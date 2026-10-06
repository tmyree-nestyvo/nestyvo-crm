import * as cdk from 'aws-cdk-lib/core';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import { Construct } from 'constructs';

export interface DatabaseStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
}

/**
 * Phase 2 — RDS PostgreSQL.
 *
 * Lands in the VPC's private-isolated subnets (NetworkStack) — no route to
 * the internet in either direction. Nothing reaches this database except
 * something else inside the VPC with an explicit security-group rule; the
 * Fargate service's security group (Phase 4) is the only one that will ever
 * get one as a permanent rule. The initial data copy from Railway needs its
 * own temporary access path (an SSM-only bastion, torn down right after) —
 * see the Phase 2 migration notes in project memory, not part of this stack.
 *
 * db.t3.micro, single-AZ, 20 GB gp3 with autoscaling to 100 GB — matches the
 * ~$62/mo single-AZ cost target (same call as NetworkStack's single NAT
 * Gateway). Multi-AZ failover is the first thing to add when this moves
 * toward the ~$120-150/mo tier; it roughly doubles the instance+storage
 * cost in exchange for an automatic standby in a second AZ.
 *
 * Engine 18.6 — matches Railway's live Postgres version exactly (confirmed
 * via `SELECT version()` against the real production database), so the
 * data copy isn't also a major-version migration.
 */
export class DatabaseStack extends cdk.Stack {
  public readonly dbInstance: rds.DatabaseInstance;
  public readonly dbSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    this.dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSecurityGroup', {
      vpc: props.vpc,
      securityGroupName: 'nestyvo-rds-sg',
      description: 'Nestyvo RDS - no default ingress. Rules added explicitly per allowed caller (Fargate service in Phase 4; a temporary migration bastion for the initial data copy).',
      allowAllOutbound: false,
    });

    this.dbInstance = new rds.DatabaseInstance(this, 'NestyvoDb', {
      instanceIdentifier: 'nestyvo-db',
      engine: rds.DatabaseInstanceEngine.postgres({
        // .of() escape hatch, not the named VER_18_6 constant — the
        // installed CDK release (2.1144.0) only names versions up through
        // 18.3; AWS itself already offers 18.6 (confirmed via `aws rds
        // describe-db-engine-versions`), matching Railway's live version
        // exactly. Revisit to the named constant once CDK catches up.
        version: rds.PostgresEngineVersion.of('18.6', '18'),
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.MICRO),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [this.dbSecurityGroup],
      multiAz: false,
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      storageType: rds.StorageType.GP3,
      // Explicit, not relying on a default — this environment is headed
      // toward real PHI, and at-rest encryption was an open TODO on the
      // Railway setup (never independently confirmed). KMS key is the AWS-
      // managed default (aws/rds) rather than a customer-managed key; a CMK
      // only matters once there's a real need to control/rotate the key
      // independently of AWS, which isn't a requirement yet.
      storageEncrypted: true,
      databaseName: 'nestyvo',
      // fromGeneratedSecret creates (and rotates-on-demand) a Secrets
      // Manager secret holding username+password — the same mechanism
      // Phase 3 reuses for the app's other env vars, so credentials never
      // live in a config file or CDK code.
      credentials: rds.Credentials.fromGeneratedSecret('nestyvo_admin', {
        secretName: 'nestyvo/rds/credentials',
      }),
      // 1 day, not 7 — this account is on the AWS Free Tier plan
      // (confirmed via `aws freetier get-account-plan-state`:
      // accountPlanType FREE, $120 remaining credit), which caps RDS
      // automated-backup retention below 7. Revisit once the account is
      // upgraded off Free Tier — 7+ days is the real target before any
      // production/PHI cutover.
      backupRetention: cdk.Duration.days(1),
      deleteAutomatedBackups: false,
      // SNAPSHOT, not RETAIN or DESTROY — a stack destroy takes a final
      // snapshot before removing the instance rather than either silently
      // keeping a running (billed) instance behind or deleting data
      // outright. Matches the app's own never-hard-delete convention.
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
    });

    new cdk.CfnOutput(this, 'DbEndpoint', { value: this.dbInstance.dbInstanceEndpointAddress });
    new cdk.CfnOutput(this, 'DbSecretArn', { value: this.dbInstance.secret!.secretArn });
  }
}
