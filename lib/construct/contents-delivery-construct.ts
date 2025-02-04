import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  ContentsDeliveryProperty,
  AccessLog,
  LogAnalytics,
} from "../../parameter/index";
import { BucketConstruct } from "./bucket-construct";
import { HostedZoneConstruct } from "./hosted-zone-construct";
import { CertificateConstruct } from "./certificate-construct";
import * as path from "path";

export interface ContentsDeliveryConstructProps
  extends ContentsDeliveryProperty,
    AccessLog,
    LogAnalytics {
  cloudFrontAccessLogBucketConstruct?: BucketConstruct;
  hostedZoneConstruct?: HostedZoneConstruct;
  certificateConstruct?: CertificateConstruct;
}

export class ContentsDeliveryConstruct extends Construct {
  readonly distribution: cdk.aws_cloudfront.Distribution;

  constructor(
    scope: Construct,
    id: string,
    props: ContentsDeliveryConstructProps
  ) {
    super(scope, id);

    // Lambda Function
    const messagePdfLambda = new cdk.aws_lambda_nodejs.NodejsFunction(
      this,
      "MessagePdfLambda",
      {
        entry: path.join(__dirname, "../src/lambda/message-pdf/index.ts"),
        runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
        bundling: {
          minify: true,
          tsconfig: path.join(__dirname, "../src/lambda/tsconfig.json"),
          format: cdk.aws_lambda_nodejs.OutputFormat.ESM,
          mainFields: ["module", "main"],
          banner:
            "const require = (await import('node:module')).createRequire(import.meta.url);const __filename = (await import('node:url')).fileURLToPath(import.meta.url);const __dirname = (await import('node:path')).dirname(__filename);",
        },
        architecture: cdk.aws_lambda.Architecture.ARM_64,
        loggingFormat: cdk.aws_lambda.LoggingFormat.JSON,
        timeout: cdk.Duration.seconds(30),
      }
    );

    // CloudFront Functions
    const datetimeBlockCf2 = new cdk.aws_cloudfront.Function(
      this,
      "DatetimeBlockCf2",
      {
        code: cdk.aws_cloudfront.FunctionCode.fromFile({
          filePath: path.join(__dirname, "../src/cf2/datetime-block/index.js"),
        }),
        runtime: cdk.aws_cloudfront.FunctionRuntime.JS_2_0,
      }
    );

    // CloudFront Distribution
    this.distribution = new cdk.aws_cloudfront.Distribution(this, "Default", {
      defaultBehavior: {
        origin:
          cdk.aws_cloudfront_origins.FunctionUrlOrigin.withOriginAccessControl(
            messagePdfLambda.addFunctionUrl({
              authType: cdk.aws_lambda.FunctionUrlAuthType.AWS_IAM,
            })
          ),
        allowedMethods: cdk.aws_cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cdk.aws_cloudfront.CachedMethods.CACHE_GET_HEAD,
        cachePolicy: new cdk.aws_cloudfront.CachePolicy(
          this,
          "MessageCachePolicy",
          {
            minTtl: cdk.Duration.seconds(1),
            maxTtl: cdk.Duration.days(1),
            defaultTtl: cdk.Duration.hours(12),
            enableAcceptEncodingBrotli: true,
            enableAcceptEncodingGzip: true,
            queryStringBehavior:
              cdk.aws_cloudfront.CacheQueryStringBehavior.allowList("message"),
            headerBehavior:
              cdk.aws_cloudfront.CacheHeaderBehavior.allowList(
                "x-datetime-block"
              ),
            cookieBehavior: cdk.aws_cloudfront.CacheCookieBehavior.none(),
          }
        ),
        viewerProtocolPolicy:
          cdk.aws_cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy:
          cdk.aws_cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        functionAssociations: [
          {
            function: datetimeBlockCf2,
            eventType: cdk.aws_cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
      httpVersion: cdk.aws_cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cdk.aws_cloudfront.PriceClass.PRICE_CLASS_ALL,
      domainNames: props.domainName ? [props.domainName] : undefined,
      certificate: props.domainName
        ? props.certificateConstruct?.certificate
        : undefined,
      logBucket: props.cloudFrontAccessLogBucketConstruct?.bucket,
      logFilePrefix: props.logFilePrefix,
    });

    // RRset
    if (props.hostedZoneConstruct) {
      new cdk.aws_route53.ARecord(this, `AliasRecord`, {
        recordName: props.domainName,
        zone: props.hostedZoneConstruct.hostedZone,
        target: cdk.aws_route53.RecordTarget.fromAlias(
          new cdk.aws_route53_targets.CloudFrontTarget(this.distribution)
        ),
      });
    }

    if (
      props.cloudFrontAccessLogBucketConstruct &&
      props.enableLogAnalytics?.find((enableLogAnalytics) => {
        return enableLogAnalytics === "cloudFrontAccessLog";
      })
    ) {
      const targetKeyPrefix = props.logFilePrefix
        ? `${props.logFilePrefix}/partitioned/${cdk.Stack.of(this).account}/${
            this.distribution.distributionId
          }/`
        : `partitioned/${cdk.Stack.of(this).account}/${
            this.distribution.distributionId
          }/`;

      const moveCloudFrontAccessLogLambda =
        new cdk.aws_lambda_nodejs.NodejsFunction(
          this,
          "MoveCloudFrontAccessLogLambda",
          {
            entry: path.join(
              __dirname,
              "../src/lambda/move-cloudfront-access-log/index.ts"
            ),
            runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
            bundling: {
              minify: true,
              tsconfig: path.join(__dirname, "../src/lambda/tsconfig.json"),
              format: cdk.aws_lambda_nodejs.OutputFormat.ESM,
            },
            architecture: cdk.aws_lambda.Architecture.ARM_64,
            loggingFormat: cdk.aws_lambda.LoggingFormat.JSON,
            environment: {
              TARGET_KEY_PREFIX: targetKeyPrefix,
              HIVE_COMPATIBLE_PARTITIONS: "false",
            },
          }
        );

      props.cloudFrontAccessLogBucketConstruct.bucket.enableEventBridgeNotification();
      props.cloudFrontAccessLogBucketConstruct.bucket.grantReadWrite(
        moveCloudFrontAccessLogLambda
      );
      props.cloudFrontAccessLogBucketConstruct.bucket.grantDelete(
        moveCloudFrontAccessLogLambda
      );

      new cdk.aws_events.Rule(this, "CloudFrontAccessLogCreatedEventRule", {
        eventPattern: {
          source: ["aws.s3"],
          resources: [
            props.cloudFrontAccessLogBucketConstruct.bucket.bucketArn,
          ],
          detailType: ["Object Created"],
          detail: {
            object: {
              key: [
                {
                  "anything-but": {
                    prefix: targetKeyPrefix,
                  },
                },
              ],
            },
          },
        },
        targets: [
          new cdk.aws_events_targets.LambdaFunction(
            moveCloudFrontAccessLogLambda
          ),
        ],
      });
    }
  }
}
