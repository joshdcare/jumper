import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { Execution } from '../../src/tui/execution.js';
import { RunEmitter } from '../../src/tui/emitter.js';
import type { Step } from '../../src/types.js';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const MOBILE_STEPS: Step[] = ['account-created', 'at-build-profile', 'at-availability', 'profile-complete', 'upgraded', 'at-disclosure', 'fully-enrolled'];

function renderExecution(emitter: RunEmitter) {
  return render(
    <Execution
      emitter={emitter}
      steps={MOBILE_STEPS}
      platform="mobile"
      verticals={['childcare']}
      tier="premium"
      env="dev"
      executionMode="run-all"
      onStepContinue={() => {}}
      onRetry={() => {}}
      onQuit={() => {}}
      onCreateAnother={() => {}}
      onNewConfig={() => {}}
      onAbortMonitoring={() => {}}
    />
  );
}

describe('Execution spinner', () => {
  it('shows viewing icon (►) for first step and pending (○) for rest before any step starts', () => {
    const emitter = new RunEmitter();
    const inst = renderExecution(emitter);
    const output = inst.lastFrame()!;
    expect(output).toContain('► account-created');
    expect(output).toContain('○ at-build-profile');
    inst.unmount();
  });

  it('shows spinner frame when a step is running', async () => {
    const emitter = new RunEmitter();
    const inst = renderExecution(emitter);

    emitter.stepStart('account-created', 'Creating account');

    // Wait for React to process the state update
    await new Promise(r => setTimeout(r, 100));

    const output = inst.lastFrame()!;
    const hasSpinner = SPINNER_FRAMES.some(frame => output.includes(`${frame} account-created`));
    expect(hasSpinner).toBe(true);
    inst.unmount();
  });

  it('shows ✓ icon after step completes', async () => {
    const emitter = new RunEmitter();
    const inst = renderExecution(emitter);

    emitter.stepStart('account-created', 'Creating account');
    await new Promise(r => setTimeout(r, 50));
    emitter.stepComplete('account-created');
    await new Promise(r => setTimeout(r, 50));

    const output = inst.lastFrame()!;
    expect(output).toContain('✓ account-created');
    inst.unmount();
  });

  it('shows spinner in bottom status bar during execution', async () => {
    const emitter = new RunEmitter();
    const inst = renderExecution(emitter);

    // Bottom bar always shows spinner + currentStep when not done
    await new Promise(r => setTimeout(r, 100));
    const output = inst.lastFrame()!;
    const hasBottomSpinner = SPINNER_FRAMES.some(frame => output.includes(frame));
    expect(hasBottomSpinner).toBe(true);
    inst.unmount();
  });
});
