# LaunchDarkly Variation Selection

## Problem

The flag browser only toggles flags ON/OFF. When a flag is ON, the behavior depends on which **variation** is served (e.g., "holdout", "control", "test"). To truly test feature flags, users need to choose the fallthrough variation — the value served to all users when the flag is ON and no targeting rules match.

## Design

### Data model

Extend `LDFlag` to carry variation data:

```typescript
interface LDVariation {
  id: string;        // LD variation _id (used in semantic patch API calls)
  name?: string;     // human label, e.g. "control" — not always present
  value: unknown;    // the served value (string, number, JSON, boolean)
}

interface LDFlag {
  key: string;
  name: string;
  on: boolean;
  variations: LDVariation[];
  fallthroughVariationId: string | null;
  // _id of the variation served when flag is ON.
  // null when the fallthrough is a percentage rollout instead of a single variation.
}
```

The LD API already returns this data in the `searchFlags` response — `variations[]` at the flag level and `environments[env].fallthrough.variation` (an index into that array). We map the index to the variation `_id`.

**Display name fallback:** When a variation has no `name`, display `JSON.stringify(value)` (truncated to 40 chars). If that's also unhelpful, fall back to `"Variation {index}"`.

### API layer — `src/api/launchdarkly.ts`

**`searchFlags`** — updated to parse and return `variations` and `fallthroughVariationId` on each `LDFlag`. The `mapItemToFlag` helper gains access to the full variation array and the fallthrough object from the environment data. When `fallthrough.rollout` is present instead of `fallthrough.variation`, set `fallthroughVariationId` to `null`.

**`setFallthroughVariation(flagKey, ldEnv: Env, variationId: string)`** — new method. Includes the same `LD_ENV_MAP` environment guard as `toggleFlag`. Sends a PATCH with semantic patch content type:

```json
{
  "environmentKey": "<envKey>",
  "instructions": [
    { "kind": "updateFallthroughVariationOrRollout", "variationId": "<variationId>" }
  ]
}
```

Returns the updated `LDFlag`.

**`toggleFlag`** — updated return type to include the new `LDFlag` fields (variations, fallthroughVariationId) since the PATCH response already contains them.

### Session tracking — `src/tui/flag-session.ts`

`ToggleRecord` expanded:

```typescript
interface ToggleRecord {
  originalOn: boolean;
  originalFallthroughId: string | null;
  env: Env;
}
```

**`recordToggle`** renamed to **`recordSnapshot`**. New signature:

```typescript
function recordSnapshot(
  flagKey: string,
  originalOn: boolean,
  originalFallthroughId: string | null,
  env: Env
): void
```

Called on first interaction with any flag (toggle or variation change). Captures the flag's `on` state and `fallthroughVariationId` at that moment. Subsequent interactions with the same flag are no-ops — we only need the original state.

**`revertSessionToggles`** updated to unconditionally restore both ON/OFF state and fallthrough variation for each snapshotted flag — no diffing against current state. Per-flag revert is sequential (await `setFallthroughVariation` first if `originalFallthroughId` is non-null, then await `toggleFlag`). All flags revert in parallel via `Promise.allSettled` wrapping per-flag async sequences. This ordering avoids a window where the flag is ON with a wrong variation.

**`getSessionToggleEntries`** updated to include `originalFallthroughId` so the confirm screen can display what changed.

### Flag browser UX — `src/tui/flag-browser.tsx`

Two views, managed by `view` state: `'list' | 'detail'`.

#### List view (updated from current behavior)

**Breaking change:** Enter no longer quick-toggles a flag. Enter now opens the detail view. This is intentional — the detail view provides both toggle and variation selection in one place.

Each flag row now shows the active variation name in brackets:

```
▸ ● growth-enrollment-overhaul-cc-m1   ON  [holdout]
  ○ checkout-page-checkbox-test        OFF [Control]
```

Keybindings:
- **↑/↓** — navigate flag list
- **Enter** — open detail view for selected flag
- **Type** — search query
- **Esc** — close flag browser

#### Detail view (new)

Replaces the flag list with a focused view of one flag.

```
██ Feature Flags                                          dev

  growth-enrollment-seeker-overhaul-cc-m1                  ON

  Fallthrough variation (served when flag is ON):
    holdout                          "holdout"  ← current
    control                          "control"
  ▸ test                             "test"
    holdout-2                        "holdout2"

  ↑↓ select · enter: set variation · t: toggle on/off · esc: back
```

- Variation list shows `name` (or fallback) and `value` (formatted with `JSON.stringify`, truncated to 30 chars for non-scalar types).
- Current fallthrough is marked `← current`.
- Selected variation highlighted with `▸`.
- When `fallthroughVariationId` is `null` (rollout-based), show `Rollout (not editable)` instead of the variation list. Variation selection is disabled; only `t` toggle works.
- **↑/↓** — navigate variations
- **Enter** — set selected variation as fallthrough via `setFallthroughVariation`, snapshot original state if first change, show brief "Updated" confirmation. Errors display inline (same pattern as list view error handling — error state banner, busy lock released on failure).
- **t** — toggle flag ON/OFF, snapshot original state if first change. Same error handling.
- **Esc** — return to list view, refresh flags

### Confirm screen — `src/tui/wizard.tsx`

The confirm screen already shows toggled flags. Updated to also show variation changes:

```
Flags changed this session (will revert on exit):
  ● ON  ← OFF   growth-enrollment-overhaul-cc-m1
                 variation: holdout → test
  ● OFF ← ON    checkout-page-checkbox-test
```

### Revert on exit

Revert fires in `handleQuit` (in `app.tsx`) and `useInput` quit handler (in `wizard.tsx`) — both already call `revertSessionToggles()`. The updated function unconditionally restores the snapshotted original state for each flag:

1. For each snapshotted flag (all flags in parallel via `Promise.allSettled`):
   a. If `originalFallthroughId` is non-null, await `setFallthroughVariation` to restore it.
   b. Await `toggleFlag` to restore the original ON/OFF state.
2. Best-effort — individual failures are swallowed so remaining flags still revert.
3. Clear the session map.

## Files changed

| File | Change |
|------|--------|
| `src/api/launchdarkly.ts` | Extend `LDFlag`, update `mapItemToFlag`, add `setFallthroughVariation` |
| `src/tui/flag-browser.tsx` | Add detail view, update list view to show variation name |
| `src/tui/flag-session.ts` | Expand `ToggleRecord`, rename to `recordSnapshot`, revert variations |
| `src/tui/wizard.tsx` | Update confirm screen to show variation changes |
| `tests/launchdarkly.test.ts` | Test `setFallthroughVariation`, updated `searchFlags` shape |
| `tests/tui/flag-browser.test.tsx` | Test detail view rendering |

## Out of scope

- Per-user targeting (individual variation overrides). The user explicitly chose session-wide toggling.
- Percentage rollouts. We display them as non-editable. We only set a single fallthrough variation, not weighted distributions.
- Editing targeting rules. We only modify the fallthrough and the ON/OFF kill switch.
