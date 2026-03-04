const TITLE_MAX_LENGTH = 100;
const METADATA_MAX_KEYS = 10;
const METADATA_KEY_MAX_LENGTH = 50;
const METADATA_STRING_VALUE_MAX_LENGTH = 200;
const METADATA_MAX_ARRAY_LENGTH = 50;
const EVENT_MAX_SIZE_BYTES = 5 * 1024;

/** Primitive or array of primitives only (no nested objects). */
type Primitive = string | number | boolean | null;
type StructValue = Primitive | Primitive[];

/**
 * Metadata shape for events/session: keys with primitive or primitive[] values only.
 * No nested objects; invalid entries are dropped at runtime.
 */
export type Struct = Record<string, unknown>;

export interface EmitInput {
  title: string;
  metadata?: Struct;
}

export interface ValidatedEvent {
  title: string;
  timestampMillis: number;
  metadata?: Struct;
}

function isPrimitive(v: unknown): v is Primitive {
  return v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

function validateStruct(obj: unknown): { ok: true; value: Struct } | { ok: false; reason: string } {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return { ok: false, reason: "metadata must be a plain object" };
  }
  const keys = Object.keys(obj);
  if (keys.length > METADATA_MAX_KEYS) {
    return { ok: false, reason: `metadata has more than ${METADATA_MAX_KEYS} keys` };
  }
  const out: Struct = {};
  for (const k of keys) {
    if (k.length > METADATA_KEY_MAX_LENGTH) {
      return { ok: false, reason: `metadata key exceeds ${METADATA_KEY_MAX_LENGTH} chars` };
    }
    const v = (obj as Record<string, unknown>)[k];
    if (Array.isArray(v)) {
      if (v.length > METADATA_MAX_ARRAY_LENGTH) {
        return { ok: false, reason: `metadata array length exceeds ${METADATA_MAX_ARRAY_LENGTH}` };
      }
      for (let i = 0; i < v.length; i++) {
        const item = v[i];
        if (!isPrimitive(item)) {
          return { ok: false, reason: "metadata array values must be string, number, boolean, or null" };
        }
        if (typeof item === "string" && item.length > METADATA_STRING_VALUE_MAX_LENGTH) {
          return { ok: false, reason: `metadata string in array exceeds ${METADATA_STRING_VALUE_MAX_LENGTH} chars` };
        }
      }
      out[k] = v as StructValue;
    } else if (isPrimitive(v)) {
      if (typeof v === "string" && v.length > METADATA_STRING_VALUE_MAX_LENGTH) {
        return { ok: false, reason: `metadata string value exceeds ${METADATA_STRING_VALUE_MAX_LENGTH} chars` };
      }
      out[k] = v;
    } else {
      return { ok: false, reason: "metadata values must be primitive or array of primitives (no nested objects)" };
    }
  }
  return { ok: true, value: out };
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

  let metadata: Struct | undefined;
  if (input.metadata != null && typeof input.metadata === "object" && !Array.isArray(input.metadata)) {
    const result = validateStruct(input.metadata);
    if (!result.ok) {
      console.warn(`[testchimp-rum] Event dropped: ${result.reason}`);
      return null;
    }
    metadata = Object.keys(result.value).length > 0 ? result.value : undefined;
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

export function validateSessionMetadata(metadata?: Struct): Struct | undefined {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
  const result = validateStruct(metadata);
  if (!result.ok) return undefined;
  return Object.keys(result.value).length > 0 ? result.value : undefined;
}
