const AWSMock = require('aws-sdk-mock');
const AWS = require('aws-sdk');
const fs = require('fs-extra');
const Plugin = require('../lib/index');

const slsDir = '.serverless';
const templatePrefix = `${slsDir}/cloudformation-template-update-stack`;
const exampleTemplate = `${templatePrefix}.json`;
const slsDefaults = {
  service: {
    service: 'foo',
    defaults: {
      stage: 'foo',
      region: 'eu-west-1',
    },
  },
  cli: {
    log: jest.fn(),
  },
};

beforeAll(() => {
  if (!fs.existsSync(slsDir)) {
    fs.mkdirSync(slsDir);
  }
});

beforeEach(() => fs.writeFileSync(exampleTemplate, '{"foo":"foo"}'));

describe('serverless-plugin-diff', () => {
  describe('constructor', () => {
    test('sets the correct defaults', () => {
      const plugin = new Plugin(slsDefaults, {});
      expect(plugin.options.stage).toBe('foo');
      expect(plugin.options.region).toBe('eu-west-1');
      expect(plugin.newTemplateFile).toBe(exampleTemplate);
    });

    test('registers the appropriate hooks', () => {
      const plugin = new Plugin(slsDefaults, {});
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
        const plugin = new Plugin(slsDefaults, {});

        return plugin.diffCmd()
          .then((data) => expect(data).toMatchSnapshot());
      });

      test('downloads currently deployed template with custom stackName', () => {
        const sls = { ...slsDefaults };
        sls.service.provider = { stackName: 'foo-r' };
        const plugin = new Plugin(sls, {});

        return plugin.diffCmd()
          .then((data) => expect(data).toMatchSnapshot());
      });

      test('downloads currently deployed template with preV1Resources flag', () => {
        const sls = { ...slsDefaults };
        sls.service.provider = { preV1Resources: true };
        const plugin = new Plugin(sls, {});

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
        const plugin = new Plugin(slsDefaults, {});

        return plugin.diffCmd()
          .catch((err) => expect(err).toMatchSnapshot());
      });
    });
  });
  describe('templateDiff', () => {
    describe('runs diff without changes', () => {
      test('successfully triggers diff', () => {
        const plugin = new Plugin(slsDefaults, {});
        return plugin.templateDiff({ foo: 'foo' })
          .then((data) => expect(data).toMatchSnapshot());
      });
    });
    describe('successfully triggers diff', () => {
      test('runs diff with defaults', () => {
        const plugin = new Plugin(slsDefaults, {});
        return plugin.templateDiff({ foo: 'foo' })
          .then((data) => expect(data).toMatchSnapshot());
      });
    });
    describe('unable to find locally compiled template', () => {
      test('unsuccessfully triggers diff', () => {
        const plugin = new Plugin(slsDefaults, {});
        plugin.newTemplateFile = 'non-existent.json';
        return plugin.templateDiff({})
          .catch((err) => expect(err).toMatchSnapshot());
      });
    });
  });
});
