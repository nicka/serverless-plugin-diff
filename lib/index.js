'use strict';

const chalk = require('chalk');
const cfnDiff = require('@aws-cdk/cloudformation-diff');
const fs = require('fs-extra');
const AWS = require('aws-sdk');
const { JSONPath } = require('jsonpath-plus');

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
      'before:diff:diff': async () => {
        const provider = this.serverless.service.provider.name;
        if (!this.serverless.getProvider(provider)) {
          const errorMessage = `The specified provider "${provider}" does not exist.`;
          throw new Error(errorMessage, 'INVALID_PROVIDER');
        }

        if (!this.options.package && !this.serverless.service.package.path) {
          await this.serverless.pluginManager.spawn('package');
        }
      },
      'diff:diff': this.diffCmd.bind(this),
    };

    this.options.stage = this.options.stage
      || (this.serverless.service.defaults && this.serverless.service.defaults.stage)
      || 'dev';
    this.options.region = this.options.region
      || (this.serverless.service.defaults && this.serverless.service.defaults.region)
      || 'us-east-1';

    AWS.config.update({ region: this.options.region });

    this.cloudFormation = new AWS.CloudFormation();
    this.newTemplateFile = '.serverless/cloudformation-template-update-stack.json';
  }

  diffCmd() {
    let stackName;

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

    const promise = this.cloudFormation.getTemplate(params).promise();

    return promise.then(
      (data) => {
        const oldTemplate = JSON.parse(data.TemplateBody);
        this.templateDiff(oldTemplate);
        return Promise.resolve(oldTemplate);
      },
      (err) => {
        if (err.code === 'ValidationError') {
          const oldTemplate = {};
          this.templateDiff(oldTemplate);
          return Promise.resolve(oldTemplate);
        }
        return Promise.reject(err.message);
      },
    );
  }

  templateDiff(oldTemplate) {
    const { newTemplateFile } = this;
    this.serverless.cli.log('Running diff against deployed template');

    return fs.stat(newTemplateFile)
      .then(() => {
        const newTemplate = JSON.parse(fs.readFileSync(newTemplateFile, 'utf8'));
        const diff = cfnDiff.diffTemplate(oldTemplate, newTemplate);

        if (!diff.isEmpty) {
          const stream = process.stdout;
          const config = this.serverless.service.custom;
          const diffConfig = config && config.diff;
          let tableWidth;
          let excludes = [];
          let reportPath;
          if (diffConfig) {
            tableWidth = diffConfig.tableWidth || 0;
            excludes = diffConfig.excludes || [];
            reportPath = diffConfig.reportPath;
          }
          tableWidth = process.env.DIFF_TABLE_WIDTH || tableWidth;
          if (tableWidth) {
            stream.columns = 80;
          }
          excludes.forEach((exclude) => {
            const result = JSONPath({
              resultType: 'all',
              json: diff,
              path: exclude,
            });
            result.forEach((res) => {
              delete res.parent[res.parentProperty];
            });
          });
          if (reportPath) {
            const report = {
              create: 0,
              update: 0,
              delete: 0,
            };
            Object.values(diff.resources.diffs).forEach((res) => {
              if (res.isAddition) {
                report.create += 1;
              } else if (res.isRemoval) {
                report.delete += 1;
              } else {
                report.update += 1;
              }
            });
            fs.writeFile(diffConfig.reportPath, JSON.stringify(report, null, 4));
          }
          cfnDiff.formatDifferences(stream, diff);
        } else {
          console.log(chalk.green('There were no differences'));
        }

        return Promise.resolve(diff);
      })
      .catch((err) => {
        if (err.code === 'ENOENT') {
          const errorPrefix = `${newTemplateFile} could not be found`;
          return Promise.reject(errorPrefix);
        }
        return Promise.reject(err);
      });
  }
}

module.exports = ServerlessPlugin;
