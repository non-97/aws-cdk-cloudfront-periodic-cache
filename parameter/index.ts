import * as cdk from "aws-cdk-lib";
import * as path from "path";

export type LogType = "cloudFrontAccessLog";

export interface LifecycleRule {
  prefix?: string;
  expirationDays: number;
  ruleNameSuffix?: string;
  abortIncompleteMultipartUploadAfter?: cdk.Duration;
}

export interface LogAnalytics {
  createWorkGroup?: boolean;
  enableLogAnalytics?: LogType[];
}

export interface AccessLog {
  enableAccessLog?: boolean;
  logFilePrefix?: string;
  lifecycleRules?: LifecycleRule[];
}

export interface HostZoneProperty {
  zoneName?: string;
  hostedZoneId?: string;
}

export interface CertificateProperty {
  certificateArn?: string;
  certificateDomainName?: string;
}

export interface ContentsDeliveryProperty {
  domainName?: string;
}

export interface LambdaOacProperty {
  hostedZone?: HostZoneProperty;
  certificate?: CertificateProperty;
  contentsDelivery?: ContentsDeliveryProperty;
  allowDeleteBucketAndObjects?: boolean;
  cloudFrontAccessLog?: AccessLog;
  logAnalytics?: LogAnalytics;
}

export interface LambdaOacStackProperty {
  env?: cdk.Environment;
  props: LambdaOacProperty;
}

export const lambdaOacStackProperty: LambdaOacStackProperty = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  props: {
    hostedZone: {
      zoneName: "lambda-url.non-97.net",
    },
    certificate: {
      certificateDomainName: "lambda-url.non-97.net",
    },
    contentsDelivery: {
      domainName: "lambda-url.non-97.net",
    },
    allowDeleteBucketAndObjects: true,
    cloudFrontAccessLog: {
      enableAccessLog: true,
      lifecycleRules: [{ expirationDays: 365 }],
    },
    logAnalytics: {
      createWorkGroup: true,
      enableLogAnalytics: ["cloudFrontAccessLog"],
    },
  },
};
