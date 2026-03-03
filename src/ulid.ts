/**
 * Minimal ULID implementation for session IDs.
 * Crockford's Base32, timestamp (10 chars) + random (16 chars).
 */
const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function generateULID(): string {
  const now = Date.now();
  const timePart = encodeTime(now, 10);
  const randomPart = encodeRandom(16);
  return timePart + randomPart;
}

function encodeTime(now: number, len: number): string {
  let str = "";
  for (let i = len; i > 0; i--) {
    str = ENCODING[now % 32] + str;
    now = Math.floor(now / 32);
  }
  return str;
}

function encodeRandom(len: number): string {
  const bytes = new Uint8Array(len);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < len; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let str = "";
  for (let i = 0; i < len; i++) {
    str += ENCODING[bytes[i] % 32];
  }
  return str;
}
