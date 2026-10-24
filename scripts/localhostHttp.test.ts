import { describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:http";

import { localGet, localGetJson, localOk, localRequest } from "./localhostHttp";

async function server(
  handler: (path: string, response: import("node:http").ServerResponse) => void,
): Promise<{ port: number; stop: () => Promise<void> }> {
  const listener: Server = createServer((request, response) => handler(request.url ?? "/", response));
  await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const address = listener.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  return { port: address.port, stop: () => new Promise<void>((resolve) => listener.close(() => resolve())) };
}

function withProxy<T>(run: () => Promise<T>): Promise<T> {
  const saved = new Map<string, string | undefined>();
  for (const name of ["HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy", "NO_PROXY", "no_proxy"]) {
    saved.set(name, process.env[name]);
    if (name === "NO_PROXY" || name === "no_proxy") process.env[name] = "";
    else process.env[name] = "http://127.0.0.1:9";
  }
  return run().finally(() => {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
}

describe("localhostHttp", () => {
  test("a local probe still answers with a dead HTTP_PROXY set", async () => {
    const endpoint = await server((_path, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ webSocketDebuggerUrl: "ws://127.0.0.1:1/devtools" }));
    });
    try {
      const body = await withProxy(async () => localGetJson<{ webSocketDebuggerUrl: string }>(
        `http://127.0.0.1:${endpoint.port}/json/version`,
        2_000,
      ));
      expect(body.webSocketDebuggerUrl).toBe("ws://127.0.0.1:1/devtools");
      expect(await withProxy(() => localOk(`http://127.0.0.1:${endpoint.port}/json/version`, 2_000))).toBe(true);
    } finally {
      await endpoint.stop();
    }
  });

  test("a non-2xx answer rejects with the status, and a 3xx still answers", async () => {
    const endpoint = await server((path, response) => {
      response.writeHead(path === "/missing" ? 404 : 302, path === "/missing" ? {} : { location: "/" });
      response.end(path === "/missing" ? "no" : "");
    });
    try {
      let status: number | undefined;
      await localGet(`http://127.0.0.1:${endpoint.port}/missing`, 2_000).catch((error: { status?: number }) => {
        status = error.status;
      });
      expect(status).toBe(404);
      const redirect = await localRequest(`http://127.0.0.1:${endpoint.port}/moved`, { timeoutMs: 2_000 });
      expect(redirect.status).toBe(302);
      expect(await localOk(`http://127.0.0.1:${endpoint.port}/missing`, 2_000)).toBe(false);
    } finally {
      await endpoint.stop();
    }
  });

  test("a socket that never answers times out instead of hanging", async () => {
    const endpoint = await server(() => {
      /* hold the response open */
    });
    try {
      const startedAt = Date.now();
      await expect(localGet(`http://127.0.0.1:${endpoint.port}/json/version`, 250)).rejects.toThrow(
        /timed out after 250ms/,
      );
      expect(Date.now() - startedAt).toBeLessThan(2_000);
    } finally {
      await endpoint.stop();
    }
  });

  test("a closed port is a rejection, not a false success", async () => {
    expect(await localOk("http://127.0.0.1:1/json/version", 500)).toBe(false);
  });
});
