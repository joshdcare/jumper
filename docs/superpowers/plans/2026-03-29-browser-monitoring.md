# Browser Monitoring Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the TUI active after web automation completes so users see live browser activity in the logs.

**Architecture:** Split `runWebEnrollmentFlow`'s return into result + monitoring promise. Add a `monitoring-start` emitter event. The TUI renders a "Monitoring browser..." state between automation-complete and browser-disconnect, reusing the existing Playwright listeners and log infrastructure.

**Tech Stack:** TypeScript, Playwright, React/Ink, Vitest

---

### Task 1: Add `monitoring-start` event to emitter

**Files:**
- Modify: `src/tui/emitter.ts`
- Modify: `tests/tui/emitter.test.ts`

- [ ] **Step 1: Add the event type to RunEvent union**

In `src/tui/emitter.ts`, add to the `RunEvent` type union:

```typescript
| { type: 'monitoring-start' }
```

Add the convenience method to `RunEmitter`:

```typescript
monitoringStart(): void {
  this._emit({ type: 'monitoring-start' });
}
```

- [ ] **Step 2: Add a test for the new event**

In `tests/tui/emitter.test.ts`, add:

```typescript
it('emits monitoring-start event', () => {
  const emitter = new RunEmitter();
  const events: RunEvent[] = [];
  emitter.on('event', (e: RunEvent) => events.push(e));
  emitter.monitoringStart();
  expect(events).toEqual([{ type: 'monitoring-start' }]);
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/tui/emitter.test.ts`
Expected: All pass

- [ ] **Step 4: Add monitoring-start to eventToLine in execution.tsx**

In `src/tui/execution.tsx`, add a case to `eventToLine`:

```typescript
case 'monitoring-start': return '👁 Monitoring browser...';
```

- [ ] **Step 5: Commit**

```bash
git add src/tui/emitter.ts tests/tui/emitter.test.ts src/tui/execution.tsx
git commit -m "feat: add monitoring-start event type to RunEmitter"
```

---

### Task 2: Split web-flow.ts return type

**Files:**
- Modify: `src/steps/web-flow.ts`

- [ ] **Step 1: Define WebFlowReturn and update function signature**

At the top of `src/steps/web-flow.ts`, add the new return type:

```typescript
export interface WebFlowReturn {
  result: WebFlowResult;
  monitoring?: Promise<void>;
}
```

Change `runWebEnrollmentFlow` return type from `Promise<WebFlowResult>` to `Promise<WebFlowReturn>`.

- [ ] **Step 2: Refactor stop() to separate result from monitoring**

Replace the `stop()` function body. Currently it waits for browser disconnect inline. Change it to:

```typescript
async function stop(stepName: string): Promise<WebFlowReturn> {
  console.log(`\n✓ Browser stopped at: ${stepName}`);
  console.log(`  URL: ${page.url()}`);
  if (accountCreated) {
    if (!memberId) {
      const extracted = await extractAccountInfo(page);
      memberId = extracted.memberId;
      uuid = extracted.uuid;
    }
    emitter?.contextUpdate('email', email);
    emitter?.contextUpdate('password', password);
    if (memberId) emitter?.contextUpdate('memberId', memberId);
    if (uuid) emitter?.contextUpdate('uuid', uuid);
    emitter?.contextUpdate('vertical', vertical);
    console.log('');
    console.log(`  Email:      ${email}`);
    console.log(`  Password:   ${password}`);
    console.log(`  MemberId:   ${memberId ?? '(not found)'}`);
    console.log(`  UUID:       ${uuid ?? '(not found)'}`);
    console.log(`  Vertical:   ${vertical}`);
  } else {
    console.log(`\n  Suggested credentials (for the account creation step):`);
    console.log(`    Email:      ${email}`);
    console.log(`    Password:   ${password}`);
  }

  const flowResult: WebFlowResult = { email, password, accountCreated, memberId, uuid, vertical };

  if (autoClose) {
    if (!recorder) {
      console.log('\n  Auto-closing browser.\n');
      await browser.close();
    }
    return { result: flowResult };
  }

  console.log('\n  Browser open for manual interaction. Close it when done.\n');
  const monitoring = new Promise<void>(resolve => {
    browser.once('disconnected', () => resolve());
  });
  return { result: flowResult, monitoring };
}
```

- [ ] **Step 3: Update all return sites to use WebFlowReturn**

Every `return await stop(...)` stays as-is since `stop` now returns `WebFlowReturn`.

The catch block at the bottom of the function also waits for browser disconnect when `!autoClose`. Refactor it the same way — return `{ result: flowResult, monitoring }` instead of blocking:

```typescript
} catch (error) {
  console.error(`\n✗ Error during web enrollment: ${(error as Error).message}`);
  console.log(`  URL: ${page.url()}`);
  if (accountCreated) {
    if (!memberId) {
      const extracted = await extractAccountInfo(page);
      memberId = extracted.memberId;
      uuid = extracted.uuid;
    }
    console.log('');
    console.log(`  Email:      ${email}`);
    console.log(`  Password:   ${password}`);
    console.log(`  MemberId:   ${memberId ?? '(not found)'}`);
    console.log(`  UUID:       ${uuid ?? '(not found)'}`);
    console.log(`  Vertical:   ${vertical}`);
  }

  const flowResult: WebFlowResult = { email, password, accountCreated, memberId, uuid, vertical };

  if (autoClose) {
    console.log('\n  Auto-closing browser.\n');
    await browser.close();
    return { result: flowResult };
  }

  console.log('\n  Browser left open for debugging. Close it when done.\n');
  const monitoring = new Promise<void>(resolve => {
    browser.once('disconnected', () => resolve());
  });
  return { result: flowResult, monitoring };
}
```

Update the final fallback return at the end of the function:

```typescript
return { result: { email, password, accountCreated, memberId, uuid, vertical } };
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: Errors in `src/index.ts` and `src/tui/app.tsx` (they still expect `WebFlowResult`). That's expected — we fix those next.

- [ ] **Step 5: Commit**

```bash
git add src/steps/web-flow.ts
git commit -m "refactor: split web flow return into result + monitoring promise"
```

---

### Task 3: Update CLI call site (index.ts)

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Unwrap WebFlowReturn in runWebFlow**

In `src/index.ts`, the `runWebFlow` function calls `runWebEnrollmentFlow` and stores the result in `webResult`. Update to destructure:

```typescript
let webResult: WebFlowResult | undefined;
try {
  const { result, monitoring } = await runWebEnrollmentFlow(
    opts.step, opts.tier as Tier, envConfig, verticalConfig,
    payloads.providerCreateDefaults.serviceType, opts.autoClose,
    emitter, undefined, recorder,
  );
  webResult = result;
  // CLI: finish recorder before monitoring (captures automation artifacts)
  await recorder.finish({
    email: webResult.email,
    password: webResult.password,
    memberId: webResult.memberId,
    vertical: webResult.vertical,
  });
  if (monitoring) {
    console.log('  Monitoring browser activity... Close the browser to exit.\n');
    await monitoring;
  }
} catch (err) {
  recorder.recordError('web-flow', err as Error);
  console.error(`\nWeb flow error: ${(err as Error).message}`);
  await recorder.finish({
    email: webResult?.email ?? '',
    password: webResult?.password ?? '',
    memberId: webResult?.memberId,
    vertical: webResult?.vertical,
  });
}
```

Note: the `finally` block that previously called `recorder.finish` is replaced — we now call it in both the try and catch paths because we need `webResult` available.

Also add the import for `WebFlowResult` at the top:

```typescript
import type { WebFlowResult } from './steps/web-flow.js';
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: Only `src/tui/app.tsx` errors remain.

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All pass (CLI tests exercise `parseArgs`, not the web flow runner directly)

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "fix: unwrap WebFlowReturn at CLI call site"
```

---

### Task 4: Wire monitoring into TUI (app.tsx)

**Files:**
- Modify: `src/tui/app.tsx`

- [ ] **Step 1: Add abort ref and pass to Execution**

In `App()`, add an abort ref alongside the existing `continueRef`:

```typescript
const monitoringAbortRef = useRef<(() => void) | null>(null);
```

Pass it as a new prop to `<Execution>`:

```typescript
onAbortMonitoring={() => { monitoringAbortRef.current?.(); }}
```

- [ ] **Step 2: Update runWebExecution to handle monitoring**

Replace `runWebExecution` in `app.tsx`:

```typescript
async function runWebExecution(
  result: WizardResult,
  envConfig: EnvConfig,
  emitter: RunEmitter,
  continueRef: React.MutableRefObject<(() => void) | null>,
  monitoringAbortRef: React.MutableRefObject<(() => void) | null>,
): Promise<void> {
  const { runWebEnrollmentFlow } = await import('../steps/web-flow.js');

  for (let i = 0; i < result.count; i++) {
    for (const vertical of result.verticals) {
      if (result.count > 1 || result.verticals.length > 1) {
        emitter.info(`── Run ${i + 1}/${result.count} · ${vertical} ──`);
      }

      const verticalConfig = VERTICAL_REGISTRY[vertical];
      const recorder = new RunRecorder({
        platform: 'web',
        vertical,
        tier: result.tier,
        targetStep: result.step,
      });
      recorder.attach(emitter);

      const onStepComplete =
        result.executionMode === 'step-through'
          ? () => new Promise<void>((resolve) => { continueRef.current = resolve; })
          : undefined;

      try {
        const { result: flowResult, monitoring } = await runWebEnrollmentFlow(
          result.step,
          result.tier,
          envConfig,
          verticalConfig,
          verticalConfig.serviceId,
          result.autoClose,
          emitter,
          onStepComplete,
          recorder,
        );
        await recorder.finish({
          email: flowResult.email,
          password: flowResult.password,
          memberId: flowResult.memberId,
          vertical: flowResult.vertical,
        });

        if (monitoring) {
          emitter.monitoringStart();
          const abortPromise = new Promise<void>(resolve => {
            monitoringAbortRef.current = resolve;
          });
          await Promise.race([monitoring, abortPromise]);
          monitoringAbortRef.current = null;
        }
      } catch (err) {
        recorder.recordError('web-flow', err as Error);
        await recorder.finish({ email: '', password: '' });
        throw err;
      }

      emitter.contextUpdate('vertical', vertical);
    }
  }
}
```

- [ ] **Step 3: Update runExecution to pass monitoringAbortRef**

In `runExecution`, pass `monitoringAbortRef` through to `runWebExecution`:

```typescript
async function runExecution(
  result: WizardResult,
  envConfig: EnvConfig,
  emitter: RunEmitter,
  continueRef: React.MutableRefObject<(() => void) | null>,
  monitoringAbortRef: React.MutableRefObject<(() => void) | null>,
): Promise<void> {
  // ... console redirect ...
  try {
    if (result.platform === 'web') {
      await runWebExecution(result, envConfig, emitter, continueRef, monitoringAbortRef);
    } else {
      await runMobileExecution(result, envConfig, emitter, continueRef);
    }
  } catch (err) {
    emitter.stepError('fatal', (err as Error).message);
  } finally {
    console.log = originalLog;
    console.error = originalError;
    emitter.runComplete();
  }
}
```

Update `startRun` callback to pass the new ref:

```typescript
setTimeout(() => {
  runExecution(result, envConfig, emitter, continueRef, monitoringAbortRef);
}, 100);
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: Errors in `execution.tsx` for the new `onAbortMonitoring` prop. Fixed in next task.

- [ ] **Step 5: Commit**

```bash
git add src/tui/app.tsx
git commit -m "feat: wire monitoring phase into TUI web execution"
```

---

### Task 5: Add monitoring state to execution.tsx

**Files:**
- Modify: `src/tui/execution.tsx`
- Modify: `tests/tui/execution-spinner.test.tsx`

- [ ] **Step 1: Add monitoring prop and state**

Add `onAbortMonitoring` to the `ExecutionProps` interface:

```typescript
onAbortMonitoring: () => void;
```

Add it to the destructured props.

Add monitoring state:

```typescript
const [monitoring, setMonitoring] = useState(false);
```

- [ ] **Step 2: Handle monitoring-start event**

In the `handler` function inside the `useEffect`, add a case:

```typescript
} else if (event.type === 'monitoring-start') {
  setMonitoring(true);
}
```

- [ ] **Step 3: Update spinner to pause during monitoring**

Change the spinner line:

```typescript
const spinnerChar = useSpinner(!done && !waiting && !logsExpanded && !monitoring);
```

Wait — we actually want the spinner active during monitoring (to show "Monitoring browser..." with a visual indicator). Change to:

```typescript
const spinnerChar = useSpinner(!done && !waiting && !logsExpanded);
```

This is actually the existing line — no change needed. The spinner runs during monitoring (not done, not waiting), which is what we want.

- [ ] **Step 4: Allow recentLines updates during monitoring**

In the event handler, the check `if (!logsExpandedRef.current)` blocks recentLines during log expansion. During monitoring, we want recentLines to update (since the user is watching live activity). No change needed — this already works because `logsExpandedRef` is independent of monitoring.

- [ ] **Step 5: Add monitoring UI to the right panel**

In the JSX, the right panel currently has `done ? (completion screen) : (running screen)`. Add a monitoring branch between them:

Replace the ternary in the right panel with:

```tsx
{done ? (
  // ... existing completion UI (unchanged) ...
) : monitoring ? (
  <Box flexDirection="column">
    <Text color={COLORS.stepRunning} bold>
      {spinnerChar} Monitoring browser...
    </Text>
    <Text color={COLORS.dimText}>
      Navigate the browser — activity appears in the logs below.
    </Text>
    <Text color={COLORS.dimText}>
      Close the browser or press q to finish.
    </Text>

    {context.email && (
      <Box marginTop={1} flexDirection="column">
        <Text color={COLORS.stepComplete} bold>Created User</Text>
        <Text>  <Text color={COLORS.dimText}>Email:</Text>     <Text color={COLORS.contextValue} bold>{context.email}</Text></Text>
        {context.password && <Text>  <Text color={COLORS.dimText}>Password:</Text>  <Text color={COLORS.contextValue} bold>{context.password}</Text></Text>}
        {context.memberId && <Text>  <Text color={COLORS.dimText}>MemberId:</Text>  <Text color={COLORS.contextValue} bold>{context.memberId}</Text></Text>}
        {context.uuid && <Text>  <Text color={COLORS.dimText}>UUID:</Text>      <Text color={COLORS.contextValue} bold>{context.uuid}</Text></Text>}
        {context.vertical && <Text>  <Text color={COLORS.dimText}>Vertical:</Text>  <Text color={COLORS.contextValue}>{context.vertical}</Text></Text>}
      </Box>
    )}

    {!logsExpanded && recentLines.length > 0 && (
      <Box marginTop={1} flexDirection="column">
        {recentLines.map((line, i) => (
          <Text key={i} color={i === recentLines.length - 1 ? COLORS.systemEvent : COLORS.dimText}>{line}</Text>
        ))}
      </Box>
    )}
  </Box>
) : (
  // ... existing running UI (unchanged) ...
)}
```

- [ ] **Step 6: Handle q during monitoring**

In the `useInput` handler, during execution (the `!done` branch), update the `q` handler:

```typescript
if (input === 'q') {
  if (monitoring) {
    onAbortMonitoring();
  } else {
    onQuit();
    exit();
  }
}
```

When monitoring, pressing `q` aborts the monitoring promise, which causes `runWebExecution` to finish → `runComplete()` fires → TUI transitions to done → then immediately exits because the `run-complete` handler in `useEffect` will set `done = true`. But we also want to exit cleanly. So after `onAbortMonitoring()`, add a small timeout exit:

Actually, simpler: when monitoring aborts, `runExecution` finishes and emits `run-complete`. The handler sets `done = true`. We need the TUI to then exit. Add to the run-complete handler:

In the event handler's `run-complete` case, check if we were monitoring:

We can handle this more simply. When `q` is pressed during monitoring, call `onAbortMonitoring()` and then `onQuit(); exit();` — this exits the TUI while the monitoring promise resolves in the background. The `runExecution` finally block will still fire `emitter.runComplete()` but the TUI is already gone.

```typescript
if (input === 'q') {
  if (monitoring) {
    onAbortMonitoring();
    return; // run-complete will fire from runExecution's finally block, then onQuit/exit happen in the done handler
  }
  onQuit();
  exit();
}
```

- [ ] **Step 7: Update bottom bar for monitoring state**

Add a monitoring case to the bottom bar:

```tsx
{done ? (
  <Text color={COLORS.stepComplete}>✓ {completedCount}/{steps.length} steps</Text>
) : monitoring ? (
  <Text color={COLORS.stepRunning}>{spinnerChar} Monitoring</Text>
) : (
  <Text color={COLORS.stepRunning}>{spinnerChar} {currentStep}</Text>
)}
```

And for the right side of the bottom bar:

```tsx
{done ? (
  <Text color={COLORS.dimText}>↑↓ select · enter: confirm · l: logs · tab: browse steps · q: quit</Text>
) : monitoring ? (
  <Text color={COLORS.dimText}>l: {logsExpanded ? 'hide' : 'show'} logs{logsExpanded ? ' · d: detail' : ''} · tab: browse steps · q: finish</Text>
) : waiting ? (
  // ... existing ...
) : (
  // ... existing ...
)}
```

- [ ] **Step 8: Handle q-during-monitoring exit flow**

When monitoring aborts, `runExecution`'s finally block emits `run-complete`, which sets `done = true`. We need to detect this and auto-exit. Add a `quitRequestedRef` to track when `q` was pressed during monitoring:

```typescript
const quitRequestedRef = useRef(false);
```

In the `q` handler during monitoring:

```typescript
if (monitoring) {
  quitRequestedRef.current = true;
  onAbortMonitoring();
  return;
}
```

In the event handler, when `run-complete` fires:

```typescript
} else if (event.type === 'run-complete') {
  setDone(true);
  if (quitRequestedRef.current) {
    setTimeout(() => { onQuit(); exit(); }, 0);
  }
}
```

This ensures: `q` during monitoring → abort → `run-complete` fires → `done = true` briefly → immediate exit. No menu flash, clean teardown.

- [ ] **Step 9: Update test helper in execution-spinner.test.tsx**

In `tests/tui/execution-spinner.test.tsx`, add the new prop to `renderExecution`:

```typescript
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
```

- [ ] **Step 10: Allow logVersion updates during monitoring**

Currently, `addEntry` skips `setLogVersion` when `logsExpandedRef.current` is true. During monitoring, we want the log panel to update even when expanded (activity is sparse — user-driven navigations, not rapid automated events). 

Add a `monitoringRef` to keep the current value accessible in the event handler closure:

```typescript
const monitoringRef = useRef(monitoring);
monitoringRef.current = monitoring;
```

Update `addEntry`:

```typescript
if (!logsExpandedRef.current || monitoringRef.current) {
  setLogVersion(v => v + 1);
}
```

This means: always update logVersion during monitoring (activity is infrequent enough to not cause flashing), but suppress during automated execution when logs are expanded.

- [ ] **Step 11: Type-check and test**

Run: `npx tsc --noEmit`
Expected: Clean

Run: `npx vitest run`
Expected: All pass

- [ ] **Step 12: Commit**

```bash
git add src/tui/execution.tsx tests/tui/execution-spinner.test.tsx
git commit -m "feat: add monitoring state and UI to TUI execution screen"
```

---

### Task 6: Final verification

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: Clean

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All pass

- [ ] **Step 4: Manual test (web, autoClose=false)**

Run: `npx tsx src/tui/app.tsx` or `jumper start`
Select web platform, any vertical, run to a step past account creation.
After automation completes, verify:
- TUI shows "Monitoring browser..." with created user credentials
- Navigate in the browser — see navigation events in recent lines and log panel
- Press `l` to open logs — see both automation logs and monitoring events
- Press `q` to exit — TUI exits cleanly

- [ ] **Step 5: Manual test (web, autoClose=true)**

Run with `--auto-close` flag.
Verify: no monitoring phase, goes straight to completion screen.

- [ ] **Step 6: Manual test (mobile)**

Run a mobile flow.
Verify: no monitoring phase, behavior unchanged.

- [ ] **Step 7: Commit any fixes, then final commit**

```bash
git add -A
git commit -m "feat: browser monitoring mode for web flows"
```
