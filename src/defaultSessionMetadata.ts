import type { Struct } from "./validation";

const MAX_LEN = 200;

function truncate(s: string): string {
  return s.length <= MAX_LEN ? s : s.slice(0, MAX_LEN);
}

function getBrowser(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent ?? "";
  if (/Edg\//i.test(ua)) return "Edge";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return "Safari";
  if (/OPR\//i.test(ua)) return "Opera";
  return truncate(ua.slice(0, 50)) || "unknown";
}

function getDeviceType(): string {
  if (typeof navigator === "undefined" || typeof window === "undefined") return "unknown";
  const ua = navigator.userAgent ?? "";
  const uaData = navigator as unknown as { userAgentData?: { mobile?: boolean } };
  if (uaData.userAgentData?.mobile === true) {
    if (/iPad/i.test(ua) || (/Mac/i.test(ua) && typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 0)) return "tablet";
    return "mobile";
  }
  if (/Tablet|iPad/i.test(ua)) return "tablet";
  if (/Mobile|Android/i.test(ua) && !/iPad/i.test(ua)) return "mobile";
  return "desktop";
}

function getOs(): string {
  if (typeof navigator === "undefined") return "unknown";
  const uaData = navigator as unknown as { userAgentData?: { platform?: string }; platform?: string };
  const platform = (uaData.userAgentData?.platform ?? uaData.platform ?? navigator.userAgent ?? "").toLowerCase();
  if (platform.includes("win")) return "windows";
  if (platform.includes("mac") || platform === "macintel") return "mac";
  if (platform.includes("linux") || platform === "linux") return "linux";
  if (platform.includes("iphone") || platform.includes("ipod")) return "ios";
  if (platform.includes("ipad")) return "ios";
  if (platform.includes("android")) return "android";
  return truncate(platform || "unknown");
}

function getLanguage(): string {
  if (typeof navigator === "undefined") return "unknown";
  const lang = navigator.language ?? (navigator as unknown as { userLanguage?: string }).userLanguage;
  return truncate(lang ?? "unknown");
}

function getTimezone(): string {
  try {
    if (typeof Intl === "undefined" || !Intl.DateTimeFormat) return "unknown";
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return truncate(tz ?? "unknown");
  } catch {
    return "unknown";
  }
}

/**
 * Returns client-derived default metadata for session init only.
 * Safe to call in non-browser environments (returns {}).
 */
export function getDefaultSessionMetadata(): Struct {
  if (typeof navigator === "undefined") return {};
  return {
    _browser: getBrowser(),
    _device_type: getDeviceType(),
    _os: getOs(),
    _language: getLanguage(),
    _timezone: getTimezone(),
  };
}
