# @testchimp/rum-js

Lightweight browser library for emitting structured user interaction events to [TestChimp](https://testchimp.io). Use it to capture real user activity for TrueCoverage and session analytics. Events are buffered and sent in batches; requests are fire-and-forget and do not block the main thread.

## Installation

**npm**

```bash
npm install @testchimp/rum-js
```

**Script tag (UMD)**

```html
<script src="https://unpkg.com/@testchimp/rum-js/dist/testchimp-rum.min.js"></script>
```

**ES module**

```javascript
import testchimp from '@testchimp/rum-js';
```

## Quick start

1. Call `init()` once with your project credentials.
2. Call `emit()` whenever you want to record a user action.

```javascript
// Initialize (e.g. on app load)
testchimp.init({
  projectId: 'your-project-id',
  apiKey: 'your-api-key',
});

// Record events
testchimp.emit({ title: 'checkout_started' });
testchimp.emit({ title: 'add_to_cart', metadata: { product_id: 'SKU-123' } });
```

## API

### `testchimp.init(config)`

Initializes the RUM client. Call once before using `emit`, `flush`, or `resetSession`.

| Parameter | Type | Required | Description |
|-----------|------|----------|--------------|
| `config.projectId` | `string` | Yes | TestChimp project ID. |
| `config.apiKey` | `string` | Yes | TestChimp API key for this project. |
| `config.environment` | `string` | Yes | Logical environment for the session (e.g. `'production'`, `'staging'`). |
| `config.sessionId` | `string` | No | Override session ID (otherwise derived from `localStorage` or generated). |
| `config.release` | `string` | No | Application release/version identifier (e.g. `'2.1.0'`). |
| `config.branchName` | `string` | No | Git branch name associated with this session (e.g. `'feature/checkout'`). |
| `config.sessionMetadata` | `Struct` | No | Additional immutable metadata for the session (same validation as event metadata). Do **not** put `environment`, `release`, or `branchName` here—use the top-level fields above. |
| `config.config` | `object` | No | Optional tuning; see [Configuration options](#configuration-options). |

**Example with options**

```javascript
testchimp.init({
  projectId: 'proj_abc',
  apiKey: 'tc_xxxxxxxx',
  environment: 'production',
  release: '2.1.0',
  branchName: 'main',
  sessionMetadata: { user_tier: 'pro' },
  config: {
    captureEnabled: true,
    maxEventsPerSession: 200,
    eventSendInterval: 5000,
    inactivityTimeoutMillis: 15 * 60 * 1000, // 15 min
  },
});
```

### `testchimp.emit(input)`

Records one event. Events are validated, then buffered and sent in batches. Invalid or over-limit events are dropped (with a console warning).

| Parameter | Type | Required | Description |
|-----------|------|----------|--------------|
| `input.title` | `string` | Yes | Event name (e.g. `'button_clicked'`). Max 100 characters. |
| `input.metadata` | `Struct` | No | Optional metadata (key-value; values are primitive or array of primitives only—no nested objects). See [Event constraints](#event-constraints). |

**Examples**

```javascript
testchimp.emit({ title: 'page_view' });

testchimp.emit({
  title: 'form_submitted',
  metadata: {
    form_id: 'signup',
    step: 2,
  },
});

// Values: primitive or array of primitives only
testchimp.emit({
  title: 'checkout_step',
  metadata: { step_index: 1, total: 3, tags: ['cart', 'checkout'] },
});
```

### `testchimp.flush()`

Sends any buffered events immediately. Useful before navigation or when you want to ensure delivery without waiting for the timer or buffer limit.

```javascript
// e.g. before redirect
testchimp.flush();
```

### `globalThis.__TC_RUM_FLUSH` (Playwright / CI automation)

On `init()`, the SDK registers a stable automation hook on `globalThis` (not only `window`, so ESM bundles such as Angular can use it):

```javascript
const ok = await globalThis.__TC_RUM_FLUSH(); // async: drains buffer and awaits POST (rum-js ≥ 0.1.7)
```

`@testchimp/playwright` (≥ 0.2.6) awaits this in web page fixture teardown while the page is still open. `__TC_RUM_GET_BUFFER_SIZE()` supports a short poll before flush when CI metadata is present. The hook uses a **normal** `fetch` (not keepalive) so the POST completes before Playwright closes the context. Failed POSTs leave events in the buffer. Prefer this hook over `testchimp.flush()` in automation. **Production `emit` is unchanged** — no per-event CI checks; batching uses your configured `eventSendInterval` (default 10s).

### `testchimp.resetSession()`

Clears in-memory state and `localStorage` session data (session ID, event counts, etc.). The next `emit` (after a new `init` if needed) will start a new session.

```javascript
testchimp.resetSession();
```

## Configuration options

Pass these under `config` in `init()`:

| Option | Type | Default | Description |
|--------|------|--------|-------------|
| `captureEnabled` | `boolean` | `true` | If `false`, `emit` is a no-op. |
| `enableDefaultSessionMetadata` | `boolean` | `true` | When `true` (default), the session init request is automatically populated with client-derived metadata (`_platform`, browser, device type, OS, language, timezone). Set to `false` to disable and send only your own `sessionMetadata`. |
| `maxEventsPerSession` | `number` | `100` | Max events accepted per session (by title count + repeats). |
| `maxRepeatsPerEvent` | `number` | `3` | Max number of events with the same `title` per session. |
| `eventSendInterval` | `number` | `10000` | Interval (ms) for sending buffered events. |
| `maxBufferSize` | `number` | `100` | Max events in buffer before an automatic flush. |
| `inactivityTimeoutMillis` | `number` | `1800000` (30 min) | Session considered expired after this much inactivity; next load gets a new session. |
| `testchimpEndpoint` | `string` | `'https://ingress.testchimp.io'` | Base URL for RUM API (session start and events). |

**Default session metadata (updated behaviour)**

- **Config:** `enableDefaultSessionMetadata` under `config` in `init()`.
- **Default value:** `true`. Session init requests are automatically populated with the metadata below unless you set it to `false`.
- **What gets populated:** When enabled, the **session init** request (only) includes the following client-derived keys in `metadata`. They are computed in the browser from `navigator` and `Intl`; you do not need to pass them. User-provided `sessionMetadata` overrides any of these if you use the same key name.

| Key | Populated with |
|-----|----------------|
| `_platform` | Always `web` for this SDK (native iOS/Android SDKs send `ios`, `android`, or `macos`). |
| `_browser` | Browser name only (e.g. Chrome, Firefox, Edge, Safari). No version. |
| `_device_type` | One of: `desktop`, `mobile`, `tablet`. |
| `_os` | Normalized OS (e.g. mac, windows, linux, ios, android). |
| `_language` | Browser language (e.g. en-US). |
| `_timezone` | IANA timezone (e.g. America/New_York). |

These fields are added **only to the session init** call (`/rum/session/start`). Individual `emit()` calls are unchanged and do not include this metadata.

**Native SDKs (iOS / Android):** Session start uses the same reserved `_*` keys where applicable: `_platform` (`ios` / `android`; macOS targets use `macos`), `_os`, `_device_type` (`mobile` / `tablet`), `_language`, `_timezone`, `_os_version`, `_device_model`, `_manufacturer`. Previously `_platform` was `native`; dashboards should filter on `ios` / `android` / `macos` / `web` as needed.

**Example: high-frequency sampling**

```javascript
testchimp.init({
  projectId: 'proj_abc',
  apiKey: 'tc_xxx',
  config: {
    maxEventsPerSession: 50,
    maxRepeatsPerEvent: 2,
    eventSendInterval: 5000,
    maxBufferSize: 20,
    inactivityTimeoutMillis: 10 * 60 * 1000,
  },
});
```

## Event constraints

Events that exceed these limits are dropped and a warning is logged:

- **title**: Required, non-empty string, max **100** characters.
- **metadata**: Optional. Values must be primitive (string, number, boolean, null) or array of primitives—no nested objects. Max **10** keys; each key max **50** chars; string values max **200** chars; arrays max **50** elements. Total serialized event size max **5 KB**.

Session metadata (in `init`) uses the same metadata rules. The type `Struct` is exported for TypeScript users.

## Session and batching

- **Session ID**: Stored in `localStorage` and reused until it expires (inactivity timeout) or the user calls `resetSession()`. You can override it via `init({ sessionId: '…' })`.
- **Event index**: Each accepted event in a session gets a monotonic `event_index` (1, 2, 3, …) for ordering; it is sent with the event and stored by the backend.
- **Batching**: Events are buffered in memory and sent when:
  - The buffer reaches `maxBufferSize`, or
  - The `eventSendInterval` timer fires, or
  - The page becomes hidden (`visibilitychange`), or
  - `beforeunload` / `pagehide` fires, or
  - You call `flush()` or `globalThis.__TC_RUM_FLUSH()` (automation; normal fetch while the page is open).
  - Page unload uses keepalive via `visibilitychange` / `pagehide`.
- **Delivery**: Requests use `fetch` with `keepalive: true` where needed so delivery is best-effort and non-blocking.

## How this helps in real testing scenarios

`@testchimp/rum-js` feeds **TrueCoverage**: structured events from **production** compared to events emitted during **Playwright CI** (via [@testchimp/playwright](https://www.npmjs.com/package/@testchimp/playwright) + `__TC_RUM_FLUSH`). Instrument flows with metadata dimensions (payment method, auth provider, locale, plan tier)—then see which slices real users hit but your suite never exercises.

Start here: [TrueCoverage introduction](https://docs.testchimp.io/truecoverage/intro) · [How TrueCoverage works](https://docs.testchimp.io/truecoverage/how-it-works) · [Instrumentation guide](https://docs.testchimp.io/truecoverage/instrumentation) · [TrueCoverage dashboard](https://docs.testchimp.io/truecoverage/dashboard)

### Payments & revenue (instrument `checkout_*`, `payment_method`, `country`)

| Scenario | Testing guide |
|----------|----------------|
| Stripe Checkout, Elements, 3DS | [Stripe payments in Playwright](https://docs.testchimp.io/guides/flows/testing-stripe-payments) |
| Stripe webhooks & idempotency | [Testing Stripe webhooks in CI](https://docs.testchimp.io/guides/integrations/testing-stripe-webhooks) |
| Apple Pay / Google Pay / PayPal | [Wallet payment flows](https://docs.testchimp.io/guides/flows/testing-wallet-payments) |
| Subscriptions, trials, dunning | [Subscription billing](https://docs.testchimp.io/guides/flows/testing-subscriptions-billing) |
| Cart, coupons, promos | [Cart & promo codes](https://docs.testchimp.io/guides/verticals/testing-ecommerce-cart-and-coupons) |
| Checkout end-to-end | [E-commerce checkout](https://docs.testchimp.io/guides/verticals/testing-ecommerce-checkout-flows) |
| Tax / VAT / regional pricing | [Tax & regional pricing](https://docs.testchimp.io/guides/flows/testing-tax-regional-pricing) |
| Refunds & partial credits | [Returns & refunds](https://docs.testchimp.io/guides/flows/testing-returns-refunds) |
| Free trial → paid conversion | [Trial to paid](https://docs.testchimp.io/guides/flows/testing-trial-to-paid) |
| Seat limits & team growth | [Seat licensing](https://docs.testchimp.io/guides/flows/testing-seat-licensing) |
| Plan entitlements & feature flags | [Feature entitlements](https://docs.testchimp.io/guides/flows/testing-feature-entitlements) |

### Auth & identity (instrument `auth_provider`, `verification_state`, `sign_in_method`)

| Scenario | Testing guide |
|----------|----------------|
| Firebase Auth emulator & custom tokens | [Firebase authentication flows](https://docs.testchimp.io/guides/auth/testing-firebase-auth) |
| Auth0 / Okta enterprise SSO | [Auth0 & Okta SSO testing](https://docs.testchimp.io/guides/auth/testing-auth0-okta-sso) |
| Google / GitHub OAuth | [OAuth social login](https://docs.testchimp.io/guides/auth/testing-oauth-social-login) |
| Magic links & passwordless | [Magic link testing](https://docs.testchimp.io/guides/auth/testing-magic-link-passwordless) |
| MFA / TOTP / SMS OTP | [MFA & 2FA flows](https://docs.testchimp.io/guides/auth/testing-mfa-2fa) |
| CAPTCHA on signup/login | [CAPTCHA-enabled flows](https://docs.testchimp.io/guides/auth/testing-captcha-flows) |
| Role × permission matrices | [RBAC permissions](https://docs.testchimp.io/guides/auth/testing-rbac-permissions) |
| Session timeout & refresh tokens | [Session expiry testing](https://docs.testchimp.io/guides/auth/testing-session-timeout) |

### AI & conversational UX (instrument `conversation_intent`, `tool_invoked`)

| Scenario | Testing guide |
|----------|----------------|
| Chatbots & multi-turn UI | [Conversational UI testing](https://docs.testchimp.io/guides/ai/testing-conversational-ui) |
| AI agent tool calling | [AI agent workflows](https://docs.testchimp.io/guides/ai/testing-ai-agent-workflows) |
| RAG / knowledge-base search | [RAG testing](https://docs.testchimp.io/guides/ai/testing-rag-search) |
| LLM output / JSON schema | [LLM output validation](https://docs.testchimp.io/guides/ai/testing-llm-output-validation) |
| Streaming responses | [Streaming AI responses](https://docs.testchimp.io/guides/ai/testing-ai-streaming-responses) |
| Canvas, charts, maps | [Canvas & visual widgets](https://docs.testchimp.io/guides/ai/testing-canvas-visual-interactions) · [Google Maps](https://docs.testchimp.io/guides/integrations/testing-google-maps) |
| Hybrid SmartTests + `ai.act` | [AI-powered web apps](https://docs.testchimp.io/guides/verticals/testing-ai-web-apps) · [ai-wright](https://github.com/testchimphq/ai-wright) |

### Integrations & outputs (instrument `email_template`, `webhook_event_type`, …)

| Scenario | Testing guide |
|----------|----------------|
| Transactional email (Mailtrap patterns) | [Transactional email flows](https://docs.testchimp.io/guides/integrations/testing-transactional-email) |
| SMS / OTP verification | [SMS & OTP testing](https://docs.testchimp.io/guides/integrations/testing-sms-otp) |
| Async webhooks (generic) | [Webhooks & async events](https://docs.testchimp.io/guides/integrations/testing-webhooks-async) |
| PDF invoices & downloads | [PDF generation & downloads](https://docs.testchimp.io/guides/integrations/testing-pdf-downloads) |
| File upload & CSV import/export | [File uploads](https://docs.testchimp.io/guides/integrations/testing-file-uploads) · [CSV import/export](https://docs.testchimp.io/guides/integrations/testing-csv-import-export) |
| Stripe iframes & embeds | [Third-party embeds](https://docs.testchimp.io/guides/integrations/testing-third-party-embeds) |
| Push notification preferences | [Push notifications](https://docs.testchimp.io/guides/integrations/testing-push-notifications) |

### SaaS, UI patterns & compliance

| Scenario | Testing guide |
|----------|----------------|
| Onboarding funnels & screen states | [SaaS onboarding](https://docs.testchimp.io/guides/verticals/testing-saas-onboarding-flows) · [Screen-state annotations](https://docs.testchimp.io/smart-tests/screen-state-annotations) |
| Localization & RTL | [Localization / i18n](https://docs.testchimp.io/guides/patterns/testing-localization-i18n) |
| Timezones & scheduling | [Date, time & timezones](https://docs.testchimp.io/guides/patterns/testing-date-time-timezones) · [Calendar booking](https://docs.testchimp.io/guides/patterns/testing-calendar-scheduling) |
| GDPR export / delete / consent | [GDPR privacy flows](https://docs.testchimp.io/guides/patterns/testing-gdpr-privacy) |
| Form validation & a11y errors | [Form validation](https://docs.testchimp.io/guides/patterns/testing-form-validation) |
| Search, filters, data grids | [Search & filters](https://docs.testchimp.io/guides/patterns/testing-search-filters) · [Data grids](https://docs.testchimp.io/guides/patterns/testing-data-grids-tables) |
| Fintech transfers & ledgers | [Fintech web apps](https://docs.testchimp.io/guides/verticals/testing-fintech-web-apps) |
| HR, healthcare, insurance | [HR applications](https://docs.testchimp.io/guides/verticals/testing-hr-applications) · [Healthcare portals](https://docs.testchimp.io/guides/verticals/testing-healthcare-portals) · [Insurance quotes](https://docs.testchimp.io/guides/verticals/testing-insurance-quotes) |

### Close the loop with TestChimp QA workflow

When TrueCoverage shows a rising prod slice with no matching test scenario:

1. Document the flow in markdown plans — [Test planning in Git](https://docs.testchimp.io/test-planning/intro)
2. Run [`/testchimp evolve`](https://docs.testchimp.io/qa-autopilot-claude/evolve) to expand SmartTests from gaps
3. Gate PRs with [`/testchimp test`](https://docs.testchimp.io/qa-autopilot-claude/test) — [SmartTests in CI](https://docs.testchimp.io/smart-tests/run-in-ci-playwright)
4. Link automation with `// @Scenario:` — [Requirement traceability](https://docs.testchimp.io/test-planning/requirement-traceability)

More guides: [Testing guides hub](https://docs.testchimp.io/guides/intro) · [Fix flaky E2E tests](https://docs.testchimp.io/guides/verticals/testing-flaky-e2e-tests-startups) · [Arrange/Act/Assert pattern](https://docs.testchimp.io/qa-autopilot-claude/testchimps-approach-to-test-automation)

## Build and development

```bash
npm install
npm run build        # ESM + UMD + types
npm run build:esm    # dist/testchimp-rum.mjs
npm run build:umd    # dist/testchimp-rum.min.js
npm run build:types  # dist/*.d.ts
npm run clean        # remove dist/
```

## License

MIT © TestChimp
