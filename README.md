[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)

# Serverless CloudFormation Diff

WIP

## Overview

Plugin for Serverless Framework v1.x which compares your locale AWS CloudFormation templates against deployed ones.

## Usage

```bash
serverless deploy --diff --noDeploy --stage REPLACEME --region REPLACEME
```

## Install

Execute npm install in your Serverless project.

```bash
npm install --save-dev serverless-plugin-diff
```

Add the plugin to your `serverless.yml` file

```yml
plugins:
  - serverless-plugin-diff
```
