'use strict';

const _ = require('lodash');
const aws = require('gitc-common/aws');
const log = require('gitc-common/log');
const configUtil = require('gitc-common/config');
const uuid = require('uuid');

/**
 * Runs the given function at the given offset and with the given period thereafter
 *
 * @param {number} periodMs - The period (ms) at which to run the given fn
 * @param {number} offsetMs - The time offset (ms) at which to run the first invocation
 */
const doPeriodically = async (periodMs, offsetMs, fn) => {
  setTimeout(() => {
    setInterval(fn, periodMs);
    fn();
  }, offsetMs);
};

/**
 * Starts an ingest for the given collection
 * @param resources - An object with keys and values mapping meaningful resource names to external
 *                    URIs, ARNs, etc
 * @param provider - The provider configuration object for the collection's provider.
 * @param collection - Configuration for the collection to be ingested
 */
const triggerIngest = async (resources, provider, collection) => {
  try {
    const stateMachine = collection.workflow;
    const meta = JSON.parse(JSON.stringify(collection.meta || {}));
    const startDate = new Date().toISOString();
    const id = uuid.v4();
    const executionName = `${collection.id}-${id}`;
    const eventData = {
      workflow_config: collection.workflow_config,
      resources: resources,
      provider: provider,
      ingest_meta: {
        event_source: 'sfn',
        start_date: startDate,
        state_machine: stateMachine,
        execution_name: executionName,
        id: id
      },
      meta: meta,
      exception: 'None',
      payload: null
    };

    const message = JSON.stringify(eventData);
    log.info(`Starting ingest of ${collection.id}`);
    await aws.sfn().startExecution({
      stateMachineArn: stateMachine,
      input: message,
      name: executionName
    }).promise();
  }
  catch (err) {
    log.error(err);
    log.error(err.stack);
  }
};

/**
 * Given a resource object as returned by CloudFormation::DescribeStackResources, returns
 * the resource's ARN. Often this is the PhysicalResourceId property, but for Lambdas,
 * need to glean information and attempt to construct an ARN.
 * @param {StackResource} resource - The resource as returned by cloudformation
 * @return - The ARN of the resource
 */
const resourceToArn = (resource) => {
  const physicalId = resource.PhysicalResourceId;
  if (physicalId.indexOf('arn:') === 0) {
    return physicalId;
  }
  const typesToArnFns = {
    'AWS::Lambda::Function': (cfResource, region, account) =>
      `arn:aws:lambda:${region}:${account}:function:${cfResource.PhysicalResourceId}`,
    'AWS::DynamoDB::Table': (cfResource, region, account) =>
      `arn:aws:dynamodb:${region}:${account}:table/${cfResource.PhysicalResourceId}`
  };

  const arnFn = typesToArnFns[resource.ResourceType];
  if (!arnFn) throw new Error(`Could not resolve resource type to ARN: ${resource.ResourceType}`);

  const arnParts = resource.StackId.split(':');
  const region = arnParts[3];
  const account = arnParts[4];
  return arnFn(resource, region, account);
};

const resolveResource = (cfResourcesById, prefix) =>
  (key) => {
    const [name, fn] = key.split('.');
    const resource = cfResourcesById[name] || cfResourcesById[prefix + name];
    if (!resource) throw new Error(`Resource not found: ${key}`);
    if (fn && ['Arn'].indexOf(fn) === -1) throw new Error(`Function not supported: ${key}`);
    const result = fn === 'Arn' ? resourceToArn(resource) : resource.PhysicalResourceId;
    log.info(`${key} -> ${result}`);
    return result;
  };

/**
 * Starts a scheduler service that periodically triggers ingests described in config/collections.yml
 */
module.exports.handler = async (invocation) => {
  try {
    const cfParams = { StackName: invocation.resources.stack };
    const cfResources = await aws.cf().describeStackResources(cfParams).promise();
    const cfResourcesById = {};
    const prefix = invocation.resources.sfn_prefix;

    for (const cfResource of cfResources.StackResources) {
      cfResourcesById[cfResource.LogicalResourceId] = cfResource;
    }

    const configStr = await aws.getPossiblyRemote(invocation.payload);
    const resolver = resolveResource(cfResourcesById, prefix);
    const config = configUtil.parseConfig(configStr, resolver);

    // Update the keys under the workflows to map identifiers (Arns) to workflow
    config.workflows = _.mapKeys(config.workflows, (v, k) => resolver(k));

    log.info('RESOURCES', JSON.stringify(cfResourcesById));
    log.info('CONFIG', JSON.stringify(config));

    const collectionsByProviderId = _.groupBy(config.collections, (c) => c.provider_id);

    for (const provider of config.providers) {
      const collections = collectionsByProviderId[provider.id];
      let offsetMs = 0;

      // Stagger collection ingests by 2.9 minutes to avoid overwhelming a provider
      // 2.9 is chosen because it's longer than a typical fetch cycle and also unlikely
      // to evenly divide normal NRT intervals and cause clashes in start time
      const staggerMs = 2.9 * 60 * 1000;

      for (const collection of collections) {
        const trigger = collection.trigger;
        if (trigger && trigger.type === 'timer') {
          const periodMs = 1000 * trigger.period_s;
          log.info(`Scheduling ${collection.id}.` +
                   `period=${periodMs}ms, offset=${offsetMs % periodMs}ms`);
          doPeriodically(periodMs, offsetMs % periodMs, () => {
            triggerIngest(invocation.resources, provider, collection);
          });
          offsetMs += staggerMs;
        }
      }
    }
  }
  catch (err) {
    log.error('Scheduler failed: ', err.message);
    log.error(err.stack);
    throw err;
  }
};

const localHelpers = require('gitc-common/local-helpers');
const fs = require('fs');
if (localHelpers.isLocal) {
  module.exports.handler({ resources: { sfn_prefix: 'gitcxpqxsfnxx', stack: 'gitc-pq-sfn' },
                           payload: fs.readFileSync('../config/collections.yml').toString() });
}
