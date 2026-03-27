# Interactive TUI for Jumper

**Date:** 2026-03-27
**Status:** Ready for planning

## Purpose

Add a full-screen terminal UI (TUI) to Jumper so that new team members and engineers unfamiliar with the enrollment flow can configure and run the tool through a guided interface, with real-time visibility into every action the tool takes.

The existing CLI (`jumper web <step>`, `jumper mobile <step>`) remains unchanged. The TUI is an additional entry point.

## Audience

Engineers and QA team members who are new to the provider enrollment flow. They need guidance on what each step does, what options are available, and want to see exactly what's happening under the hood as the tool runs.

## Entry Points

```
jumper web <step> [opts]     → existing CLI (unchanged)
jumper mobile <step> [opts]  → existing CLI (unchanged)
jumper interactive           → launches full-screen TUI
jumper (no args)             → shows help + hint about interactive mode
```

## Technology

**Ink** (React for CLI) with the following dependencies:

- `ink` — React renderer for terminal
- `react` — component model
- `ink-select-input` — arrow-key list selection
- `ink-text-input` — text input fields
- `ink-spinner` — loading indicators

Ink provides flexbox layout, full-screen mode, and a rich widget ecosystem. It's actively maintained with a large community.

## Screen Layout

The TUI uses a persistent full-screen layout with four regions:

### Top Bar

Displays the JUMPER banner and current run configuration (platform, vertical, tier, environment). During the wizard phase, shows "Configuration" instead.

### Left Panel — Steps + Context

- **Step list:** All enrollment steps for the selected platform, each with a status indicator:
  - `✓` completed (green)
  - `▸` running (yellow, highlighted row)
  - `○` pending (dim)
- **Context section:** Provider data updated as it becomes available — email, password, memberId, uuid, current URL (web), auth token (mobile).
- **Log filter section:** Toggle switches for browser actions, network calls, navigation, and static assets. Controlled via `f` key.

### Right Panel — Detail / Logs

- **Step header:** Current step name and one-line description of what it does.
- **Log output:** Scrollable, chronological log of all actions. Displays different event types:

**Browser actions** (blue) — web flow:
- `⌨ Filled field → First name → "Martina"`
- `🖱 Clicked button → "Join Now"`
- `☑ Checked → Age verification checkbox`

**Network calls** (orange) — both web and mobile:
- `→ POST /api/graphql (providerCreate)` with request payload
- `← 200 OK (1,204ms)` with response payload
- Request/response bodies shown inline, expandable with `d` key for full payloads

**Navigation** (green) — web flow:
- `🔗 Navigated → /enrollment/provider/mv/family-connection`

**System events** (dim):
- `⏳ Waiting for navigation...`
- `🔑 Acquiring access token...`
- `🗄 Querying BACKGROUND_CHECK_EXECUTION...`

For web flows, Playwright's `page.on('request')` and `page.on('response')` listeners capture all network traffic and interleave it with browser actions chronologically, showing the full cause-and-effect chain.

Log filtering via `f` key toggles visibility of each event category. Static assets (JS/CSS/images) are hidden by default.

### Bottom Bar

- Connection status indicator
- Step progress counter (`Step 3/7 · Elapsed: 4.2s`)
- Keyboard shortcuts reference
- In step-through mode: `Press enter to continue to next step`

### Keyboard Controls

| Key | Action |
|-----|--------|
| `↑/↓` | Navigate step list / scroll logs |
| `enter` | Confirm selection / continue to next step |
| `esc` | Go back (wizard) / cancel current step and drop to step-through mode (run-all) |
| `d` | Toggle detail level (summary vs full payloads) |
| `f` | Toggle log filters |
| `t` | Show results table (batch mode) |
| `r` | Retry failed step |
| `s` | Skip failed step (where possible) |
| `q` | Quit |

## Wizard Flow

The wizard is a 6-step configuration sequence, rendered within the same full-screen layout. The left panel shows wizard progress; the right panel shows the current question.

### Step 1: Platform

Arrow-key select: **Web** or **Mobile**.

### Step 2: Vertical

Arrow-key select from: childcare, seniorcare, petcare, housekeeping, tutoring. For batch runs, multi-select is available (space to toggle, enter to confirm). "All" option selects all verticals.

### Step 3: Step

Filtered list based on the chosen platform — 13 web steps or 7 mobile steps. As the user highlights each step, a description appears in the info bar explaining what that checkpoint represents and what state the provider will be in.

### Step 4: Tier

Arrow-key select: **Basic** or **Premium**.

### Step 5: Options

Pre-filled with sensible defaults. The user only changes what they need:
- **Count:** 1 (text input, 1-50)
- **Auto-close browser:** yes (web only)
- **Environment:** dev

### Step 6: Confirm

Summary table of all selections. Three choices:
- **Run all steps automatically** — executes straight through, pauses only on error
- **Step through one at a time** — pauses after each enrollment step within a single provider completes. In batch mode (count > 1 or multiple verticals), also pauses between providers so the user can review the completed result before the next one starts.
- **Go back and edit** — returns to the wizard

### Environment Variable Validation

Before reaching the confirm screen, the TUI checks for required env vars based on the selected configuration:
- `CZEN_API_KEY` — required for all mobile flows
- `MYSQL_DB_PASS_DEV` — required for mobile `fully-enrolled`; optional otherwise
- `STRIPE_KEY` — required for web payment steps (`at-basic-payment`, `at-premium-payment`, `at-app-download`)

If a var is missing, the confirm screen displays a warning with the var name and where to find it (team lead or QA vault), rather than letting the run fail midway.

## Architecture

### Principle: New entry point, not a rewrite

The TUI reuses all existing step runners, API client, payloads, and vertical configs. The only new abstraction is how output is captured and rendered.

### Event Emitter Layer

A `RunEmitter` class (extends `EventEmitter`) provides the bridge between step execution and UI rendering.

Event types:

```typescript
type RunEvent =
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
```

### Integration with existing code

- **Step runners** accept an optional `emitter` parameter. When present, they emit events instead of (or in addition to) calling `console.log`.
- **Web flow** adds `page.on('request')` and `page.on('response')` listeners that emit `network-request` and `network-response` events. Existing `log()` calls are adapted to emit typed events.
- **CLI path** uses a thin adapter that subscribes to the emitter and writes to stdout, preserving current behavior exactly.
- **TUI path** subscribes to the emitter and updates React state, which Ink renders to the terminal.

### New Files

| File | Purpose |
|------|---------|
| `src/tui/app.tsx` | Root Ink component; manages wizard → execution screen transition |
| `src/tui/wizard.tsx` | Wizard panel components (platform, vertical, step, tier, options, confirm) |
| `src/tui/execution.tsx` | Execution layout (step list panel, log panel, status bar) |
| `src/tui/log-panel.tsx` | Scrollable, filterable log renderer |
| `src/tui/emitter.ts` | `RunEmitter` class and event type definitions |
| `src/tui/theme.ts` | Color constants and style definitions |

### Dependency on existing modules

The TUI imports from:
- `src/types.ts` — steps, verticals, types
- `src/steps/registry.ts` — step pipeline
- `src/steps/web-flow.ts` — web enrollment runner
- `src/api/client.ts` — API client
- `src/api/auth.ts` — token acquisition
- `src/verticals.ts` — vertical config
- `src/payloads/*.ts` — request payloads

The `StepDefinition` runner signature in `registry.ts` gains an optional `emitter` parameter. The `ApiClient` class gains an optional `emitter` that it uses to emit `network-request` and `network-response` events around every HTTP call, providing network-level visibility for mobile flows. Payload modules, vertical configs, and type exports are unchanged. All additions are optional parameters with no breaking changes to existing callers.

## Error Handling

### Step Failures

- **Run-all mode:** Execution pauses automatically on failure. The TUI drops into step-through mode at the failed step. The log panel shows the error in red.
- **Step-through mode:** The user stays on the failed step with options: `r` to retry, `s` to skip (where safe — e.g., skipping a noop step), `q` to quit.
- On quit after a failure, any credentials created so far are displayed.

### Terminal Resize

Ink handles resize natively via flexbox. The log panel is the flex-grow region. Minimum terminal width is 80 columns; if the terminal is too narrow, a message asks the user to widen it.

### Browser Visibility (Web Flow)

- **Step-through mode:** Browser is visible. The TUI displays a note: "Browser window open — switch to it to observe the page."
- **Run-all mode:** Browser runs headless by default. Togglable from the options wizard step.

### Batch Mode

When count > 1 or multiple verticals are selected:
- A progress summary appears at the top of the execution view: `Creating 3/10 providers...`
- The log panel shows the current provider being created
- Completed providers accumulate in a results table, accessible via `t` key
- Failed providers follow the existing retry logic (3 attempts), with the TUI showing retry status in the log

## Testing

- **Wizard logic:** Unit tests for option validation, step filtering by platform, env var checking
- **Emitter:** Unit tests for event emission and adapter (emitter → console.log)
- **Components:** Ink provides `ink-testing-library` for rendering components in tests without a real terminal
- **Integration:** Existing test suite (`tests/index.test.ts`) continues to cover the CLI path; new tests cover the TUI entry point
