# QA Provider Factory

CLI tool to create providers at specific enrollment checkpoints via API.

## Prerequisites

- Node.js 20+
- Environment variables:
  - `CZEN_API_KEY` — Care.com API key
  - `STRIPE_KEY` — Stripe test key (for `upgraded` and later)
  - `MYSQL_DB_PASS_DEV` — MySQL read-only password (required for `fully-enrolled`; optional for UUID lookup on other steps)
- Playwright browsers: `npx playwright install chromium`

## Usage

```bash
# Install
npm install

# Create a provider at a specific enrollment step
npm run dev -- --step <step> [--tier basic|premium] [--vertical childcare] [--env dev]
```

### Steps

| Step | Description |
|------|-------------|
| `account-created` | Account exists, no profile |
| `at-availability` | Profile set up, availability screen (none set) |
| `profile-complete` | Full profile with availability and biography |
| `pre-upgrade` | Profile complete, Stripe linked, no subscription |
| `upgraded` | Subscription purchased (use `--tier`) |
| `at-disclosure` | Background check disclosure accepted |
| `fully-enrolled` | Everything complete, background check cleared |

### Examples

```bash
npm run dev -- --step account-created
npm run dev -- --step upgraded --tier basic
npm run dev -- --step fully-enrolled
```

## Adding a Vertical

See `docs/specs/2026-03-23-provider-factory-design.md` § Future Verticals.
