import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import type { RunEmitter, RunEvent } from './emitter.js';
import type { Step, Platform, Tier, Vertical } from '../types.js';
import { LogPanel } from './log-panel.js';
import { STEP_DESCRIPTIONS } from './step-descriptions.js';
import { COLORS } from './theme.js';

type StepStatus = 'pending' | 'running' | 'complete' | 'error';

interface ExecutionProps {
  emitter: RunEmitter;
  steps: readonly Step[];
  platform: Platform;
  verticals: Vertical[];
  tier: Tier;
  env: string;
  executionMode: 'run-all' | 'step-through';
  onStepContinue: () => void;
  onRetry: () => void;
  onQuit: () => void;
}

export function Execution({
  emitter, steps, platform, verticals, tier, env,
  executionMode, onStepContinue, onRetry, onQuit,
}: ExecutionProps): React.ReactElement {
  const { exit } = useApp();
  const [stepStatuses, setStepStatuses] = useState<Map<string, StepStatus>>(
    () => new Map(steps.map(s => [s, 'pending']))
  );
  const [currentStep, setCurrentStep] = useState<string>(steps[0]);
  const [detailMode, setDetailMode] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [context, setContext] = useState<Record<string, string>>({});
  const [startTime] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setElapsed(Date.now() - startTime), 1000);
    return () => clearInterval(timer);
  }, [startTime]);

  useEffect(() => {
    const handler = (event: RunEvent) => {
      if (event.type === 'step-start') {
        setCurrentStep(event.step);
        setStepStatuses(prev => new Map(prev).set(event.step, 'running'));
      } else if (event.type === 'step-complete') {
        setStepStatuses(prev => new Map(prev).set(event.step, 'complete'));
        if (executionMode === 'step-through') setWaiting(true);
      } else if (event.type === 'step-error') {
        setStepStatuses(prev => new Map(prev).set(event.step, 'error'));
        setWaiting(true);
      } else if (event.type === 'context-update') {
        setContext(prev => ({ ...prev, [event.key]: event.value }));
      }
    };
    emitter.on('event', handler);
    return () => { emitter.off('event', handler); };
  }, [emitter, executionMode]);

  useInput((input, key) => {
    if (input === 'd') setDetailMode(prev => !prev);
    if (input === 'q') { onQuit(); exit(); }
    if (input === 'r' && waiting) { setWaiting(false); onRetry(); }
    if (key.return && waiting) { setWaiting(false); onStepContinue(); }
    if (key.escape && executionMode === 'run-all') { setWaiting(true); }
  });

  const currentIdx = steps.indexOf(currentStep as Step);
  const elapsedStr = `${Math.floor(elapsed / 1000)}s`;

  return (
    <Box flexDirection="column" height="100%">
      {/* Top bar */}
      <Box borderStyle="single" borderColor={COLORS.chrome} paddingX={1}>
        <Text color={COLORS.banner} bold>██ JUMPER</Text>
        <Box flexGrow={1} />
        <Text color={COLORS.contextValue}>{platform} · {verticals.join(', ')} · {tier} · {env}</Text>
      </Box>

      <Box flexGrow={1} flexDirection="row">
        {/* Left panel: step list + context */}
        <Box flexDirection="column" width={28} borderStyle="single" borderColor={COLORS.chrome} paddingX={1}>
          <Text color={COLORS.dimText} dimColor>STEPS</Text>
          {steps.map(s => {
            const status = stepStatuses.get(s) ?? 'pending';
            const icon = status === 'complete' ? '✓' : status === 'running' ? '▸' : status === 'error' ? '✗' : '○';
            const color = status === 'complete' ? COLORS.stepComplete
              : status === 'running' ? COLORS.stepRunning
              : status === 'error' ? COLORS.stepError
              : COLORS.stepPending;
            return <Text key={s} color={color}>{icon} {s}</Text>;
          })}

          <Box marginTop={1} flexDirection="column">
            <Text color={COLORS.dimText} dimColor>CONTEXT</Text>
            {Object.entries(context).filter(([k]) => !k.startsWith('_')).map(([k, v]) => (
              <Text key={k}><Text color={COLORS.dimText}>{k}: </Text><Text color={COLORS.contextValue}>{v}</Text></Text>
            ))}
          </Box>
        </Box>

        {/* Right panel: step header + log */}
        <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor={COLORS.chrome} paddingX={1}>
          <Box flexDirection="column" marginBottom={1}>
            <Text color={COLORS.stepRunning} bold>{currentStep}</Text>
            <Text color={COLORS.dimText}>{STEP_DESCRIPTIONS[currentStep as Step] ?? ''}</Text>
          </Box>
          <LogPanel emitter={emitter} detailMode={detailMode} />
        </Box>
      </Box>

      {/* Bottom bar */}
      <Box borderStyle="single" borderColor={COLORS.chrome} paddingX={1}>
        <Text color={COLORS.stepComplete}>● Connected to {env}</Text>
        <Box flexGrow={1} />
        {waiting ? (
          <Text color={COLORS.stepRunning}>
            {stepStatuses.get(currentStep) === 'error'
              ? 'r: retry · q: quit'
              : 'Press enter to continue'}
          </Text>
        ) : (
          <Text color={COLORS.dimText}>d: detail · f: filter · q: quit</Text>
        )}
        <Text color={COLORS.dimText}> · Step {currentIdx + 1}/{steps.length} · {elapsedStr}</Text>
      </Box>
    </Box>
  );
}
