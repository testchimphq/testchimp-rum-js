import type { HttpConfig } from "./http";
import { post } from "./http";
import {
  resolveSessionId,
  persistSession,
  updateLastActivity,
  resetSession as resetSessionStorage,
  getStorage,
  getSessionMetadata,
} from "./session";
import { getDefaultSessionMetadata } from "./defaultSessionMetadata";
import { validateEvent, validateSessionMetadata } from "./validation";
import {
  createEventBuffer,
  getDefaultEventBufferConfig,
  type EventBufferConfig,
} from "./events";
import type { EmitInput, ValidatedEvent, Struct } from "./validation";

export type { Struct, EmitInput };

const DEFAULT_ENDPOINT = "https://ingress.testchimp.io";
const DEFAULT_EVENT_SEND_INTERVAL = 10000;
/** Shorter batch interval when Playwright injects CI test info at init (secondary safety net). */
const CI_AUTOMATION_EVENT_SEND_INTERVAL = 2000;
const DEFAULT_MAX_BUFFER_SIZE = 100;
const DEFAULT_INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 min

export interface InitConfig {
  projectId: string;
  apiKey: string;
  sessionId?: string;
  environment: string;
  release?: string;
  branchName?: string;
  sessionMetadata?: Struct;
  config?: {
    captureEnabled?: boolean;
    enableDefaultSessionMetadata?: boolean;
    maxEventsPerSession?: number;
    maxRepeatsPerEvent?: number;
    eventSendInterval?: number;
    maxBufferSize?: number;
    inactivityTimeoutMillis?: number;
    testchimpEndpoint?: string;
  };
}

let state: {
  httpConfig: HttpConfig;
  sessionId: string;
  buffer: ReturnType<typeof createEventBuffer>;
  captureEnabled: boolean;
  flushTimerId: ReturnType<typeof setInterval> | null;
  initialized: boolean;
} | null = null;

function scheduleFlush(intervalMs: number): void {
  if (state!.flushTimerId) clearInterval(state!.flushTimerId);
  state!.flushTimerId = setInterval(() => {
    if (state && state.buffer.getBufferSize() > 0) {
      state.buffer.flush(false);
    }
  }, intervalMs);
}

function onVisibilityChange(): void {
  if (document.visibilityState === "hidden" && state) {
    state.buffer.flush(true);
  }
}

function onPageHide(): void {
  if (state) {
    state.buffer.flush(true);
  }
}

function onStorage(e: StorageEvent): void {
  if (e.key === "testchimp_session_id" && e.newValue && state) {
    state.sessionId = e.newValue;
  }
}

function hasCiTestInfoAtInit(): boolean {
  if (typeof globalThis === "undefined") return false;
  const v = (globalThis as unknown as { __TC_CI_TEST_INFO?: string })
    .__TC_CI_TEST_INFO;
  return typeof v === "string" && v.length > 0;
}

function resolveEventSendInterval(
  cfg: NonNullable<InitConfig["config"]>
): number {
  if (cfg.eventSendInterval !== undefined) return cfg.eventSendInterval;
  if (hasCiTestInfoAtInit()) return CI_AUTOMATION_EVENT_SEND_INTERVAL;
  return DEFAULT_EVENT_SEND_INTERVAL;
}

function installAutomationFlushHook(): void {
  if (typeof globalThis === "undefined") return;
  (globalThis as unknown as { __TC_RUM_FLUSH?: () => void }).__TC_RUM_FLUSH =
    () => {
      if (state?.initialized) state.buffer.flush(true);
    };
}

function clearAutomationFlushHook(): void {
  if (typeof globalThis === "undefined") return;
  delete (globalThis as unknown as { __TC_RUM_FLUSH?: () => void })
    .__TC_RUM_FLUSH;
}

export function init(config: InitConfig): void {
  if (!config.projectId || !config.apiKey) {
    console.warn("[testchimp-rum] init: projectId and apiKey are required");
    return;
  }

  const cfg = config.config ?? {};
  const captureEnabled = cfg.captureEnabled !== false;
  const endpoint = cfg.testchimpEndpoint ?? DEFAULT_ENDPOINT;
  const inactivityTimeout = cfg.inactivityTimeoutMillis ?? DEFAULT_INACTIVITY_TIMEOUT;
  const eventSendInterval = resolveEventSendInterval(cfg);
  const maxBufferSize = cfg.maxBufferSize ?? DEFAULT_MAX_BUFFER_SIZE;

  const sessionMetadata = validateSessionMetadata(config.sessionMetadata);
  const { sessionId, isNew } = resolveSessionId(
    config.sessionId,
    sessionMetadata,
    inactivityTimeout
  );

  persistSession(sessionId, sessionMetadata ?? config.sessionMetadata);

  const httpConfig: HttpConfig = {
    baseUrl: endpoint,
    projectId: config.projectId,
    apiKey: config.apiKey,
  };

  const bufferConfig: EventBufferConfig = {
    ...getDefaultEventBufferConfig(),
    maxEventsPerSession: cfg.maxEventsPerSession ?? 100,
    maxRepeatsPerEvent: cfg.maxRepeatsPerEvent ?? 3,
    maxBufferSize,
  };

  const buffer = createEventBuffer(httpConfig, sessionId, bufferConfig);

  if (state) {
    if (state.flushTimerId) clearInterval(state.flushTimerId);
  }

  state = {
    httpConfig,
    sessionId,
    buffer,
    captureEnabled,
    flushTimerId: null,
    initialized: true,
  };

  scheduleFlush(eventSendInterval);

  installAutomationFlushHook();

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("beforeunload", onPageHide);
    window.addEventListener("pagehide", onPageHide);
  }

  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }

  if (isNew && captureEnabled) {
    const userMeta = getSessionMetadata() ?? sessionMetadata ?? {};
    const metadata =
      cfg.enableDefaultSessionMetadata !== false
        ? { ...getDefaultSessionMetadata(), ...userMeta }
        : userMeta;
    const body: Record<string, unknown> = {
      session_id: sessionId,
      started_at: Date.now(),
      metadata,
    };

    if (config.environment) {
      body.environment = config.environment;
    }
    if (config.release) {
      body.release = config.release;
    }
    if (config.branchName) {
      body.branch_name = config.branchName;
    }

    post(httpConfig, "/rum/session/start", body);
  }
}

export function emit(input: EmitInput): void {
  if (!state || !state.initialized) {
    console.warn("[testchimp-rum] emit: call init() first");
    return;
  }
  if (!state.captureEnabled) return;

  const event = validateEvent(input);
  if (!event) return;

  updateLastActivity();

  const added = state.buffer.add(event);
  if (!added) return;

  if (state.buffer.getBufferSize() >= state.buffer.maxBufferSize) {
    state.buffer.flush(false);
  }
}

export function flush(): void {
  if (state && state.initialized) {
    state.buffer.flush(false);
  }
}

export function getSessionId(): string {
  if (!state || !state.initialized) {
    return "";
  }
  return state.sessionId;
}

export function resetSession(): void {
  if (state) {
    if (state.flushTimerId) {
      clearInterval(state.flushTimerId);
      state.flushTimerId = null;
    }
    state = null;
  }
  clearAutomationFlushHook();

  if (typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("beforeunload", onPageHide);
    window.removeEventListener("pagehide", onPageHide);
  }
  if (typeof window !== "undefined") {
    window.removeEventListener("storage", onStorage);
  }
  resetSessionStorage();
}

// Export for UMD global
const testchimp = {
  init,
  emit,
  flush,
  getSessionId,
  resetSession,
};

export default testchimp;
