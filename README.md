# Jumper

A CLI + TUI tool for the PEXP team that navigates provider enrollment to specific checkpoints. Instead of manually clicking through 15+ screens to reach a particular point in the flow, run one command and get there in seconds.

Supports **five verticals**: Child Care, Senior Care, Pet Care, Housekeeping, and Tutoring.

- **Web**: Opens a real Chromium browser and drives through enrollment pages, stopping at the target page. The browser auto-closes after logging credentials; pass `--no-auto-close` to keep it open for manual testing.
- **Mobile**: Uses API calls to create an account at a specific enrollment state.

## Setup

```bash
git clone git@github.com:joshdcare/jumper.git
cd jumper
./setup.sh
```

The setup script handles everything: checks your Node.js version, installs npm dependencies, installs Playwright Chromium, walks you through configuring `.env`, and builds the project.

To set up manually instead, see the steps below.

<details>
<summary>Manual setup</summary>

### 1. Install dependencies

```bash
npm install
```

### 2. Install Playwright (used for web enrollment + Auth0 token acquisition)

```bash
npx playwright install chromium
```

### 3. Configure environment variables

Create a `.env` file in the project root (or copy from `.env.example`):

```
CZEN_API_KEY=<your Care.com API key>
STRIPE_KEY=<Stripe test key>
MYSQL_DB_PASS_DEV=<MySQL read-only password>
```

### 4. Build and link

```bash
npm run build
npm link
```

After linking, the `jumper` command is available globally in your terminal.

</details>

### Environment variables

| Variable | Required for | How to get it |
|----------|-------------|---------------|
| `CZEN_API_KEY` | Mobile steps, web steps past account creation | Ask a team lead or check the QA vault |
| `STRIPE_KEY` | Mobile `upgraded` and later | Stripe dashboard > Developers > API keys (test mode) |
| `MYSQL_DB_PASS_DEV` | Mobile `fully-enrolled`; optional for UUID lookup on other steps | Ask a team lead or check the QA vault |

### Network access

You must be connected to the **VPN** for SPI endpoints and the dev database to be reachable.

---

## Interactive Mode (TUI)

The easiest way to use Jumper. A guided wizard walks you through configuration, then runs or steps through each enrollment stage with full visibility into what's happening.

```bash
jumper start
```

### Wizard

The wizard walks through six screens:

1. **Platform** — Web or Mobile
2. **Vertical** — Child Care, Senior Care, Pet Care, Housekeeping, or Tutoring
3. **Step** — The enrollment checkpoint to stop at (platform-specific list with descriptions)
4. **Tier** — Basic or Premium
5. **Options** — Count (how many providers to create) and execution mode (Run All or Step Through)
6. **Confirm** — Review your selections and launch

Environment variable warnings are shown if your `.env` is missing keys required for the selected flow.

### Execution screen

Once the wizard completes, the execution screen takes over:

```
┌──────────────────────────────────────────────────────────────┐
│ ██ JUMPER                                  web · childcare   │
├────────────┬─────────────────────────────────────────────────┤
│ STEPS      │ at-location                                     │
│ ✓ get-str  │ Enter your ZIP code                             │
│ ✓ soft-int │                                                 │
│ ▸ location │ ▸ Logs: at-location (12) — press l to expand    │
│ ○ prefs    │                                                 │
│            │                                                 │
│ CONTEXT    │                                                 │
│ email: ... │                                                 │
├────────────┴─────────────────────────────────────────────────┤
│ ● dev     tab: browse steps · l: show logs · q: quit        │
└──────────────────────────────────────────────────────────────┘
```

**Left panel** — Step list with status icons (`○` pending, `▸` running, `✓` complete, `✗` error) and per-step log counts. Below the steps, a context section shows extracted values (email, memberId, UUID) as they become available.

**Right panel** — Current step header with description, recent activity lines, and a collapsible log drawer.

**Bottom bar** — Environment indicator, keybindings, step counter, and elapsed time.

### Keyboard shortcuts

| Key | During execution | After completion |
|-----|-----------------|------------------|
| `l` | Toggle log drawer open/closed | Toggle log drawer |
| `d` | Toggle detail mode (verbose log entries) | Toggle detail mode |
| `tab` / `shift+tab` | Browse logs by step | Browse logs by step |
| `a` | Show all logs (across all steps) | Show all logs |
| `enter` | Continue (step-through mode) | Confirm menu selection |
| `↑` / `↓` | — | Navigate completion menu |
| `q` | Quit | Quit |
| `esc` | Close log drawer / pause (run-all) | Close log drawer |
| `r` | Retry (after error) | — |

### Log drawer

Press `l` to expand the log drawer. Logs are grouped by step — use `tab`/`shift+tab` to switch between steps, or `a` to see all logs combined. Each step shows its log count in the step list.

Logs include:
- **Network requests/responses** — method, URL, status, duration
- **Browser actions** (web) — fields filled, buttons clicked, checkboxes toggled, page navigations
- **API details** (mobile) — request/response payloads
- **Step lifecycle** — start, complete, error events with context

### Execution modes

- **Run All** — Executes every step automatically from start to finish. Press `esc` to pause.
- **Step Through** — Pauses after each step completes. Press `enter` to advance to the next step.

### After completion

When the run finishes, a completion screen shows:
- Step results summary
- Provider details (email, password, memberId, UUID, vertical)
- A **What next?** menu:
  - **Create another (same settings)** — re-run with the same wizard configuration
  - **New configuration** — go back to the wizard
  - **Quit** — exit

Logs remain accessible on the completion screen via `l`, `tab`, and `a`.

---

## CLI Mode

For scripting or when you already know exactly what you want:

```bash
jumper --step <step> [--platform web|mobile] [--tier basic|premium] [--vertical childcare] [--env dev] [--no-auto-close]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--step` | *(required)* | Enrollment checkpoint to stop at |
| `--platform` | `web` | Target platform — `web` or `mobile` (Android) |
| `--tier` | `premium` | Subscription tier — `basic` or `premium` |
| `--vertical` | `childcare` | Service vertical — `childcare`, `seniorcare`, `petcare`, `housekeeping`, `tutoring` |
| `--env` | `dev` | Target environment |
| `--no-auto-close` | *(off)* | Keep the browser open after logging credentials (web only) |

### Examples

```bash
# Web — stop at the location page (Child Care, the default)
jumper --step at-location --platform web

# Web — Senior Care provider at account creation
jumper --step at-account-creation --platform web --vertical seniorcare

# Web — Pet Care provider through premium checkout
jumper --step at-premium-payment --platform web --vertical petcare

# Mobile — Housekeeping provider stopped at the availability screen
jumper --step at-availability --platform mobile --vertical housekeeping

# Mobile — fully enrolled Basic user
jumper --step fully-enrolled --platform mobile --tier basic

# Mobile — fully enrolled Tutoring Premium user
jumper --step fully-enrolled --platform mobile --tier premium --vertical tutoring
```

---

## Enrollment Steps

### Web (`--platform web`)

Web drives a real Chromium browser through the enrollment flow. The browser auto-closes after logging credentials. Use `--no-auto-close` to keep it open for manual testing.

| Step | Page URL |
|------|----------|
| `at-get-started` | `/app/vhp/get-started` |
| `at-soft-intro-combined` | `/app/vhp/provider/soft-intro-combined` |
| `at-vertical-selection` | `/app/vhp/vertical-triage` |
| `at-location` | `/app/enrollment/provider/mv/location` |
| `at-preferences` | `/app/enrollment/provider/mv/preferences` |
| `at-family-count` | `/app/enrollment/provider/mv/family-count` |
| `at-account-creation` | `/app/enrollment/provider/mv/account/combined` |
| `at-family-connection` | `/app/enrollment/provider/mv/family-connection` |
| `at-safety-screening` | `/app/enrollment/provider/mv/safety-screening` |
| `at-subscriptions` | `/app/ratecard/provider/rate-card` |
| `at-basic-payment` | `/app/checkout` (Basic tier) |
| `at-premium-payment` | `/app/checkout` (Premium tier) |
| `at-app-download` | `/app/enrollment/provider/mv/app-download` |

Steps before `at-account-creation` navigate the browser without creating an account — the browser stops and you fill in the form yourself. Steps at `at-account-creation` and beyond fill in forms automatically using the test data below.

#### What the web flow fills in automatically

| Step | Fields entered |
|------|---------------|
| `at-vertical-selection` | Selects the vertical specified by `--vertical` |
| `at-location` | ZIP code `72204` |
| `at-account-creation` | First name, last name, email, password, gender, age checkbox |
| `at-basic-payment` / `at-premium-payment` | Name on card, credit card number, expiration, CVV, billing ZIP (via Stripe Elements) |

### Mobile (`--platform mobile`)

Mobile uses API calls to build account state at each checkpoint. Steps are cumulative — `--step upgraded` creates an account, completes the profile, and purchases a subscription.

| Step | What it does | Where the user lands |
|------|-------------|---------------------|
| `account-created` | Creates account via REST SPI | "Where are you looking for jobs?" screen |
| `at-build-profile` | Account created, no profile work done | "Build Your Profile" screen |
| `at-availability` | Completes profile build steps (verticals + attributes) | "Your availability" screen |
| `profile-complete` | Sets availability (Full-time, Mon-Fri) + bio + photo | Past profile |
| `upgraded` | Vantiv payment + Basic/Premium subscription | Past upgrade |
| `at-disclosure` | Reaches disclosure screen | Disclosure screen |
| `fully-enrolled` | Disclosure, SSN trace, eligibility, BGC, Sterling callback | Fully enrolled |

## Test Data

Every account uses:

| Field | Value |
|-------|-------|
| Password | `letmein1` |
| Name | Martina Goodram |
| Address | 28965 Homewood Plaza, Little Rock, AR 72204 |
| Date of birth | 07/26/1995 |
| SSN | 490-95-9347 |
| Phone | 200-100-4000 |
| Credit card | `4111 1111 1111 1111`, Exp `09/32`, CVV `123`, Billing ZIP `72204` |

The name, address, DOB, SSN, and phone are configured to pass IDV and SSN trace checks in the dev environment.

## Known Limitations

### Web selectors

The web flow uses Playwright selectors (role, label, text) to interact with enrollment pages. If a page's UI changes, selectors in `src/steps/web-flow.ts` may need updating. When the automation fails, the browser stays open so you can continue manually or debug.

### Stripe checkout (web)

The checkout page uses Stripe Elements, which render card number, expiration, and CVC fields inside separate iframes. The factory handles this by clicking the card number iframe and using keyboard input (`page.keyboard.type`) with Tab between fields. If Stripe changes its iframe structure or titles, update `fillCheckoutForm()` in `web-flow.ts`.

### Availability calendar on mobile

The mobile app's "Your Services & Availability" detail view (the day/time grid) reads from a legacy database table that is only populated when a user saves availability through the app UI. The factory sets the Full-time preference and acknowledges availability via the API, but the detailed Mon-Fri 9am-5pm grid requires one manual action after first login:

1. Open "Your Services & Availability"
2. Tap **Edit**
3. Tap **Save**

This is a one-time step per user.

### iOS

Mobile enrollment targets **Android only**. The iOS enrollment flow has inconsistencies that cause users to land on unexpected screens. Avoid iOS for factory-created users until this is resolved.

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| `Error: browserType.launch` | Playwright browsers not installed | Run `npx playwright install chromium` |
| Web flow stops with selector error | Page UI changed or selector is wrong | Browser stays open — continue manually or update selectors in `web-flow.ts` |
| Checkout fields not filling | Stripe iframe titles changed | Update iframe selectors in `fillCheckoutForm()` in `web-flow.ts` |
| Purchase button stays disabled | Stripe validation failed (card/exp/CVC not entered correctly) | Check browser — Stripe fields may show red error borders indicating which field failed |
| `CZEN_API_KEY environment variable is required` | Missing `.env` file or empty value | Create `.env` with all three variables |
| `INVALID_CREDENTIALS` or `403 Forbidden` on login | VPN not connected, or API key is wrong | Connect to VPN; verify `CZEN_API_KEY` |
| BGC step fails at Sterling callback | `MYSQL_DB_PASS_DEV` not set or DB unreachable | Set the env var; verify VPN connection |

## Project Structure

```
jumper/
├── .env                          # Environment variables (not committed)
├── .env.example                  # Template for .env
├── setup.sh                      # First-time setup script
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                  # CLI entry point + `start` subcommand
│   ├── types.ts                  # Types, step lists, env config
│   ├── verticals.ts              # Vertical registry (service IDs, web selectors)
│   ├── api/
│   │   ├── auth.ts               # Auth0 PKCE token flow (Playwright headless)
│   │   ├── client.ts             # HTTP client — GraphQL, REST JSON, SPI, multipart
│   │   └── graphql.ts            # All GraphQL queries and mutations
│   ├── payloads/
│   │   ├── childcare.ts          # Child Care payloads
│   │   ├── seniorcare.ts         # Senior Care payloads
│   │   ├── petcare.ts            # Pet Care payloads
│   │   ├── housekeeping.ts       # Housekeeping payloads
│   │   └── tutoring.ts           # Tutoring payloads
│   ├── steps/
│   │   ├── web-flow.ts           # Playwright browser enrollment (web)
│   │   ├── registry.ts           # Step pipeline (mobile)
│   │   ├── account.ts            # Account creation
│   │   ├── profile.ts            # Profile, availability, bio
│   │   ├── mobile.ts             # Mobile-specific enrollment runners
│   │   ├── upgrade.ts            # Payment setup + subscription (Stripe / Vantiv)
│   │   ├── disclosure.ts         # BGC disclosure acceptance
│   │   ├── enrollment.ts         # SSN trace, eligibility, BGC, Sterling callback
│   │   └── photo.ts              # Programmatic profile photo generation + upload
│   └── tui/
│       ├── app.tsx               # Root TUI component + state machine
│       ├── wizard.tsx            # Configuration wizard (6-stage)
│       ├── execution.tsx         # Execution screen with step list + log drawer
│       ├── log-panel.tsx         # Scrollable, filterable log renderer
│       ├── emitter.ts            # RunEmitter event system
│       ├── results-table.tsx     # Batch results table
│       ├── step-descriptions.ts  # Human-readable step descriptions
│       └── theme.ts              # TUI color constants
├── tests/
│   ├── index.test.ts
│   ├── client.test.ts
│   ├── registry.test.ts
│   └── verticals.test.ts
└── docs/
    ├── specs/                    # Design spec
    └── plans/                    # Implementation plan
```

## Extending the Tool

### Adding a new web enrollment step

1. Add the step name to `WEB_STEPS` in `src/types.ts`
2. Add a new navigation block in `runWebEnrollmentFlow()` in `src/steps/web-flow.ts`
3. Add a description in `src/tui/step-descriptions.ts`

### Adding a new mobile step

1. Add the step name to `MOBILE_STEPS` in `src/types.ts`
2. Write a runner function in the appropriate file under `src/steps/`
3. Insert it in the correct position in the pipeline array in `src/steps/registry.ts`
4. Add a description in `src/tui/step-descriptions.ts`

### Adding a new vertical

1. Add the vertical name to `ALL_VERTICALS` in `src/types.ts`
2. Add an entry in `VERTICAL_REGISTRY` in `src/verticals.ts` with the service ID and web tile pattern
3. Create a payload file at `src/payloads/<vertical>.ts` (copy an existing one and update the service-specific fields)
4. Add the dynamic import case in `loadPayloads()` in `src/index.ts`

### Running tests

```bash
npm test             # single run
npm run test:watch   # watch mode
```
