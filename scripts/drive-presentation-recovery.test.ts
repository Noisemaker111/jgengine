import { describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:http";

import { localGetJson, localOk } from "./localhostHttp";

/**
 * drive-presentation-recovery.ts reads its fixture with node:http so the readiness check cannot be answered by a
 * proxy. This covers that contract: frontend and realm answers through the same helper the script calls.
 */

async function fixture(status: number, body: unknown): Promise<{ url: URL; stop: () => Promise<void> }> {
  const server: Server = createServer((_request, response) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  return {
    url: new URL(`http://127.0.0.1:${address.port}`),
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function withDeadProxy<T>(run: () => Promise<T>): Promise<T> {
  const saved = new Map<string, string | undefined>();
  for (const name of ["HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy", "NO_PROXY", "no_proxy"]) {
    saved.set(name, process.env[name]);
    process.env[name] = name.toLowerCase().includes("no_proxy") ? "" : "http://127.0.0.1:9";
  }
  return run().finally(() => {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
}

describe("drive-presentation-recovery.ts fixture readiness", () => {
  test("frontend and realm reads its revision with a dead HTTP_PROXY set", async () => {
    const endpoint = await fixture(200, { revision: "abc123", component: "frontend and realm" });
    try {
      const revision = new URL("/__version", endpoint.url);
      expect(await withDeadProxy(() => localOk(revision, 2_000))).toBe(true);
      const identity = await withDeadProxy(() => localGetJson(revision, 2_000));
      expect(identity).toEqual({ revision: "abc123", component: "frontend and realm" });
    } finally {
      await endpoint.stop();
    }
  });

  test("a fixture that is not up is a false readiness, never a pass", async () => {
    expect(await withDeadProxy(() => localOk(new URL("http://127.0.0.1:1/__version"), 300))).toBe(false);
  });
});
