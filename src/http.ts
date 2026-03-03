export interface HttpConfig {
  baseUrl: string;
  projectId: string;
  apiKey: string;
}

export function post(
  config: HttpConfig,
  path: string,
  body: object,
  options?: { keepalive?: boolean }
): void {
  const url = `${config.baseUrl.replace(/\/$/, "")}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "project-id": config.projectId,
    "testchimp-api-key": config.apiKey,
  };

  const init: RequestInit = {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    keepalive: options?.keepalive ?? false,
  };

  fetch(url, init).catch(() => {
    // Fire-and-forget: ignore errors
  });
}
