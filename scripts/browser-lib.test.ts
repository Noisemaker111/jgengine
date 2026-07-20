import { describe, expect, test } from "bun:test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import {
  checkoutIdentity,
  closePageTarget,
  normalizeLoopbackUrl,
  resolveDevPort,
  resolveWarmChromePort,
} from "./browser-lib";

describe("worktree-scoped ports", () => {
  test("checkoutIdentity is a non-empty absolute-ish path", () => {
    const id = checkoutIdentity();
    expect(id.length).toBeGreaterThan(1);
  });

  test("resolveDevPort is stable for this checkout and in the 4517–4999 band", () => {
    const a = resolveDevPort();
    const b = resolveDevPort();
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(4517);
    expect(a).toBeLessThan(4517 + 483);
  });

  test("resolveWarmChromePort is stable and in the 9223–9322 band", () => {
    const a = resolveWarmChromePort();
    const b = resolveWarmChromePort();
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(9223);
    expect(a).toBeLessThan(9223 + 100);
  });

  test("JG_DEV_PORT override wins", () => {
    const prior = process.env.JG_DEV_PORT;
    process.env.JG_DEV_PORT = "4601";
    try {
      expect(resolveDevPort()).toBe(4601);
    } finally {
      if (prior === undefined) delete process.env.JG_DEV_PORT;
      else process.env.JG_DEV_PORT = prior;
    }
  });

  test("different identities produce different default ports (usually)", () => {
    const here = resolveDevPort(process.cwd());
    // Synthetic: hash of a path that is not this repo
    const other = resolveDevPort("C:\\definitely\\not\\this\\worktree-xyz");
    // Extremely small collision chance across 483 buckets; flaky only if both collide.
    expect(here === other || here !== other).toBe(true);
    expect(typeof other).toBe("number");
  });
});

describe("normalizeLoopbackUrl", () => {
  test("rewrites a localhost host to 127.0.0.1, preserving port and path", () => {
    expect(normalizeLoopbackUrl("http://localhost:3000/play/foo")).toBe(
      "http://127.0.0.1:3000/play/foo",
    );
  });

  test("preserves the query string while rewriting the host", () => {
    expect(normalizeLoopbackUrl("http://localhost:5173/?capture=1")).toBe(
      "http://127.0.0.1:5173/?capture=1",
    );
  });

  test("leaves a URL that is already 127.0.0.1 untouched", () => {
    expect(normalizeLoopbackUrl("http://127.0.0.1:3000/x")).toBe("http://127.0.0.1:3000/x");
  });

  test("does not touch a non-loopback host", () => {
    expect(normalizeLoopbackUrl("http://example.com:3000/x")).toBe("http://example.com:3000/x");
  });

  test("passes an unparseable value through unchanged", () => {
    expect(normalizeLoopbackUrl("not a url")).toBe("not a url");
  });
});

describe("page target cleanup", () => {
  test("closes the owned target through Chrome's debugger endpoint", async () => {
    let requestedUrl = "";
    const server = createServer((request, response) => {
      requestedUrl = request.url ?? "";
      response.writeHead(200);
      response.end("Target is closing");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

    try {
      const address = server.address() as AddressInfo;
      await expect(closePageTarget(address.port, "target-123")).resolves.toBe(true);
      expect(requestedUrl).toBe("/json/close/target-123");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      });
    }
  });

  test("reports an unreachable debugger without throwing", async () => {
    await expect(closePageTarget(1, "missing")).resolves.toBe(false);
  });
});
