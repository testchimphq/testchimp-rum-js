import type { HttpConfig } from "./http";
import { post } from "./http";
import type { ValidatedEvent } from "./validation";
import {
  getEventCount,
  getEventTypeCounts,
  setEventCount,
  setEventTypeCounts,
  getSessionMetadata,
} from "./session";

const MAX_EVENTS_PER_SESSION_DEFAULT = 100;
const MAX_REPEATS_PER_EVENT_DEFAULT = 3;

export interface EventBufferConfig {
  maxEventsPerSession: number;
  maxRepeatsPerEvent: number;
  maxBufferSize: number;
}

type BufferedEvent = ValidatedEvent & {
  eventIndex: number;
};

export function createEventBuffer(
  httpConfig: HttpConfig,
  sessionId: string,
  config: EventBufferConfig
) {
  let buffer: BufferedEvent[] = [];
  let flushScheduled = false;

  function canAcceptEvent(title: string): boolean {
    const total = getEventCount();
    if (total >= config.maxEventsPerSession) return false;

    const counts = getEventTypeCounts();
    const current = counts[title] ?? 0;
    if (current >= config.maxRepeatsPerEvent) return false;

    return true;
  }

  function recordEventAccepted(title: string): number {
    const nextIndex = getEventCount() + 1;
    setEventCount(nextIndex);
    const counts = getEventTypeCounts();
    counts[title] = (counts[title] ?? 0) + 1;
    setEventTypeCounts(counts);
    return nextIndex;
  }

  function eventsPayload(events: BufferedEvent[]) {
    return {
      session_id: sessionId,
      events: events.map((e) => ({
        title: e.title,
        event_index: e.eventIndex,
        timestamp_millis: e.timestampMillis,
        metadata: e.metadata ?? {},
      })),
    };
  }

  function sendBatch(events: BufferedEvent[], keepalive = false): void {
    if (events.length === 0) return;
    void post(httpConfig, "/rum/events", eventsPayload(events), { keepalive });
  }

  async function sendBatchAsync(
    events: BufferedEvent[],
    keepalive = false
  ): Promise<boolean> {
    if (events.length === 0) return true;
    return post(httpConfig, "/rum/events", eventsPayload(events), { keepalive });
  }

  function flush(keepalive = false): void {
    if (buffer.length === 0) return;
    const toSend = [...buffer];
    buffer = [];
    void sendBatchAsync(toSend, keepalive).then((ok) => {
      if (!ok) {
        buffer = [...toSend, ...buffer];
      }
    });
  }

  /** Drains the buffer; only removes events after a successful POST. */
  async function flushAsync(keepalive = false): Promise<boolean> {
    if (buffer.length === 0) return true;
    const toSend = [...buffer];
    const ok = await sendBatchAsync(toSend, keepalive);
    if (ok) {
      buffer = [];
    }
    return ok;
  }

  function add(event: ValidatedEvent): boolean {
    if (!canAcceptEvent(event.title)) return false;
    const eventIndex = recordEventAccepted(event.title);
    buffer.push({ ...event, eventIndex });
    return true;
  }

  function getBufferSize(): number {
    return buffer.length;
  }

  function getBuffer(): BufferedEvent[] {
    return buffer;
  }

  return {
    add,
    flush,
    flushAsync,
    getBufferSize,
    getBuffer,
    get maxBufferSize() {
      return config.maxBufferSize;
    },
  };
}

export function getDefaultEventBufferConfig(): EventBufferConfig {
  return {
    maxEventsPerSession: MAX_EVENTS_PER_SESSION_DEFAULT,
    maxRepeatsPerEvent: MAX_REPEATS_PER_EVENT_DEFAULT,
    maxBufferSize: 100,
  };
}
