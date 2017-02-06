const AWS = require('aws-sdk-mock');
const fs = require('fs-promise');
const Plugin = require('../lib/index');

const slsDir = '.serverless';
const templatePrefix = `${slsDir}/cloudformation-template-update-stack`;
const exampleTemplate = `${templatePrefix}.json`;
const exampleOrgTemplate = `${templatePrefix}.org.json`;
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

describe('serverless-plugin-write-env-vars', () => {
  describe('constructor', () => {
    it('sets the correct defaults', () => {
      const plugin = new Plugin(slsDefaults, {});

      expect(plugin.options.stage).toBe('foo');
      expect(plugin.options.region).toBe('eu-west-1');
      expect(plugin.options.diffTool).toBe(undefined);
      expect(plugin.options.localTemplate).toBe(`${templatePrefix}.json`);
      expect(plugin.options.orgTemplate).toBe(`${templatePrefix}.org.json`);
    });

    it('registers the appropriate hooks', () => {
      const plugin = new Plugin(slsDefaults, {});

      expect(typeof plugin.hooks['before:diff:diff']).toBe('function');
      expect(typeof plugin.hooks['diff:diff']).toBe('function');
    });
  });

  describe('downloadTemplate', () => {
    afterEach(() => AWS.restore('CloudFormation'));

    describe('with successful CloudFormation call', () => {
      beforeEach(() =>
        AWS.mock('CloudFormation', 'getTemplate', {
          TemplateBody: '{"foo":"bar"}',
        })
      );

      it('downloads currently deployed template', () => {
        const plugin = new Plugin(slsDefaults, {});

        return plugin.downloadTemplate()
          .then(() =>
            fs.readFile(`${templatePrefix}.org.json`, { encoding: 'utf8' })
              .then(data => expect(data).toMatchSnapshot())
          );
      });

      it('downloads currently deployed template with custom stackName', () => {
        const sls = Object.assign({}, slsDefaults);
        sls.service.provider = { stackName: 'foo-r' };
        const plugin = new Plugin(sls, {});

        return plugin.downloadTemplate()
          .then(() =>
            fs.readFile(`${templatePrefix}.org.json`, { encoding: 'utf8' })
              .then(data => expect(data).toMatchSnapshot())
          );
      });

      it('downloads currently deployed template with preV1Resources flag', () => {
        const sls = Object.assign({}, slsDefaults);
        sls.service.provider = { preV1Resources: true };
        const plugin = new Plugin(sls, {});

        return plugin.downloadTemplate()
          .then(() =>
            fs.readFile(`${templatePrefix}.org.json`, { encoding: 'utf8' })
              .then(data => expect(data).toMatchSnapshot())
          );
      });
    });

    describe('with unsuccessful CloudFormation call', () => {
      beforeEach(() =>
        AWS.mock('CloudFormation', 'getTemplate', (Object, callback) =>
          callback(new Error('Stack with id foo-foo does not exist'), null)
        )
      );

      it('could not download deployed template', () => {
        const plugin = new Plugin(slsDefaults, {});

        return plugin.downloadTemplate()
          .catch(err => expect(err).toMatchSnapshot());
      });
    });
  });

  describe('diff', () => {
    beforeEach(() =>
      fs.writeFile(exampleTemplate, '{"foo":"foo"}')
        .then(() => fs.writeFile(exampleOrgTemplate, '{"foo":"bar"}'))
    );

    describe('successfully triggers diff', () => {
      it('runs diff with defaults', () => {
        const plugin = new Plugin(slsDefaults, {});

        return plugin.diff()
          .then(data => expect(data).toMatchSnapshot());
      });

      it('runs diff with custom diff tool', () => {
        const plugin = new Plugin(slsDefaults, {
          diffTool: 'diff',
        });

        return plugin.diff()
          .then(data => expect(data).toMatchSnapshot());
      });
    });

    describe('runs diff with custom localTemplate template', () => {
      const customTemplate = `${templatePrefix}-foo.json`;
      const customOrgTemplate = `${templatePrefix}-foo.org.json`;

      beforeEach(() =>
        fs.writeFile(customTemplate, '{"foo":"foo"}')
          .then(() => fs.writeFile(customOrgTemplate, '{"foo":"custom"}'))
      );

      it('successfully triggers diff', () => {
        const plugin = new Plugin(slsDefaults, {
          localTemplate: customTemplate,
        });

        return plugin.diff()
          .then(data => expect(data).toMatchSnapshot());
      });
    });

    describe('runs diff without changes', () => {
      const customTemplate = `${templatePrefix}-foo.json`;
      const customOrgTemplate = `${templatePrefix}-foo.org.json`;

      beforeEach(() =>
        fs.writeFile(customTemplate, '{"foo":"foo"}')
          .then(() => fs.writeFile(customOrgTemplate, '{"foo":"foo"}'))
      );

      it('successfully triggers diff', () => {
        const plugin = new Plugin(slsDefaults, {
          localTemplate: customTemplate,
        });

        return plugin.diff()
          .then(data => expect(data).toMatchSnapshot());
      });
    });

    describe('could not find locally compiled template', () => {
      beforeEach(() => fs.unlink(exampleTemplate));

      it('unsuccessfully triggers diff', () => {
        const plugin = new Plugin(slsDefaults, {});

        return plugin.diff()
          .catch(err => expect(err).toMatchSnapshot());
      });
    });
  });
});
