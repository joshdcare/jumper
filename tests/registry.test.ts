import { describe, it, expect } from 'vitest';
import { getStepsUpTo, MOBILE_STEP_PIPELINE } from '../src/steps/registry.js';

describe('Step Registry', () => {
  describe('web platform', () => {
    it('throws because web uses browser-based flow', () => {
      expect(() => getStepsUpTo('at-location' as any, 'web')).toThrow(/browser-based/i);
    });
  });

  describe('mobile pipeline', () => {
    it('returns cumulative steps up to at-build-profile', () => {
      const steps = getStepsUpTo('at-build-profile', 'mobile');
      expect(steps.map((s) => s.name)).toEqual([
        'account-created',
        'at-build-profile',
      ]);
    });

    it('returns cumulative steps up to at-availability', () => {
      const steps = getStepsUpTo('at-availability', 'mobile');
      expect(steps.map((s) => s.name)).toEqual([
        'account-created',
        'at-build-profile',
        'at-availability',
      ]);
    });

    it('puts build-profile before availability and availability before upgraded', () => {
      const steps = getStepsUpTo('upgraded', 'mobile');
      const names = steps.map((s) => s.name);
      expect(names.indexOf('at-build-profile')).toBeLessThan(names.indexOf('at-availability'));
      expect(names.indexOf('at-availability')).toBeLessThan(names.indexOf('upgraded'));
    });

    it('returns all steps for fully-enrolled', () => {
      const steps = getStepsUpTo('fully-enrolled', 'mobile');
      expect(steps).toHaveLength(MOBILE_STEP_PIPELINE.length);
    });

    it('throws for unknown step', () => {
      expect(() => getStepsUpTo('unknown' as any, 'mobile')).toThrow(/mobile platform/i);
    });

    it('throws for web-only step on mobile', () => {
      expect(() => getStepsUpTo('at-location' as any, 'mobile')).toThrow(/mobile platform/i);
    });
  });
});
