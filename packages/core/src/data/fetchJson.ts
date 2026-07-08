export type FetchImpl = typeof fetch;

export interface FetchJsonOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  fetchImpl?: FetchImpl;
}

export class HttpStatusError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly url: string;

  constructor(status: number, statusText: string, url: string) {
    super(`HTTP ${status} ${statusText} for ${url}`);
    this.name = "HttpStatusError";
    this.status = status;
    this.statusText = statusText;
    this.url = url;
  }
}

export class JsonParseError extends Error {
  readonly url: string;
  readonly cause: unknown;

  constructor(url: string, cause: unknown) {
    super(`failed to parse JSON response from ${url}`);
    this.name = "JsonParseError";
    this.url = url;
    this.cause = cause;
  }
}

export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(url, {
    method: options.method,
    headers: options.headers,
    body: options.body,
    signal: options.signal,
  });
  if (!response.ok) {
    throw new HttpStatusError(response.status, response.statusText, url);
  }
  const text = await response.text();
  if (text.length === 0) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch (cause) {
    throw new JsonParseError(url, cause);
  }
}
