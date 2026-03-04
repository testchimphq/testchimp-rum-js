# testchimp-rum-js

Lightweight browser library for emitting structured user interaction events to [TestChimp](https://testchimp.io). Use it to capture real user activity for TrueCoverage and session analytics. Events are buffered and sent in batches; requests are fire-and-forget and do not block the main thread.

## Installation

**npm**

```bash
npm install testchimp-rum-js
```

**Script tag (UMD)**

```html
<script src="https://unpkg.com/testchimp-rum-js/dist/testchimp-rum.min.js"></script>
```

**ES module**

```javascript
import testchimp from 'testchimp-rum-js';
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
| `config.sessionId` | `string` | No | Override session ID (otherwise derived from `localStorage` or generated). |
| `config.environment` | `string` | No | Logical environment for the session (e.g. `'production'`, `'staging'`). |
| `config.release` | `string` | No | Application release/version identifier (e.g. `'2.1.0'`). |
| `config.branchName` | `string` | No | Git branch name associated with this session (e.g. `'feature/checkout'`). |
| `config.sessionMetadata` | `Struct` | No | Additional immutable metadata for the session (same validation as event metadata). Do **not** put `environment`, `release`, or `branch_name` here—use the top-level fields above. |
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
| `maxEventsPerSession` | `number` | `100` | Max events accepted per session (by title count + repeats). |
| `maxRepeatsPerEvent` | `number` | `3` | Max number of events with the same `title` per session. |
| `eventSendInterval` | `number` | `10000` | Interval (ms) for sending buffered events. |
| `maxBufferSize` | `number` | `100` | Max events in buffer before an automatic flush. |
| `inactivityTimeoutMillis` | `number` | `1800000` (30 min) | Session considered expired after this much inactivity; next load gets a new session. |
| `testchimpEndpoint` | `string` | `'https://ingress.testchimp.io'` | Base URL for RUM API (session start and events). |

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
  - `beforeunload` fires, or
  - You call `flush()`.
- **Delivery**: Requests use `fetch` with `keepalive: true` where needed so delivery is best-effort and non-blocking.

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
