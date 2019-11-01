'use strict';

const AWS = require('aws-sdk');
const diff = require('json-diff').diffString;
const exec = require('child-process-promise').exec;
const fs = require('fs-promise');

class ServerlessPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;

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

    let localTemplate = options.localTemplate || '.serverless/cloudformation-template-update-stack.json';
    let orgTemplate = localTemplate.replace('.json', '.org.json');
    this.options = {
      diffTool: options.diffTool,
      localTemplate,
      orgTemplate,
    };
  }

  downloadTemplate() {
    this.serverless.pluginManager.spawn('aws:common:validate');
    AWS.config.update({ region: this.serverless.getProvider('aws').getRegion() });
    let cloudFormation = new AWS.CloudFormation();
    let stackName;

    const orgTemplate = this.options.orgTemplate;

    if (this.serverless.service.provider
        && typeof this.serverless.service.provider.stackName !== 'undefined'
        && this.serverless.service.provider.stackName !== '') {
      stackName = this.serverless.service.provider.stackName;
    } else {
      let stage = this.serverless.getProvider('aws').getStage();
      stackName = `${this.serverless.service.service}-${stage}`;
    }

    const params = {
      StackName: stackName,
      TemplateStage: 'Processed',
    };

    this.serverless.cli.log('Downloading currently deployed template');

    return cloudFormation.getTemplate(params).promise()
      .then((data) => {
        let templateBody = JSON.parse(data.TemplateBody);
        templateBody = JSON.stringify(templateBody, null, 2);

        return fs.writeFile(orgTemplate, templateBody)
          .then(() => Promise.resolve());
      })
      .catch(err => Promise.reject(err.message));
  }

  diff() {
    const diffTool = this.options.diffTool;
    const localTemplate = this.options.localTemplate;
    const orgTemplate = this.options.orgTemplate;

    this.serverless.cli.log('Running diff against deployed template');

    return fs.stat(localTemplate)
      .then(() => {
        if (typeof diffTool === 'undefined') {
          const orgTemplateJson = JSON.parse(fs.readFileSync(orgTemplate, 'utf8'));
          const localTemplateJson = JSON.parse(fs.readFileSync(localTemplate, 'utf8'));
          const differences = diff(orgTemplateJson, localTemplateJson) || {};

          if (differences.trim() === 'undefined') {
            console.log('Resource templates are equal');
          } else {
            console.log(differences);
          }

          return Promise.resolve(differences);
        }

        return exec(`${diffTool} ${orgTemplate} ${localTemplate} || true`)
          .then((result) => {
            const diffData = result.stdout;
            console.log(diffData);
            return Promise.resolve(diffData);
          });
      })
      .catch((err) => {
        if (err.code === 'ENOENT') {
          const errorPrefix = `${localTemplate} could not be found:`;
          return Promise.reject(`${errorPrefix} run "sls deploy --noDeploy" first.`);
        }
        return Promise.reject(err);
      });
  }
}

module.exports = ServerlessPlugin;
