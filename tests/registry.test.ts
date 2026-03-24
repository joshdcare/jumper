import { describe, it, expect } from 'vitest';
import { getStepsUpTo, STEP_PIPELINE } from '../src/steps/registry.js';

describe('Step Registry', () => {
  it('returns only account-created step for that target', () => {
    const steps = getStepsUpTo('account-created');
    expect(steps).toHaveLength(1);
    expect(steps[0].name).toBe('account-created');
  });

  it('returns cumulative steps up to upgraded', () => {
    const steps = getStepsUpTo('upgraded');
    expect(steps.map((s) => s.name)).toEqual([
      'account-created',
      'at-availability',
      'profile-complete',
      'pre-upgrade',
      'upgraded',
    ]);
  });

  it('returns all steps for fully-enrolled', () => {
    const steps = getStepsUpTo('fully-enrolled');
    expect(steps).toHaveLength(STEP_PIPELINE.length);
  });

  it('throws for unknown step', () => {
    expect(() => getStepsUpTo('unknown' as any)).toThrow();
  });
});
