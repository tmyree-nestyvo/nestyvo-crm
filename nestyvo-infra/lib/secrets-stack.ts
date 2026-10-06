import * as cdk from 'aws-cdk-lib/core';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

/**
 * Phase 3 — Secrets Manager.
 *
 * All secrets below were created imperatively via `aws secretsmanager
 * create-secret` (and by RDS itself for `nestyvo/rds/credentials`, Phase
 * 2's `fromGeneratedSecret`), NOT by this stack. That's deliberate, not a
 * shortcut: CDK can only create a *new* secret either by generating a
 * random value or by baking a plaintext value into the CloudFormation
 * template/CDK source — neither is an option when the whole point is
 * migrating an *existing* real value (Railway's live ANTHROPIC_API_KEY,
 * JWT_SECRET, DEV_LOGIN_SECRET) without ever writing it into source
 * control or CloudFormation state.
 *
 * What this stack actually does is import them by name (`fromSecretNameV2`)
 * so they're visible, documented, and grantable from CDK — Phase 4's
 * Fargate task definition references these exports rather than hardcoding
 * secret names inline.
 *
 * jwt-secret/dev-login-secret/database-url point at "-v2" names, not the
 * originals — a real, unexplained Phase 4 finding (Oct 5 2026). ECS's
 * execution role could GetSecretValue on anthropic-api-key fine, but got
 * AccessDeniedException specifically on the original jwt-secret and
 * dev-login-secret ARNs, with the IAM policy granting all of them
 * identically (confirmed via CloudTrail — same role, same moment, one
 * call succeeds, the next fails). `iam simulate-principal-policy` was not
 * trustworthy for diagnosing this: it reported explicitDeny for secrets
 * that demonstrably succeeded in CloudTrail, so don't trust it over real
 * traffic for this account. Recreating each affected secret under a new
 * name (new ARN, new random suffix) fixed every one of them — strongly
 * suggests a stale/incorrect authorization cache tied to specific
 * resource ARNs (likely ones that were denied at least once, early,
 * before this phase's VPC endpoint existed), not an actual policy or
 * network problem. The original nestyvo/api/{jwt-secret,dev-login-secret,
 * database-url} are left in place, unused, pending cleanup once this is
 * fully confirmed stable.
 */
export class SecretsStack extends cdk.Stack {
  public readonly anthropicApiKey: secretsmanager.ISecret;
  public readonly jwtSecret: secretsmanager.ISecret;
  public readonly devLoginSecret: secretsmanager.ISecret;
  public readonly databaseUrl: secretsmanager.ISecret;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Migrated from Railway's ANTHROPIC_API_KEY — the AI copilot's live
    // key. The one secret that never hit the ARN-specific denial below.
    this.anthropicApiKey = secretsmanager.Secret.fromSecretNameV2(
      this, 'AnthropicApiKey', 'nestyvo/api/anthropic-api-key',
    );

    // Migrated from Railway's JWT_SECRET — HS256 signing key (DevStrategy).
    this.jwtSecret = secretsmanager.Secret.fromSecretNameV2(
      this, 'JwtSecret', 'nestyvo/api/jwt-secret-v2',
    );

    // Migrated from Railway's DEV_LOGIN_SECRET — the x-dev-secret header
    // value DevAuthController requires. Stays a real, gated verification
    // tool in AWS too (see dev-auth.controller.ts) — not something to drop
    // just because the environment changed.
    this.devLoginSecret = secretsmanager.Secret.fromSecretNameV2(
      this, 'DevLoginSecret', 'nestyvo/api/dev-login-secret-v2',
    );

    // Composed postgres:// connection string (nestyvo_admin + the RDS
    // password from nestyvo/rds/credentials + the RDS endpoint) — the
    // app's TypeORM config (app.module.ts) prefers a single DATABASE_URL
    // over discrete host/user/password vars, exactly like Railway. Kept as
    // its own secret rather than asking the app to assemble it at runtime
    // from 3 separate secrets, which would need code changes.
    this.databaseUrl = secretsmanager.Secret.fromSecretNameV2(
      this, 'DatabaseUrl', 'nestyvo/api/database-url-v2',
    );
  }
}
