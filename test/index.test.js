const AWSMock = require('aws-sdk-mock');
const AWS = require('aws-sdk');
const fs = require('fs-extra');
const Plugin = require('../lib/index');

const slsDir = '.serverless';
const templatePrefix = 'cloudformation-template-update-stack';
const exampleTemplate = `${slsDir}/${templatePrefix}.json`;
const exampleBase = `${templatePrefix}.json`;

beforeAll(() => {
  if (!fs.existsSync(slsDir)) {
    fs.mkdirSync(slsDir);
  }
});

let serverless;

beforeEach(() => {
  fs.writeFileSync(exampleTemplate, '{"foo":"foo"}');
  serverless = {
    serviceDir: '',
    service: {
      provider: {
        name: 'test',
        stage: 'foo',
        region: 'eu-west-1',
        naming: {
          getStackName: () => 'test',
          getCompiledTemplateFileName: () => exampleBase,
        },
      },
    },
    cli: {
      log: jest.fn(),
    },
  };
  serverless.getProvider = (providerName) => {
    console.log(`using ${providerName} provider`);
    return serverless.service.provider;
  };
});

describe('serverless-plugin-diff', () => {
  describe('constructor', () => {
    test('sets the correct defaults', () => {
      const plugin = new Plugin(serverless, {});
      expect(plugin.options.stage).toBe('foo');
      expect(plugin.options.region).toBe('eu-west-1');
      expect(plugin.newTemplateFile).toBe(exampleTemplate);
    });

    test('registers the appropriate hooks', () => {
      const plugin = new Plugin(serverless, {});
      expect(typeof plugin.hooks['before:diff:diff']).toBe('function');
      expect(typeof plugin.hooks['diff:diff']).toBe('function');
    });
  });

  describe('diffCmd', () => {
    describe('with successful CloudFormation call', () => {
      beforeEach(() => {
        AWSMock.setSDKInstance(AWS);
        AWSMock.mock('CloudFormation', 'getTemplate', (params, callback) => {
          callback(null, { TemplateBody: '{"foo":"bar"}' });
        });
      });

      test('downloads currently deployed template', () => {
        const plugin = new Plugin(serverless, {});

        return plugin.diffCmd()
          .then((data) => expect(data).toMatchSnapshot());
      });

      test('downloads currently deployed template with custom stackName', () => {
        const plugin = new Plugin(serverless, {});

        return plugin.diffCmd()
          .then((data) => expect(data).toMatchSnapshot());
      });

      test('downloads currently deployed template with preV1Resources flag', () => {
        const plugin = new Plugin(serverless, {});

        return plugin.diffCmd()
          .then((data) => expect(data).toMatchSnapshot());
      });
    });

    describe('with unsuccessful CloudFormation call', () => {
      beforeEach(() => {
        fs.writeFile(exampleTemplate, '{"foo":"foo"}').then(() => {
          AWSMock.setSDKInstance(AWS);
          AWSMock.mock('CloudFormation', 'getTemplate', (Object, callback) => {
            callback({
              message: 'Stack with id foo-foo does not exist',
              code: 'ValidationError',
            }, null);
          });
        });
      });

      test('could not download deployed template', () => {
        const plugin = new Plugin(serverless, {});

        return plugin.diffCmd()
          .catch((err) => expect(err).toMatchSnapshot());
      });
    });
  });
  describe('templateDiff', () => {
    describe('runs diff without changes', () => {
      test('successfully triggers diff', () => {
        const plugin = new Plugin(serverless, {});
        return plugin.templateDiff({ foo: 'foo' })
          .then((data) => expect(data).toMatchSnapshot());
      });
    });
    describe('successfully triggers diff', () => {
      test('runs diff with defaults', () => {
        const plugin = new Plugin(serverless, {});
        return plugin.templateDiff({ foo: 'foo' })
          .then((data) => expect(data).toMatchSnapshot());
      });
    });
    describe('unable to find locally compiled template', () => {
      test('unsuccessfully triggers diff', () => {
        const plugin = new Plugin(serverless, {});
        plugin.newTemplateFile = 'non-existent.json';
        return plugin.templateDiff({})
          .catch((err) => expect(err).toMatchSnapshot());
      });
    });
  });
});
