import { request as httpRequest, type IncomingHttpHeaders } from "node:http";

/**
 * One HTTP client for addresses on this machine: `node:http`, never `fetch`.
 *
 * Bun's fetch sends `127.0.0.1` through `HTTP_PROXY`, so on a machine with a corporate
 * proxy every local probe — dev server, debugger, fixture — reads as refused in about a
 * millisecond (#2278). `node:http` has no proxy in it, so a local probe answers the same
 * wherever the process runs. Anything reaching a real network address keeps using fetch.
 */
export interface LocalResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

const MAX_BODY_BYTES = 4 * 1_048_576;

export function localRequest(
  url: string | URL,
  options: { method?: string; timeoutMs: number; maxBytes?: number } = { timeoutMs: 1_000 },
): Promise<LocalResponse> {
  return new Promise((resolve, reject) => {
    const target = typeof url === "string" ? new URL(url) : url;
    const request = httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname + target.search,
        method: options.method ?? "GET",
        headers: { connection: "close" },
      },
      (response) => {
        let body = "";
        const limit = options.maxBytes ?? MAX_BODY_BYTES;
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          if (body.length < limit) body += chunk;
        });
        response.on("end", () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body }));
        response.on("error", reject);
      },
    );
    request.setTimeout(options.timeoutMs, () =>
      request.destroy(new Error(`localhost ${target.pathname} timed out after ${options.timeoutMs}ms`)),
    );
    request.on("error", reject);
    request.end();
  });
}

/** The body of a 2xx local response; any other status rejects with the status attached. */
export async function localGet(url: string | URL, timeoutMs: number, method = "GET"): Promise<string> {
  const response = await localRequest(url, { method, timeoutMs });
  if (response.status < 200 || response.status >= 300) {
    throw Object.assign(new Error(`localhost ${new URL(url).pathname} answered ${response.status}`), {
      status: response.status,
    });
  }
  return response.body;
}

/** Parse a 2xx local JSON response. */
export async function localGetJson<T = unknown>(url: string | URL, timeoutMs: number, method = "GET"): Promise<T> {
  return JSON.parse(await localGet(url, timeoutMs, method)) as T;
}

/** True when a local address answers 2xx within the timeout. */
export async function localOk(url: string | URL, timeoutMs: number): Promise<boolean> {
  try {
    const response = await localRequest(url, { timeoutMs });
    return response.status >= 200 && response.status < 300;
  } catch {
    return false;
  }
}
