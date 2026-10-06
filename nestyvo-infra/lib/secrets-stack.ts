import * as cdk from 'aws-cdk-lib/core';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

/**
 * Phase 3 — Secrets Manager.
 *
 * All 4 secrets below were created imperatively via `aws secretsmanager
 * create-secret` (3 of them) and by RDS itself (`nestyvo/rds/credentials`,
 * Phase 2's `fromGeneratedSecret`), NOT by this stack. That's deliberate,
 * not a shortcut: CDK can only create a *new* secret either by generating
 * a random value or by baking a plaintext value into the CloudFormation
 * template/CDK source — neither is an option when the whole point is
 * migrating an *existing* real value (Railway's live ANTHROPIC_API_KEY,
 * JWT_SECRET, DEV_LOGIN_SECRET) without ever writing it into source control
 * or CloudFormation state.
 *
 * What this stack actually does is import them by name (`fromSecretNameV2`)
 * so they're visible, documented, and grantable from CDK — Phase 4's
 * Fargate task definition references these exports rather than hardcoding
 * secret names inline.
 */
export class SecretsStack extends cdk.Stack {
  public readonly anthropicApiKey: secretsmanager.ISecret;
  public readonly jwtSecret: secretsmanager.ISecret;
  public readonly devLoginSecret: secretsmanager.ISecret;
  public readonly databaseUrl: secretsmanager.ISecret;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Migrated from Railway's ANTHROPIC_API_KEY — the AI copilot's live key.
    this.anthropicApiKey = secretsmanager.Secret.fromSecretNameV2(
      this, 'AnthropicApiKey', 'nestyvo/api/anthropic-api-key',
    );

    // Migrated from Railway's JWT_SECRET — HS256 signing key (DevStrategy).
    this.jwtSecret = secretsmanager.Secret.fromSecretNameV2(
      this, 'JwtSecret', 'nestyvo/api/jwt-secret',
    );

    // Migrated from Railway's DEV_LOGIN_SECRET — the x-dev-secret header
    // value DevAuthController requires. Stays a real, gated verification
    // tool in AWS too (see dev-auth.controller.ts) — not something to drop
    // just because the environment changed.
    this.devLoginSecret = secretsmanager.Secret.fromSecretNameV2(
      this, 'DevLoginSecret', 'nestyvo/api/dev-login-secret',
    );

    // Composed postgres:// connection string (nestyvo_admin + the RDS
    // password from nestyvo/rds/credentials + the RDS endpoint) — the
    // app's TypeORM config (app.module.ts) prefers a single DATABASE_URL
    // over discrete host/user/password vars, exactly like Railway. Kept as
    // its own secret rather than asking the app to assemble it at runtime
    // from 3 separate secrets, which would need code changes.
    this.databaseUrl = secretsmanager.Secret.fromSecretNameV2(
      this, 'DatabaseUrl', 'nestyvo/api/database-url',
    );
  }
}
