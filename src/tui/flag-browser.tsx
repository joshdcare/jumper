import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { LDClient, type LDFlag } from '../api/launchdarkly.js';
import type { Env } from '../types.js';
import { COLORS } from './theme.js';
import { recordToggle, getSessionToggleCount } from './flag-session.js';

export interface FlagBrowserProps {
  env: Env;
  onClose?: () => void;
}

function getLdConfig(): { ok: true; token: string; projectKey: string } | { ok: false; missing: string[] } {
  const token = process.env.LD_API_TOKEN;
  const projectKey = process.env.LD_PROJECT_KEY;
  if (!token || !projectKey) {
    const missing: string[] = [];
    if (!token) missing.push('LD_API_TOKEN');
    if (!projectKey) missing.push('LD_PROJECT_KEY');
    return { ok: false, missing };
  }
  return { ok: true, token, projectKey };
}

const NAME_COL_WIDTH = 36;

function padName(name: string): string {
  const truncated = name.length > NAME_COL_WIDTH ? `${name.slice(0, NAME_COL_WIDTH - 1)}…` : name;
  return truncated.padEnd(NAME_COL_WIDTH, ' ');
}

export function FlagBrowser({ env, onClose }: FlagBrowserProps): React.ReactElement {
  const { exit } = useApp();
  const config = getLdConfig();
  const client = useMemo(
    () => config.ok ? new LDClient(config.token, config.projectKey) : null,
    [config.ok, config.ok ? config.token : '', config.ok ? config.projectKey : '']
  );

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [flags, setFlags] = useState<LDFlag[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toggledKey, setToggledKey] = useState<string | null>(null);

  const searchSeq = useRef(0);
  const toggledTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const loadFlags = useCallback(async () => {
    if (!client) return;
    const seq = ++searchSeq.current;
    setLoading(true);
    setError(null);
    try {
      const next = await client.searchFlags(debouncedQuery, env);
      if (seq !== searchSeq.current) return;
      setFlags(next);
      setSelectedIndex(i => {
        if (next.length === 0) return 0;
        return Math.min(i, next.length - 1);
      });
    } catch (e) {
      if (seq !== searchSeq.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (seq === searchSeq.current) setLoading(false);
    }
  }, [client, debouncedQuery, env]);

  useEffect(() => {
    if (!client) return;
    void loadFlags();
  }, [client, debouncedQuery, env, loadFlags]);

  const handleToggle = useCallback(async () => {
    if (!client || flags.length === 0 || togglingKey) return;
    const flag = flags[selectedIndex];
    if (!flag) return;
    setTogglingKey(flag.key);
    setError(null);
    try {
      recordToggle(flag.key, flag.on, env);
      const newState = !flag.on;
      await client.toggleFlag(flag.key, env, newState);
      setTogglingKey(null);
      setToggledKey(flag.key);
      if (toggledTimeoutRef.current) clearTimeout(toggledTimeoutRef.current);
      toggledTimeoutRef.current = setTimeout(() => {
        setToggledKey(null);
        toggledTimeoutRef.current = null;
      }, 2000);
      await loadFlags();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setTogglingKey(null);
    }
  }, [client, env, flags, loadFlags, selectedIndex, togglingKey]);

  useInput((input, key) => {
    if (!config.ok) {
      if (key.escape) {
        if (onClose) onClose();
        else exit();
      }
      if (input === 'q' && onClose === undefined) exit();
      return;
    }

    if (key.escape) {
      if (onClose) onClose();
      else exit();
      return;
    }

    if (input === 'q' && onClose === undefined) {
      exit();
      return;
    }

    if (key.upArrow) {
      setSelectedIndex(i => (flags.length === 0 ? 0 : Math.max(0, i - 1)));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex(i => (flags.length === 0 ? 0 : Math.min(flags.length - 1, i + 1)));
      return;
    }

    if (key.return) {
      if (flags.length > 0) void handleToggle();
      return;
    }

    if (key.backspace || key.delete) {
      setQuery(q => q.slice(0, -1));
      return;
    }

    if (input && !key.ctrl && !key.meta && input.length === 1) {
      setQuery(q => q + input);
    }
  });

  useEffect(() => () => {
    if (toggledTimeoutRef.current) clearTimeout(toggledTimeoutRef.current);
  }, []);

  const footer =
    onClose === undefined
      ? '↑↓ select · enter: toggle · esc: close · q: quit'
      : '↑↓ select · enter: toggle · esc: close';

  if (!config.ok) {
    return (
      <Box flexDirection="column" height="100%">
        <Box borderStyle="single" borderColor={COLORS.chrome} paddingX={1}>
          <Text color={COLORS.banner} bold>██ Feature Flags</Text>
          <Box flexGrow={1} />
          <Text color={COLORS.contextValue}>{env}</Text>
        </Box>
        <Box flexGrow={1} borderStyle="single" borderColor={COLORS.chrome} paddingX={1} flexDirection="column">
          <Text color={COLORS.stepError}>LaunchDarkly is not configured.</Text>
          <Text color={COLORS.dimText}>Set the following environment variable(s):</Text>
          {config.missing.map(v => (
            <Text key={v} color={COLORS.stepRunning}>• {v}</Text>
          ))}
        </Box>
        <Box borderStyle="single" borderColor={COLORS.chrome} paddingX={1}>
          <Text color={COLORS.dimText}>{footer}</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height="100%">
      <Box borderStyle="single" borderColor={COLORS.chrome} paddingX={1}>
        <Text color={COLORS.banner} bold>██ Feature Flags</Text>
        <Box flexGrow={1} />
        <Text color={COLORS.contextValue}>{env}</Text>
      </Box>

      <Box flexGrow={1} flexDirection="column" borderStyle="single" borderColor={COLORS.chrome} paddingX={1}>
        <Box>
          <Text color={COLORS.dimText}>Search: </Text>
          <Text color={COLORS.contextValue}>{query}</Text>
          <Text color={COLORS.contextValue}>█</Text>
        </Box>

        {error && (
          <Box marginTop={1}>
            <Text color={COLORS.stepError}>{error}</Text>
          </Box>
        )}

        <Box marginTop={1} flexDirection="column">
          {loading && flags.length === 0 && (
            <Text color={COLORS.stepRunning}>Loading…</Text>
          )}
          {loading && flags.length > 0 && (
            <Text color={COLORS.dimText}>Refreshing…</Text>
          )}
          {flags.map((f, i) => {
            const selected = i === selectedIndex;
            const prefix = selected ? '▸' : ' ';
            const stateDot = f.on ? '●' : '○';
            const isBusy = togglingKey === f.key;
            const stateLabel = isBusy ? '...' : f.on ? 'ON' : 'OFF';
            const stateColor = isBusy ? COLORS.stepRunning : f.on ? COLORS.stepComplete : COLORS.dimText;
            const showToggled = toggledKey === f.key && !isBusy;
            return (
              <Box key={f.key}>
                <Text color={selected ? COLORS.stepRunning : COLORS.dimText}>
                  {prefix} {stateDot} {padName(f.key)}
                </Text>
                <Text color={stateColor}> {stateLabel}</Text>
                {showToggled && (
                  <Text color={COLORS.stepComplete}>  Toggled</Text>
                )}
              </Box>
            );
          })}
        </Box>

        {getSessionToggleCount() > 0 && (
          <Box marginTop={1}>
            <Text color={COLORS.dimText}>
              Session: {getSessionToggleCount()} flag(s) changed — will revert on exit
            </Text>
          </Box>
        )}
      </Box>

      <Box borderStyle="single" borderColor={COLORS.chrome} paddingX={1}>
        <Text color={COLORS.dimText}>{footer}</Text>
      </Box>
    </Box>
  );
}
