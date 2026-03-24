import { describe, it, expect, beforeEach } from 'vitest';
import { ApiClient } from '../src/api/client.js';

describe('ApiClient', () => {
  let client: ApiClient;

  beforeEach(() => {
    client = new ApiClient('https://example.com', 'test-api-key');
  });

  describe('retryRequest', () => {
    it('retries on failure and returns on success', async () => {
      let attempt = 0;
      const result = await client.retryRequest(async () => {
        attempt++;
        if (attempt < 3) throw new Error('fail');
        return 'success';
      }, 3, 'test op');
      expect(result).toBe('success');
      expect(attempt).toBe(3);
    });

    it('throws after exhausting retries', async () => {
      await expect(
        client.retryRequest(async () => {
          throw new Error('always fails');
        }, 3, 'test op')
      ).rejects.toThrow('always fails');
    });
  });
});
