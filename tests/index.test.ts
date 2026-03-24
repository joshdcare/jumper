import { describe, it, expect } from 'vitest';
import { parseArgs } from '../src/index.js';

describe('parseArgs', () => {
  it('parses required --step flag', () => {
    const opts = parseArgs(['--step', 'upgraded']);
    expect(opts.step).toBe('upgraded');
    expect(opts.tier).toBe('premium');
    expect(opts.vertical).toBe('childcare');
    expect(opts.env).toBe('dev');
  });

  it('parses all flags', () => {
    const opts = parseArgs([
      '--step',
      'pre-upgrade',
      '--tier',
      'basic',
      '--vertical',
      'childcare',
      '--env',
      'dev',
    ]);
    expect(opts.step).toBe('pre-upgrade');
    expect(opts.tier).toBe('basic');
  });

  it('rejects invalid step', () => {
    expect(() => parseArgs(['--step', 'invalid'])).toThrow();
  });
});
