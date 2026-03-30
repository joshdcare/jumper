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
    const warnings = validateEnvVars('mobile', 'at-availability', 'dev');
    expect(warnings).toContainEqual(expect.objectContaining({ var: 'CZEN_API_KEY' }));
    if (original) process.env.CZEN_API_KEY = original;
  });

  it('returns missing MYSQL_DB_PASS_DEV for mobile fully-enrolled on dev', () => {
    const original = process.env.MYSQL_DB_PASS_DEV;
    delete process.env.MYSQL_DB_PASS_DEV;
    const warnings = validateEnvVars('mobile', 'fully-enrolled', 'dev');
    expect(warnings).toContainEqual(expect.objectContaining({ var: 'MYSQL_DB_PASS_DEV' }));
    if (original) process.env.MYSQL_DB_PASS_DEV = original;
  });

  it('returns missing MYSQL_DB_PASS_STG for mobile fully-enrolled on stg', () => {
    const original = process.env.MYSQL_DB_PASS_STG;
    delete process.env.MYSQL_DB_PASS_STG;
    const warnings = validateEnvVars('mobile', 'fully-enrolled', 'stg');
    expect(warnings).toContainEqual(expect.objectContaining({ var: 'MYSQL_DB_PASS_STG' }));
    if (original) process.env.MYSQL_DB_PASS_STG = original;
  });

  it('returns missing CZEN_API_KEY_STG for mobile on stg', () => {
    const original = process.env.CZEN_API_KEY_STG;
    delete process.env.CZEN_API_KEY_STG;
    const warnings = validateEnvVars('mobile', 'at-availability', 'stg');
    expect(warnings).toContainEqual(expect.objectContaining({ var: 'CZEN_API_KEY_STG' }));
    if (original) process.env.CZEN_API_KEY_STG = original;
  });

  it('does not require CZEN_API_KEY for web', () => {
    const original = process.env.CZEN_API_KEY;
    delete process.env.CZEN_API_KEY;
    const warnings = validateEnvVars('web', 'at-location', 'dev');
    expect(warnings.find(w => w.var === 'CZEN_API_KEY')).toBeUndefined();
    if (original) process.env.CZEN_API_KEY = original;
  });
});
