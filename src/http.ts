/**
 * Simple HTTP client for browser or Node.
 * Uses global fetch (browser, or Node 18+).
 */

function getFetch(): typeof fetch {
  if (typeof fetch !== "undefined") return fetch;
  throw new Error(
    "testchimp-rum-js: fetch is not available. Use a browser or Node 18+."
  );
}

export interface HttpConfig {
  baseUrl: string;
  projectId: string;
  apiKey: string;
}

/**
 * CI test info injected by Playwright runtime (TrueCoverage); sent as ci-test-info header on RUM ingest.
 */
function getCiTestInfoHeader(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { __TC_CI_TEST_INFO?: string };
  const v = w.__TC_CI_TEST_INFO;
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function buildUrl(config: HttpConfig, path: string): string {
  const base = config.baseUrl.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

/**
 * POST to a path under config.baseUrl with auth headers (projectId, apiKey) and optional ci-test-info.
 */
export async function post(
  config: HttpConfig,
  path: string,
  body: unknown,
  options?: { keepalive?: boolean }
): Promise<boolean> {
  try {
    const url = buildUrl(config, path);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Project-Id": config.projectId,
      "TestChimp-Api-Key": config.apiKey,
      ...(options?.keepalive && { "Keep-Alive": "true" }),
    };
    const ciTestInfo = getCiTestInfoHeader();
    if (ciTestInfo) {
      headers["ci-test-info"] = ciTestInfo;
    }
    const res = await getFetch()(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}
