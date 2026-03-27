import { describe, it, expect } from 'vitest';
import { getStepsForPlatform, validateEnvVars } from '../../src/tui/wizard.js';

describe('getStepsForPlatform', () => {
  it('returns web steps for web platform', () => {
    const steps = getStepsForPlatform('web');
    expect(steps[0]).toBe('at-get-started');
    expect(steps.length).toBeGreaterThanOrEqual(10);
  });

  it('returns mobile steps for mobile platform', () => {
    const steps = getStepsForPlatform('mobile');
    expect(steps[0]).toBe('account-created');
    expect(steps.length).toBeGreaterThanOrEqual(5);
  });
});

describe('validateEnvVars', () => {
  it('returns missing CZEN_API_KEY for mobile', () => {
    const original = process.env.CZEN_API_KEY;
    delete process.env.CZEN_API_KEY;
    const warnings = validateEnvVars('mobile', 'at-availability');
    expect(warnings).toContainEqual(expect.objectContaining({ var: 'CZEN_API_KEY' }));
    if (original) process.env.CZEN_API_KEY = original;
  });

  it('returns missing MYSQL_DB_PASS_DEV for mobile fully-enrolled', () => {
    const original = process.env.MYSQL_DB_PASS_DEV;
    delete process.env.MYSQL_DB_PASS_DEV;
    const warnings = validateEnvVars('mobile', 'fully-enrolled');
    expect(warnings).toContainEqual(expect.objectContaining({ var: 'MYSQL_DB_PASS_DEV' }));
    if (original) process.env.MYSQL_DB_PASS_DEV = original;
  });

  it('does not require CZEN_API_KEY for web', () => {
    const original = process.env.CZEN_API_KEY;
    delete process.env.CZEN_API_KEY;
    const warnings = validateEnvVars('web', 'at-location');
    expect(warnings.find(w => w.var === 'CZEN_API_KEY')).toBeUndefined();
    if (original) process.env.CZEN_API_KEY = original;
  });
});
