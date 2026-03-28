import { describe, it, expect } from 'vitest';
import { truncate } from '../../src/recorder/truncate.js';

describe('truncate', () => {
  it('returns short strings unchanged', () => {
    expect(truncate('hello')).toBe('hello');
  });

  it('returns strings at exactly maxLen unchanged', () => {
    const s = 'a'.repeat(2048);
    expect(truncate(s)).toBe(s);
  });

  it('truncates strings exceeding maxLen', () => {
    const s = 'a'.repeat(3000);
    const result = truncate(s);
    expect(result.length).toBeLessThan(3000);
    expect(result).toContain('...[truncated, 3000 bytes total]');
    expect(result.startsWith('a'.repeat(2048))).toBe(true);
  });

  it('accepts custom maxLen', () => {
    const result = truncate('abcdef', 3);
    expect(result).toBe('abc...[truncated, 6 bytes total]');
  });

  it('handles empty string', () => {
    expect(truncate('')).toBe('');
  });
});
