import type { ApiClient } from '../api/client.js';
import type { ProviderContext, Step, EnvConfig } from '../types.js';
import { createAccount } from './account.js';
import { setupProfile, completeProfile } from './profile.js';
import { setupPayment, upgradeSubscription } from './upgrade.js';
import { acceptDisclosure } from './disclosure.js';
import { completeEnrollment } from './enrollment.js';

export interface StepDefinition {
  name: Step;
  runner: (
    client: ApiClient,
    ctx: ProviderContext,
    payloads: any,
    envConfig?: EnvConfig
  ) => Promise<void>;
}

export const STEP_PIPELINE: StepDefinition[] = [
  { name: 'account-created', runner: createAccount },
  { name: 'at-availability', runner: setupProfile },
  { name: 'profile-complete', runner: completeProfile },
  { name: 'pre-upgrade', runner: setupPayment },
  { name: 'upgraded', runner: upgradeSubscription },
  { name: 'at-disclosure', runner: acceptDisclosure },
  { name: 'fully-enrolled', runner: completeEnrollment },
];

export function getStepsUpTo(targetStep: Step): StepDefinition[] {
  const index = STEP_PIPELINE.findIndex((s) => s.name === targetStep);
  if (index === -1) {
    throw new Error(
      `Unknown step: "${targetStep}". Valid steps: ${STEP_PIPELINE.map((s) => s.name).join(', ')}`
    );
  }
  return STEP_PIPELINE.slice(0, index + 1);
}
