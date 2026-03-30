import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LDClient } from '../src/api/launchdarkly.js';

const BASE = 'https://app.launchdarkly.com/api/v2';
const PROJECT = 'test-project';

function mockJsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('LDClient', () => {
  let fetchImpl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchImpl = vi.fn();
  });

  describe('searchFlags', () => {
    it('returns flags with correct on state from environments', async () => {
      fetchImpl.mockResolvedValueOnce(
        mockJsonResponse({
          items: [
            {
              key: 'flag-a',
              name: 'Flag A',
              environments: {
                dev: { on: true },
              },
            },
            {
              key: 'flag-b',
              name: 'Flag B',
              environments: {
                dev: { on: false },
              },
            },
          ],
        })
      );

      const client = new LDClient('api-token', PROJECT, fetchImpl);
      const flags = await client.searchFlags('my-query', 'dev');

      expect(flags).toEqual([
        { key: 'flag-a', name: 'Flag A', on: true },
        { key: 'flag-b', name: 'Flag B', on: false },
      ]);

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const url = new URL(fetchImpl.mock.calls[0][0] as string);
      expect(url.origin + url.pathname).toBe(`${BASE}/flags/${PROJECT}`);
      expect(url.searchParams.get('env')).toBe('dev');
      expect(url.searchParams.get('filter')).toBe('query:my-query');
      expect(url.searchParams.get('limit')).toBe('20');
      expect(url.searchParams.get('sort')).toBe('name');
      expect(fetchImpl.mock.calls[0][1].headers).toMatchObject({
        Authorization: 'api-token',
      });
    });

    it('omits filter when query is empty', async () => {
      fetchImpl.mockResolvedValueOnce(mockJsonResponse({ items: [] }));

      const client = new LDClient('api-token', PROJECT, fetchImpl);
      await client.searchFlags('', 'dev');

      const url = new URL(fetchImpl.mock.calls[0][0] as string);
      expect(url.searchParams.has('filter')).toBe(false);
    });

    it('throws on API error (401)', async () => {
      fetchImpl.mockResolvedValueOnce(
        mockJsonResponse({ message: 'Unauthorized' }, { status: 401 })
      );

      const client = new LDClient('bad-token', PROJECT, fetchImpl);
      await expect(client.searchFlags('q', 'dev')).rejects.toThrow(
        'LaunchDarkly API error (401): Unauthorized'
      );
    });
  });

  describe('toggleFlag', () => {
    it('sends correct PATCH body and returns updated flag', async () => {
      const flagKey = 'my-feature';
      const updated = {
        key: flagKey,
        name: 'My Feature',
        environments: {
          stg: { on: true },
        },
      };
      fetchImpl.mockResolvedValueOnce(mockJsonResponse(updated));

      const client = new LDClient('api-token', PROJECT, fetchImpl);
      const result = await client.toggleFlag(flagKey, 'stg', true);

      expect(result).toEqual({
        key: flagKey,
        name: 'My Feature',
        on: true,
      });

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE}/flags/${PROJECT}/${flagKey}`);
      expect(init.method).toBe('PATCH');
      expect(init.headers).toMatchObject({
        Authorization: 'api-token',
        'Content-Type':
          'application/json; domain-model=launchdarkly.semanticpatch',
      });
      expect(JSON.parse(init.body as string)).toEqual({
        environmentKey: 'stg',
        instructions: [{ kind: 'turnFlagOn' }],
      });
    });

    it('rejects production environment and does not call fetch', async () => {
      const client = new LDClient('api-token', PROJECT, fetchImpl);
      await expect(
        client.toggleFlag('flag-x', 'prod' as never, true)
      ).rejects.toThrow(/not allowed/i);

      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('throws on API error (429)', async () => {
      fetchImpl.mockResolvedValueOnce(
        mockJsonResponse({ message: 'Too Many Requests' }, { status: 429 })
      );

      const client = new LDClient('api-token', PROJECT, fetchImpl);
      await expect(client.toggleFlag('flag-y', 'dev', false)).rejects.toThrow(
        'LaunchDarkly API error (429): Too Many Requests'
      );
    });
  });

});
