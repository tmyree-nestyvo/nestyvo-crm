import * as cdk from 'aws-cdk-lib/core';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface ComputeStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  ecrRepo: ecr.IRepository;
  dbSecurityGroup: ec2.ISecurityGroup;
  anthropicApiKey: secretsmanager.ISecret;
  jwtSecret: secretsmanager.ISecret;
  devLoginSecret: secretsmanager.ISecret;
  databaseUrl: secretsmanager.ISecret;
}

/**
 * Phase 4 — ECS Fargate + ALB.
 *
 * Uses the ecs-patterns `ApplicationLoadBalancedFargateService` rather than
 * hand-wiring Cluster/TaskDefinition/Service/ALB/TargetGroup/Listener
 * separately — it's AWS's own well-tested pattern for exactly this shape
 * (one service, one ALB, public-facing), and every piece it creates
 * (security groups, the ALB-to-Fargate wiring, secret grants on the
 * execution role) is still inspectable afterward. Hand-rolling the same
 * six resources individually would be more code with more chances to get
 * a security-group rule wrong, for no real benefit at this scale.
 *
 * desiredCount: 1, cpu 256 (.25 vCPU) / memory 512 MiB — matches Railway's
 * current single-instance, modest-traffic reality (one first customer,
 * pre-pilot). Scaling (desiredCount, or autoscaling on CPU) is the first
 * thing to revisit once there's real pilot traffic to size against.
 *
 * HTTP only, not HTTPS — the ALB's own AWS-generated DNS name
 * (*.elb.amazonaws.com) can't get an ACM certificate; that requires a real
 * domain pointed at it, which doesn't exist yet. This stack is for
 * parallel build-and-verify, not yet taking real traffic — Railway (which
 * already terminates HTTPS) keeps serving the live app until a domain +
 * ACM cert + HTTPS listener are added as part of the actual cutover. Not
 * silently shipping something that looks production-ready but isn't.
 */
export class ComputeStack extends cdk.Stack {
  public readonly service: ecsPatterns.ApplicationLoadBalancedFargateService;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    const logGroup = new logs.LogGroup(this, 'ApiLogGroup', {
      logGroupName: '/nestyvo/api',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.service = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'ApiService', {
      vpc: props.vpc,
      serviceName: 'nestyvo-api',
      cpu: 256,
      memoryLimitMiB: 512,
      desiredCount: 1,
      publicLoadBalancer: true,
      // Fargate tasks live in the private-with-egress subnets (outbound to
      // Anthropic/Twilio/Rula-Headway via the Phase 1 NAT Gateway, never
      // directly reachable from the internet — only the ALB is public).
      taskSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      taskImageOptions: {
        image: ecs.ContainerImage.fromEcrRepository(props.ecrRepo, 'latest'),
        containerPort: 3000,
        logDriver: ecs.LogDrivers.awsLogs({ streamPrefix: 'api', logGroup }),
        environment: {
          NODE_ENV: 'production',
          TZ: 'America/Los_Angeles',
          PORT: '3000',
          // DEV_AUTH_BYPASS stays true here, matching Railway's current
          // production value exactly (confirmed via `railway variables`)
          // — real Cognito auth isn't provisioned yet (dormant
          // CognitoStrategy in auth/cognito.strategy.ts); flipping this
          // off breaks every login, not just this one. Carrying over the
          // same real state, not changing app behavior as a side effect
          // of the infra move.
          DEV_AUTH_BYPASS: 'true',
          // main.ts's CORS allowlist, not this stack's own ALB URL — this
          // is the *frontend's* origin (still Netlify; Phase 5 hasn't
          // moved it to CloudFront yet). Matches Railway's real current
          // value (confirmed via `railway variables`) so the existing
          // Netlify frontend could point at this API for verification
          // without a CORS rejection.
          APP_URL: 'https://profound-medovik-ac1b30.netlify.app',
        },
        secrets: {
          ANTHROPIC_API_KEY: ecs.Secret.fromSecretsManager(props.anthropicApiKey),
          JWT_SECRET: ecs.Secret.fromSecretsManager(props.jwtSecret),
          DEV_LOGIN_SECRET: ecs.Secret.fromSecretsManager(props.devLoginSecret),
          DATABASE_URL: ecs.Secret.fromSecretsManager(props.databaseUrl),
        },
      },
      // app.controller.ts's @Public() GET /health, behind the global
      // 'api/v1' prefix set in main.ts — this is the one unauthenticated
      // route that exists for exactly this purpose.
      healthCheckGracePeriod: cdk.Duration.seconds(60),
      // Without this, a task stuck failing to start (exactly what happened
      // during this phase's own secret-access investigation) leaves the
      // deployment hanging for up to 3 hours before CloudFormation gives
      // up — CDK warns about this by default. Fail fast and roll back
      // instead.
      circuitBreaker: { rollback: true },
      minHealthyPercent: 0,
    });

    this.service.targetGroup.configureHealthCheck({
      path: '/api/v1/health',
      healthyHttpCodes: '200',
    });

    // The one permanent ingress rule promised in DatabaseStack's security-
    // group comment — only the Fargate service's own security group, never
    // opened to the VPC CIDR or the internet.
    //
    // Deliberately NOT props.dbSecurityGroup.addIngressRule(...) — that
    // high-level method attaches the new SecurityGroupIngress resource to
    // whichever stack owns the *target* security group (DatabaseStack),
    // but the rule's source is this stack's own Fargate security group,
    // so DatabaseStack would end up depending on ComputeStack for that
    // reference — and ComputeStack already depends on DatabaseStack for
    // the database itself. A real circular stack dependency, discovered
    // the hard way when `cdk deploy` on either stack got stuck re-entering
    // the other (Oct 5 2026). The low-level CfnSecurityGroupIngress below
    // creates the exact same rule but as a resource IN this stack instead,
    // referencing the target by ID only — one-directional dependency,
    // same as every other cross-stack reference here.
    new ec2.CfnSecurityGroupIngress(this, 'DbIngressFromApiService', {
      groupId: props.dbSecurityGroup.securityGroupId,
      sourceSecurityGroupId: this.service.service.connections.securityGroups[0].securityGroupId,
      ipProtocol: 'tcp',
      fromPort: 5432,
      toPort: 5432,
      description: 'Nestyvo Fargate service (Phase 4)',
    });

    new cdk.CfnOutput(this, 'ApiUrl', { value: `http://${this.service.loadBalancer.loadBalancerDnsName}` });
  }
}
