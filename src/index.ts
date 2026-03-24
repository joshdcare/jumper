#!/usr/bin/env node
import 'dotenv/config';
import { Command, CommanderError } from 'commander';
import { STEPS, ENV_CONFIGS } from './types.js';
import type { Step, Tier, Vertical, CliOptions, ProviderContext } from './types.js';
import { ApiClient } from './api/client.js';
import { getAccessToken } from './api/auth.js';
import { getStepsUpTo } from './steps/registry.js';

export function parseArgs(argv: string[]): CliOptions {
  const program = new Command();
  program.exitOverride();
  program
    .requiredOption(
      '--step <step>',
      `Enrollment checkpoint (${STEPS.join(', ')})`,
      (value: string) => {
        if (!STEPS.includes(value as Step)) {
          throw new Error(
            `Invalid step "${value}". Valid: ${STEPS.join(', ')}`
          );
        }
        return value as Step;
      }
    )
    .option('--tier <tier>', 'Subscription tier', 'premium')
    .option('--vertical <vertical>', 'Service vertical', 'childcare')
    .option('--env <env>', 'Target environment', 'dev');

  program.parse(argv, { from: 'user' });
  return program.opts() as CliOptions;
}

async function loadPayloads(vertical: Vertical) {
  switch (vertical) {
    case 'childcare':
      return import('./payloads/childcare.js');
    default:
      throw new Error(`Unsupported vertical: ${vertical}`);
  }
}

async function run(opts: CliOptions): Promise<void> {
  const envConfig = ENV_CONFIGS[opts.env];
  if (!envConfig) {
    throw new Error(`Unknown environment: ${opts.env}`);
  }

  if (!envConfig.apiKey) {
    throw new Error('CZEN_API_KEY environment variable is required');
  }

  const client = new ApiClient(envConfig.baseUrl, envConfig.apiKey);
  const payloads = await loadPayloads(opts.vertical);

  const ctx: ProviderContext = {
    email: '',
    password: 'letmein1',
    memberId: '',
    authToken: '',
    tier: opts.tier as Tier,
    vertical: payloads.providerCreateDefaults.serviceType,
  };

  const steps = getStepsUpTo(opts.step);

  console.log(`\nCreating provider at step: ${opts.step}\n`);

  for (const step of steps) {
    if (step.name !== 'account-created' && !ctx.accessToken) {
      console.log('  ⏳ Acquiring access token...');
      ctx.accessToken = await getAccessToken(ctx.email, envConfig.baseUrl);
      client.setAccessToken(ctx.accessToken);
    }

    try {
      await step.runner(client, ctx, payloads, envConfig);
    } catch (err) {
      console.error(`\n✗ Failed at step: ${step.name}`);
      console.error(`  Error: ${(err as Error).message}`);
      if (ctx.email) {
        console.log('\n  Partial provider created:');
        console.log(`    Email:    ${ctx.email}`);
        console.log(`    Password: ${ctx.password}`);
        if (ctx.memberId) console.log(`    MemberId: ${ctx.memberId}`);
      }
      process.exit(1);
    }
  }

  console.log(`\n✓ Provider created at step: ${opts.step}\n`);
  console.log(`  Email:      ${ctx.email}`);
  console.log(`  Password:   ${ctx.password}`);
  console.log(`  MemberId:   ${ctx.memberId}`);
  console.log(`  UUID:       ${ctx.uuid ?? '(set MYSQL_DB_PASS_DEV to retrieve)'}`);
  console.log(`  Vertical:   ${ctx.vertical}`);
  console.log('');
}

const isMainModule = process.argv[1]?.includes('index');
if (isMainModule) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    run(opts).catch((err) => {
      console.error('Fatal error:', (err as Error).message);
      process.exit(1);
    });
  } catch (err) {
    if (err instanceof CommanderError) {
      process.exit(err.exitCode);
    }
    console.error('Fatal error:', (err as Error).message);
    process.exit(1);
  }
}
