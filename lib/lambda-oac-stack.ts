import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { LambdaOacProperty, LogType } from "../parameter/index";
import { HostedZoneConstruct } from "./construct/hosted-zone-construct";
import { CertificateConstruct } from "./construct/certificate-construct";
import { BucketConstruct } from "./construct/bucket-construct";
import { ContentsDeliveryConstruct } from "./construct/contents-delivery-construct";
import { LogAnalyticsConstruct } from "./construct/log-analytics-construct";

export interface LambdaOacStackProps
  extends cdk.StackProps,
    LambdaOacProperty {}

export class LambdaOacStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: LambdaOacStackProps) {
    super(scope, id, props);

    // Public Hosted Zone
    const hostedZoneConstruct = props.hostedZone
      ? new HostedZoneConstruct(this, "HostedZoneConstruct", {
          ...props.hostedZone,
        })
      : undefined;

    // ACM Certificate
    const certificateConstruct = props.certificate
      ? new CertificateConstruct(this, "CertificateConstruct", {
          ...props.certificate,
          hostedZoneConstruct,
        })
      : undefined;

    // Bucket for CloudFront Access Log
    const cloudFrontAccessLogBucketConstruct = props.cloudFrontAccessLog
      ?.enableAccessLog
      ? new BucketConstruct(this, "CloudFrontAccessLogBucketConstruct", {
          allowDeleteBucketAndObjects: props.allowDeleteBucketAndObjects,
          accessControl: cdk.aws_s3.BucketAccessControl.LOG_DELIVERY_WRITE,
          ...props.cloudFrontAccessLog,
        })
      : undefined;

    // CloudFront
    const contentsDeliveryConstruct = new ContentsDeliveryConstruct(
      this,
      "ContentsDeliveryConstruct",
      {
        cloudFrontAccessLogBucketConstruct,
        hostedZoneConstruct,
        certificateConstruct,
        ...props.contentsDelivery,
        ...props.cloudFrontAccessLog,
        ...props.logAnalytics,
      }
    );

    // Log Analytics
    // Athena query output
    const queryOutputBucketConstruct = props.logAnalytics?.createWorkGroup
      ? new BucketConstruct(this, "QueryOutputBucketConstruct", {
          allowDeleteBucketAndObjects: props.allowDeleteBucketAndObjects,
        })
      : undefined;

    const logAnalyticsConstruct = props.logAnalytics
      ? new LogAnalyticsConstruct(this, "LogAnalyticsConstruct", {
          queryOutputBucketConstruct,
        })
      : undefined;

    // Database
    if (!logAnalyticsConstruct) {
      return;
    }
    const database = props.logAnalytics?.enableLogAnalytics
      ? logAnalyticsConstruct?.createDatabase("AccessLogDatabase", {
          databaseName: "access_log",
        })
      : undefined;

    // CloudFront Access Log Table
    if (cloudFrontAccessLogBucketConstruct) {
      database
        ? logAnalyticsConstruct?.createTable("CloudFrontAccessLogTable", {
            databaseName: database.ref,
            logType: "cloudFrontAccessLog",
            locationPlaceHolder: {
              logBucketName:
                cloudFrontAccessLogBucketConstruct.bucket.bucketName,
              logSrcResourceId:
                contentsDeliveryConstruct.distribution.distributionId,
              logSrcResourceAccountId: this.account,
              logSrcResourceRegion: this.region,
              prefix: props.cloudFrontAccessLog?.logFilePrefix,
            },
          })
        : undefined;
    }
  }
}
