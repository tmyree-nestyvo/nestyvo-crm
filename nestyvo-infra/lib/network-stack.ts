import * as cdk from 'aws-cdk-lib/core';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';

/**
 * Phase 1 — Foundation.
 *
 * VPC layout, three subnet tiers per AZ:
 *   - PUBLIC              → the ALB (Phase 4) and the single NAT Gateway live here.
 *   - PRIVATE_WITH_EGRESS  → ECS Fargate tasks (Phase 4). Can reach the internet
 *     (Anthropic API, Twilio, Rula/Headway .ics feeds) via the NAT Gateway, but
 *     are never directly reachable from the internet themselves.
 *   - PRIVATE_ISOLATED     → RDS (Phase 2). No route to the internet at all in
 *     either direction — the most defensible posture for the database in an
 *     environment that will eventually hold real PHI.
 *
 * natGateways: 1 (not one per AZ) is a deliberate cost call, not an oversight —
 * matches the ~$62/mo single-AZ target already scoped with Charlene back in
 * the original AWS-migration plan. A single NAT Gateway is a single point of
 * failure for the API's *outbound* internet calls (not for inbound traffic,
 * not for the database) if that one AZ has an outage. Going to one-per-AZ
 * (~$32/mo each) is the first thing to revisit when this moves toward the
 * multi-AZ ~$120-150/mo tier.
 */
export class NetworkStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly ecrRepo: ecr.Repository;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.vpc = new ec2.Vpc(this, 'NestyvoVpc', {
      vpcName: 'nestyvo-vpc',
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'private-egress', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        { name: 'private-isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    // Gateway endpoint for S3 — free, no hourly charge, and the frontend
    // build + any future file storage goes through S3 anyway. Keeps that
    // traffic off the NAT Gateway (which bills per-GB processed).
    this.vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });

    // Interface endpoint for Secrets Manager — NOT optional, discovered the
    // hard way in Phase 4 (Oct 5 2026). This "new AWS experience" account
    // carries an AWS-managed Resource Control Policy (confirmed via
    // `iam simulate-principal-policy`, showing an org-level explicit deny
    // with MatchedStatements: [] — the identity policy was correct and
    // irrelevant) that blocks secretsmanager:GetSecretValue (and several
    // other services) for calls that leave the VPC over the NAT Gateway to
    // the public regional API endpoint. The Fargate execution role's IAM
    // policy was correct the whole time; every secret fetch failed anyway
    // until traffic had a private path. ~$7.30/mo + minor data processing.
    this.vpc.addInterfaceEndpoint('SecretsManagerEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });

    // ECR repo for the API container image (Phase 4 pulls from this).
    // imageScanOnPush — free vulnerability scanning on every push, a real
    // security control worth having before this environment holds PHI.
    // Lifecycle rule keeps the repo from accumulating unlimited old images
    // (storage cost + clutter) while still keeping enough history to roll
    // back a bad deploy.
    this.ecrRepo = new ecr.Repository(this, 'NestyvoApiRepo', {
      repositoryName: 'nestyvo-api',
      imageScanOnPush: true,
      lifecycleRules: [
        {
          description: 'Keep the 15 most recent images, expire the rest',
          maxImageCount: 15,
        },
      ],
      // RETAIN — an `npx cdk destroy` of this stack should never silently
      // delete pushed container images. Matches the entity-level
      // never-hard-delete convention already used throughout the app's own
      // database (Practice.isActive, Provider.status, etc.).
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
  }
}
