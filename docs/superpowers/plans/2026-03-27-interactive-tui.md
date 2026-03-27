# Interactive TUI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-screen interactive TUI mode (`jumper interactive`) using Ink/React that guides users through enrollment configuration and shows real-time browser actions + API calls during execution.

**Architecture:** New entry point (`jumper interactive`) launches an Ink app. A `RunEmitter` event emitter bridges step execution to the UI. Existing step runners gain an optional `emitter` param; `ApiClient` emits network events. The existing CLI path is unchanged — a console adapter subscribes to the same emitter and writes to stdout.

**Tech Stack:** TypeScript, Ink 5, React 18, ink-select-input, ink-text-input, ink-spinner, ink-testing-library (dev)

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/tui/emitter.ts` | `RunEvent` type union, `RunEmitter` class (extends EventEmitter), console adapter function |
| `src/tui/theme.ts` | Color constants for log event categories, step statuses, UI chrome |
| `src/tui/step-descriptions.ts` | Human-readable descriptions for every enrollment step (used in wizard + execution) |
| `src/tui/app.tsx` | Root Ink component; screen state machine (wizard → execution) |
| `src/tui/wizard.tsx` | Wizard screen: 6-step config flow (platform, vertical, step, tier, options, confirm) |
| `src/tui/execution.tsx` | Execution screen: step list + log panel + status bar layout |
| `src/tui/log-panel.tsx` | Scrollable, filterable log renderer; subscribes to `RunEmitter` |
| `src/tui/results-table.tsx` | Batch mode results table component (displayed via `t` key) |
| `src/api/client.ts` | **Modify:** Add optional `emitter` to constructor, emit around HTTP calls |
| `src/steps/registry.ts` | **Modify:** Add optional `emitter` to `StepDefinition` runner signature |
| `src/steps/account.ts` | **Modify:** Emit events instead of/alongside console.log |
| `src/steps/mobile.ts` | **Modify:** Emit events instead of/alongside console.log |
| `src/steps/web-flow.ts` | **Modify:** Add page.on('request'/'response') listeners, adapt log() to emit |
| `src/index.ts` | **Modify:** Add `interactive` subcommand, wire up console adapter for existing paths |
| `tests/tui/emitter.test.ts` | Unit tests for RunEmitter and console adapter |
| `tests/tui/wizard.test.ts` | Unit tests for wizard validation logic, step filtering, env var checks |

---

### Task 1: Install dependencies and configure JSX

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`

- [ ] **Step 1: Install Ink and React dependencies**

```bash
npm install ink react ink-select-input ink-text-input ink-spinner
npm install -D @types/react ink-testing-library
```

- [ ] **Step 2: Add JSX support to tsconfig**

In `tsconfig.json`, add `"jsx": "react-jsx"` to `compilerOptions`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true,
    "types": ["node"],
    "jsx": "react-jsx"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Verify build still works**

```bash
npx tsc --noEmit
```

Expected: No errors. Existing `.ts` files are unaffected by the JSX flag.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json tsconfig.json
git commit -m "feat: add Ink/React dependencies and JSX support for TUI"
```

---

### Task 2: RunEmitter — event types and emitter class

**Files:**
- Create: `src/tui/emitter.ts`
- Create: `tests/tui/emitter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/tui/emitter.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { RunEmitter, consoleAdapter } from '../../src/tui/emitter.js';
import type { RunEvent } from '../../src/tui/emitter.js';

describe('RunEmitter', () => {
  it('emits and receives events', () => {
    const emitter = new RunEmitter();
    const received: RunEvent[] = [];
    emitter.on('event', (e: RunEvent) => received.push(e));

    emitter.emit('event', { type: 'info', message: 'hello' });

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ type: 'info', message: 'hello' });
  });

  it('emits step lifecycle events', () => {
    const emitter = new RunEmitter();
    const received: RunEvent[] = [];
    emitter.on('event', (e: RunEvent) => received.push(e));

    emitter.stepStart('account-created', 'Create provider account');
    emitter.stepComplete('account-created');

    expect(received).toHaveLength(2);
    expect(received[0]).toEqual({ type: 'step-start', step: 'account-created', description: 'Create provider account' });
    expect(received[1]).toEqual({ type: 'step-complete', step: 'account-created' });
  });

  it('emits network events', () => {
    const emitter = new RunEmitter();
    const received: RunEvent[] = [];
    emitter.on('event', (e: RunEvent) => received.push(e));

    emitter.networkRequest('POST', '/api/graphql', '{"query":"..."}');
    emitter.networkResponse(200, '/api/graphql', 312, '{"data":{}}');

    expect(received).toHaveLength(2);
    expect(received[0].type).toBe('network-request');
    expect(received[1].type).toBe('network-response');
  });
});

describe('consoleAdapter', () => {
  it('writes step events to console.log', () => {
    const emitter = new RunEmitter();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    consoleAdapter(emitter);
    emitter.stepStart('account-created', 'Create provider account');
    emitter.stepComplete('account-created');

    expect(spy).toHaveBeenCalledWith(expect.stringContaining('account-created'));
    spy.mockRestore();
  });

  it('writes network events to console.log', () => {
    const emitter = new RunEmitter();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    consoleAdapter(emitter);
    emitter.networkRequest('POST', '/api/graphql');
    emitter.networkResponse(200, '/api/graphql', 312);

    expect(spy).toHaveBeenCalledWith(expect.stringContaining('POST'));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('200'));
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/tui/emitter.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/tui/emitter.ts`:

```typescript
import { EventEmitter } from 'events';

export type RunEvent =
  | { type: 'step-start'; step: string; description: string }
  | { type: 'step-complete'; step: string }
  | { type: 'step-error'; step: string; error: string }
  | { type: 'field-fill'; field: string; value: string }
  | { type: 'button-click'; label: string }
  | { type: 'checkbox'; label: string; checked: boolean }
  | { type: 'navigation'; url: string }
  | { type: 'network-request'; method: string; url: string; body?: string }
  | { type: 'network-response'; status: number; url: string; duration: number; body?: string }
  | { type: 'auth'; message: string }
  | { type: 'db-query'; query: string }
  | { type: 'info'; message: string }
  | { type: 'context-update'; key: string; value: string };

export class RunEmitter extends EventEmitter {
  private _emit(event: RunEvent): void {
    this.emit('event', event);
  }

  stepStart(step: string, description: string): void {
    this._emit({ type: 'step-start', step, description });
  }

  stepComplete(step: string): void {
    this._emit({ type: 'step-complete', step });
  }

  stepError(step: string, error: string): void {
    this._emit({ type: 'step-error', step, error });
  }

  fieldFill(field: string, value: string): void {
    this._emit({ type: 'field-fill', field, value });
  }

  buttonClick(label: string): void {
    this._emit({ type: 'button-click', label });
  }

  checkboxToggle(label: string, checked: boolean): void {
    this._emit({ type: 'checkbox', label, checked });
  }

  navigation(url: string): void {
    this._emit({ type: 'navigation', url });
  }

  networkRequest(method: string, url: string, body?: string): void {
    this._emit({ type: 'network-request', method, url, body });
  }

  networkResponse(status: number, url: string, duration: number, body?: string): void {
    this._emit({ type: 'network-response', status, url, duration, body });
  }

  auth(message: string): void {
    this._emit({ type: 'auth', message });
  }

  dbQuery(query: string): void {
    this._emit({ type: 'db-query', query });
  }

  info(message: string): void {
    this._emit({ type: 'info', message });
  }

  contextUpdate(key: string, value: string): void {
    this._emit({ type: 'context-update', key, value });
  }
}

export function consoleAdapter(emitter: RunEmitter): void {
  emitter.on('event', (e: RunEvent) => {
    switch (e.type) {
      case 'step-start':
        console.log(`  ⏳ ${e.step}: ${e.description}`);
        break;
      case 'step-complete':
        console.log(`  ✓ ${e.step}`);
        break;
      case 'step-error':
        console.error(`  ✗ ${e.step}: ${e.error}`);
        break;
      case 'field-fill':
        console.log(`    Filled field → ${e.field} → "${e.value}"`);
        break;
      case 'button-click':
        console.log(`    Clicked button → "${e.label}"`);
        break;
      case 'checkbox':
        console.log(`    ${e.checked ? 'Checked' : 'Unchecked'} → ${e.label}`);
        break;
      case 'navigation':
        console.log(`    Navigated → ${e.url}`);
        break;
      case 'network-request':
        console.log(`    → ${e.method} ${e.url}`);
        if (e.body) console.log(`      ${e.body.slice(0, 200)}`);
        break;
      case 'network-response':
        console.log(`    ← ${e.status} (${e.duration}ms)`);
        if (e.body) console.log(`      ${e.body.slice(0, 200)}`);
        break;
      case 'auth':
        console.log(`    🔑 ${e.message}`);
        break;
      case 'db-query':
        console.log(`    🗄 ${e.query}`);
        break;
      case 'info':
        console.log(`    ${e.message}`);
        break;
      case 'context-update':
        break;
    }
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/tui/emitter.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tui/emitter.ts tests/tui/emitter.test.ts
git commit -m "feat: add RunEmitter event system and console adapter"
```

---

### Task 3: Theme constants and step descriptions

**Files:**
- Create: `src/tui/theme.ts`
- Create: `src/tui/step-descriptions.ts`

- [ ] **Step 1: Create theme file**

Create `src/tui/theme.ts`:

```typescript
export const COLORS = {
  browserAction: '#a0c4ff',
  networkCall: '#f97316',
  navigation: '#4ade80',
  systemEvent: '#888888',
  stepComplete: '#4ade80',
  stepRunning: '#fbbf24',
  stepPending: '#555555',
  stepError: '#ef4444',
  contextValue: '#a0c4ff',
  chrome: '#0f3460',
  banner: '#a0c4ff',
  dimText: '#666666',
} as const;
```

- [ ] **Step 2: Create step descriptions file**

Create `src/tui/step-descriptions.ts`. Each step needs a one-line description for the wizard info bar and execution header:

```typescript
import type { Step } from '../types.js';

export const STEP_DESCRIPTIONS: Record<Step, string> = {
  'at-get-started': 'Browser at the "Get Started" page. No data entered yet.',
  'at-soft-intro-combined': 'Clicked "Find Jobs". Browser at the soft intro screen.',
  'at-vertical-selection': 'Passed intro. Browser at the vertical/service type selection.',
  'at-location': 'Browser at the ZIP code entry page. Account not yet created.',
  'at-preferences': 'ZIP entered. Browser at the preferences/experience page.',
  'at-family-count': 'Preferences set. Browser at the family count page (some verticals skip this).',
  'at-account-creation': 'Browser at the account creation form. Email/password not yet submitted.',
  'at-family-connection': 'Account created. Browser at the family connection page.',
  'at-safety-screening': 'Browser at the safety screening info page.',
  'at-subscriptions': 'Browser at the subscription tier selection (Basic/Premium).',
  'at-basic-payment': 'Selected Basic tier. Browser at the payment/checkout page.',
  'at-premium-payment': 'Selected Premium tier. Browser at the payment/checkout page.',
  'at-app-download': 'Payment complete. Browser at the app download page. Fully enrolled (web).',
  'account-created': 'Provider account created via API. Email and memberId available.',
  'at-build-profile': 'Account created. Profile verticals and attributes set.',
  'at-availability': 'Profile attributes set. Availability schedule configured (Mon-Fri 9-5).',
  'profile-complete': 'Profile fully built: preferences, availability, skills, bio, and photo uploaded.',
  'upgraded': 'Premium subscription activated. Payment processed via Stripe.',
  'at-disclosure': 'Disclosure accepted. Ready for background check.',
  'fully-enrolled': 'Background check submitted and completed via Sterling callback. Fully enrolled.',
};
```

- [ ] **Step 3: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/tui/theme.ts src/tui/step-descriptions.ts
git commit -m "feat: add TUI theme constants and step descriptions"
```

---

### Task 4: Add emitter to ApiClient for network visibility

**Files:**
- Modify: `src/api/client.ts`
- Existing tests still pass (no breaking changes)

- [ ] **Step 1: Add optional emitter to ApiClient constructor and HTTP methods**

In `src/api/client.ts`, add an optional `emitter` property and instrument every HTTP method to emit `network-request` and `network-response` events. The emitter wraps each `fetch` call.

Add import at top:

```typescript
import type { RunEmitter } from '../tui/emitter.js';
```

Add `emitter` property and setter:

```typescript
private emitter?: RunEmitter;

setEmitter(emitter: RunEmitter): void {
  this.emitter = emitter;
}
```

Then add a private helper that wraps fetch with emission:

```typescript
private async trackedFetch(url: string, init: RequestInit): Promise<Response> {
  const method = init.method ?? 'GET';
  const shortUrl = url.replace(this.baseUrl, '');
  this.emitter?.networkRequest(method, shortUrl, typeof init.body === 'string' ? init.body : undefined);
  const start = Date.now();
  const res = await fetch(url, init);
  const duration = Date.now() - start;
  const cloned = res.clone();
  const text = await cloned.text().catch(() => '');
  this.emitter?.networkResponse(res.status, shortUrl, duration, text.slice(0, 500));
  return res;
}
```

Then replace every `fetch(...)` call in `graphql`, `restPost`, `restPostSpi`, `restGet`, `restGetSpi`, and `restPostMultipartSpi` with `this.trackedFetch(...)`. For example, in `graphql`:

```typescript
const res = await this.trackedFetch(`${this.baseUrl}/api/graphql`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ query, variables }),
});
```

Apply the same pattern to all 6 HTTP methods. The only change is `fetch(` → `this.trackedFetch(`.

- [ ] **Step 2: Run existing tests**

```bash
npx vitest run
```

Expected: All existing tests PASS. The emitter is optional — when not set, `this.emitter?.` short-circuits and behavior is identical.

- [ ] **Step 3: Commit**

```bash
git add src/api/client.ts
git commit -m "feat: add optional RunEmitter to ApiClient for network visibility"
```

---

### Task 5: Add emitter to step runner signatures

**Files:**
- Modify: `src/steps/registry.ts`
- Modify: `src/steps/account.ts`
- Modify: `src/steps/mobile.ts`

The goal is to thread the emitter through the step pipeline so runners can emit typed events. For now, runners emit events *alongside* their existing `console.log` calls (not replacing them), so the CLI path continues to work. The TUI will subscribe to the emitter; the CLI still reads stdout.

- [ ] **Step 1: Update StepDefinition runner signature in registry.ts**

In `src/steps/registry.ts`, add `RunEmitter` to the runner signature as an optional last parameter:

```typescript
import type { RunEmitter } from '../tui/emitter.js';

export interface StepDefinition {
  name: Step;
  runner: (
    client: ApiClient,
    ctx: ProviderContext,
    payloads: any,
    envConfig?: EnvConfig,
    verticalConfig?: VerticalConfig,
    emitter?: RunEmitter
  ) => Promise<void>;
}
```

Update the `MOBILE_STEP_PIPELINE` entries — the existing functions already accept extra params via `...args` or have matching optional params, but `createAccountMobile` and the mobile step functions need their signatures updated to accept the new param.

- [ ] **Step 2: Update account.ts to accept and use emitter**

In `src/steps/account.ts`, add the emitter as an optional param to both `createAccount` and `createAccountMobile`. Emit events alongside console.log:

```typescript
import type { RunEmitter } from '../tui/emitter.js';

export async function createAccountMobile(
  client: ApiClient,
  ctx: ProviderContext,
  payloads: any,
  envConfig?: EnvConfig,
  verticalConfig?: VerticalConfig,
  emitter?: RunEmitter
): Promise<void> {
  // ... existing code ...
  // After account created, add:
  emitter?.contextUpdate('email', ctx.email);
  emitter?.contextUpdate('memberId', ctx.memberId);
  if (ctx.uuid) emitter?.contextUpdate('uuid', ctx.uuid);
  console.log(`  ✓ Account created (lite+upgrade): ${ctx.email} (ID: ${ctx.memberId})`);
}
```

Apply the same pattern to `createAccount`.

- [ ] **Step 3: Update mobile.ts to accept and use emitter**

In `src/steps/mobile.ts`, add the emitter param to `mobilePreAvailability`, `mobileCompleteProfile`, `mobileUpgrade`, and `mobileFullyEnrolled`. Thread it through to sub-calls. Emit info events alongside console.log:

```typescript
export async function mobilePreAvailability(
  client: ApiClient,
  ctx: ProviderContext,
  payloads: any,
  envConfig?: EnvConfig,
  verticalConfig?: VerticalConfig,
  emitter?: RunEmitter
): Promise<void> {
  // ... existing code unchanged ...
  emitter?.info('Profile set (verticals + attributes)');
  console.log('  ✓ Profile set (verticals + attributes)');
}
```

Repeat for all 4 exported functions.

- [ ] **Step 4: Run existing tests**

```bash
npx vitest run
```

Expected: All tests PASS. The new param is optional and doesn't affect existing callers.

- [ ] **Step 5: Commit**

```bash
git add src/steps/registry.ts src/steps/account.ts src/steps/mobile.ts
git commit -m "feat: thread optional RunEmitter through step pipeline"
```

---

### Task 6: Add network listeners and emitter to web flow

**Files:**
- Modify: `src/steps/web-flow.ts`

- [ ] **Step 1: Add emitter parameter to runWebEnrollmentFlow**

Add an optional `emitter?: RunEmitter` parameter to the function signature. Import `RunEmitter` type.

- [ ] **Step 2: Add Playwright network listeners**

After creating the page, attach request/response listeners that emit through the emitter. Filter out static assets (`.js`, `.css`, `.png`, `.jpg`, `.svg`, `.woff`) by default:

```typescript
if (emitter) {
  const STATIC_EXTS = /\.(js|css|png|jpg|jpeg|svg|gif|woff2?|ico|map)(\?|$)/;
  const requestTimes = new Map<string, number>();

  page.on('request', (req) => {
    const url = req.url();
    if (STATIC_EXTS.test(url)) return;
    requestTimes.set(url, Date.now());
    const shortUrl = url.replace(envConfig.baseUrl, '');
    emitter.networkRequest(req.method(), shortUrl, req.postData() ?? undefined);
  });

  page.on('response', async (res) => {
    const url = res.url();
    if (STATIC_EXTS.test(url)) return;
    const start = requestTimes.get(url);
    const duration = start ? Date.now() - start : 0;
    requestTimes.delete(url);
    const shortUrl = url.replace(envConfig.baseUrl, '');
    const body = await res.text().catch(() => '');
    emitter.networkResponse(res.status(), shortUrl, duration, body.slice(0, 500));
  });

  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      emitter.navigation(frame.url().replace(envConfig.baseUrl, ''));
    }
  });
}
```

- [ ] **Step 3: Adapt existing log() calls to also emit**

Update the `log()` helper to accept an optional emitter and emit typed events:

```typescript
function log(action: string, detail?: string, emitter?: RunEmitter): void {
  const suffix = detail ? ` → ${detail}` : '';
  console.log(`    ${action}${suffix}`);

  if (emitter && action.startsWith('Filled field')) {
    const parts = detail?.split(' → ') ?? [];
    emitter.fieldFill(parts[0] ?? action, parts[1] ?? '');
  } else if (emitter && action.startsWith('Clicked')) {
    emitter.buttonClick(detail ?? action);
  } else if (emitter && (action.startsWith('Selected') || action.startsWith('Checked'))) {
    emitter.checkboxToggle(detail ?? action, true);
  }
}
```

Then pass `emitter` through all existing `log()` calls.

- [ ] **Step 4: Add step lifecycle emissions at each web checkpoint**

At each `console.log('  ✓ at-...')` line in the web flow, add corresponding emitter calls. For example, at the `at-get-started` checkpoint:

```typescript
emitter?.stepStart('at-get-started', STEP_DESCRIPTIONS['at-get-started']);
// ... existing navigation/click code ...
console.log('  ✓ at-get-started');
emitter?.stepComplete('at-get-started');
if (targetStep === 'at-get-started') return await stop('at-get-started');
```

Repeat this pattern for every `at-*` checkpoint in the flow. Import `STEP_DESCRIPTIONS` from `../tui/step-descriptions.js` (web-flow.ts is in `src/steps/`, so the relative path goes up one level).

This is critical — without these emissions, the TUI's step list panel won't track progress during web runs.

- [ ] **Step 5: Add step-through pause support to web flow**

Add an optional `onStepComplete` callback parameter to `runWebEnrollmentFlow`:

```typescript
export async function runWebEnrollmentFlow(
  targetStep: string,
  tier: Tier,
  envConfig: EnvConfig,
  verticalConfig: VerticalConfig,
  serviceType: string,
  autoClose: boolean,
  headless: boolean,
  emitter?: RunEmitter,
  onStepComplete?: () => Promise<void>,
): Promise<WebFlowResult> {
```

After each checkpoint's `emitter?.stepComplete(...)` call, invoke the callback if present:

```typescript
emitter?.stepComplete('at-get-started');
if (onStepComplete) await onStepComplete();
if (targetStep === 'at-get-started') return await stop('at-get-started');
```

The TUI's app component provides this callback — it creates a promise that resolves when the user presses enter (same `continueRef` pattern used for mobile). This enables step-through mode for web flows without restructuring the monolithic function.

- [ ] **Step 6: Verify build compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/steps/web-flow.ts
git commit -m "feat: add network listeners, step lifecycle, and step-through to web flow"
```

---

### Task 7: Wizard component

**Files:**
- Create: `src/tui/wizard.tsx`
- Create: `tests/tui/wizard.test.ts`

- [ ] **Step 1: Write failing tests for wizard validation logic**

Create `tests/tui/wizard.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getStepsForPlatform, validateEnvVars } from '../../src/tui/wizard.js';

describe('getStepsForPlatform', () => {
  it('returns 13 steps for web', () => {
    const steps = getStepsForPlatform('web');
    expect(steps).toHaveLength(13);
    expect(steps[0]).toBe('at-get-started');
  });

  it('returns 7 steps for mobile', () => {
    const steps = getStepsForPlatform('mobile');
    expect(steps).toHaveLength(7);
    expect(steps[0]).toBe('account-created');
  });
});

describe('validateEnvVars', () => {
  it('returns missing CZEN_API_KEY for mobile', () => {
    const original = process.env.CZEN_API_KEY;
    delete process.env.CZEN_API_KEY;
    const warnings = validateEnvVars('mobile', 'at-availability');
    expect(warnings).toContainEqual(expect.objectContaining({ var: 'CZEN_API_KEY' }));
    if (original) process.env.CZEN_API_KEY = original;
  });

  it('returns missing MYSQL_DB_PASS_DEV for mobile fully-enrolled', () => {
    const original = process.env.MYSQL_DB_PASS_DEV;
    delete process.env.MYSQL_DB_PASS_DEV;
    const warnings = validateEnvVars('mobile', 'fully-enrolled');
    expect(warnings).toContainEqual(expect.objectContaining({ var: 'MYSQL_DB_PASS_DEV' }));
    if (original) process.env.MYSQL_DB_PASS_DEV = original;
  });

  it('returns no warnings when all vars set', () => {
    const saved = { ...process.env };
    process.env.CZEN_API_KEY = 'test';
    process.env.MYSQL_DB_PASS_DEV = 'test';
    process.env.STRIPE_KEY = 'test';
    const warnings = validateEnvVars('mobile', 'fully-enrolled');
    expect(warnings).toHaveLength(0);
    Object.assign(process.env, saved);
  });

  it('does not require CZEN_API_KEY for web', () => {
    const original = process.env.CZEN_API_KEY;
    delete process.env.CZEN_API_KEY;
    const warnings = validateEnvVars('web', 'at-location');
    expect(warnings.find(w => w.var === 'CZEN_API_KEY')).toBeUndefined();
    if (original) process.env.CZEN_API_KEY = original;
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/tui/wizard.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the wizard component**

Create `src/tui/wizard.tsx`. This is a large file — it contains the validation logic (exported for testing) and the 6-step wizard Ink component.

```tsx
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
    warnings.push({ var: 'CZEN_API_KEY', reason: 'Required for all mobile flows. Ask a team lead or check the QA vault.' });
  }

  if (platform === 'mobile' && step === 'fully-enrolled' && !process.env.MYSQL_DB_PASS_DEV) {
    warnings.push({ var: 'MYSQL_DB_PASS_DEV', reason: 'Required for fully-enrolled (Sterling BGC callback). Ask a team lead or check the QA vault.' });
  }

  const paymentSteps: Step[] = ['at-basic-payment', 'at-premium-payment', 'at-app-download'];
  if (platform === 'web' && paymentSteps.includes(step) && !process.env.STRIPE_KEY) {
    warnings.push({ var: 'STRIPE_KEY', reason: 'Required for web payment steps. Check the QA vault.' });
  }

  return warnings;
}

type WizardStage = 'platform' | 'vertical' | 'step' | 'tier' | 'options' | 'confirm';

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
  const [autoClose, setAutoClose] = useState(true);
  const [env] = useState('dev');
  const [highlightedStep, setHighlightedStep] = useState<Step | null>(null);

  useInput((input, key) => {
    if (key.escape) {
      const stages: WizardStage[] = ['platform', 'vertical', 'step', 'tier', 'options', 'confirm'];
      const idx = stages.indexOf(stage);
      if (idx > 0) setStage(stages[idx - 1]);
    }
  });

  // Component renders each stage based on `stage` state.
  // Each stage uses SelectInput for choices, advancing to next stage on select.
  // The confirm stage shows a summary + execution mode choice.
  // Full render logic for each stage goes here — using SelectInput items,
  // Text for labels, Box for layout.

  // This is the structural skeleton — each case renders the appropriate wizard panel.
  // Implementation follows the mockup: left panel shows wizard progress,
  // right panel shows the current question.

  return (
    <Box flexDirection="column" height="100%">
      {/* Top bar */}
      <Box borderStyle="single" borderColor={COLORS.chrome} paddingX={1}>
        <Text color={COLORS.banner} bold>██ JUMPER</Text>
        <Box flexGrow={1} />
        <Text color={COLORS.dimText}>Configuration</Text>
      </Box>

      <Box flexGrow={1} flexDirection="row">
        {/* Left panel: wizard progress */}
        <Box flexDirection="column" width={24} borderStyle="single" borderColor={COLORS.chrome} paddingX={1}>
          <Text color={COLORS.dimText} dimColor>SETUP</Text>
          {(['platform', 'vertical', 'step', 'tier', 'options', 'confirm'] as WizardStage[]).map((s, i) => {
            const stages: WizardStage[] = ['platform', 'vertical', 'step', 'tier', 'options', 'confirm'];
            const currentIdx = stages.indexOf(stage);
            const icon = i < currentIdx ? '✓' : i === currentIdx ? '▸' : '○';
            const color = i < currentIdx ? COLORS.stepComplete : i === currentIdx ? COLORS.stepRunning : COLORS.stepPending;
            const labels: Record<WizardStage, string> = {
              platform: 'Platform', vertical: 'Vertical', step: 'Step',
              tier: 'Tier', options: 'Options', confirm: 'Confirm',
            };
            const value = i < currentIdx ? getStageValue(s) : '';
            return (
              <Text key={s} color={color}>
                {icon} {labels[s]} {value ? <Text color={COLORS.dimText}>{value}</Text> : ''}
              </Text>
            );
          })}
        </Box>

        {/* Right panel: current question */}
        <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor={COLORS.chrome} paddingX={1}>
          {renderStage()}
        </Box>
      </Box>

      {/* Bottom bar */}
      <Box borderStyle="single" borderColor={COLORS.chrome} paddingX={1}>
        <Text color={COLORS.dimText}>↑↓ select · enter: confirm · esc: back · q: quit</Text>
        <Box flexGrow={1} />
        <Text color={COLORS.dimText}>
          Step {(['platform', 'vertical', 'step', 'tier', 'options', 'confirm'] as WizardStage[]).indexOf(stage) + 1}/6
        </Text>
      </Box>
    </Box>
  );

  function getStageValue(s: WizardStage): string {
    switch (s) {
      case 'platform': return platform;
      case 'vertical': return verticals.length > 1 ? `${verticals.length} selected` : verticals[0] ?? '';
      case 'step': return step;
      case 'tier': return tier;
      case 'options': return `×${count}`;
      default: return '';
    }
  }

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
                  ...ALL_VERTICALS.map(v => ({ label: v, value: v })),
                  { label: 'All verticals', value: 'all' as string },
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
```

Note: This is the structural implementation. The exact JSX may need minor tweaks during development based on Ink's rendering behavior — but the logic and data flow are complete.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/tui/wizard.test.ts
```

Expected: All 4 tests PASS (validation logic tests — component rendering tested separately).

- [ ] **Step 5: Commit**

```bash
git add src/tui/wizard.tsx tests/tui/wizard.test.ts
git commit -m "feat: add wizard component with platform/step/tier selection and env validation"
```

---

### Task 8: Log panel component

**Files:**
- Create: `src/tui/log-panel.tsx`

- [ ] **Step 1: Create the log panel component**

Create `src/tui/log-panel.tsx`. This component subscribes to a `RunEmitter`, maintains a log buffer, and renders filtered entries with color-coded event types:

```tsx
import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import type { RunEmitter, RunEvent } from './emitter.js';
import { COLORS } from './theme.js';

interface LogEntry {
  event: RunEvent;
  timestamp: number;
}

interface LogFilters {
  browser: boolean;
  network: boolean;
  navigation: boolean;
  system: boolean;
}

interface LogPanelProps {
  emitter: RunEmitter;
  detailMode: boolean;
}

function isBrowserEvent(e: RunEvent): boolean {
  return e.type === 'field-fill' || e.type === 'button-click' || e.type === 'checkbox';
}

function isNetworkEvent(e: RunEvent): boolean {
  return e.type === 'network-request' || e.type === 'network-response';
}

function isNavigationEvent(e: RunEvent): boolean {
  return e.type === 'navigation';
}

function isSystemEvent(e: RunEvent): boolean {
  return e.type === 'info' || e.type === 'auth' || e.type === 'db-query';
}

export function LogPanel({ emitter, detailMode }: LogPanelProps): React.ReactElement {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [filters, setFilters] = useState<LogFilters>({
    browser: true, network: true, navigation: true, system: true,
  });
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);

  useEffect(() => {
    const handler = (event: RunEvent) => {
      setEntries(prev => [...prev, { event, timestamp: Date.now() }]);
    };
    emitter.on('event', handler);
    return () => { emitter.off('event', handler); };
  }, [emitter]);

  useInput((input, key) => {
    if (input === 'f') setShowFilterMenu(prev => !prev);
    if (input === '1') setFilters(prev => ({ ...prev, browser: !prev.browser }));
    if (input === '2') setFilters(prev => ({ ...prev, network: !prev.network }));
    if (input === '3') setFilters(prev => ({ ...prev, navigation: !prev.navigation }));
    if (input === '4') setFilters(prev => ({ ...prev, system: !prev.system }));
    if (key.upArrow) setScrollOffset(prev => Math.max(0, prev - 1));
    if (key.downArrow) setScrollOffset(prev => prev + 1);
  });

  const filtered = entries.filter(({ event }) => {
    if (isBrowserEvent(event) && !filters.browser) return false;
    if (isNetworkEvent(event) && !filters.network) return false;
    if (isNavigationEvent(event) && !filters.navigation) return false;
    if (isSystemEvent(event) && !filters.system) return false;
    return true;
  });

  const visible = filtered.slice(Math.max(0, filtered.length - 30 + scrollOffset));

  return (
    <Box flexDirection="column" flexGrow={1}>
      {showFilterMenu && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color={COLORS.dimText}>Filters (toggle with 1-4):</Text>
          <Text color={filters.browser ? COLORS.browserAction : COLORS.dimText}>
            {filters.browser ? '●' : '○'} 1: Browser actions
          </Text>
          <Text color={filters.network ? COLORS.networkCall : COLORS.dimText}>
            {filters.network ? '●' : '○'} 2: Network calls
          </Text>
          <Text color={filters.navigation ? COLORS.navigation : COLORS.dimText}>
            {filters.navigation ? '●' : '○'} 3: Navigation
          </Text>
          <Text color={filters.system ? COLORS.systemEvent : COLORS.dimText}>
            {filters.system ? '●' : '○'} 4: System events
          </Text>
        </Box>
      )}
      {visible.map((entry, i) => (
        <LogLine key={i} entry={entry} detailMode={detailMode} />
      ))}
    </Box>
  );
}

function LogLine({ entry, detailMode }: { entry: LogEntry; detailMode: boolean }): React.ReactElement {
  const { event } = entry;

  switch (event.type) {
    case 'field-fill':
      return <Text color={COLORS.browserAction}>⌨ Filled field → {event.field} → "{event.value}"</Text>;
    case 'button-click':
      return <Text color={COLORS.stepComplete}>🖱 Clicked button → "{event.label}"</Text>;
    case 'checkbox':
      return <Text color="#c4b5fd">☑ {event.checked ? 'Checked' : 'Unchecked'} → {event.label}</Text>;
    case 'navigation':
      return <Text color={COLORS.navigation}>🔗 Navigated → {event.url}</Text>;
    case 'network-request':
      return (
        <Box flexDirection="column">
          <Text color={COLORS.networkCall}>→ {event.method} {event.url}</Text>
          {detailMode && event.body && <Text color={COLORS.dimText}>  {event.body.slice(0, 200)}</Text>}
        </Box>
      );
    case 'network-response':
      return (
        <Box flexDirection="column">
          <Text color={COLORS.networkCall}>← {event.status} <Text color={COLORS.dimText}>({event.duration}ms)</Text></Text>
          {detailMode && event.body && <Text color={COLORS.dimText}>  {event.body.slice(0, 200)}</Text>}
        </Box>
      );
    case 'step-start':
      return <Text color={COLORS.stepRunning} bold>{event.step}</Text>;
    case 'step-complete':
      return <Text color={COLORS.stepComplete}>✓ {event.step} complete</Text>;
    case 'step-error':
      return <Text color={COLORS.stepError}>✗ {event.step}: {event.error}</Text>;
    case 'auth':
      return <Text color={COLORS.systemEvent}>🔑 {event.message}</Text>;
    case 'db-query':
      return <Text color={COLORS.systemEvent}>🗄 {event.query}</Text>;
    case 'info':
      return <Text color={COLORS.systemEvent}>{event.message}</Text>;
    case 'context-update':
      return <Text color={COLORS.dimText}>{event.key}: {event.value}</Text>;
  }
}
```

- [ ] **Step 2: Verify build compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/tui/log-panel.tsx
git commit -m "feat: add scrollable, filterable log panel component"
```

---

### Task 9: Execution view component

**Files:**
- Create: `src/tui/execution.tsx`

- [ ] **Step 1: Create the execution view**

Create `src/tui/execution.tsx`. This component renders the full-screen layout during execution: step list (left), log panel (right), status bar (bottom). It subscribes to the emitter for step progress and manages the step-through pause behavior.

```tsx
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
  const elapsedStr = `${(elapsed / 1000).toFixed(1)}s`;

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
            {Object.entries(context).map(([k, v]) => (
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
              ? 'r: retry · s: skip · q: quit'
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
```

- [ ] **Step 2: Verify build compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/tui/execution.tsx
git commit -m "feat: add execution view with step list, log panel, and status bar"
```

---

### Task 10: Batch mode results table

**Files:**
- Create: `src/tui/results-table.tsx`

- [ ] **Step 1: Create the results table component**

Create `src/tui/results-table.tsx`. This component displays completed providers in a table format, shown when the user presses `t` during batch execution:

```tsx
import React from 'react';
import { Box, Text } from 'ink';
import { COLORS } from './theme.js';

interface BatchResult {
  email: string;
  password: string;
  memberId: string;
  uuid: string;
  vertical: string;
  tier: string;
}

interface ResultsTableProps {
  results: BatchResult[];
  total: number;
  failed: number;
}

export function ResultsTable({ results, total, failed }: ResultsTableProps): React.ReactElement {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color={COLORS.stepRunning} bold>
        Batch Results: {results.length}/{total} created
        {failed > 0 ? <Text color={COLORS.stepError}> ({failed} failed)</Text> : ''}
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text color={COLORS.dimText}>
          {'Email'.padEnd(30)} {'MemberId'.padEnd(10)} {'Vertical'.padEnd(14)} Tier
        </Text>
        {results.map((r, i) => (
          <Text key={i}>
            <Text color={COLORS.contextValue}>{r.email.padEnd(30)}</Text>
            {' '}
            <Text>{r.memberId.padEnd(10)}</Text>
            {' '}
            <Text>{r.vertical.padEnd(14)}</Text>
            {' '}
            <Text>{r.tier}</Text>
          </Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color={COLORS.dimText}>Press t to close this view</Text>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 2: Wire results table into execution view**

In `src/tui/execution.tsx`, add state for batch results and the `t` key toggle:

```typescript
const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
const [showResults, setShowResults] = useState(false);

// In useInput handler:
if (input === 't') setShowResults(prev => !prev);

// In the emitter listener, capture completed providers from context-update events
// (the app.tsx runExecution loop emits these after each provider completes)
```

In the render, conditionally show `<ResultsTable>` overlay when `showResults` is true.

Also add a batch progress header in the execution view:

```tsx
{total > 1 && (
  <Text color={COLORS.stepRunning}>Creating {current}/{total} providers...</Text>
)}
```

The `total` and `current` values come from props passed by `app.tsx`.

- [ ] **Step 3: Verify build compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/tui/results-table.tsx src/tui/execution.tsx
git commit -m "feat: add batch mode results table and progress tracking"
```

---

### Task 11: Root app component (with batch tracking + web step-through)

**Files:**
- Create: `src/tui/app.tsx`

- [ ] **Step 1: Create the root app component**

Create `src/tui/app.tsx`. This is the top-level Ink component that manages the screen state machine: wizard → execution. When the wizard completes, it creates a `RunEmitter`, wires up the appropriate runner (web or mobile), and transitions to the execution view.

```tsx
import React, { useState, useCallback, useRef } from 'react';
import { Box, useApp } from 'ink';
import { Wizard, type WizardResult } from './wizard.js';
import { Execution } from './execution.js';
import { RunEmitter } from './emitter.js';
import { getStepsForPlatform } from './wizard.js';
import type { CliOptions, Tier, Vertical } from '../types.js';
import { ENV_CONFIGS } from '../types.js';
import { ApiClient } from '../api/client.js';
import { getAccessToken } from '../api/auth.js';
import { getStepsUpTo } from '../steps/registry.js';
import { VERTICAL_REGISTRY } from '../verticals.js';

type Screen = 'wizard' | 'execution';

export function App(): React.ReactElement {
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>('wizard');
  const [config, setConfig] = useState<WizardResult | null>(null);
  const emitterRef = useRef<RunEmitter>(new RunEmitter());
  const continueRef = useRef<(() => void) | null>(null);

  const handleWizardComplete = useCallback(async (result: WizardResult) => {
    setConfig(result);
    setScreen('execution');

    const emitter = emitterRef.current;
    const envConfig = ENV_CONFIGS[result.env];

    // Run in background — don't block render
    setTimeout(() => {
      runExecution(result, envConfig, emitter, continueRef).catch(err => {
        emitter.stepError('fatal', (err as Error).message);
      });
    }, 100);
  }, []);

  const handleStepContinue = useCallback(() => {
    continueRef.current?.();
  }, []);

  const retryFnRef = useRef<(() => Promise<void>) | null>(null);

  const handleRetry = useCallback(async () => {
    if (retryFnRef.current) {
      await retryFnRef.current();
    }
  }, []);

  const handleQuit = useCallback(() => {
    exit();
  }, [exit]);

  if (screen === 'wizard' || !config) {
    return <Wizard onComplete={handleWizardComplete} />;
  }

  const steps = getStepsForPlatform(config.platform);

  return (
    <Execution
      emitter={emitterRef.current}
      steps={steps}
      platform={config.platform}
      verticals={config.verticals}
      tier={config.tier}
      env={config.env}
      executionMode={config.executionMode}
      onStepContinue={handleStepContinue}
      onRetry={handleRetry}
      onQuit={handleQuit}
    />
  );
}

async function runExecution(
  config: WizardResult,
  envConfig: typeof ENV_CONFIGS[string],
  emitter: RunEmitter,
  continueRef: React.MutableRefObject<(() => void) | null>,
): Promise<void> {
  const jobs: Vertical[] = [];
  for (const v of config.verticals) {
    for (let i = 0; i < config.count; i++) jobs.push(v);
  }

  for (let i = 0; i < jobs.length; i++) {
    const vertical = jobs[i];
    // Emit batch progress for the UI
    emitter.info(`Creating provider ${i + 1}/${jobs.length} (${vertical})`);
    emitter.contextUpdate('_batchTotal', String(jobs.length));
    emitter.contextUpdate('_batchCurrent', String(i + 1));

    if (config.platform === 'web') {
      await runWebExecution(config, vertical, envConfig, emitter, continueRef);
    } else {
      await runMobileExecution(config, vertical, envConfig, emitter, continueRef);
    }

    // Emit a batch-result event so execution view can track completed providers
    emitter.info(`Provider ${i + 1}/${jobs.length} complete`);

    // In step-through batch mode, pause between providers
    if (config.executionMode === 'step-through' && i < jobs.length - 1) {
      await new Promise<void>(resolve => { continueRef.current = resolve; });
    }
  }
}

async function runWebExecution(
  config: WizardResult,
  vertical: Vertical,
  envConfig: typeof ENV_CONFIGS[string],
  emitter: RunEmitter,
  continueRef: React.MutableRefObject<(() => void) | null>,
): Promise<void> {
  const { runWebEnrollmentFlow } = await import('../steps/web-flow.js');
  const verticalConfig = VERTICAL_REGISTRY[vertical];
  const payloads = await loadPayloads(vertical);
  const headless = config.executionMode === 'run-all';

  const onStepComplete = config.executionMode === 'step-through'
    ? () => new Promise<void>(resolve => { continueRef.current = resolve; })
    : undefined;

  await runWebEnrollmentFlow(
    config.step, config.tier, envConfig, verticalConfig,
    payloads.providerCreateDefaults.serviceType,
    config.autoClose, headless, emitter, onStepComplete,
  );
}

async function runMobileExecution(
  config: WizardResult,
  vertical: Vertical,
  envConfig: typeof ENV_CONFIGS[string],
  emitter: RunEmitter,
  continueRef: React.MutableRefObject<(() => void) | null>,
): Promise<void> {
  const client = new ApiClient(envConfig.baseUrl, envConfig.apiKey);
  client.setEmitter(emitter);
  const payloads = await loadPayloads(vertical);
  const verticalConfig = VERTICAL_REGISTRY[vertical];

  const ctx = {
    email: '', password: 'letmein1', memberId: '', authToken: '',
    tier: config.tier as Tier,
    vertical: payloads.providerCreateDefaults.serviceType,
  };

  const steps = getStepsUpTo(config.step, config.platform);
  const { STEP_DESCRIPTIONS } = await import('./step-descriptions.js');

  for (const step of steps) {
    emitter.stepStart(step.name, STEP_DESCRIPTIONS[step.name] ?? '');

    if (step.name !== 'account-created' && !ctx.accessToken) {
      emitter.auth('Acquiring access token...');
      (ctx as any).accessToken = await getAccessToken(ctx.email, envConfig.baseUrl);
      client.setAccessToken((ctx as any).accessToken);
    }

    try {
      await step.runner(client, ctx, payloads, envConfig, verticalConfig, emitter);
      emitter.stepComplete(step.name);

      if (config.executionMode === 'step-through') {
        await new Promise<void>(resolve => { continueRef.current = resolve; });
      }
    } catch (err) {
      emitter.stepError(step.name, (err as Error).message);
      await new Promise<void>(resolve => { continueRef.current = resolve; });
    }
  }
}

async function loadPayloads(vertical: Vertical) {
  switch (vertical) {
    case 'childcare': return import('../payloads/childcare.js');
    case 'seniorcare': return import('../payloads/seniorcare.js');
    case 'petcare': return import('../payloads/petcare.js');
    case 'housekeeping': return import('../payloads/housekeeping.js');
    case 'tutoring': return import('../payloads/tutoring.js');
    default: throw new Error(`Unsupported vertical: ${vertical}`);
  }
}
```

- [ ] **Step 2: Verify build compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/tui/app.tsx
git commit -m "feat: add root TUI app with wizard-to-execution state machine"
```

---

### Task 12: Wire up the `interactive` subcommand

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add the interactive subcommand to Commander**

In `src/index.ts`, add a new `interactive` subcommand that launches the Ink app. Add it after the existing `mobile` subcommand block:

```typescript
program
  .command('interactive')
  .description('Launch interactive TUI for guided enrollment')
  .action(async () => {
    const { render } = await import('ink');
    const React = await import('react');
    const { App } = await import('./tui/app.js');
    render(React.createElement(App));
  });
```

Dynamic imports keep Ink/React out of the critical path for the existing CLI commands.

Also update the no-args hint. In the `isMainModule` block, before `parseArgs`, add a check:

```typescript
if (process.argv.length <= 2) {
  console.log(BANNER);
  console.log('  Run `jumper interactive` for guided mode.\n');
}
```

- [ ] **Step 2: Verify existing CLI still works**

```bash
npx vitest run
```

Expected: All existing tests PASS. The new command doesn't affect `parseArgs` — it's handled before Commander parses.

- [ ] **Step 3: Verify interactive command loads**

```bash
npx tsx src/index.ts interactive --help
```

Expected: Shows "Launch interactive TUI for guided enrollment".

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: add 'jumper interactive' subcommand to launch TUI"
```

---

### Task 13: End-to-end smoke test

**Files:**
- Verify all components work together

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run
```

Expected: All tests PASS (existing + new emitter + wizard validation tests).

- [ ] **Step 2: Type check the entire project**

```bash
npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 3: Manual smoke test — launch interactive mode**

```bash
npx tsx src/index.ts interactive
```

Expected: Full-screen TUI appears with the wizard. Navigate through platform → vertical → step → tier → options → confirm. Verify:
- Arrow keys work for selection
- Step descriptions appear when highlighting
- Esc goes back
- Confirm screen shows summary
- Env var warnings appear if vars are unset

- [ ] **Step 4: Manual smoke test — verify existing CLI unchanged**

```bash
npx tsx src/index.ts web at-location --help
npx tsx src/index.ts mobile at-availability --help
```

Expected: Same help output as before. No TUI, no React, no Ink loaded.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: interactive TUI mode complete — wizard + execution view"
```
