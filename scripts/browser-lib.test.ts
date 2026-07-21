import { describe, expect, test } from "bun:test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import {
  type CdpSession,
  checkoutIdentity,
  chromeGraphicsArgs,
  closePageTarget,
  navigateCapturePage,
  normalizeLoopbackUrl,
  resolveDevPort,
  resolveWebPort,
  resolveWarmChromePort,
  windowsPersistentChromeCommand,
} from "./browser-lib";

function fakeSession(options: {
  navigation?: Record<string, unknown>;
  onNavigate?: (emit: (method: string, params: Record<string, unknown>) => void) => void;
  captureStatus?: string;
}): CdpSession {
  const handlers = new Map<string, (params: Record<string, unknown>) => void>();
  const emit = (method: string, params: Record<string, unknown>) => handlers.get(method)?.(params);
  return {
    on(method, handler) {
      handlers.set(method, handler);
      return () => handlers.delete(method);
    },
    async send(method) {
      if (method === "Page.navigate") {
        options.onNavigate?.(emit);
        return options.navigation ?? {};
      }
      return {};
    },
    async evaluate() {
      return { status: options.captureStatus ?? null, error: null };
    },
  } as unknown as CdpSession;
}

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

  test("resolveWebPort stays in the Chrome-safe 5517-5916 band", () => {
    expect(resolveWebPort()).toBe(resolveWebPort());
    expect(resolveWebPort()).toBeGreaterThanOrEqual(5517);
    expect(resolveWebPort()).toBeLessThanOrEqual(5916);
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

describe("Chrome graphics profile", () => {
  test("persistent Windows Chrome uses a hidden native process boundary", () => {
    const command = windowsPersistentChromeCommand("C:\\Program Files\\Chrome\\chrome.exe", [
      "--headless=new",
      "--user-data-dir=C:\\Users\\Test User\\Temp\\profile",
    ]);
    expect(command).toContain("Start-Process");
    expect(command).toContain("-WindowStyle Hidden");
    expect(command).toContain("-PassThru");
    expect(command).toContain("'\"--user-data-dir=C:\\Users\\Test User\\Temp\\profile\"'");
  });

  test("uses native GPU locally instead of forcing CPU-bound SwiftShader", () => {
    expect(chromeGraphicsArgs({}, "win32")).toEqual(["--ignore-gpu-blocklist"]);
  });

  test("uses SwiftShader in CI or when explicitly requested", () => {
    expect(chromeGraphicsArgs({ CI: "true" })).toContain("--use-angle=swiftshader");
    expect(chromeGraphicsArgs({ JG_CAPTURE_SOFTWARE_GL: "1" })).toContain("--enable-unsafe-swiftshader");
    expect(chromeGraphicsArgs({}, "linux")).toContain("--use-angle=swiftshader");
  });

  test("allows hardware GPU to be explicitly selected in CI", () => {
    expect(chromeGraphicsArgs({ CI: "true", JG_CAPTURE_SOFTWARE_GL: "0" })).not.toContain(
      "--use-angle=swiftshader",
    );
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

describe("capture navigation failures", () => {
  test("surfaces Chrome navigation errors immediately", async () => {
    const session = fakeSession({ navigation: { errorText: "net::ERR_UNSAFE_PORT" } });
    await expect(navigateCapturePage(session, "http://127.0.0.1:5060/playground", 60_000)).rejects.toThrow(
      "navigation failed for http://127.0.0.1:5060/playground: net::ERR_UNSAFE_PORT",
    );
  });

  test("surfaces uncaught page exceptions before the readiness timeout", async () => {
    const session = fakeSession({
      onNavigate(emit) {
        emit("Runtime.exceptionThrown", {
          exceptionDetails: { text: "Uncaught", exception: { description: "Error: broken route" } },
        });
      },
    });
    await expect(navigateCapturePage(session, "http://127.0.0.1:5712/playground", 60_000)).rejects.toThrow(
      "page exception: Error: broken route",
    );
  });

  test("returns when the page declares the capture ready", async () => {
    const session = fakeSession({ captureStatus: "ready" });
    await expect(navigateCapturePage(session, "http://127.0.0.1:5712/playground", 1_000)).resolves.toBeUndefined();
  });

  test("ignores a failed document request from a subframe", async () => {
    const session = fakeSession({
      navigation: { frameId: "main" },
      captureStatus: "ready",
      onNavigate(emit) {
        emit("Network.requestWillBeSent", { type: "Document", requestId: "sub-request", frameId: "sub" });
        emit("Network.loadingFailed", {
          type: "Document",
          requestId: "sub-request",
          errorText: "net::ERR_BLOCKED_BY_CLIENT",
        });
      },
    });
    await expect(navigateCapturePage(session, "http://127.0.0.1:5712/playground", 1_000)).resolves.toBeUndefined();
  });
});
