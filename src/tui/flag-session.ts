import type { Env } from '../types.js';

interface ToggleRecord {
  originalState: boolean;
  env: Env;
}

const sessionToggles = new Map<string, ToggleRecord>();

/**
 * Record the original state of a flag before the first toggle this session.
 * Subsequent toggles of the same flag are ignored (we only care about the
 * state we need to restore on exit).
 */
export function recordToggle(flagKey: string, originalState: boolean, env: Env): void {
  if (!sessionToggles.has(flagKey)) {
    sessionToggles.set(flagKey, { originalState, env });
  }
}

export function hasSessionToggles(): boolean {
  return sessionToggles.size > 0;
}

export function getSessionToggleCount(): number {
  return sessionToggles.size;
}

export function getSessionToggleEntries(): Array<{ key: string; originalState: boolean; env: Env }> {
  return [...sessionToggles.entries()].map(([key, { originalState, env }]) => ({
    key,
    originalState,
    env,
  }));
}

/**
 * Revert all flags toggled this session back to their original state.
 * Best-effort — individual failures are swallowed so remaining flags
 * still get reverted.
 */
export async function revertSessionToggles(): Promise<void> {
  if (sessionToggles.size === 0) return;

  const token = process.env.LD_API_TOKEN;
  const projectKey = process.env.LD_PROJECT_KEY;
  if (!token || !projectKey) {
    sessionToggles.clear();
    return;
  }

  const { LDClient } = await import('../api/launchdarkly.js');
  const client = new LDClient(token, projectKey);

  const entries = [...sessionToggles.entries()];
  sessionToggles.clear();

  await Promise.allSettled(
    entries.map(([flagKey, { originalState, env }]) =>
      client.toggleFlag(flagKey, env, originalState)
    ),
  );
}
