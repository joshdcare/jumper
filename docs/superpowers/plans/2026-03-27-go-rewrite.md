# Jumper Go Rewrite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite jumper in Go to improve API call speed (goroutine concurrency), reliability (typed errors, context deadlines, structured retries), and distribution (single binary).

**Architecture:** Four layers — TUI (Bubble Tea), Orchestrator (step pipeline with event channels), API Client (HTTP with retries/timeouts/health checks), Web Driver (playwright-go). Mobile pipeline parallelizes independent calls within steps. All state flows through a `ProviderContext` struct passed between steps.

**Tech Stack:** Go 1.22+, Bubble Tea + Lipgloss (TUI), playwright-go (web flow), go-sql-driver/mysql (DB), godotenv (env loading)

**Spec:** `docs/superpowers/specs/2026-03-27-go-rewrite-design.md`

**Existing TypeScript source (reference):** `src/` in the jumper project root — port logic, not syntax.

---

## File Structure

```
jumper-go/
├── main.go                          # CLI entry point (flag parsing, dispatch to TUI or direct run)
├── go.mod
├── go.sum
├── .env                             # Env vars (CZEN_API_KEY, MYSQL_DB_PASS_DEV)
├── internal/
│   ├── config/
│   │   └── config.go                # EnvConfig, load from .env + env vars
│   ├── types/
│   │   └── types.go                 # ProviderContext, Step, Platform, Vertical, StepResult, errors
│   ├── api/
│   │   ├── client.go                # HTTP client: GraphQL, REST SPI, REST, multipart, retries, health check
│   │   ├── client_test.go           # Client retry + error handling tests
│   │   ├── graphql.go               # All GQL query/mutation string constants
│   │   └── auth.go                  # Auth0 PKCE flow via playwright-go
│   ├── payloads/
│   │   ├── payloads.go              # Payload structs + interface
│   │   ├── childcare.go             # Child Care defaults
│   │   ├── seniorcare.go            # Senior Care defaults
│   │   ├── petcare.go               # Pet Care defaults
│   │   ├── housekeeping.go          # Housekeeping defaults
│   │   └── tutoring.go              # Tutoring defaults
│   ├── steps/
│   │   ├── pipeline.go              # Orchestrator: runs steps, manages context, emits events
│   │   ├── pipeline_test.go         # Pipeline sequencing + concurrency tests
│   │   ├── account.go               # account-created step (lite + upgrade SPI calls)
│   │   ├── profile.go               # at-build-profile, at-availability, profile-complete steps
│   │   ├── upgrade.go               # Stripe token, payment setup, subscription upgrade
│   │   ├── disclosure.go            # at-disclosure step
│   │   ├── enrollment.go            # SSN trace, BGC, Sterling callback, fully-enrolled
│   │   ├── photo.go                 # Programmatic photo generation + upload
│   │   ├── vantiv.go                # Vantiv eProtect PPRID helper
│   │   └── verticals.go             # VerticalConfig registry
│   ├── web/
│   │   ├── flow.go                  # Web enrollment flow (Playwright page navigation)
│   │   ├── checkout.go              # Stripe Elements iframe handling
│   │   └── auth.go                  # Auth0 PKCE token flow (web platform)
│   └── tui/
│       ├── theme.go                 # Lipgloss styles and color constants
│       ├── events.go                # RunEvent types + event channel
│       ├── wizard.go                # 6-stage wizard model
│       ├── wizard_test.go           # Wizard state machine tests
│       ├── execution.go             # Execution screen (step list + log drawer)
│       ├── logpanel.go              # Scrollable, filterable log renderer
│       └── app.go                   # Root Bubble Tea program (wizard → execution → completion)
└── README.md
```

---

## Phase 1: Foundation

### Task 1: Project Scaffolding

**Files:**
- Create: `jumper-go/go.mod`
- Create: `jumper-go/main.go`
- Create: `jumper-go/.env`

- [ ] **Step 1: Create project directory and go.mod**

```bash
mkdir -p /Users/josh.davis/projects/jumper-go
cd /Users/josh.davis/projects/jumper-go
go mod init jumper-go
```

- [ ] **Step 2: Add core dependencies**

```bash
go get github.com/charmbracelet/bubbletea@latest
go get github.com/charmbracelet/lipgloss@latest
go get github.com/charmbracelet/bubbles@latest
go get github.com/joho/godotenv@latest
go get github.com/go-sql-driver/mysql@latest
go get github.com/playwright-community/playwright-go@latest
```

- [ ] **Step 3: Create minimal main.go**

```go
// main.go
package main

import "fmt"

func main() {
	fmt.Println("jumper-go")
}
```

- [ ] **Step 4: Create .env**

```
CZEN_API_KEY=JJ3yuX9LysNKEze67FchqbvHOlEsYVWjEyS15IXPvuMx
MYSQL_DB_PASS_DEV=DeV6Oosu
```

- [ ] **Step 5: Verify it builds and runs**

```bash
go build -o jumper && ./jumper
```

Expected: prints `jumper-go`

- [ ] **Step 6: Initialize git repo and commit**

```bash
git init && git add . && git commit -m "feat: project scaffolding with dependencies"
```

---

### Task 2: Types and Config

**Files:**
- Create: `jumper-go/internal/types/types.go`
- Create: `jumper-go/internal/config/config.go`

- [ ] **Step 1: Create types.go**

Port from `src/types.ts`. Contains all shared types.

```go
// internal/types/types.go
package types

import (
	"fmt"
	"time"
)

type Platform string

const (
	PlatformWeb    Platform = "web"
	PlatformMobile Platform = "mobile"
)

type Vertical string

const (
	VerticalChildcare    Vertical = "childcare"
	VerticalSeniorcare   Vertical = "seniorcare"
	VerticalPetcare      Vertical = "petcare"
	VerticalHousekeeping Vertical = "housekeeping"
	VerticalTutoring     Vertical = "tutoring"
)

var AllVerticals = []Vertical{
	VerticalChildcare, VerticalSeniorcare, VerticalPetcare,
	VerticalHousekeeping, VerticalTutoring,
}

type Step string

const (
	// Web steps
	StepAtGetStarted       Step = "at-get-started"
	StepAtSoftIntro        Step = "at-soft-intro-combined"
	StepAtVerticalSelection Step = "at-vertical-selection"
	StepAtLocation         Step = "at-location"
	StepAtPreferences      Step = "at-preferences"
	StepAtFamilyCount      Step = "at-family-count"
	StepAtAccountCreation  Step = "at-account-creation"
	StepAtFamilyConnection Step = "at-family-connection"
	StepAtSafetyScreening  Step = "at-safety-screening"
	StepAtSubscriptions    Step = "at-subscriptions"
	StepAtBasicPayment     Step = "at-basic-payment"
	StepAtPremiumPayment   Step = "at-premium-payment"
	StepAtAppDownload      Step = "at-app-download"
	// Mobile steps
	StepAccountCreated Step = "account-created"
	StepAtBuildProfile Step = "at-build-profile"
	StepAtAvailability Step = "at-availability"
	StepProfileComplete Step = "profile-complete"
	StepUpgraded       Step = "upgraded"
	StepAtDisclosure   Step = "at-disclosure"
	StepFullyEnrolled  Step = "fully-enrolled"
)

var WebSteps = []Step{
	StepAtGetStarted, StepAtSoftIntro, StepAtVerticalSelection,
	StepAtLocation, StepAtPreferences, StepAtFamilyCount,
	StepAtAccountCreation, StepAtFamilyConnection, StepAtSafetyScreening,
	StepAtSubscriptions, StepAtBasicPayment, StepAtPremiumPayment,
	StepAtAppDownload,
}

var MobileSteps = []Step{
	StepAccountCreated, StepAtBuildProfile, StepAtAvailability,
	StepProfileComplete, StepUpgraded, StepAtDisclosure, StepFullyEnrolled,
}

type Tier string

const (
	TierBasic   Tier = "basic"
	TierPremium Tier = "premium"
)

type ProviderContext struct {
	Email               string
	Password            string
	MemberID            string
	AuthToken           string
	UUID                string
	Tier                Tier
	EligibilityResponse map[string]any
}

type StepResult struct {
	Step     Step
	Duration time.Duration
	Err      error
	Context  map[string]string
}

// Typed errors for retry/abort decisions
type ErrTimeout struct{ Msg string }
func (e *ErrTimeout) Error() string { return fmt.Sprintf("timeout: %s", e.Msg) }

type ErrAuth struct{ Msg string }
func (e *ErrAuth) Error() string { return fmt.Sprintf("auth: %s", e.Msg) }

type ErrUpstream struct{ StatusCode int; Msg string }
func (e *ErrUpstream) Error() string { return fmt.Sprintf("upstream %d: %s", e.StatusCode, e.Msg) }

type ErrValidation struct{ Msg string }
func (e *ErrValidation) Error() string { return fmt.Sprintf("validation: %s", e.Msg) }
```

- [ ] **Step 2: Create config.go**

Port from `src/types.ts` `ENV_CONFIGS`. Loads `.env` via godotenv.

```go
// internal/config/config.go
package config

import (
	"os"

	"github.com/joho/godotenv"
)

type DBConfig struct {
	Host     string
	User     string
	Password string
	Database string
}

type EnvConfig struct {
	BaseURL              string
	APIKey               string
	SterlingCallbackURL  string
	DB                   DBConfig
}

func Load() *EnvConfig {
	_ = godotenv.Load()

	return &EnvConfig{
		BaseURL: "https://www.dev.carezen.net",
		APIKey:  os.Getenv("CZEN_API_KEY"),
		SterlingCallbackURL: "https://safety-background-check.useast1.dev.omni.carezen.net",
		DB: DBConfig{
			Host:     "dev-czendb-ro.use.dom.carezen.net",
			User:     "readOnly",
			Password: os.Getenv("MYSQL_DB_PASS_DEV"),
			Database: "caredb",
		},
	}
}
```

- [ ] **Step 3: Verify it compiles**

```bash
go build ./...
```

- [ ] **Step 4: Commit**

```bash
git add . && git commit -m "feat: add types and config packages"
```

---

### Task 3: API Client

**Files:**
- Create: `jumper-go/internal/api/client.go`
- Create: `jumper-go/internal/api/client_test.go`

Port from `src/api/client.ts`. The Go version adds context deadlines and typed errors.

- [ ] **Step 1: Write client_test.go — retry logic**

```go
// internal/api/client_test.go
package api

import (
	"errors"
	"testing"
)

func TestRetryRequest_SucceedsOnFirstAttempt(t *testing.T) {
	calls := 0
	result, err := RetryRequest(3, "test", func() (string, error) {
		calls++
		return "ok", nil
	})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if result != "ok" {
		t.Fatalf("expected 'ok', got %q", result)
	}
	if calls != 1 {
		t.Fatalf("expected 1 call, got %d", calls)
	}
}

func TestRetryRequest_SucceedsAfterRetries(t *testing.T) {
	calls := 0
	result, err := RetryRequest(3, "test", func() (string, error) {
		calls++
		if calls < 3 {
			return "", errors.New("fail")
		}
		return "ok", nil
	})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if result != "ok" {
		t.Fatalf("expected 'ok', got %q", result)
	}
	if calls != 3 {
		t.Fatalf("expected 3 calls, got %d", calls)
	}
}

func TestRetryRequest_ExhaustsRetries(t *testing.T) {
	calls := 0
	_, err := RetryRequest(3, "test", func() (string, error) {
		calls++
		return "", errors.New("always fails")
	})
	if err == nil {
		t.Fatal("expected error")
	}
	if calls != 3 {
		t.Fatalf("expected 3 calls, got %d", calls)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/josh.davis/projects/jumper-go && go test ./internal/api/... -v
```

Expected: FAIL — `RetryRequest` not defined

- [ ] **Step 3: Implement client.go**

```go
// internal/api/client.go
package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"net/url"
	"strings"
	"time"

	"jumper-go/internal/config"
	"jumper-go/internal/tui"
	"jumper-go/internal/types"
)

const defaultTimeout = 15 * time.Second

type Client struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
	accessToken string
	events     chan<- tui.RunEvent
}

func NewClient(cfg *config.EnvConfig, events chan<- tui.RunEvent) *Client {
	return &Client{
		baseURL:    cfg.BaseURL,
		apiKey:     cfg.APIKey,
		httpClient: &http.Client{Timeout: 30 * time.Second},
		events:     events,
	}
}

func (c *Client) SetAccessToken(token string) {
	c.accessToken = token
}

func (c *Client) emit(e tui.RunEvent) {
	if c.events != nil {
		c.events <- e
	}
}

func (c *Client) do(ctx context.Context, method, rawURL string, body io.Reader, headers map[string]string) ([]byte, int, error) {
	if ctx == nil {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(context.Background(), defaultTimeout)
		defer cancel()
	}

	req, err := http.NewRequestWithContext(ctx, method, rawURL, body)
	if err != nil {
		return nil, 0, fmt.Errorf("creating request: %w", err)
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	shortURL := strings.Replace(rawURL, c.baseURL, "", 1)
	c.emit(tui.RunEvent{Type: tui.EventNetworkRequest, Method: method, URL: shortURL})
	start := time.Now()

	resp, err := c.httpClient.Do(req)
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return nil, 0, &types.ErrTimeout{Msg: shortURL}
		}
		return nil, 0, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("reading response: %w", err)
	}

	duration := time.Since(start)
	c.emit(tui.RunEvent{
		Type: tui.EventNetworkResponse, Status: resp.StatusCode,
		URL: shortURL, Duration: duration,
		Body: truncate(string(data), 500),
	})

	return data, resp.StatusCode, nil
}

// GraphQL sends a GraphQL request using the access token.
func (c *Client) GraphQL(query string, variables map[string]any) (map[string]any, error) {
	payload := map[string]any{"query": query, "variables": variables}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	headers := map[string]string{
		"Content-Type": "application/json",
		"Pragma":       "crcm-x-authorized",
	}
	if c.accessToken != "" {
		headers["Authorization"] = c.accessToken
	}

	data, status, err := c.do(nil, "POST", c.baseURL+"/api/graphql", bytes.NewReader(body), headers)
	if err != nil {
		return nil, err
	}

	var result map[string]any
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, fmt.Errorf("parsing graphql response: %w", err)
	}
	if errs, ok := result["errors"]; ok {
		return nil, &types.ErrUpstream{StatusCode: status, Msg: fmt.Sprintf("%v", errs)}
	}
	if d, ok := result["data"].(map[string]any); ok {
		return d, nil
	}
	return result, nil
}

// RestPostSPI sends a form-encoded or JSON POST to the SPI endpoint.
func (c *Client) RestPostSPI(path, authToken string, params map[string]string, contentType string) (map[string]any, error) {
	sep := "?"
	if strings.Contains(path, "?") {
		sep = "&"
	}
	fullURL := fmt.Sprintf("%s/platform/spi/%s%sX-Care.com-AuthToken=%s", c.baseURL, path, sep, url.QueryEscape(authToken))

	headers := c.spiHeaders(authToken)

	var body io.Reader
	if contentType == "json" {
		headers["Content-Type"] = "application/json"
		b, _ := json.Marshal(params)
		body = bytes.NewReader(b)
	} else {
		headers["Content-Type"] = "application/x-www-form-urlencoded"
		form := url.Values{}
		for k, v := range params {
			form.Set(k, v)
		}
		body = strings.NewReader(form.Encode())
	}

	data, _, err := c.do(nil, "POST", fullURL, body, headers)
	if err != nil {
		return nil, err
	}
	return parseJSON(data)
}

// RestPostSPIJSON sends a JSON POST to the SPI endpoint with an arbitrary body.
func (c *Client) RestPostSPIJSON(path, authToken string, payload any) (map[string]any, error) {
	sep := "?"
	if strings.Contains(path, "?") {
		sep = "&"
	}
	fullURL := fmt.Sprintf("%s/platform/spi/%s%sX-Care.com-AuthToken=%s", c.baseURL, path, sep, url.QueryEscape(authToken))

	headers := c.spiHeaders(authToken)
	headers["Content-Type"] = "application/json"

	b, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	data, _, err := c.do(nil, "POST", fullURL, bytes.NewReader(b), headers)
	if err != nil {
		return nil, err
	}
	return parseJSON(data)
}

// RestGetSPI sends a GET to the SPI endpoint.
func (c *Client) RestGetSPI(path, authToken string) (map[string]any, error) {
	sep := "?"
	if strings.Contains(path, "?") {
		sep = "&"
	}
	fullURL := fmt.Sprintf("%s/platform/spi/%s%sX-Care.com-AuthToken=%s", c.baseURL, path, sep, url.QueryEscape(authToken))
	headers := c.spiHeaders(authToken)
	data, _, err := c.do(nil, "GET", fullURL, nil, headers)
	if err != nil {
		return nil, err
	}
	return parseJSON(data)
}

// RestPostMultipartSPI sends a multipart form POST to the SPI endpoint.
func (c *Client) RestPostMultipartSPI(path, authToken string, prepareForm func(w *multipart.Writer) error) (map[string]any, error) {
	sep := "?"
	if strings.Contains(path, "?") {
		sep = "&"
	}
	fullURL := fmt.Sprintf("%s/platform/spi/%s%sX-Care.com-AuthToken=%s", c.baseURL, path, sep, url.QueryEscape(authToken))

	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	if err := prepareForm(w); err != nil {
		return nil, err
	}
	w.Close()

	headers := c.spiHeaders(authToken)
	headers["Content-Type"] = w.FormDataContentType()

	data, _, err := c.do(nil, "POST", fullURL, &buf, headers)
	if err != nil {
		return nil, err
	}
	return parseJSON(data)
}

func (c *Client) spiHeaders(authToken string) map[string]string {
	return map[string]string{
		"Accept":               "application/json",
		"X-Care.com-APIKey":    c.apiKey,
		"X-Care.com-OS":        "Android",
		"X-Care.com-AppVersion": "19.2",
		"X-Care.com-AppBuildNr": "8000",
		"X-Care.com-AuthToken": authToken,
	}
}

// HealthCheck verifies VPN connectivity and API reachability.
func (c *Client) HealthCheck() error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", c.baseURL, nil)
	if err != nil {
		return fmt.Errorf("health check: %w", err)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("cannot reach %s — is VPN connected? %w", c.baseURL, err)
	}
	resp.Body.Close()
	return nil
}

// RetryRequest retries fn up to `attempts` times with exponential backoff.
func RetryRequest[T any](attempts int, opName string, fn func() (T, error)) (T, error) {
	var zero T
	var lastErr error
	for i := 0; i < attempts; i++ {
		result, err := fn()
		if err == nil {
			return result, nil
		}
		lastErr = err
		log.Printf("%s attempt %d/%d failed: %s", opName, i+1, attempts, err)
		if i < attempts-1 {
			time.Sleep(time.Duration(1<<uint(i)) * time.Second)
		}
	}
	return zero, lastErr
}

func parseJSON(data []byte) (map[string]any, error) {
	var result map[string]any
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, fmt.Errorf("parsing json: %s", truncate(string(data), 200))
	}
	return result, nil
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max]
}
```

Note: This references `tui.RunEvent` which will be created in Task 5. For now, create a minimal stub so it compiles.

- [ ] **Step 4: Create minimal tui/events.go stub**

```go
// internal/tui/events.go
package tui

import "time"

type EventType int

const (
	EventStepStart EventType = iota
	EventStepComplete
	EventStepError
	EventFieldFill
	EventButtonClick
	EventCheckbox
	EventNavigation
	EventNetworkRequest
	EventNetworkResponse
	EventAuth
	EventDBQuery
	EventInfo
	EventContextUpdate
	EventRunComplete
)

type RunEvent struct {
	Type     EventType
	Step     string
	Desc     string
	Method   string
	URL      string
	Status   int
	Duration time.Duration
	Body     string
	Field    string
	Value    string
	Label    string
	Checked  bool
	Message  string
	Key      string
	Error    string
}
```

- [ ] **Step 5: Run tests**

```bash
go test ./internal/api/... -v
```

Expected: 3 tests PASS

- [ ] **Step 6: Commit**

```bash
git add . && git commit -m "feat: add API client with retries, timeouts, and health check"
```

---

### Task 4: GraphQL Queries

**Files:**
- Create: `jumper-go/internal/api/graphql.go`

Port all query/mutation constants from `src/api/graphql.ts`. These are raw strings — straightforward copy.

- [ ] **Step 1: Create graphql.go with all queries**

Port each `export const` from `src/api/graphql.ts` to a Go `const`. Use backtick raw strings. Include all 13 queries/mutations:
- `PROVIDER_CREATE`
- `PROVIDER_NAME_UPDATE`
- `SAVE_MULTIPLE_VERTICAL`
- `CAREGIVER_ATTRIBUTES_UPDATE`
- `PROVIDER_JOB_INTEREST_UPDATE`
- `UNIVERSAL_PROVIDER_ATTRIBUTES_UPDATE`
- `SET_PROVIDER_UNIVERSAL_AVAILABILITY`
- `CAREGIVER_SERVICE_BIOGRAPHY_UPDATE`
- `GET_PAYMENT_METHODS_INFORMATION`
- `UPGRADE_PROVIDER_SUBSCRIPTION`
- `GET_MEMBER_IDS`
- `UPDATE_PROVIDER_AVAILABILITY_PREFERENCE`
- `ACKNOWLEDGE_AVAILABILITY`
- `NOTIFICATION_SETTING_CREATE`

- [ ] **Step 2: Verify compiles**

```bash
go build ./...
```

- [ ] **Step 3: Commit**

```bash
git add . && git commit -m "feat: add GraphQL query constants"
```

---

### Task 5: Payloads

**Files:**
- Create: `jumper-go/internal/payloads/payloads.go`
- Create: `jumper-go/internal/payloads/childcare.go`
- Create: `jumper-go/internal/payloads/seniorcare.go`
- Create: `jumper-go/internal/payloads/petcare.go`
- Create: `jumper-go/internal/payloads/housekeeping.go`
- Create: `jumper-go/internal/payloads/tutoring.go`

Port from `src/payloads/*.ts`. Each vertical's payloads become a struct implementing a common interface.

- [ ] **Step 1: Create payloads.go with the common interface**

```go
// internal/payloads/payloads.go
package payloads

type Payloads struct {
	ProviderCreateDefaults              map[string]any
	ProviderNameUpdateInput             map[string]any
	SaveMultipleVerticalsInput          map[string]any
	CaregiverAttributesUpdateInput      map[string]any
	ProviderJobInterestUpdateInput      map[string]any
	UniversalProviderAttributesInput    map[string]any
	ProviderUniversalAvailabilityInput  map[string]any
	ProviderBiographyInput              map[string]any
	CaregiverAttributesSecondInput      map[string]any
	NotificationSettingCreateInput      map[string]any
	PricingConfig                       map[string]PricingTier
	P2PStripeAccountInput               map[string]string
	LegalInfoInput                      map[string]string
	LegalAddressInput                   map[string]string
	SSNInput                            map[string]any
	MobilePreferencesInput              map[string]string
	MobileSkillsInput                   map[string]string
	MobileBioInput                      map[string]string
	AvailabilityNotes                   string
}

type PricingTier struct {
	PricingSchemeID string
	PricingPlanID   string
	PromoCode       string
}

func ForVertical(vertical string) *Payloads {
	switch vertical {
	case "childcare":
		return ChildCare()
	case "seniorcare":
		return SeniorCare()
	case "petcare":
		return PetCare()
	case "housekeeping":
		return Housekeeping()
	case "tutoring":
		return Tutoring()
	default:
		return ChildCare()
	}
}
```

- [ ] **Step 2: Create childcare.go**

Port all exports from `src/payloads/childcare.ts` into a `ChildCare()` function that returns `*Payloads`. Convert TypeScript objects to `map[string]any` or `map[string]string` Go maps. This is the reference implementation — other verticals follow the same pattern.

- [ ] **Step 3: Create remaining vertical payloads**

Port `seniorcare.ts`, `petcare.ts`, `housekeeping.ts`, `tutoring.ts` following the same pattern as childcare. Diff each against childcare to understand what's vertical-specific (serviceType, ageGroups, etc.) vs shared.

- [ ] **Step 4: Verify compiles**

```bash
go build ./...
```

- [ ] **Step 5: Commit**

```bash
git add . && git commit -m "feat: add vertical payloads for all 5 verticals"
```

---

### Task 6: Verticals Registry

**Files:**
- Create: `jumper-go/internal/steps/verticals.go`

Port from `src/verticals.ts`.

- [ ] **Step 1: Create verticals.go**

```go
// internal/steps/verticals.go
package steps

import "regexp"

type VerticalConfig struct {
	ServiceID      string
	SubServiceID   string
	WebTilePattern *regexp.Regexp
	WebTestIDToken string
}

var VerticalRegistry = map[string]VerticalConfig{
	"childcare":    {ServiceID: "CHILDCARE", SubServiceID: "babysitter", WebTilePattern: regexp.MustCompile(`(?i)child\s*care`), WebTestIDToken: "childcare"},
	"seniorcare":   {ServiceID: "SENIRCARE", SubServiceID: "babysitter", WebTilePattern: regexp.MustCompile(`(?i)senior\s*care`), WebTestIDToken: "seniorcare"},
	"petcare":      {ServiceID: "PETCAREXX", SubServiceID: "babysitter", WebTilePattern: regexp.MustCompile(`(?i)pet\s*care`), WebTestIDToken: "petcare"},
	"housekeeping": {ServiceID: "HOUSEKEEP", SubServiceID: "babysitter", WebTilePattern: regexp.MustCompile(`(?i)house\s*keep`), WebTestIDToken: "housekeeping"},
	"tutoring":     {ServiceID: "TUTORINGX", SubServiceID: "babysitter", WebTilePattern: regexp.MustCompile(`(?i)tutor`), WebTestIDToken: "tutoring"},
}
```

- [ ] **Step 2: Commit**

```bash
git add . && git commit -m "feat: add verticals registry"
```

---

## Phase 2: Mobile Pipeline Steps

### Task 7: Account Creation Step

**Files:**
- Create: `jumper-go/internal/steps/account.go`

Port from `src/steps/account.ts` — the `createAccountMobile` function. Uses `enroll/lite` + `enroll/upgrade/provider` SPI calls. Optionally queries MySQL for UUID.

- [ ] **Step 1: Implement account.go**

Port the `createAccountMobile` logic: generate random email with a short random suffix, call `enroll/lite`, extract authToken + memberId, call `enroll/upgrade/provider`, optionally query DB for UUID. Use `crypto/rand` for suffix generation instead of nanoid.

- [ ] **Step 2: Verify compiles**

```bash
go build ./...
```

- [ ] **Step 3: Commit**

```bash
git add . && git commit -m "feat: add account creation step (lite + upgrade)"
```

---

### Task 8: Profile Steps

**Files:**
- Create: `jumper-go/internal/steps/profile.go`

Port from `src/steps/mobile.ts` — the `mobilePreAvailability` and `mobileCompleteProfile` functions.

Key concurrency opportunity: in `mobilePreAvailability`, the `SAVE_MULTIPLE_VERTICAL` and `CAREGIVER_ATTRIBUTES_UPDATE` calls are independent — run them concurrently with `errgroup`.

- [ ] **Step 1: Implement profile.go**

Include:
- `PreAvailability()` — save verticals + attributes (concurrent via errgroup)
- `CompleteProfile()` — set preferences, availability (REST + GraphQL), skills, bio, photo upload
- `addAvailability()` — helper that sets REST availability then GraphQL preference + acknowledge

Reference `src/steps/mobile.ts` lines 19-161 for exact API call sequence and payloads.

- [ ] **Step 2: Verify compiles**

```bash
go build ./...
```

- [ ] **Step 3: Commit**

```bash
git add . && git commit -m "feat: add profile steps with concurrent calls"
```

---

### Task 9: Photo Upload

**Files:**
- Create: `jumper-go/internal/steps/photo.go`

Port from `src/steps/photo.ts`. Generates a small PNG programmatically and uploads via multipart.

- [ ] **Step 1: Implement photo.go**

Generate a minimal valid PNG in memory (can use `image/png` stdlib). Upload via `RestPostMultipartSPI` to the photo endpoint.

- [ ] **Step 2: Commit**

```bash
git add . && git commit -m "feat: add photo generation and upload"
```

---

### Task 10: Upgrade Step (Stripe + Vantiv)

**Files:**
- Create: `jumper-go/internal/steps/upgrade.go`
- Create: `jumper-go/internal/steps/vantiv.go`

Port from `src/steps/upgrade.ts`.

- [ ] **Step 1: Implement vantiv.go**

Port `getVantivPPRID()` — POST to Vantiv eProtect endpoint, extract `paypageRegistrationId`.

- [ ] **Step 2: Implement upgrade.go**

Include:
- `SetupPayment()` — calls `payment/stripe/addAccount` with p2pStripeAccountInput
- `ScreeningUpgradeRest()` — Vantiv-based Basic upgrade, then Premium if tier requires it
- `CreateStripeToken()` — POST to `https://api.stripe.com/v1/tokens` with the hardcoded `pk_test_UZuwv5SEujgQze49pdvUY8zp` key (same approach we just added to the TS version)

Port from `src/steps/mobile.ts` `mobileUpgrade()` which calls: acceptDisclosure → setupPayment → screeningUpgradeRest.

- [ ] **Step 3: Commit**

```bash
git add . && git commit -m "feat: add upgrade step with Stripe token and Vantiv"
```

---

### Task 11: Disclosure Step

**Files:**
- Create: `jumper-go/internal/steps/disclosure.go`

Port from `src/steps/disclosure.ts`. Single SPI call.

- [ ] **Step 1: Implement disclosure.go**

Port `acceptDisclosure()` — format current timestamp, POST to `enroll/backgroundCheckAccepted`.

- [ ] **Step 2: Commit**

```bash
git add . && git commit -m "feat: add disclosure acceptance step"
```

---

### Task 12: Enrollment Step (SSN + BGC + Sterling)

**Files:**
- Create: `jumper-go/internal/steps/enrollment.go`

Port from `src/steps/enrollment.ts`. This is the most complex step — SSN trace, eligibility check, BGC creation, Sterling callback.

- [ ] **Step 1: Implement enrollment.go**

Include:
- `SubmitSSNTrace()` — feature check, legal info update, address update, SSN trace, notification setting
- `CreateEligibilityCheck()` — polls eligibility endpoint up to 5 times with 5s delay
- `CreateSitterBGCheck()` — large form POST with all personal data + Vantiv PPRID
- `CompleteBGC()` — queries MySQL for screening ID (retries up to 5 times with 3s delay), then sends Sterling callback
- `FullyEnrolled()` — orchestrates the full sequence

Reference `src/steps/enrollment.ts` and `src/steps/mobile.ts` `mobileFullyEnrolled()` for the exact call order:
1. submitSsnTrace
2. infoVerification/check
3. backgroundcheck/sitter/options
4. creditCard/subscription/profile
5. orderSummary/details/display
6. provider/showStateBGCDisclosure
7. createSitterBGCheck (with Vantiv PPRID)
8. completeBGC (Sterling callback)

- [ ] **Step 2: Commit**

```bash
git add . && git commit -m "feat: add enrollment step with SSN trace and Sterling callback"
```

---

### Task 13: Pipeline Orchestrator

**Files:**
- Create: `jumper-go/internal/steps/pipeline.go`
- Create: `jumper-go/internal/steps/pipeline_test.go`

Port from `src/steps/registry.ts`. The orchestrator runs steps sequentially, emits events, and collects results.

- [ ] **Step 1: Write pipeline_test.go**

Test that `GetStepsUpTo` returns the correct slice of steps for a given target. Test that running the pipeline calls each step in order.

- [ ] **Step 2: Implement pipeline.go**

```go
// internal/steps/pipeline.go
package steps

import (
	"fmt"
	"time"

	"jumper-go/internal/api"
	"jumper-go/internal/config"
	"jumper-go/internal/tui"
	"jumper-go/internal/types"
)

type StepRunner func(client *api.Client, ctx *types.ProviderContext, payloads any, cfg *config.EnvConfig, vc *VerticalConfig, events chan<- tui.RunEvent) error

type StepDefinition struct {
	Name   types.Step
	Runner StepRunner
}

var MobilePipeline = []StepDefinition{
	{Name: types.StepAccountCreated, Runner: RunAccountCreated},
	{Name: types.StepAtBuildProfile, Runner: RunNoop},
	{Name: types.StepAtAvailability, Runner: RunPreAvailability},
	{Name: types.StepProfileComplete, Runner: RunCompleteProfile},
	{Name: types.StepUpgraded, Runner: RunUpgrade},
	{Name: types.StepAtDisclosure, Runner: RunNoop},
	{Name: types.StepFullyEnrolled, Runner: RunFullyEnrolled},
}

func GetStepsUpTo(target types.Step) ([]StepDefinition, error) {
	for i, s := range MobilePipeline {
		if s.Name == target {
			return MobilePipeline[:i+1], nil
		}
	}
	return nil, fmt.Errorf("unknown mobile step: %s", target)
}

func RunPipeline(
	steps []StepDefinition,
	client *api.Client,
	ctx *types.ProviderContext,
	payloads any,
	cfg *config.EnvConfig,
	vc *VerticalConfig,
	events chan<- tui.RunEvent,
	stepDescriptions map[types.Step]string,
) []types.StepResult {
	var results []types.StepResult

	for _, step := range steps {
		events <- tui.RunEvent{Type: tui.EventStepStart, Step: string(step.Name), Desc: stepDescriptions[step.Name]}
		start := time.Now()

		err := step.Runner(client, ctx, payloads, cfg, vc, events)
		duration := time.Since(start)

		result := types.StepResult{
			Step:     step.Name,
			Duration: duration,
			Err:      err,
			Context: map[string]string{
				"email":    ctx.Email,
				"memberId": ctx.MemberID,
				"uuid":     ctx.UUID,
			},
		}
		results = append(results, result)

		if err != nil {
			events <- tui.RunEvent{Type: tui.EventStepError, Step: string(step.Name), Error: err.Error()}
			break
		}
		events <- tui.RunEvent{Type: tui.EventStepComplete, Step: string(step.Name)}
	}

	events <- tui.RunEvent{Type: tui.EventRunComplete}
	return results
}

func RunNoop(_ *api.Client, _ *types.ProviderContext, _ any, _ *config.EnvConfig, _ *VerticalConfig, _ chan<- tui.RunEvent) error {
	return nil
}
```

Wire each `Run*` function to delegate to the implementations from Tasks 7-12.

- [ ] **Step 3: Run tests**

```bash
go test ./internal/steps/... -v
```

- [ ] **Step 4: Commit**

```bash
git add . && git commit -m "feat: add pipeline orchestrator with step sequencing"
```

---

## Phase 3: TUI

### Task 14: Theme and Styles

**Files:**
- Create: `jumper-go/internal/tui/theme.go`

Port from `src/tui/theme.ts`. Define lipgloss styles.

- [ ] **Step 1: Implement theme.go**

Define color constants and lipgloss styles for: step status icons (pending, running, complete, error), panel borders, header, footer bar, log line colors by event type.

- [ ] **Step 2: Commit**

```bash
git add . && git commit -m "feat: add TUI theme with lipgloss styles"
```

---

### Task 15: Wizard

**Files:**
- Create: `jumper-go/internal/tui/wizard.go`
- Create: `jumper-go/internal/tui/wizard_test.go`

Port from `src/tui/wizard.tsx`. Six stages using Bubble Tea's list component.

- [ ] **Step 1: Write wizard_test.go**

Test state machine transitions: platform selection advances to vertical, vertical advances to step, etc. Test that env var warnings are generated correctly.

- [ ] **Step 2: Implement wizard.go**

Bubble Tea model with:
- `WizardModel` struct holding current stage, selections, and list model
- `Init()` returns nil (no initial command)
- `Update()` handles key presses — Enter to select and advance, Esc to go back
- `View()` renders the current stage's list with a header showing prior selections
- Stage-specific list items for Platform (2 items), Vertical (5 items), Step (filtered by platform), Tier (2 items), Options (count + mode), Confirm (summary + warnings)

Use `bubbles/list` for item selection. Each stage transitions to the next by setting the stage field and rebuilding the list items.

Return a `WizardResult` struct with all selections when confirmed.

- [ ] **Step 3: Run tests**

```bash
go test ./internal/tui/... -v
```

- [ ] **Step 4: Commit**

```bash
git add . && git commit -m "feat: add TUI wizard with 6-stage selection flow"
```

---

### Task 16: Execution Screen

**Files:**
- Create: `jumper-go/internal/tui/execution.go`

Port from `src/tui/execution.tsx`.

- [ ] **Step 1: Implement execution.go**

Bubble Tea model with:
- Left panel: step list with status icons (○ ▸ ✓ ✗), per-step log counts, context values
- Right panel: current step description, recent log lines, collapsible log drawer
- Bottom bar: env name, keybindings, step counter, elapsed time
- Receives `RunEvent` messages from the pipeline via a channel (use `tea.Sub` or `tea.Cmd` to bridge the Go channel to Bubble Tea messages)
- Keybindings: `l` toggle logs, `d` detail, `tab`/`shift+tab` browse steps, `a` all logs, `q` quit, `r` retry, `enter` continue (step-through mode)

- [ ] **Step 2: Commit**

```bash
git add . && git commit -m "feat: add TUI execution screen with step list and log drawer"
```

---

### Task 17: Log Panel

**Files:**
- Create: `jumper-go/internal/tui/logpanel.go`

Port from `src/tui/log-panel.tsx`.

- [ ] **Step 1: Implement logpanel.go**

Renders log entries with:
- Color-coded lines by event type (network, browser, navigation, system)
- Scroll support (up/down arrow keys)
- Filter toggles (1-4 keys)
- Detail mode toggle (shows request/response bodies)

- [ ] **Step 2: Commit**

```bash
git add . && git commit -m "feat: add TUI log panel with filtering and scroll"
```

---

### Task 18: Root App

**Files:**
- Create: `jumper-go/internal/tui/app.go`

Port from `src/tui/app.tsx`. Ties wizard → execution → completion together.

- [ ] **Step 1: Implement app.go**

Root Bubble Tea model that transitions between three screens:
1. Wizard → collects selections
2. Execution → runs pipeline, shows progress
3. Completion → shows results, offers "create another" / "new config" / "quit"

Bridge the pipeline's event channel to Bubble Tea messages using a `tea.Cmd` that reads from the channel.

- [ ] **Step 2: Commit**

```bash
git add . && git commit -m "feat: add root TUI app with wizard → execution → completion flow"
```

---

## Phase 4: Web Flow

### Task 19: Auth0 PKCE Flow

**Files:**
- Create: `jumper-go/internal/web/auth.go`

Port from `src/api/auth.ts`. Uses playwright-go to drive headless Chromium through Auth0 login.

- [ ] **Step 1: Implement auth.go**

Port the PKCE flow: generate verifier/challenge, open Auth0 authorize URL, fill email/password, capture auth code from redirect, exchange for access token. Use `playwright-go` API (same selectors as TS version).

- [ ] **Step 2: Commit**

```bash
git add . && git commit -m "feat: add Auth0 PKCE flow via playwright-go"
```

---

### Task 20: Web Enrollment Flow

**Files:**
- Create: `jumper-go/internal/web/flow.go`
- Create: `jumper-go/internal/web/checkout.go`

Port from `src/steps/web-flow.ts`.

- [ ] **Step 1: Implement flow.go**

Port the page-by-page navigation: get-started, soft-intro, vertical-selection, location, preferences, family-count, account-creation, family-connection, safety-screening, subscriptions, payment, app-download. Each page is a function that takes a `playwright.Page` and returns an error.

- [ ] **Step 2: Implement checkout.go**

Port `fillCheckoutForm()` — handle Stripe Elements iframes. Find card number iframe by title, click, type card, Tab to expiry, type expiry, Tab to CVC, type CVC. Fallback to page-level fields if Stripe iframes not found.

- [ ] **Step 3: Commit**

```bash
git add . && git commit -m "feat: add web enrollment flow with Stripe checkout handling"
```

---

## Phase 5: CLI Entry Point & Integration

### Task 21: CLI Entry Point

**Files:**
- Modify: `jumper-go/main.go`

Wire everything together: flag parsing, TUI launch, direct CLI mode.

- [ ] **Step 1: Implement main.go**

Support two modes:
1. `./jumper start` — launches TUI wizard
2. `./jumper --step <step> [--platform web|mobile] [--tier basic|premium] [--vertical childcare] [--no-auto-close]` — direct CLI mode

Use stdlib `flag` package (or `cobra` if you prefer, but flag is simpler). Load config, create client, dispatch to either TUI or direct runner.

- [ ] **Step 2: Build and smoke test**

```bash
go build -o jumper && ./jumper --help
```

- [ ] **Step 3: Commit**

```bash
git add . && git commit -m "feat: add CLI entry point with TUI and direct modes"
```

---

### Task 22: Step Descriptions

**Files:**
- Create: `jumper-go/internal/tui/descriptions.go`

Port from `src/tui/step-descriptions.ts`.

- [ ] **Step 1: Create descriptions.go**

```go
package tui

import "jumper-go/internal/types"

var StepDescriptions = map[types.Step]string{
	types.StepAtGetStarted:       `Browser at the "Get Started" page. No data entered yet.`,
	types.StepAtSoftIntro:        `Clicked "Find Jobs". Browser at the soft intro screen.`,
	// ... all 20 step descriptions
	types.StepFullyEnrolled:      `Background check submitted and completed via Sterling callback. Fully enrolled.`,
}
```

- [ ] **Step 2: Commit**

```bash
git add . && git commit -m "feat: add step descriptions"
```

---

### Task 23: README

**Files:**
- Create: `jumper-go/README.md`

- [ ] **Step 1: Write README**

Cover: what it is, setup (`go build`), usage (both TUI and CLI modes), env vars table, test data, known limitations. Keep it shorter than the TS README since distribution is simpler.

- [ ] **Step 2: Commit**

```bash
git add . && git commit -m "docs: add README"
```

---

### Task 24: End-to-End Verification

- [ ] **Step 1: Build the binary**

```bash
cd /Users/josh.davis/projects/jumper-go && go build -o jumper
```

- [ ] **Step 2: Run all unit tests**

```bash
go test ./... -v
```

- [ ] **Step 3: Smoke test — CLI mobile flow**

```bash
./jumper --step account-created --platform mobile --vertical childcare --tier premium
```

Verify: account is created, email + memberId printed.

- [ ] **Step 4: Smoke test — TUI**

```bash
./jumper start
```

Verify: wizard renders, can select options, execution screen shows step progress.

- [ ] **Step 5: Smoke test — fully-enrolled (if VPN connected)**

```bash
./jumper --step fully-enrolled --platform mobile --vertical childcare --tier premium
```

Verify: all steps complete, Sterling callback succeeds.

- [ ] **Step 6: Final commit**

```bash
git add . && git commit -m "chore: end-to-end verification pass"
```
