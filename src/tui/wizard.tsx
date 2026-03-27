import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import type { Platform, Step, Tier, Vertical } from '../types.js';
import { WEB_STEPS, MOBILE_STEPS, ALL_VERTICALS } from '../types.js';
import { STEP_DESCRIPTIONS } from './step-descriptions.js';
import { COLORS } from './theme.js';

export interface WizardResult {
  platform: Platform;
  verticals: Vertical[];
  step: Step;
  tier: Tier;
  count: number;
  autoClose: boolean;
  env: string;
  executionMode: 'run-all' | 'step-through';
}

export function getStepsForPlatform(platform: Platform): readonly Step[] {
  return platform === 'web' ? WEB_STEPS : MOBILE_STEPS;
}

interface EnvWarning {
  var: string;
  reason: string;
}

export function validateEnvVars(platform: Platform, step: Step): EnvWarning[] {
  const warnings: EnvWarning[] = [];

  if (platform === 'mobile' && !process.env.CZEN_API_KEY) {
    warnings.push({ var: 'CZEN_API_KEY', reason: 'Required for all mobile flows.' });
  }

  if (platform === 'mobile' && step === 'fully-enrolled' && !process.env.MYSQL_DB_PASS_DEV) {
    warnings.push({ var: 'MYSQL_DB_PASS_DEV', reason: 'Required for fully-enrolled (Sterling BGC callback).' });
  }

  return warnings;
}

type WizardStage = 'platform' | 'vertical' | 'step' | 'tier' | 'options' | 'confirm';

const STAGES: WizardStage[] = ['platform', 'vertical', 'step', 'tier', 'options', 'confirm'];

const STAGE_LABELS: Record<WizardStage, string> = {
  platform: 'Platform',
  vertical: 'Vertical',
  step: 'Step',
  tier: 'Tier',
  options: 'Options',
  confirm: 'Confirm',
};

interface WizardProps {
  onComplete: (result: WizardResult) => void;
}

export function Wizard({ onComplete }: WizardProps): React.ReactElement {
  const [stage, setStage] = useState<WizardStage>('platform');
  const [platform, setPlatform] = useState<Platform>('web');
  const [verticals, setVerticals] = useState<Vertical[]>(['childcare']);
  const [step, setStep] = useState<Step>('at-location');
  const [tier, setTier] = useState<Tier>('premium');
  const [count, setCount] = useState('1');
  const [autoClose] = useState(true);
  const [env] = useState('dev');
  const [highlightedStep, setHighlightedStep] = useState<Step | null>(null);

  useInput((_input, key) => {
    if (key.escape) {
      const idx = STAGES.indexOf(stage);
      if (idx > 0) setStage(STAGES[idx - 1]);
    }
  });

  const currentIdx = STAGES.indexOf(stage);

  return (
    <Box flexDirection="column" height="100%">
      <Box borderStyle="single" borderColor={COLORS.chrome} paddingX={1}>
        <Text color={COLORS.banner} bold>██ JUMPER</Text>
        <Box flexGrow={1} />
        <Text color={COLORS.dimText}>Configuration</Text>
      </Box>

      <Box flexGrow={1} flexDirection="row">
        <Box flexDirection="column" width={24} borderStyle="single" borderColor={COLORS.chrome} paddingX={1}>
          <Text color={COLORS.dimText} dimColor>SETUP</Text>
          {STAGES.map((s, i) => {
            const icon = i < currentIdx ? '✓' : i === currentIdx ? '▸' : '○';
            const color = i < currentIdx ? COLORS.stepComplete : i === currentIdx ? COLORS.stepRunning : COLORS.stepPending;
            return (
              <Text key={s} color={color}>
                {icon} {STAGE_LABELS[s]}
              </Text>
            );
          })}
        </Box>

        <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor={COLORS.chrome} paddingX={1}>
          {renderStage()}
        </Box>
      </Box>

      <Box borderStyle="single" borderColor={COLORS.chrome} paddingX={1}>
        <Text color={COLORS.dimText}>↑↓ select · enter: confirm · esc: back · q: quit</Text>
        <Box flexGrow={1} />
        <Text color={COLORS.dimText}>Step {currentIdx + 1}/6</Text>
      </Box>
    </Box>
  );

  function renderStage(): React.ReactElement {
    switch (stage) {
      case 'platform':
        return (
          <Box flexDirection="column">
            <Text color={COLORS.stepRunning} bold>Which platform?</Text>
            <Text color={COLORS.dimText}>Web uses Playwright browser automation. Mobile uses API calls.</Text>
            <Box marginTop={1}>
              <SelectInput
                items={[
                  { label: 'Web (Playwright browser)', value: 'web' as Platform },
                  { label: 'Mobile (API-driven)', value: 'mobile' as Platform },
                ]}
                onSelect={(item) => { setPlatform(item.value); setStage('vertical'); }}
              />
            </Box>
          </Box>
        );

      case 'vertical':
        return (
          <Box flexDirection="column">
            <Text color={COLORS.stepRunning} bold>Which vertical(s)?</Text>
            <Text color={COLORS.dimText}>Select one or use "All" for batch runs</Text>
            <Box marginTop={1}>
              <SelectInput
                items={[
                  ...ALL_VERTICALS.map(v => ({ label: v, value: v as string })),
                  { label: 'All verticals', value: 'all' },
                ]}
                onSelect={(item) => {
                  if (item.value === 'all') {
                    setVerticals([...ALL_VERTICALS]);
                  } else {
                    setVerticals([item.value as Vertical]);
                  }
                  setStage('step');
                }}
              />
            </Box>
          </Box>
        );

      case 'step': {
        const steps = getStepsForPlatform(platform);
        return (
          <Box flexDirection="column">
            <Text color={COLORS.stepRunning} bold>Which enrollment step?</Text>
            <Text color={COLORS.dimText}>The provider will be created up to this checkpoint</Text>
            <Box marginTop={1}>
              <SelectInput
                items={steps.map(s => ({ label: s, value: s }))}
                onSelect={(item) => { setStep(item.value as Step); setStage('tier'); }}
                onHighlight={(item) => { setHighlightedStep(item.value as Step); }}
              />
            </Box>
            {highlightedStep && (
              <Box marginTop={1} borderStyle="single" borderColor={COLORS.chrome} paddingX={1}>
                <Text color={COLORS.banner}>ℹ </Text>
                <Text color={COLORS.dimText}>{STEP_DESCRIPTIONS[highlightedStep]}</Text>
              </Box>
            )}
          </Box>
        );
      }

      case 'tier':
        return (
          <Box flexDirection="column">
            <Text color={COLORS.stepRunning} bold>Which tier?</Text>
            <Text color={COLORS.dimText}>Premium includes subscription + background check flow</Text>
            <Box marginTop={1}>
              <SelectInput
                items={[
                  { label: 'Premium', value: 'premium' as Tier },
                  { label: 'Basic', value: 'basic' as Tier },
                ]}
                onSelect={(item) => { setTier(item.value); setStage('options'); }}
              />
            </Box>
          </Box>
        );

      case 'options':
        return (
          <Box flexDirection="column">
            <Text color={COLORS.stepRunning} bold>Options</Text>
            <Text color={COLORS.dimText}>Defaults shown — change only what you need</Text>
            <Box marginTop={1} flexDirection="column">
              <Box>
                <Text>Count (1-50): </Text>
                <TextInput value={count} onChange={setCount} onSubmit={() => setStage('confirm')} />
              </Box>
              <Text color={COLORS.dimText}>Press enter to continue</Text>
            </Box>
          </Box>
        );

      case 'confirm': {
        const warnings = validateEnvVars(platform, step);
        const parsedCount = parseInt(count, 10);
        const countValid = !isNaN(parsedCount) && parsedCount >= 1 && parsedCount <= 50;
        return (
          <Box flexDirection="column">
            <Text color={COLORS.stepRunning} bold>Ready to launch</Text>
            <Box marginTop={1} flexDirection="column">
              <Text><Text color={COLORS.dimText}>Platform    </Text><Text color={COLORS.contextValue}>{platform}</Text></Text>
              <Text><Text color={COLORS.dimText}>Vertical    </Text><Text color={COLORS.contextValue}>{verticals.join(', ')}</Text></Text>
              <Text><Text color={COLORS.dimText}>Step        </Text><Text color={COLORS.contextValue}>{step}</Text></Text>
              <Text><Text color={COLORS.dimText}>Tier        </Text><Text color={COLORS.contextValue}>{tier}</Text></Text>
              <Text><Text color={COLORS.dimText}>Count       </Text><Text color={COLORS.contextValue}>{count}</Text></Text>
              <Text><Text color={COLORS.dimText}>Environment </Text><Text color={COLORS.contextValue}>{env}</Text></Text>
            </Box>
            {warnings.length > 0 && (
              <Box marginTop={1} flexDirection="column">
                <Text color={COLORS.stepError} bold>⚠ Missing environment variables:</Text>
                {warnings.map(w => (
                  <Text key={w.var} color={COLORS.stepError}>  {w.var} — {w.reason}</Text>
                ))}
              </Box>
            )}
            {!countValid && (
              <Box marginTop={1}>
                <Text color={COLORS.stepError}>⚠ Count must be 1-50. Go back to fix.</Text>
              </Box>
            )}
            <Box marginTop={1}>
              <SelectInput
                items={[
                  { label: 'Run all steps automatically', value: 'run-all' },
                  { label: 'Step through one at a time', value: 'step-through' },
                  { label: '← Go back and edit', value: 'back' },
                ]}
                onSelect={(item) => {
                  if (item.value === 'back') {
                    setStage('platform');
                  } else if (countValid && warnings.length === 0) {
                    onComplete({
                      platform, verticals, step, tier, env,
                      count: parsedCount,
                      autoClose,
                      executionMode: item.value as 'run-all' | 'step-through',
                    });
                  }
                }}
              />
            </Box>
          </Box>
        );
      }
    }
  }
}
