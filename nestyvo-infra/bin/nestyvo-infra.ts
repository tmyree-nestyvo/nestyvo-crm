#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { NetworkStack } from '../lib/network-stack';
import { DatabaseStack } from '../lib/database-stack';

const app = new cdk.App();

// Pinned, not environment-agnostic — the "new AWS experience" rules this
// project runs under (see nestyvo-api/CLAUDE.md) require every Regional
// resource to land in the project's one assigned Region. Hardcoding it here
// means a stray `cdk deploy` from a shell with a different default profile/
// region active can't accidentally stand up resources somewhere else.
const env = { account: '454911205143', region: 'us-east-2' };

const network = new NetworkStack(app, 'NestyvoNetworkStack', { env });

new DatabaseStack(app, 'NestyvoDatabaseStack', { env, vpc: network.vpc });
