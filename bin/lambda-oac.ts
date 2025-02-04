#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { LambdaOacStack } from "../lib/lambda-oac-stack";
import { lambdaOacStackProperty } from "../parameter/index";

const app = new cdk.App();
new LambdaOacStack(app, "CloudfrontPeriodicCacheStack", {
  env: lambdaOacStackProperty.env,
  ...lambdaOacStackProperty.props,
});
