const chalk = require('chalk');
const cfnDiff = require('@aws-cdk/cloudformation-diff');
const fs = require('fs-extra');
const AWS = require('aws-sdk');

class ServerlessPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      diff: {
        usage: 'Compares new AWS CloudFormation templates against old ones',
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
    this.newTemplate = '.serverless/cloudformation-template-update-stack.json';
    this.oldTemplate = '.serverless/cloudformation-template-update-stack.org.json';
  }

  downloadTemplate() {
    let stackName;

    const { oldTemplate } = this;

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

        return fs.writeFile(oldTemplate, templateBody)
          .then(() => {
            console.log('Downloaded currently deployed template');
            return Promise.resolve();
          });
      })
      .catch((err) => Promise.reject(err.message));
  }

  diff() {
    const { newTemplate, oldTemplate } = this;

    this.serverless.cli.log('Running diff against deployed template');

    return fs.stat(newTemplate)
      .then(() => {
        const oldTemplateJson = JSON.parse(fs.readFileSync(oldTemplate, 'utf8'));
        const newTemplateJson = JSON.parse(fs.readFileSync(newTemplate, 'utf8'));
        const diff = cfnDiff.diffTemplate(oldTemplateJson, newTemplateJson);

        if (!diff.isEmpty) {
          cfnDiff.formatDifferences(process.stdout, diff);
        } else {
          console.log(chalk.green('There were no differences'));
        }

        return Promise.resolve(diff);
      })
      .catch((err) => {
        if (err.code === 'ENOENT') {
          const errorPrefix = `${newTemplate} could not be found:`;
          return Promise.reject(`${errorPrefix} run "sls package" first.`);
        }
        return Promise.reject(err);
      });
  }
}

module.exports = ServerlessPlugin;
