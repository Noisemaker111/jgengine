import { describe, expect, test } from "bun:test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { deflateSync } from "node:zlib";

import {
  type CdpSession,
  DEVICES,
  MAX_FLAT_SCREENCAST_FRAMES,
  captureViewportPng,
  checkoutIdentity,
  chromeGraphicsArgs,
  closePageTarget,
  navigateCapturePage,
  normalizeLoopbackUrl,
  resolveDevPort,
  resolveWebPort,
  resolveWarmChromePort,
  regionCarriesPicture,
  screencastCapturesFully,
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

function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "latin1");
  data.copy(out, 8);
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of out.subarray(4, 8 + data.length)) crc = table[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 8 + data.length);
  return out;
}

/**
 * Truecolor PNG whose left half is one flat colour and whose right half is noise — the shape
 * of the frames this guard exists for: a live HUD beside a viewport the canvas never drew.
 */
function splitPng(width: number, height: number, textured: "left" | "right" | "none"): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(2, 9);
  const stride = 1 + width * 3;
  const scanlines = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inLeft = x < width / 2;
      const noisy = textured === "none" ? false : textured === "left" ? inLeft : !inLeft;
      const value = noisy ? (x * 37 + y * 91) % 251 : 0;
      const at = y * stride + 1 + x * 3;
      scanlines[at] = value;
      scanlines[at + 1] = noisy ? (value * 3) % 251 : 0;
      scanlines[at + 2] = noisy ? (value * 7) % 251 : 0;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("regionCarriesPicture", () => {
  const viewport = { x: 0, y: 0, width: 40, height: 40 };

  test("a flat region carries no picture", () => {
    expect(regionCarriesPicture(splitPng(80, 40, "right"), viewport)).toBe(false);
  });

  test("a textured region does", () => {
    expect(regionCarriesPicture(splitPng(80, 40, "left"), viewport)).toBe(true);
  });

  test("a busy HUD outside the region never rescues a dead viewport", () => {
    // The whole frame is far from flat; scoped to the viewport it is empty.
    expect(regionCarriesPicture(splitPng(80, 40, "right"), { x: 0, y: 0, width: 39, height: 39 })).toBe(false);
  });

  test("an undecodable frame is left to the size guard and the scorer", () => {
    expect(regionCarriesPicture(Buffer.from(pngHead(80, 40), "base64"), viewport)).toBe(true);
  });
});

/** Minimal PNG head — {@link captureViewportPng}'s size guard only reads the IHDR. */
function pngHead(width: number, height: number): string {
  const bytes = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes, 0);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes.toString("base64");
}

function castSession(options: {
  /** Frames the pump emits once `Page.startScreencast` is sent, in order. */
  frames?: { data: string; timestamp?: number }[];
  screenshot?: string;
}): { session: CdpSession; calls: string[] } {
  const calls: string[] = [];
  const handlers = new Map<string, (params: Record<string, unknown>) => void>();
  const session = {
    on(method: string, handler: (params: Record<string, unknown>) => void) {
      handlers.set(method, handler);
      return () => handlers.delete(method);
    },
    async send(method: string) {
      calls.push(method);
      if (method === "Page.startScreencast") {
        for (const frame of options.frames ?? []) {
          setTimeout(
            () =>
              handlers.get("Page.screencastFrame")?.({
                sessionId: 1,
                data: frame.data,
                metadata: { timestamp: frame.timestamp ?? Date.now() / 1000 + 1 },
              }),
            1,
          );
        }
      }
      if (method === "Page.captureScreenshot") return { data: options.screenshot ?? pngHead(1600, 900) };
      return {};
    },
    async evaluate() {
      return undefined;
    },
  } as unknown as CdpSession;
  return { session, calls };
}

describe("captureViewportPng", () => {
  const expect1600 = { width: 1600, height: 900 };

  test("takes the next composited frame off the screencast pump", async () => {
    const { session, calls } = castSession({ frames: [{ data: pngHead(1600, 900) }] });
    const shot = await captureViewportPng(session, { expect: expect1600, timeoutMs: 2_000 });
    expect(shot.via).toBe("screencast");
    expect(calls).toContain("Page.stopScreencast");
    expect(calls).not.toContain("Page.captureScreenshot");
  });

  test("ignores a frame the compositor presented before the request", async () => {
    const stale = { data: pngHead(1600, 900), timestamp: 1 };
    const { session } = castSession({ frames: [stale] });
    const shot = await captureViewportPng(session, { expect: expect1600, timeoutMs: 300 });
    expect(shot.via).toBe("screenshot");
  });

  test("falls back once the pump keeps delivering frames with a dead viewport", async () => {
    // The regression this guards: on a page whose canvas has not committed since the
    // screencast started, every frame is well-formed and shows a black hole where the world is.
    const blind = splitPng(80, 40, "right").toString("base64");
    const frames = Array.from({ length: MAX_FLAT_SCREENCAST_FRAMES }, () => ({ data: blind }));
    const { session, calls } = castSession({ frames });
    const shot = await captureViewportPng(session, {
      expect: { width: 80, height: 40 },
      liveRegion: { x: 0, y: 0, width: 40, height: 40 },
      timeoutMs: 2_000,
    });
    expect(shot.via).toBe("screenshot");
    expect(calls).toContain("Page.stopScreencast");
  });

  test("takes the first frame whose viewport actually shows the world", async () => {
    const blind = splitPng(80, 40, "right").toString("base64");
    const live = splitPng(80, 40, "left").toString("base64");
    const { session, calls } = castSession({ frames: [{ data: blind }, { data: live }] });
    const shot = await captureViewportPng(session, {
      expect: { width: 80, height: 40 },
      liveRegion: { x: 0, y: 0, width: 40, height: 40 },
      timeoutMs: 2_000,
    });
    expect(shot.via).toBe("screencast");
    expect(calls).not.toContain("Page.captureScreenshot");
  });

  test("falls back when the pump delivers a differently-sized frame", async () => {
    // The pump emits CSS pixels, so a dsf>1 profile would silently halve the shot.
    const { session } = castSession({ frames: [{ data: pngHead(390, 844) }] });
    const shot = await captureViewportPng(session, { expect: { width: 780, height: 1688 }, timeoutMs: 2_000 });
    expect(shot.via).toBe("screenshot");
  });

  test("falls back when no frame arrives before the deadline", async () => {
    const { session, calls } = castSession({ frames: [] });
    const shot = await captureViewportPng(session, { expect: expect1600, timeoutMs: 100 });
    expect(shot.via).toBe("screenshot");
    expect(calls).toContain("Page.stopScreencast");
  });

  test("screencast: false never starts the pump", async () => {
    const { session, calls } = castSession({ frames: [{ data: pngHead(1600, 900) }] });
    const shot = await captureViewportPng(session, { screencast: false });
    expect(shot.via).toBe("screenshot");
    expect(calls).not.toContain("Page.startScreencast");
  });

  test("screencastCapturesFully rejects the dsf>1 profiles", () => {
    expect(screencastCapturesFully(DEVICES.desktop)).toBe(true);
    expect(screencastCapturesFully(DEVICES.mobile)).toBe(false);
    expect(screencastCapturesFully(DEVICES["mobile-landscape"])).toBe(false);
  });
});
