# Run Recorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record every run (mobile + web) with structured JSON/HTML reports, and capture video + traces + screenshots for web flows.

**Architecture:** A `RunRecorder` class subscribes to the existing `RunEmitter` event stream, collects all step and network data during a run, and writes artifacts to a per-run timestamped folder. Web flows additionally get Playwright video recording, tracing, and per-step screenshots.

**Tech Stack:** TypeScript, Vitest, Playwright (video/tracing/screenshots), Node.js `fs` APIs

**Spec:** `docs/superpowers/specs/2026-03-27-run-recorder-design.md`

**Spec deviations:** The plan diverges from the spec in three areas that surfaced during planning. These are intentional and the spec should be updated as part of Task 0:
1. `onStepComplete` is **kept** (not removed) — `app.tsx` uses it for step-through mode. `recorder` is added as a new trailing parameter.
2. `startTrace()` takes **two** arguments: `(context, browser)` — `finish()` needs the browser handle to close the Chromium process.
3. `finish()` shutdown sequence includes `browser.close()` after `context.close()` to prevent zombie Chromium.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/recorder/truncate.ts` | Create | Shared 2KB truncation utility |
| `src/recorder/run-recorder.ts` | Create | RunRecorder class — event collection, artifact management, JSON report |
| `src/recorder/html-template.ts` | Create | Self-contained HTML report generation |
| `src/recorder/types.ts` | Create | `ReportContext`, `ReportStep`, `ReportRequest`, `ReportMeta` interfaces |
| `tests/recorder/truncate.test.ts` | Create | Tests for truncation helper |
| `tests/recorder/run-recorder.test.ts` | Create | Tests for RunRecorder event collection + JSON output |
| `tests/recorder/html-template.test.ts` | Create | Tests for HTML report generation |
| `src/api/client.ts` | Modify | Use `truncate()` at 2KB for network event bodies |
| `src/steps/web-flow.ts` | Modify | Accept `recorder` param (keep `onStepComplete`), add screenshots, tracing, context options |
| `src/index.ts` | Modify | Wire recorder into mobile + web paths, add signal handlers |
| `src/tui/app.tsx` | Modify | Update `runWebEnrollmentFlow` call to pass `undefined` for new `recorder` param |
| `.gitignore` | Modify | Add `runs/` |

---

### Task 0: Update Spec to Match Plan

**Files:**
- Modify: `docs/superpowers/specs/2026-03-27-run-recorder-design.md`

- [ ] **Step 1: Update web-flow.ts section**

In the spec's `web-flow.ts` section, change the signature to keep `onStepComplete` and add `recorder` after it:
```typescript
export async function runWebEnrollmentFlow(
  ..., emitter?: RunEmitter, onStepComplete?: () => Promise<void>, recorder?: RunRecorder,
)
```
Remove the line that says `onStepComplete` is removed.

- [ ] **Step 2: Update startTrace signature**

Change `startTrace(context: BrowserContext)` to `startTrace(context: BrowserContext, browser: Browser)`.

- [ ] **Step 3: Update shutdown sequence**

Add `browser.close()` to the shutdown sequence after `context.close()`. Full order:
1. `tracing.stop()` → 2. `context.close()` → 3. `browser.close()` → 4. Glob `.webm` → 5. Write reports

All browser operations in `finish()` are wrapped in `try/catch` to tolerate an already-closed browser (user may close the window before `finish()` runs when `!autoClose`).

- [ ] **Step 4: Update index.ts snippet**

Update the web flow call to show `runWebEnrollmentFlow(..., emitter, undefined, recorder)`.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-03-27-run-recorder-design.md
git commit -m "docs: update run recorder spec to match plan deviations"
```

---

### Task 1: Truncation Utility

**Files:**
- Create: `src/recorder/truncate.ts`
- Test: `tests/recorder/truncate.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/recorder/truncate.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/recorder/truncate.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/recorder/truncate.ts
export function truncate(str: string, maxLen = 2048): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + `...[truncated, ${str.length} bytes total]`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/recorder/truncate.test.ts`
Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/recorder/truncate.ts tests/recorder/truncate.test.ts
git commit -m "feat(recorder): add shared truncation utility"
```

---

### Task 2: Report Types

**Files:**
- Create: `src/recorder/types.ts`

- [ ] **Step 1: Write the types**

```typescript
// src/recorder/types.ts
export interface ReportContext {
  email: string;
  password: string;
  memberId: string | null;
  uuid: string | null;
  authToken: string | null;
  accessToken: string | null;
  vertical: string | null;
}

export interface ReportRequest {
  method: string;
  url: string;
  status: number | null;
  duration: number;
  requestBody: string | null;
  responseBody: string | null;
  timestamp: string;
}

export interface ReportStep {
  name: string;
  status: 'pass' | 'fail' | 'skipped';
  duration: number;
  startedAt: string;
  requests: ReportRequest[];
  screenshot: string | null;
  error: string | null;
}

export interface ReportError {
  step: string;
  message: string;
  stack: string;
  timestamp: string;
}

export interface ReportMeta {
  timestamp: string;
  platform: 'mobile' | 'web';
  vertical: string;
  tier: string;
  targetStep: string;
  totalDuration: number;
  outcome: 'pass' | 'fail';
}

export interface RunReport {
  meta: ReportMeta;
  context: ReportContext;
  steps: ReportStep[];
  errors: ReportError[];
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/recorder/types.ts
git commit -m "feat(recorder): add report type definitions"
```

---

### Task 3: RunRecorder — Core Event Collection

**Files:**
- Create: `src/recorder/run-recorder.ts`
- Test: `tests/recorder/run-recorder.test.ts`

- [ ] **Step 1: Write failing tests for event collection**

```typescript
// tests/recorder/run-recorder.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RunEmitter } from '../../src/tui/emitter.js';
import { RunRecorder } from '../../src/recorder/run-recorder.js';
import fs from 'fs';
import path from 'path';

const TEST_RUNS_DIR = path.resolve('test-runs-tmp');

describe('RunRecorder', () => {
  let recorder: RunRecorder;
  let emitter: RunEmitter;

  beforeEach(() => {
    emitter = new RunEmitter();
    recorder = new RunRecorder({
      platform: 'mobile',
      vertical: 'childcare',
      tier: 'premium',
      targetStep: 'account-created',
      runsDir: TEST_RUNS_DIR,
    });
    recorder.attach(emitter);
  });

  afterEach(() => {
    fs.rmSync(TEST_RUNS_DIR, { recursive: true, force: true });
  });

  it('creates the run directory on construction', () => {
    expect(fs.existsSync(recorder.runDir)).toBe(true);
  });

  it('collects step events into report steps', async () => {
    emitter.stepStart('account-created', 'Creating account');
    emitter.stepComplete('account-created');

    const report = await recorder.finish({ email: 'test@care.com', password: 'p' });
    expect(report.steps).toHaveLength(1);
    expect(report.steps[0].name).toBe('account-created');
    expect(report.steps[0].status).toBe('pass');
  });

  it('pairs network request/response into step requests', async () => {
    emitter.stepStart('account-created', 'Creating account');
    emitter.networkRequest('POST', '/platform/spi/enroll/lite', '{"email":"x"}');
    emitter.networkResponse(200, '/platform/spi/enroll/lite', 150, '{"data":{}}');
    emitter.stepComplete('account-created');

    const report = await recorder.finish({ email: 'test@care.com', password: 'p' });
    expect(report.steps[0].requests).toHaveLength(1);
    expect(report.steps[0].requests[0].method).toBe('POST');
    expect(report.steps[0].requests[0].status).toBe(200);
    expect(report.steps[0].requests[0].requestBody).toBe('{"email":"x"}');
    expect(report.steps[0].requests[0].responseBody).toBe('{"data":{}}');
  });

  it('records errors via recordError', async () => {
    emitter.stepStart('account-created', 'Creating account');
    emitter.stepError('account-created', 'enroll failed');
    recorder.recordError('account-created', new Error('enroll failed'));

    const report = await recorder.finish({ email: 'test@care.com', password: 'p' });
    expect(report.steps[0].status).toBe('fail');
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0].step).toBe('account-created');
    expect(report.errors[0].stack).toContain('enroll failed');
  });

  it('writes report.json to runDir on finish', async () => {
    emitter.stepStart('account-created', 'Creating');
    emitter.stepComplete('account-created');

    await recorder.finish({ email: 'e@c.com', password: 'p' });

    const reportPath = path.join(recorder.runDir, 'report.json');
    expect(fs.existsSync(reportPath)).toBe(true);
    const json = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    expect(json.meta.platform).toBe('mobile');
    expect(json.meta.outcome).toBe('pass');
    expect(json.context.email).toBe('e@c.com');
  });

  it('records step duration and startedAt', async () => {
    emitter.stepStart('account-created', 'Creating account');
    await new Promise(r => setTimeout(r, 50));
    emitter.stepComplete('account-created');

    const report = await recorder.finish({ email: 'test@care.com', password: 'p' });
    expect(report.steps[0].startedAt).toBeTruthy();
    expect(report.steps[0].duration).toBeGreaterThanOrEqual(40);
  });

  it('sets meta.timestamp at construction time', async () => {
    emitter.stepStart('account-created', 'Creating');
    emitter.stepComplete('account-created');

    const report = await recorder.finish({ email: 'e@c.com', password: 'p' });
    expect(report.meta.timestamp).toBeTruthy();
    const ts = new Date(report.meta.timestamp).getTime();
    expect(ts).toBeLessThanOrEqual(Date.now());
    expect(ts).toBeGreaterThan(Date.now() - 10000);
  });

  it('creates run dir with correct naming pattern', () => {
    const dirName = path.basename(recorder.runDir);
    expect(dirName).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_mobile_childcare$/);
  });

  it('handles unpaired requests (no response)', async () => {
    emitter.stepStart('account-created', 'Creating account');
    emitter.networkRequest('POST', '/platform/spi/enroll/lite', '{"email":"x"}');
    emitter.stepComplete('account-created');

    const report = await recorder.finish({ email: 'test@care.com', password: 'p' });
    expect(report.steps[0].requests).toHaveLength(1);
    expect(report.steps[0].requests[0].status).toBeNull();
    expect(report.steps[0].requests[0].requestBody).toBe('{"email":"x"}');
    expect(report.steps[0].requests[0].responseBody).toBeNull();
  });

  it('normalizes ProviderContext to ReportContext (no extra fields)', async () => {
    emitter.stepStart('account-created', 'Creating');
    emitter.stepComplete('account-created');

    const report = await recorder.finish({
      email: 'e@c.com',
      password: 'p',
      memberId: '123',
    });
    expect(report.context).not.toHaveProperty('_eligibilityResponse');
    expect(report.context).not.toHaveProperty('tier');
    expect(report.context.email).toBe('e@c.com');
    expect(report.context.memberId).toBe('123');
  });

  it('is idempotent — second finish is a no-op', async () => {
    emitter.stepStart('account-created', 'Creating');
    emitter.stepComplete('account-created');

    const r1 = await recorder.finish({ email: 'a@b.com', password: 'p' });
    const r2 = await recorder.finish({ email: 'a@b.com', password: 'p' });
    expect(r1).toEqual(r2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/recorder/run-recorder.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the RunRecorder implementation**

Create `src/recorder/run-recorder.ts`. Key behaviors:

- Constructor: takes `RunRecorderConfig` (add optional `runsDir` for test override, defaults to `runs/` relative to project root). Creates run dir named `YYYY-MM-DD_HH-mm-ss_{platform}_{vertical}` with `mkdirSync({ recursive: true })`. For web, also creates `screenshots/` subdirectory. Stores `constructedAt = new Date()` for `meta.timestamp`.
- `runDir` is a public readonly property exposing the created path.
- `attach(emitter)`: listens to emitter `'event'` events. Maintains:
  - `currentStep: { step: ReportStep, startTime: number } | null` — when `step-start` arrives, create a new step with `startedAt = new Date().toISOString()` and `startTime = Date.now()`. When `step-complete` arrives, set `status = 'pass'` and `duration = Date.now() - startTime`, then **immediately push to `this.steps` array** and set `currentStep = null`. When `step-error` arrives, set `status = 'fail'` and `duration = Date.now() - startTime`, then **immediately push to `this.steps` array** and set `currentStep = null`. Steps must be pushed immediately (not deferred to `finish()`) so that `screenshot()` can find the step by name in `this.steps` right after `stepComplete`.
  - `pendingRequests: Map<string, { method, url, body, timestamp }>` — on `network-request`, store keyed by URL. On `network-response`, pop matching request, merge into a `ReportRequest`, push to `currentStep.requests`. On `step-complete`/`step-error`, any remaining pending requests for the current step are flushed with `status: null` and `responseBody: null`.
- `recordError(step, err)`: pushes to internal `errors: ReportError[]` with `err.stack ?? err.message`.
- `finish(ctx: ReportContext)`: if already finished, return cached report. Otherwise:
  - Set `finished = true`.
  - **Normalize context:** build a `ReportContext` by explicitly picking fields from ctx: `email`, `password`, and for optional fields use `ctx.memberId ?? null`, `ctx.uuid ?? null`, etc. Do NOT spread the full input — this prevents extra fields like `_eligibilityResponse` or `tier` from leaking into `report.json`.
  - Build `RunReport` from collected data. `meta.timestamp = this.constructedAt.toISOString()`. `meta.totalDuration` = Date.now() - constructedAt time. `meta.outcome` = any step has `status === 'fail'` ? `'fail'` : `'pass'`.
  - Write `report.json` with `JSON.stringify(report, null, 2)`.
  - Call `generateHtmlReport(report, runDir)` (from html-template.ts — stub as empty string for now, implemented in Task 5).
  - Write `report.html`.
  - Log `console.log('  📁 Run saved to: <runDir>')`.
  - Return the report.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/recorder/run-recorder.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/recorder/run-recorder.ts tests/recorder/run-recorder.test.ts
git commit -m "feat(recorder): RunRecorder core with event collection and JSON report"
```

---

### Task 4: ApiClient — Standardize Body Truncation

**Files:**
- Modify: `src/api/client.ts:22-33` (the `trackedFetch` method)

- [ ] **Step 1: Update trackedFetch to use truncate at 2KB**

In `src/api/client.ts`, add the import and update `trackedFetch`:

```typescript
import { truncate } from '../recorder/truncate.js';
```

Change the `trackedFetch` method:

```typescript
private async trackedFetch(url: string, init: RequestInit): Promise<Response> {
  const method = init.method ?? 'GET';
  const shortUrl = url.replace(this.baseUrl, '');

  let requestBody: string | undefined;
  if (typeof init.body === 'string') {
    requestBody = truncate(init.body);
  } else if (init.body instanceof FormData) {
    requestBody = `[FormData: ${[...init.body.keys()].length} fields]`;
  }
  this.emitter?.networkRequest(method, shortUrl, requestBody);

  const start = Date.now();
  const res = await fetch(url, init);
  const duration = Date.now() - start;

  const cloned = res.clone();
  const text = await cloned.text().catch(() => '');
  this.emitter?.networkResponse(res.status, shortUrl, duration, truncate(text));

  return res;
}
```

This changes the response body truncation from `text.slice(0, 500)` to `truncate(text)` (2KB), and handles FormData bodies.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/api/client.ts
git commit -m "feat(recorder): standardize API client body truncation to 2KB"
```

---

### Task 5: HTML Report Template

**Files:**
- Create: `src/recorder/html-template.ts`
- Test: `tests/recorder/html-template.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/recorder/html-template.test.ts
import { describe, it, expect } from 'vitest';
import { generateHtmlReport } from '../../src/recorder/html-template.js';
import type { RunReport } from '../../src/recorder/types.js';

function makeReport(overrides: Partial<RunReport> = {}): RunReport {
  return {
    meta: {
      timestamp: '2026-03-27T14:00:00.000Z',
      platform: 'mobile',
      vertical: 'childcare',
      tier: 'premium',
      targetStep: 'account-created',
      totalDuration: 2500,
      outcome: 'pass',
      ...overrides.meta,
    },
    context: {
      email: 'test@care.com',
      password: 'letmein1',
      ...overrides.context,
    },
    steps: overrides.steps ?? [
      {
        name: 'account-created',
        status: 'pass',
        duration: 2500,
        startedAt: '2026-03-27T14:00:00.000Z',
        requests: [],
        screenshot: null,
        error: null,
      },
    ],
    errors: overrides.errors ?? [],
  };
}

describe('generateHtmlReport', () => {
  it('returns a self-contained HTML string', () => {
    const html = generateHtmlReport(makeReport());
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
    expect(html).toContain('<style>');
    expect(html).not.toContain('<link rel="stylesheet"');
  });

  it('includes pass badge for passing runs', () => {
    const html = generateHtmlReport(makeReport());
    expect(html).toContain('PASS');
    expect(html).toContain('account-created');
  });

  it('includes fail badge and errors section for failing runs', () => {
    const html = generateHtmlReport(makeReport({
      meta: { outcome: 'fail' } as any,
      errors: [{
        step: 'account-created',
        message: 'enroll failed',
        stack: 'Error: enroll failed\n    at ...',
        timestamp: '2026-03-27T14:00:02.000Z',
      }],
    }));
    expect(html).toContain('FAIL');
    expect(html).toContain('enroll failed');
  });

  it('includes request/response details in collapsible sections', () => {
    const html = generateHtmlReport(makeReport({
      steps: [{
        name: 'account-created',
        status: 'pass',
        duration: 2500,
        startedAt: '2026-03-27T14:00:00.000Z',
        requests: [{
          method: 'POST',
          url: '/platform/spi/enroll/lite',
          status: 200,
          duration: 680,
          requestBody: '{"email":"x"}',
          responseBody: '{"data":{}}',
          timestamp: '2026-03-27T14:00:00.100Z',
        }],
        screenshot: null,
        error: null,
      }],
    }));
    expect(html).toContain('<details');
    expect(html).toContain('POST');
    expect(html).toContain('/platform/spi/enroll/lite');
  });

  it('embeds screenshots as base64 when provided', () => {
    const html = generateHtmlReport(makeReport(), {
      'screenshots/01_test.png': Buffer.from('fakepng'),
    });
    expect(html).toContain('data:image/png;base64,');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/recorder/html-template.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the HTML template generator**

Create `src/recorder/html-template.ts`. Function signature:

```typescript
export function generateHtmlReport(
  report: RunReport,
  screenshots?: Record<string, Buffer>,
): string
```

The function builds a self-contained HTML string with:
- Inline `<style>` block with modern CSS (monospace for data, system fonts for labels, green/red status colors)
- Banner: outcome badge (PASS green / FAIL red), platform, vertical, tier, duration
- Context section: email, password, memberId, uuid, vertical
- Steps: each step wrapped in a `<details>` element. Summary shows icon (checkmark/cross), name, duration. Body shows nested `<details>` for each request with method, URL, status, duration, and `<pre>` blocks for request/response bodies.
- Screenshots: if the step's `screenshot` key exists in the `screenshots` map and the buffer is <= 500KB, embed as `<img src="data:image/png;base64,..." />`. Otherwise link to the file path.
- Errors section: only rendered if `report.errors.length > 0`. Red background, `<pre>` blocks with stack traces.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/recorder/html-template.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Wire HTML generation into RunRecorder.finish()**

In `src/recorder/run-recorder.ts`, update `finish()` to:
1. Import `generateHtmlReport` from `./html-template.js`
2. For web runs, read screenshot files from `<runDir>/screenshots/` into a `Record<string, Buffer>`
3. Call `generateHtmlReport(report, screenshots)`
4. Write the result to `<runDir>/report.html`

- [ ] **Step 6: Run all recorder tests**

Run: `npx vitest run tests/recorder/`
Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/recorder/html-template.ts tests/recorder/html-template.test.ts src/recorder/run-recorder.ts
git commit -m "feat(recorder): self-contained HTML report generation"
```

---

### Task 6: RunRecorder — Web Methods (Playwright Integration)

**Files:**
- Modify: `src/recorder/run-recorder.ts`

- [ ] **Step 1: Add Playwright web methods**

Add three methods to `RunRecorder`:

**`playwrightContextOptions()`**: returns `{ recordVideo: { dir: this.runDir } }`. Only meaningful for web runs but safe to call for any platform (mobile callers simply won't use the result).

**`startTrace(context: BrowserContext, browser: Browser)`**: stores `context` as `this.browserContext` and `browser` as `this.browser`, calls `await context.tracing.start({ screenshots: true, snapshots: true })`.

**`screenshot(page: Page, stepName: string, index: number)`**: wrapped in try/catch. Calls `await page.screenshot({ path: path.join(this.runDir, 'screenshots', \`${String(index).padStart(2, '0')}_${stepName}.png\`), fullPage: true })`. On success, finds the **last step** in `this.steps` whose `name === stepName` and sets its `screenshot` field to the relative path (`screenshots/NN_stepName.png`). This works because screenshots are taken immediately after `stepComplete`, and the step was just finalized and pushed to the array. On failure, logs a warning and continues.

**Update `finish()`** for web: before writing reports, if `this.browserContext` is set, run the shutdown sequence inside a **try/catch** to tolerate an already-closed browser (which happens when `!autoClose` and the user manually closes the window before `finish()` runs):

```typescript
if (this.browserContext) {
  try {
    await this.browserContext.tracing.stop({ path: path.join(this.runDir, 'trace.zip') });
  } catch { /* browser already closed — trace may be incomplete */ }
  try {
    await this.browserContext.close();
  } catch { /* already closed */ }
  try {
    await this.browser!.close();
  } catch { /* already closed */ }
  // Glob *.webm, rename first match to video.webm (may not exist if browser was closed early)
  const webms = fs.readdirSync(this.runDir).filter(f => f.endsWith('.webm'));
  if (webms.length > 0) {
    fs.renameSync(path.join(this.runDir, webms[0]), path.join(this.runDir, 'video.webm'));
  }
}
```

This approach means:
- **`autoClose=true` + recorder (CLI)**: flow finishes → `stop()` skips browser close → `finish()` cleanly stops tracing, closes context, closes browser, renames video
- **`autoClose=false` + recorder (CLI)**: flow finishes → `stop()` waits for user to close browser → `finish()` runs with try/catch, tracing may be partial, video may be missing, reports still written
- **`autoClose=false` + no recorder (TUI/legacy)**: existing behavior unchanged

Use `import type { BrowserContext, Page, Browser } from 'playwright'` for type-only imports so Playwright isn't a runtime dependency for mobile-only runs.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/recorder/run-recorder.ts
git commit -m "feat(recorder): add Playwright video, tracing, and screenshot support"
```

---

### Task 7: Web Flow Integration

**Files:**
- Modify: `src/steps/web-flow.ts`

- [ ] **Step 1: Update runWebEnrollmentFlow signature**

Add `recorder` as a new parameter **after** `onStepComplete`. Keep `onStepComplete` — it's used by `app.tsx` for step-through mode:

```typescript
import type { RunRecorder } from '../recorder/run-recorder.js';

export async function runWebEnrollmentFlow(
  targetStep: string,
  tier: Tier,
  envConfig: EnvConfig,
  verticalConfig: VerticalConfig,
  serviceType: string,
  autoClose = false,
  emitter?: RunEmitter,
  onStepComplete?: () => Promise<void>,
  recorder?: RunRecorder,
): Promise<WebFlowResult> {
```

- [ ] **Step 2: Update browser context creation**

Replace the current `browser.newContext()` call:

```typescript
const contextOptions = recorder?.playwrightContextOptions() ?? {};
const context = await browser.newContext(contextOptions);
if (recorder) {
  await recorder.startTrace(context, browser);
}
```

- [ ] **Step 3: Add screenshots after each step**

Add a `stepIndex` counter starting at 0. After every `emitter?.stepComplete(stepName)` call, add:

```typescript
stepIndex++;
await recorder?.screenshot(page, stepName, stepIndex);
```

- [ ] **Step 4: Update the `stop()` function and browser cleanup**

Update the `stop()` function's browser lifecycle. The existing code has two branches: `autoClose` (close browser) and `!autoClose` (wait for user disconnect). Modify to account for recorder:

```typescript
if (autoClose) {
  if (!recorder) {
    console.log('\n  Auto-closing browser.\n');
    await browser.close();
  }
  // When recorder is present + autoClose, skip — recorder.finish() will close
} else {
  console.log('\n  Close the browser when you\'re done.\n');
  await new Promise<void>(resolve => {
    browser.once('disconnected', () => resolve());
  });
  // Preserve wait-for-disconnect in all !autoClose cases (with or without recorder).
  // If recorder is present, finish() will try/catch around already-closed resources.
}
```

This preserves the existing wait-for-disconnect UX when `!autoClose`, regardless of whether a recorder is present.

- [ ] **Step 5: Update response body truncation in page event listeners**

Change `body.slice(0, 500)` to use the shared truncate:

```typescript
import { truncate } from '../recorder/truncate.js';

// In the response listener:
emitter.networkResponse(res.status(), shortUrl, duration, truncate(body));
```

And for the request listener, also truncate:
```typescript
emitter.networkRequest(req.method(), shortUrl, truncate(req.postData() ?? ''));
```

- [ ] **Step 6: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/steps/web-flow.ts
git commit -m "feat(recorder): integrate recorder into web enrollment flow"
```

---

### Task 8: index.ts and app.tsx Integration

**Files:**
- Modify: `src/index.ts`
- Modify: `src/tui/app.tsx`

- [ ] **Step 1: Add imports and signal handler helper to index.ts**

```typescript
import { RunRecorder } from './recorder/run-recorder.js';

function registerShutdownHandlers(recorder: RunRecorder): void {
  const handler = async () => {
    await recorder.finish({ email: '', password: '' });
    process.exit(1);
  };
  process.once('SIGINT', handler);
  process.once('SIGTERM', handler);
}
```

- [ ] **Step 2: Update runMobileFlow**

Wrap the existing pipeline loop in try/finally with recorder:

```typescript
async function runMobileFlow(opts: CliOptions, envConfig: typeof ENV_CONFIGS[string]): Promise<void> {
  const emitter = new RunEmitter();
  consoleAdapter(emitter);
  const recorder = new RunRecorder({
    platform: 'mobile',
    vertical: opts.vertical,
    tier: opts.tier,
    targetStep: opts.step,
  });
  recorder.attach(emitter);
  registerShutdownHandlers(recorder);

  const client = new ApiClient(envConfig.baseUrl, envConfig.apiKey);
  client.setEmitter(emitter);
  const payloads = await loadPayloads(opts.vertical);
  const verticalConfig = VERTICAL_REGISTRY[opts.vertical];

  const ctx: ProviderContext = {
    email: '',
    password: 'letmein1',
    memberId: '',
    authToken: '',
    tier: opts.tier as Tier,
    vertical: payloads.providerCreateDefaults.serviceType,
  };

  const steps = getStepsUpTo(opts.step, opts.platform);
  console.log(`\nCreating provider at step: ${opts.step} (mobile)\n`);

  let failed = false;
  try {
    for (const step of steps) {
      if (step.name !== 'account-created' && !ctx.accessToken) {
        const authSpinner = ora('Acquiring access token…').start();
        ctx.accessToken = await getAccessToken(ctx.email, envConfig.baseUrl);
        client.setAccessToken(ctx.accessToken);
        authSpinner.succeed('Access token acquired');
      }

      emitter.stepStart(step.name, step.name);
      const spinner = ora(step.name).start();
      try {
        await step.runner(client, ctx, payloads, envConfig, verticalConfig, emitter);
        spinner.succeed(step.name);
        emitter.stepComplete(step.name);
      } catch (err) {
        spinner.fail(step.name);
        emitter.stepError(step.name, (err as Error).message);
        recorder.recordError(step.name, err as Error);
        console.error(`  Error: ${(err as Error).message}`);
        failed = true;
        break;
      }
    }
  } finally {
    await recorder.finish(ctx);
  }

  if (failed) {
    if (ctx.email) {
      console.log('\n  Partial provider created:');
      console.log(`    Email:    ${ctx.email}`);
      console.log(`    Password: ${ctx.password}`);
      if (ctx.memberId) console.log(`    MemberId: ${ctx.memberId}`);
    }
    process.exit(1);
  }

  console.log(`\n✓ Provider created at step: ${opts.step} (mobile)\n`);
  console.log(`  Email:      ${ctx.email}`);
  console.log(`  Password:   ${ctx.password}`);
  console.log(`  MemberId:   ${ctx.memberId}`);
  console.log(`  UUID:       ${ctx.uuid ?? '(set MYSQL_DB_PASS_DEV to retrieve)'}`);
  console.log(`  Vertical:   ${ctx.vertical}`);
  console.log('');
}
```

Key change: the step runners that already emit via their internal `emitter?.` calls will now be captured by the recorder. The `emitter.stepStart` / `emitter.stepComplete` calls are added to the loop so the recorder can track step boundaries. Check whether step runners already call `emitter.stepStart/stepComplete` internally — if they do, remove the duplicate from the loop to avoid double-firing. If they don't (they currently don't — only `console.log` and info events), the loop calls are correct.

- [ ] **Step 3: Update runWebFlow**

Note: `runWebEnrollmentFlow` signature is now `(..., emitter?, onStepComplete?, recorder?)`. CLI calls pass `undefined` for `onStepComplete` and pass `recorder`. The TUI (`app.tsx`) passes `onStepComplete` and `undefined` for `recorder`.

```typescript
async function runWebFlow(opts: CliOptions, envConfig: typeof ENV_CONFIGS[string]): Promise<void> {
  const { runWebEnrollmentFlow } = await import('./steps/web-flow.js');
  const emitter = new RunEmitter();
  consoleAdapter(emitter);
  const recorder = new RunRecorder({
    platform: 'web',
    vertical: opts.vertical,
    tier: opts.tier,
    targetStep: opts.step,
  });
  recorder.attach(emitter);
  registerShutdownHandlers(recorder);

  const verticalConfig = VERTICAL_REGISTRY[opts.vertical];
  const payloads = await loadPayloads(opts.vertical);
  console.log(`\nStarting web enrollment → ${opts.step} (${opts.vertical})\n`);

  let webResult: Awaited<ReturnType<typeof runWebEnrollmentFlow>> | undefined;
  try {
    webResult = await runWebEnrollmentFlow(
      opts.step, opts.tier as Tier, envConfig, verticalConfig,
      payloads.providerCreateDefaults.serviceType, opts.autoClose,
      emitter, undefined, recorder,
    );
  } catch (err) {
    recorder.recordError('web-flow', err as Error);
    console.error(`\nWeb flow error: ${(err as Error).message}`);
  } finally {
    await recorder.finish({
      email: webResult?.email ?? '',
      password: webResult?.password ?? '',
      memberId: webResult?.memberId,
      vertical: webResult?.vertical,
    });
  }

  if (!webResult) process.exit(1);
}
```

- [ ] **Step 4: Update app.tsx**

In `src/tui/app.tsx`, update the `runWebEnrollmentFlow` call to match the new signature (add `undefined` for the `recorder` param):

```typescript
await runWebEnrollmentFlow(
  result.step,
  result.tier,
  envConfig,
  verticalConfig,
  verticalConfig.serviceId,
  result.autoClose,
  emitter,
  onStepComplete,
  undefined,  // recorder — TUI doesn't use it
);
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/index.ts src/tui/app.tsx
git commit -m "feat(recorder): wire RunRecorder into mobile and web CLI paths"
```

---

### Task 9: Gitignore and End-to-End Verification

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add runs/ to .gitignore**

Append `runs/` to `jumper/.gitignore`.

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: all tests PASS

- [ ] **Step 3: Verify TypeScript compiles clean**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Build the project**

Run: `npm run build`
Expected: clean build, no errors

- [ ] **Step 5: Manual smoke test (mobile)**

Run: `node dist/index.js --step account-created --platform mobile --vertical childcare`

Verify:
- `runs/` directory is created with a timestamped folder
- `report.json` exists and contains step data, context, and request/response bodies
- `report.html` exists and is viewable in a browser
- No `video.webm`, `trace.zip`, or `screenshots/` (mobile run)

- [ ] **Step 6: Manual smoke test (web)**

Run: `node dist/index.js --step at-get-started --platform web --vertical childcare`

Verify:
- Run folder contains `report.json`, `report.html`, `video.webm`, `trace.zip`, and `screenshots/`
- Screenshots exist for completed steps
- HTML report embeds screenshots
- Video plays back the browser session

- [ ] **Step 7: Commit**

```bash
git add .gitignore
git commit -m "chore: add runs/ to gitignore, verify end-to-end"
```
