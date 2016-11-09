'use strict';

const AWS = require('aws-sdk');
const fs = require('fs-promise');
const exec = require('child-process-promise').exec;
const Q = require('q');

class ServerlessPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      diff: {
        usage: 'Compares local AWS CloudFormation templates against deployed ones',
        lifecycleEvents: ['diff'],
        options: {
          diffTool: {
            usage:
              'Specify the diff tool you want to use '
              + '(e.g. "--diffTool \'ksdiff\'")',
            required: false,
            shortcut: 'dt',
          },
          localTemplate: {
            usage:
              'Specify your locally compiled CloudFormation template'
              + '(e.g. "--localTemplate \'./serverless/'
              + 'cloudformation-template-update-stack.json\'")',
            required: false,
            shortcut: 'lt',
          },
        },
      },
    };

    this.hooks = {
      'before:diff:diff': this.downloadTemplate.bind(this),
      'diff:diff': this.diff.bind(this),
    };

    this.options.stage = this.options.stage
      || (this.serverless.service.defaults && this.serverless.service.defaults.stage)
      || 'dev';
    this.options.region = this.options.region
      || (this.serverless.service.defaults && this.serverless.service.defaults.region)
      || 'us-east-1';
    this.options.diffTool = this.options.diffTool
      || 'diff';
    this.options.localTemplate = this.options.localTemplate
      || '.serverless/cloudformation-template-update-stack.json';
    this.options.orgTemplate = this.options.localTemplate.replace('.json', '.org.json');

    AWS.config.update({ region: this.options.region });

    this.cloudFormation = new AWS.CloudFormation();
  }

  downloadTemplate() {
    const deferred = Q.defer();
    const orgTemplate = this.options.orgTemplate;
    const params = {
      StackName: `${this.serverless.service.service}-${this.options.stage}`,
      TemplateStage: 'Processed',
    };

    this.serverless.cli.log('Downloading currently deployed template');

    this.cloudFormation.getTemplate(params, (err, data) => {
      if (err) {
        deferred.reject(err.message);
      } else {
        let templateBody = JSON.parse(data.TemplateBody);
        templateBody = JSON.stringify(templateBody, null, 2);

        fs.writeFile(orgTemplate, templateBody)
          .then(() => deferred.resolve())
          .catch(fsErr => deferred.reject(fsErr.message));
      }
    });

    return deferred.promise;
  }

  diff() {
    const deferred = Q.defer();
    const diffTool = this.options.diffTool;
    const localTemplate = this.options.localTemplate;
    const orgTemplate = this.options.orgTemplate;

    this.serverless.cli.log('Running diff against deployed template');

    fs.stat(localTemplate)
      .then(() => {
        exec(`${diffTool} ${orgTemplate} ${localTemplate} || true`)
          .then((result) => {
            const diffData = result.stdout;
            console.log(diffData);
            deferred.resolve(diffData);
          })
          .catch(execErr => deferred.reject(execErr.message));
      })
      .catch((err) => {
        if (err.code === 'ENOENT') {
          const errorPrefix = `${localTemplate} could not be found:`;
          deferred.reject(`${errorPrefix} run "sls deploy --noDeploy" first.`);
        }
      });

    return deferred.promise;
  }
}

module.exports = ServerlessPlugin;
