const TITLE_MAX_LENGTH = 100;
const METADATA_MAX_KEYS = 10;
const METADATA_KEY_MAX_LENGTH = 50;
const METADATA_VALUE_MAX_LENGTH = 200;
const EVENT_MAX_SIZE_BYTES = 5 * 1024;

export interface EmitInput {
  title: string;
  metadata?: Record<string, string>;
}

export interface ValidatedEvent {
  title: string;
  timestampMillis: number;
  metadata?: Record<string, string>;
}

export function validateEvent(input: EmitInput): ValidatedEvent | null {
  if (!input.title || typeof input.title !== "string") {
    console.warn("[testchimp-rum] Event dropped: title is required");
    return null;
  }
  if (input.title.length > TITLE_MAX_LENGTH) {
    console.warn(`[testchimp-rum] Event dropped: title exceeds ${TITLE_MAX_LENGTH} chars`);
    return null;
  }

  let metadata = input.metadata;
  if (metadata && typeof metadata === "object") {
    const keys = Object.keys(metadata);
    if (keys.length > METADATA_MAX_KEYS) {
      console.warn(`[testchimp-rum] Event dropped: metadata has more than ${METADATA_MAX_KEYS} keys`);
      return null;
    }
    const filtered: Record<string, string> = {};
    for (const k of keys) {
      if (k.length > METADATA_KEY_MAX_LENGTH) {
        console.warn(`[testchimp-rum] Event dropped: metadata key exceeds ${METADATA_KEY_MAX_LENGTH} chars`);
        return null;
      }
      const v = metadata[k];
      if (typeof v === "string" && v.length > METADATA_VALUE_MAX_LENGTH) {
        console.warn(`[testchimp-rum] Event dropped: metadata value exceeds ${METADATA_VALUE_MAX_LENGTH} chars`);
        return null;
      }
      if (typeof v === "string") {
        filtered[k] = v;
      }
    }
    metadata = Object.keys(filtered).length > 0 ? filtered : undefined;
  }

  const event: ValidatedEvent = {
    title: input.title,
    timestampMillis: Date.now(),
    metadata,
  };

  const serialized = JSON.stringify(event);
  if (new TextEncoder().encode(serialized).length > EVENT_MAX_SIZE_BYTES) {
    console.warn(`[testchimp-rum] Event dropped: total size exceeds ${EVENT_MAX_SIZE_BYTES} bytes`);
    return null;
  }

  return event;
}

export function validateSessionMetadata(metadata?: Record<string, string>): Record<string, string> | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const keys = Object.keys(metadata);
  if (keys.length > METADATA_MAX_KEYS) return undefined;
  const filtered: Record<string, string> = {};
  for (const k of keys) {
    if (k.length <= METADATA_KEY_MAX_LENGTH && typeof metadata[k] === "string" && metadata[k].length <= METADATA_VALUE_MAX_LENGTH) {
      filtered[k] = metadata[k];
    }
  }
  return Object.keys(filtered).length > 0 ? filtered : undefined;
}
