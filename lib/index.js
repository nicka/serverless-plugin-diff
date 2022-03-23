'use strict';

const AWS = require('aws-sdk');
const diff = require('json-diff').diffString;
const fs = require('fs-promise');

class ServerlessPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      diff: {
        usage: 'Compares local AWS CloudFormation templates against deployed ones',
        lifecycleEvents: ['diff'],
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

    AWS.config.update({ region: this.options.region });

    this.cloudFormation = new AWS.CloudFormation();
    this.localTemplate = '.serverless/cloudformation-template-update-stack.json';
    this.orgTemplate = '.serverless/cloudformation-template-update-stack.org.json';
  }

  downloadTemplate() {
    let stackName;

    const { orgTemplate } = this;

    if (this.serverless.service.provider
      && typeof this.serverless.service.provider.stackName !== 'undefined'
      && this.serverless.service.provider.stackName !== '') {
      stackName = this.serverless.service.provider.stackName;
    } else {
      stackName = `${this.serverless.service.service}-${this.options.stage}`;
    }

    if (this.serverless.service.provider
      && typeof this.serverless.service.provider.preV1Resources !== 'undefined'
      && this.serverless.service.provider.preV1Resources === true) {
      stackName += '-r';
    }

    const params = {
      StackName: stackName,
      TemplateStage: 'Processed',
    };

    this.serverless.cli.log('Downloading currently deployed template');

    return this.cloudFormation.getTemplate(params).promise()
      .then((data) => {
        let templateBody = JSON.parse(data.TemplateBody);
        templateBody = JSON.stringify(templateBody, null, 2);

        return fs.writeFile(orgTemplate, templateBody)
          .then(() => {
            console.log('Downloaded currently deployed template');
            return Promise.resolve();
          });
      })
      .catch((err) => Promise.reject(err.message));
  }

  diff() {
    const { localTemplate, orgTemplate } = this;

    this.serverless.cli.log('Running diff against deployed template');

    return fs.stat(localTemplate)
      .then(() => {
        const orgTemplateJson = JSON.parse(fs.readFileSync(orgTemplate, 'utf8'));
        const localTemplateJson = JSON.parse(fs.readFileSync(localTemplate, 'utf8'));
        const differences = diff(orgTemplateJson, localTemplateJson) || {};

        if (Object.entries(differences).length === 0) {
          console.log('Resource templates are equal');
        } else {
          console.log(differences);
        }

        return Promise.resolve(differences);
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
