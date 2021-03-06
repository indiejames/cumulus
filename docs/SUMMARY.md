### Documentation

* [Home](README.md)
* [Architecture](architecture.md)
* [What are Cumulus Workflows?](workflows/README.md)
  * [Workflow Protocol](workflows/protocol.md)
  * [Workflow Tasks](tasks.md)
  * [Workflow Input & Ouptut](workflows/input_output.md)
  * [Workflow Task Message Flow](workflows/cumulus-task-message-flow.md)
  * [Developing Workflow Tasks](workflows/developing-workflow-tasks.md)
    * [Lambda Functions](workflows/lambda.md)
    * [Dockerization](workflows/docker.md)
  * [Workflow Configuration How-to's](workflows/workflow-configuration-how-to.md)
  * [Workflow Triggers](workflows/workflow-triggers.md)
* Deployment
  * [How to Deploy Cumulus](deployment/README.md)
  * [Creating an S3 Bucket](deployment/create_bucket.md)
  * [Locating IAMs](deployment/iam_roles.md)
  * [Troubleshooting Deployment](deployment/troubleshoot_deployment.md)
* [Cumulus API Docs](https://nasa.github.io/cumulus-api)
* Additional Cumulus Features
  * [Cumulus Metadata in DynamoDB](data_in_dynamodb.md#cumulus-metadata-in-dynamodb)
  * [DynamoDB Backup and Restore](data_in_dynamodb.md#backup-and-restore-with-aws)
  * [DynamoDB Auto Scaling](data_in_dynamodb.md#dynamodb-auto-scaling)
  * [EMS Reporting](ems_reporting.md)
* [Changelog](https://github.com/nasa/cumulus/blob/master/CHANGELOG.md)
* [Upgrade Instructions](upgrade/README.md)
  * [1.6.0](upgrade/1.6.0.md)
  * [1.7.0](upgrade/1.7.0.md)
  * [1.9.0](upgrade/1.9.0.md)
* [Operating and Troubleshooting](system-documentation/system-documentation.md)
* [Contributing to documentation](doc_installation.md)
  * [Contributing a task](adding-a-task.md)
* [Team](team.md)

### Data Cookbook

* [About Cookbooks](data-cookbooks/about-cookbooks.md)
  * [Collections, Providers, Schemas, and Rules](data-cookbooks/setup.md)
* [HelloWorldWorkflow](data-cookbooks/hello-world.md)
* [SNS Configuration](data-cookbooks/sns.md)
* [SIPS Workflow](data-cookbooks/sips-workflow.md)
* [CNM Workflow](data-cookbooks/cnm-workflow.md)
* [Error Handling](data-cookbooks/error-handling.md)
* [Choice States](data-cookbooks/choice-states.md)
