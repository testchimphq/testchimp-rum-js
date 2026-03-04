import { generateULID } from "./ulid";
import { validateSessionMetadata, type Struct } from "./validation";

const STORAGE_SESSION_ID = "testchimp_session_id";
const STORAGE_LAST_ACTIVITY = "testchimp_last_activity";
const STORAGE_EVENT_COUNT = "testchimp_event_count";
const STORAGE_EVENT_TYPE_COUNTS = "testchimp_event_type_counts";

export function getStorage(): Storage | null {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function resolveSessionId(
  providedSessionId: string | undefined,
  sessionMetadata: Struct | undefined,
  inactivityTimeoutMillis: number
): { sessionId: string; isNew: boolean } {
  if (providedSessionId && typeof providedSessionId === "string" && providedSessionId.length > 0) {
    return { sessionId: providedSessionId, isNew: false };
  }

  const storage = getStorage();
  if (!storage) {
    return { sessionId: generateULID(), isNew: true };
  }

  const stored = storage.getItem(STORAGE_SESSION_ID);
  const lastActivityStr = storage.getItem(STORAGE_LAST_ACTIVITY);
  const now = Date.now();

  if (stored && lastActivityStr) {
    const lastActivity = parseInt(lastActivityStr, 10);
    if (!isNaN(lastActivity) && now - lastActivity < inactivityTimeoutMillis) {
      return { sessionId: stored, isNew: false };
    }
  }

  return { sessionId: generateULID(), isNew: true };
}

export function persistSession(
  sessionId: string,
  sessionMetadata?: Struct
): void {
  const storage = getStorage();
  if (!storage) return;

  const now = Date.now();
  storage.setItem(STORAGE_SESSION_ID, sessionId);
  storage.setItem(STORAGE_LAST_ACTIVITY, String(now));
  storage.setItem(STORAGE_EVENT_COUNT, "0");

  const validated = validateSessionMetadata(sessionMetadata);
  if (validated) {
    try {
      storage.setItem("testchimp_session_metadata", JSON.stringify(validated));
    } catch {
      // ignore
    }
  }

  const counts: Record<string, number> = {};
  try {
    storage.setItem(STORAGE_EVENT_TYPE_COUNTS, JSON.stringify(counts));
  } catch {
    // ignore
  }
}

export function updateLastActivity(): void {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(STORAGE_LAST_ACTIVITY, String(Date.now()));
}

export function getEventCount(): number {
  const storage = getStorage();
  if (!storage) return 0;
  const s = storage.getItem(STORAGE_EVENT_COUNT);
  const n = parseInt(s ?? "0", 10);
  return isNaN(n) ? 0 : n;
}

export function setEventCount(count: number): void {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(STORAGE_EVENT_COUNT, String(count));
}

export function getEventTypeCounts(): Record<string, number> {
  const storage = getStorage();
  if (!storage) return {};
  try {
    const s = storage.getItem(STORAGE_EVENT_TYPE_COUNTS);
    if (!s) return {};
    const parsed = JSON.parse(s);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function setEventTypeCounts(counts: Record<string, number>): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_EVENT_TYPE_COUNTS, JSON.stringify(counts));
  } catch {
    // ignore
  }
}

export function getSessionMetadata(): Struct | undefined {
  const storage = getStorage();
  if (!storage) return undefined;
  try {
    const s = storage.getItem("testchimp_session_metadata");
    if (!s) return undefined;
    const parsed = JSON.parse(s);
    return typeof parsed === "object" && parsed !== null ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function resetSession(): void {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(STORAGE_SESSION_ID);
  storage.removeItem(STORAGE_LAST_ACTIVITY);
  storage.removeItem(STORAGE_EVENT_COUNT);
  storage.removeItem(STORAGE_EVENT_TYPE_COUNTS);
  storage.removeItem("testchimp_session_metadata");
}
