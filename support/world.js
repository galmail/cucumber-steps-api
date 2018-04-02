/* eslint-disable func-names,prefer-arrow-callback */
const path = require('path');
const debug = require('debug')('cucumber:support:world');
const { Before, After, setWorldConstructor, defineParameterType, Given } = require('cucumber');
const superagent = require('superagent');
const HttpClient = require('./http-client');
const Store = require('./store');
const VariableResolver = require('./variable-resolver');
const Generator = require('./data-generator');

function CustomWorld({ attach, parameters }) {
  this.attach = attach;
  this.parameters = parameters;
  debug('Initializing World instance with new instance of agent, store and client');
  const agent = superagent.agent();
  this.Store = baseline => new Store(baseline);
  const store = this.Store();
  this.store = store;
  this.HttpClient = another => new HttpClient(another || agent, this.store);
  this.agent = agent;
  this.client = this.HttpClient();
  this.resourceResolver = resource => path.resolve(this.currentFeatureFileDir, resource);
  this.variableResolver = new VariableResolver();
  this.variableResolver.register('default', Object.assign({}, process.env));
  this.generator = new Generator(Math.floor(Math.random() * 1000000));

  this.variableResolver.register('store', this.store.resolve.bind(this.store)).alias('s');
}

setWorldConstructor(CustomWorld);

defineParameterType({
  name: 'expression',
  regexp: [/[^"]+/, /[^']+/, /.*/, /.+/],
  preferForRegexpMatch: false,
  transformer(str) {
    return str
      ? str
        .split(/((?:\${?(?:(?:\w+?):)?(?:[A-Za-z0-9-_:$.[\]]+))}?)/g)
        .map((expression) => {
          const matches =
              expression &&
              expression.match(/^["']?(?:\${?(?:(\w+?):)?([A-Za-z0-9-_:$.[\]]+?)}?)["']?$/);
          if (matches && matches[2]) {
            const [, namespace, variable] = matches;
            return this.variableResolver.resolve(variable, namespace) || expression;
          }
          return expression;
        })
        .join('')
      : str;
  },
});

const CWD = process.cwd();
Before(function (options) {
  this.currentWorkingDir = CWD;
  this.currentFeatureFilePath = path.resolve(CWD, options.sourceLocation.uri);
  this.currentFeatureFileDir = path.dirname(this.currentFeatureFilePath);
  debug(`Running feature file: ${options.sourceLocation.uri} with current working dir: ${CWD}`);
});

After(function (options) {
  if (options.result.status === 'failed') {
    this.attach('Store dump:');
    this.attach(JSON.stringify(this.store.dump(), null, 2), 'application/json');
  }
});

module.exports = CustomWorld;
