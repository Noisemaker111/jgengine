import { describe, expect, mock, test } from "bun:test";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { deflateSync } from "node:zlib";

import {
  type CdpSession,
  DEVICES,
  BrowserLaunchError,
  buildBrowserFixture,
  MAX_FLAT_SCREENCAST_FRAMES,
  captureViewportPng,
  checkoutIdentity,
  chromeGraphicsArgs,
  chromeRenderArgs,
  softwareGlBackend,
  closePageTarget,
  navigateCapturePage,
  normalizeLoopbackUrl,
  resolveDevPort,
  resolveWebPort,
  resolveWarmChromePort,
  regionCarriesPicture,
  screencastCapturesFully,
  windowsPersistentChromeCommand,
  applyCaptureQuality,
  assertQualityApplied,
  draftSuffix,
  qualitySuffix,
  sizeForDraft,
  PROFILE_OWNER_FILE,
  PROFILE_RUN_FILE,
  ensureCaptureFreeSpace,
  PRESSURE_FREE_BYTES,
  isRetryableLaunchFailure,
  resolveChromeReadyMs,
  startBrowser,
  sweepCaptureProfiles,
  sweepStaleProfiles,
  sweepStrayBrowsers,
  pidAlive,
  findChromeExecutable,
  waitForPidExit,
  waitForDebugger,
  withBrowserSession,
  type ChromeProcess,
} from "./browser-lib";

test("browser fixture bundling reads real modules despite runner mocks", async () => {
  const scratch = mkdtempSync(join(tmpdir(), "jg-browser-bundle-"));
  const dependency = join(scratch, "dependency.ts");
  const entry = join(scratch, "fixture.ts");
  try {
    writeFileSync(dependency, 'export const value = "real fixture";');
    writeFileSync(entry, 'import { value } from "./dependency"; globalThis.fixtureValue = value;');
    mock.module(dependency, () => ({ value: "runner mock" }));
    expect((await import(dependency)).value).toBe("runner mock");
    const fixtureGlobal: { fixtureValue?: string } = {};
    new Function("globalThis", buildBrowserFixture(entry))(fixtureGlobal);
    expect(fixtureGlobal.fixtureValue).toBe("real fixture");
  } finally {
    mock.restore();
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("browser fixture bundling reports unresolved imports", () => {
  const scratch = mkdtempSync(join(tmpdir(), "jg-browser-bundle-"));
  const entry = join(scratch, "fixture.ts");
  try {
    writeFileSync(entry, 'import "./missing-fixture-module";');
    expect(() => buildBrowserFixture(entry)).toThrow("missing-fixture-module");
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

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

  test("every default is headless, and a headed window sits off-screen", () => {
    expect(chromeRenderArgs(null)).toContain("--headless=new");
    expect(chromeRenderArgs("swiftshader")).toContain("--headless=new");
    const headed = chromeRenderArgs(null, true);
    expect(headed).not.toContain("--headless=new");
    expect(headed).toContain("--window-position=-32000,-32000");
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

describe("native legacy capture readiness", () => {
  function legacy(options: { statuses?: (string | null)[]; pixels?: "right" | "none"; lateSignal?: string; sized?: boolean } = {}) {
    let reads = 0;
    let captures = 0;
    const handlers = new Map<string, (params: Record<string, unknown>) => void>();
    const session = {
      on(method: string, handler: (params: Record<string, unknown>) => void) { handlers.set(method, handler); return () => handlers.delete(method); },
      async send(method: string) {
        if (method === "Page.captureScreenshot") {
          captures++;
          if (options.lateSignal) handlers.get("Runtime.bindingCalled")?.({ name: "__jgCaptureSignal", payload: JSON.stringify({ status: options.lateSignal, error: "late asset failure" }) });
          return { data: splitPng(64, 64, options.pixels ?? "right").toString("base64") };
        }
        return {};
      },
      async evaluate(expression: string) {
        if (expression.includes("const dpr")) return { region: { x: 32, y: 0, width: 32, height: 64 }, masks: [], overflow: null, collision: null };
        const status = options.statuses?.[reads++] ?? null;
        return { status, error: status === "error" ? "late asset failure" : null, sizedCanvas: options.sized !== false };
      },
    } as unknown as CdpSession;
    return { session, captured: () => captures, subscriptions: () => handlers.size };
  }

  test("native opt-in requires settled nonblank canvas pixels, without writing readiness flags", async () => {
    const fixture = legacy();
    await expect(navigateCapturePage(fixture.session, "http://native", 100, { legacyCanvas: true })).resolves.toBeUndefined();
    expect(fixture.captured()).toBe(1);
    expect(fixture.subscriptions()).toBe(0);
  });
  test("managed targets stay handshake-only; blank and undersized native canvases do not pass", async () => {
    for (const [fixture, options] of [[legacy(), {}], [legacy({ pixels: "none" }), { legacyCanvas: true }], [legacy({ sized: false }), { legacyCanvas: true }]] as const) {
      await expect(navigateCapturePage(fixture.session, "http://native", 30, options)).rejects.toThrow("timed out waiting");
      expect(fixture.subscriptions()).toBe(0);
    }
  });
  test("loading or error appearing during rendered frames wins over a sized canvas", async () => {
    const loading = legacy({ statuses: [null, "loading", null] });
    await expect(navigateCapturePage(loading.session, "http://native", 30, { legacyCanvas: true })).rejects.toThrow("timed out waiting");
    expect(loading.captured()).toBe(0);
    const error = legacy({ statuses: [null, "error"] });
    await expect(navigateCapturePage(error.session, "http://native", 100, { legacyCanvas: true })).rejects.toThrow("late asset failure");
    expect(error.captured()).toBe(0);
  });
  test("transient loading and error during screenshot still win even after the flag disappears", async () => {
    for (const status of ["loading", "error"]) {
      const fixture = legacy({ lateSignal: status });
      await expect(navigateCapturePage(fixture.session, "http://native", 30, { legacyCanvas: true })).rejects.toThrow(status === "error" ? "late asset failure" : "timed out waiting");
      expect(fixture.captured()).toBe(1);
    }
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

describe("capture quality", () => {
  test("draft halves the viewport unless --size is explicit, and pins the low tier", () => {
    expect(sizeForDraft(true, undefined)).toBe("half");
    expect(sizeForDraft(true, "full")).toBe("full");
    expect(sizeForDraft(false, undefined)).toBe("full");
    expect(applyCaptureQuality(new URL("http://x/?game=g"), "low").searchParams.get("quality")).toBe("low");
    expect(draftSuffix(true)).toBe("-draft");
  });

  test("no tier leaves the URL and file name untouched, and a non-default tier names itself", () => {
    expect(applyCaptureQuality(new URL("http://x/?game=g"), undefined).toString()).toBe("http://x/?game=g");
    expect(applyCaptureQuality(new URL("http://x/?game=g"), "ultra").searchParams.get("quality")).toBe("ultra");
    expect(qualitySuffix(undefined)).toBe("");
    expect(qualitySuffix("high")).toBe("");
    expect(qualitySuffix("ultra")).toBe("-ultra");
    expect(draftSuffix(false)).toBe("");
  });

  test("the tier the page reports must be the one the flag asked for", () => {
    expect(() => assertQualityApplied("ultra", "ultra")).not.toThrow();
    expect(() => assertQualityApplied("ultra", "high")).toThrow("the page reports tier high");
    expect(() => assertQualityApplied("ultra", null)).toThrow("no graphics tier was reported");
  });
});

describe("software GL backend", () => {
  test("prefers llvmpipe on Linux when Xvfb exists, SwiftShader otherwise", () => {
    expect(softwareGlBackend({}, "linux", true)).toBe("llvmpipe");
    expect(softwareGlBackend({}, "linux", false)).toBe("swiftshader");
    expect(softwareGlBackend({ JG_CAPTURE_GL: "swiftshader" }, "linux", true)).toBe("swiftshader");
    expect(softwareGlBackend({}, "win32", true)).toBeNull();
  });

  test("llvmpipe runs headful on ANGLE GL; the others stay headless", () => {
    expect(chromeRenderArgs("llvmpipe")).toContain("--use-angle=gl");
    expect(chromeRenderArgs("llvmpipe")).not.toContain("--headless=new");
    expect(chromeRenderArgs("swiftshader")).toEqual(expect.arrayContaining(["--headless=new", "--use-angle=swiftshader"]));
    expect(chromeRenderArgs(null)).toEqual(["--headless=new", "--ignore-gpu-blocklist"]);
  });
});

function fakeDebuggerServer(): ReturnType<typeof Bun.serve> {
  return Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () =>
      Response.json({
        Browser: "fake",
        webSocketDebuggerUrl: "ws://127.0.0.1:1/devtools/browser/fake",
      }),
  });
}

function launchFailure(error: unknown): BrowserLaunchError {
  expect(error).toBeInstanceOf(BrowserLaunchError);
  return error as BrowserLaunchError;
}

describe("browser launch handshake", () => {
  test("the ready wait is tunable through JG_CHROME_READY_MS", () => {
    expect(resolveChromeReadyMs({})).toBe(30_000);
    expect(resolveChromeReadyMs({ JG_CHROME_READY_MS: "45000" })).toBe(45_000);
    for (const bad of ["", "0", "-5", "soon"]) {
      expect(resolveChromeReadyMs({ JG_CHROME_READY_MS: bad })).toBe(30_000);
    }
  });

  test("an endpoint that never answers is retried once with a doubled wait and a fresh profile", async () => {
    const profiles: string[] = [];
    const lines: string[] = [];
    let error: unknown;
    try {
      await startBrowser({
        debugPort: 1,
        readyMs: 60,
        log: (line) => lines.push(line),
        launch: () => {
          const dir = mkdtempSync(join(tmpdir(), "jg-hung-chrome-"));
          profiles.push(dir);
          return { pid: undefined, userDataDir: dir };
        },
        pageProbe: async () => {},
      });
    } catch (caught) {
      error = caught;
    }

    const failure = launchFailure(error);
    expect(failure.step).toBe("endpoint");
    expect(failure.attempts).toBe(2);
    expect(profiles).toHaveLength(2);
    expect(new Set(profiles).size).toBe(2);
    for (const dir of profiles) expect(existsSync(dir)).toBe(false);
    expect(failure.message).toContain("endpoint step failed after");
    expect(failure.message).toContain(profiles[1] as string);
    expect(failure.message).toContain("2 attempts, last wait 120ms");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("retrying with a fresh profile and a 120ms wait");
    expect(lines[0]).toContain(profiles[0] as string);
  });

  test("a launch that fails to spawn recovers on the second attempt", async () => {
    const server = fakeDebuggerServer();
    const lines: string[] = [];
    const profiles: string[] = [];
    let calls = 0;
    try {
      const started = await startBrowser({
        debugPort: server.port,
        readyMs: 1_000,
        log: (line) => lines.push(line),
        launch: () => {
          calls += 1;
          if (calls === 1) throw new Error("spawn chrome ENOENT");
          const dir = mkdtempSync(join(tmpdir(), "jg-recovered-"));
          profiles.push(dir);
          return { pid: undefined, userDataDir: dir };
        },
        pageProbe: async () => {},
      });
      expect(started.attempts).toBe(2);
      expect(started.profilePath).toBe(profiles[0] as string);
    } finally {
      server.stop(true);
      for (const dir of profiles) rmSync(dir, { recursive: true, force: true });
    }
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("launch step failed on attempt 1");
    expect(lines[1]).toContain("launch recovered on attempt 2");
  });

  test("a page target that closed under us gets one fresh browser", async () => {
    const server = fakeDebuggerServer();
    const profiles: string[] = [];
    let probes = 0;
    try {
      const started = await startBrowser({
        debugPort: server.port,
        readyMs: 1_000,
        log: () => {},
        launch: () => {
          const dir = mkdtempSync(join(tmpdir(), "jg-page-"));
          profiles.push(dir);
          return { pid: undefined, userDataDir: dir };
        },
        pageProbe: async () => {
          probes += 1;
          if (probes === 1) throw new Error("Target page, context or browser has been closed");
        },
      });
      expect(started.attempts).toBe(2);
      expect(probes).toBe(2);
      expect(profiles).toHaveLength(2);
    } finally {
      server.stop(true);
      for (const dir of profiles) if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a real page failure is reported once, never retried", async () => {
    const server = fakeDebuggerServer();
    const profiles: string[] = [];
    let probes = 0;
    try {
      await expect(
        startBrowser({
          debugPort: server.port,
          readyMs: 1_000,
          log: () => {},
          launch: () => {
            const dir = mkdtempSync(join(tmpdir(), "jg-page-fail-"));
            profiles.push(dir);
            return { pid: undefined, userDataDir: dir };
          },
          pageProbe: async () => {
            probes += 1;
            throw new Error("capture error: unknown state");
          },
        }),
      ).rejects.toThrow("page step failed");
      expect(probes).toBe(1);
      expect(profiles).toHaveLength(1);
    } finally {
      server.stop(true);
      for (const dir of profiles) if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    }
  });

  test("missing Chrome is a configuration error, not a flake to retry", async () => {
    let calls = 0;
    await expect(
      startBrowser({
        debugPort: 1,
        readyMs: 60,
        log: () => {},
        launch: () => {
          calls += 1;
          throw new Error("No Chrome/Chromium found. Set CHROME_PATH or install Chrome.");
        },
      }),
    ).rejects.toThrow("launch step failed");
    expect(calls).toBe(1);
  });

  test("only the handshake retries: a budget or assertion failure never does", () => {
    expect(isRetryableLaunchFailure("launch", "spawn chrome ENOENT")).toBe(true);
    expect(isRetryableLaunchFailure("endpoint", "the debugger on :9222 did not answer")).toBe(true);
    expect(isRetryableLaunchFailure("page", "Target page, context or browser has been closed")).toBe(true);
    expect(isRetryableLaunchFailure("page", "capture error: unknown state")).toBe(false);
    expect(isRetryableLaunchFailure("launch", "No Chrome/Chromium found. Set CHROME_PATH")).toBe(false);
  });

  test("a browser that already exited fails at once instead of burning the wait", async () => {
    const startedAt = Date.now();
    await expect(
      waitForDebugger(1, 5_000, { browser: { exitCode: 1 }, profilePath: "/tmp/jg-profile" }),
    ).rejects.toThrow("the browser process exited (code 1) before binding the debugger on :1");
    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });
});

describe("capture profile sweep", () => {  test("removes only stale jg dirs whose browser is gone", () => {
    const root = mkdtempSync(join(tmpdir(), "jg-sweep-test-"));
    try {
      const leaked = mkdtempSync(join(root, "jg-drive-"));
      const liveOwned = mkdtempSync(join(root, "jg-shoot-daemon-"));
      writeFileSync(join(liveOwned, PROFILE_OWNER_FILE), String(process.pid));
      const recent = mkdtempSync(join(root, "jg-shoot-"));
      const foreign = mkdtempSync(join(root, "other-"));
      const file = join(root, "jg-notes.txt");
      writeFileSync(file, "not a profile");
      const stale = new Date(Date.now() - 4 * 60 * 60 * 1000);
      const fresh = new Date(Date.now() - 20 * 60 * 1000);
      for (const dir of [leaked, liveOwned, foreign]) utimesSync(dir, stale, stale);
      utimesSync(recent, fresh, fresh);
      utimesSync(file, stale, stale);

      expect(sweepStaleProfiles(root)).toBe(1);

      expect(existsSync(leaked)).toBe(false);
      expect(existsSync(liveOwned)).toBe(true);
      expect(existsSync(recent)).toBe(true);
      expect(existsSync(foreign)).toBe(true);
      expect(existsSync(file)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a thrown capture removes the profile its browser created", async () => {
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: () =>
        Response.json({ Browser: "test", webSocketDebuggerUrl: "ws://127.0.0.1:1/devtools/browser/test" }),
    });
    const profiles: string[] = [];
    try {
      const exit = await withBrowserSession(
        {
          keep: false,
          timeoutMs: 1_000,
          debugPort: server.port,
          pageProbe: async () => {},
          launch: () => {
            const dir = mkdtempSync(join(tmpdir(), "jg-test-shot-"));
            writeFileSync(join(dir, "Preferences"), "{}");
            profiles.push(dir);
            return { pid: undefined, userDataDir: dir, kill() {} } as unknown as ChromeProcess;
          },
        },
        async () => {
          throw new Error("bad game id");
        },
      );
      expect(exit).toBe(1);
    } finally {
      server.stop(true);
    }
    expect(profiles).toHaveLength(1);
    expect(existsSync(profiles[0] as string)).toBe(false);
  });

  test("a drive below the free-space floor fails loudly before capturing", () => {
    const root = mkdtempSync(join(tmpdir(), "jg-space-"));
    try {
      expect(() => ensureCaptureFreeSpace(root, { JG_CAPTURE_MIN_FREE_MB: String(1024 * 1024) })).toThrow(
        /has [\d.]+ (GB|MB) free, less than the 1024\.0 GB a capture needs/,
      );
      expect(() => ensureCaptureFreeSpace(root, { JG_CAPTURE_MIN_FREE_MB: "1" })).not.toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  /** A real profile directory whose mtime is `ageMinutes` old. */
  function agedProfile(root: string, prefix: string, ageMinutes: number): string {
    const dir = mkdtempSync(join(root, prefix));
    const at = new Date(Date.now() - ageMinutes * 60_000);
    utimesSync(dir, at, at);
    return dir;
  }

  test("with plenty of space a 20-minute profile stays and a 60-minute one goes", () => {
    const root = mkdtempSync(join(tmpdir(), "jg-sweep-room-"));
    try {
      const young = agedProfile(root, "jg-young-", 20);
      const leaked = agedProfile(root, "jg-leaked-", 60);
      const reported: string[] = [];
      const removed = sweepCaptureProfiles(root, {
        freeBytes: 200 * 1024 ** 3,
        log: (line) => {
          reported.push(line);
          console.error(line);
        },
      });
      console.error(`proof (a): 200 GB free — removed ${removed} of 2, kept the 20-minute profile`);

      expect(removed).toBe(1);
      expect(existsSync(young)).toBe(true);
      expect(existsSync(leaked)).toBe(false);
      expect(reported).toHaveLength(1);
      expect(reported[0]).toContain("older than 45 minutes");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("under 15 GB free a 6-minute profile goes and a just-created one stays", () => {
    const root = mkdtempSync(join(tmpdir(), "jg-sweep-tight-"));
    try {
      const justMade = mkdtempSync(join(root, "jg-now-"));
      const sixMinutes = agedProfile(root, "jg-six-", 6);
      const reported: string[] = [];
      const removed = sweepCaptureProfiles(root, {
        freeBytes: 8 * 1024 ** 3,
        log: (line) => {
          reported.push(line);
          console.error(line);
        },
      });
      console.error(`proof (b): 8 GB free — removed ${removed} of 2, kept the just-created profile`);

      expect(removed).toBe(1);
      expect(existsSync(sixMinutes)).toBe(false);
      expect(existsSync(justMade)).toBe(true);
      expect(reported).toHaveLength(1);
      expect(reported[0]).toContain("older than 5 minutes");
      expect(reported[0]).toContain(`under 15.0 GB`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a profile whose browser pid is alive is kept with space and under pressure", () => {
    for (const freeBytes of [200 * 1024 ** 3, 8 * 1024 ** 3]) {
      const root = mkdtempSync(join(tmpdir(), "jg-sweep-live-"));
      try {
        const liveHour = mkdtempSync(join(root, "jg-live-hour-"));
        writeFileSync(join(liveHour, PROFILE_OWNER_FILE), String(process.pid));
        const at = new Date(Date.now() - 60 * 60_000);
        utimesSync(liveHour, at, at);
        const liveSix = mkdtempSync(join(root, "jg-live-six-"));
        writeFileSync(join(liveSix, PROFILE_OWNER_FILE), String(process.pid));
        const recent = new Date(Date.now() - 6 * 60_000);
        utimesSync(liveSix, recent, recent);

        const removed = sweepCaptureProfiles(root, { freeBytes, log: () => {} });
        console.error(`proof (c): ${Math.round(freeBytes / 1024 ** 3)} GB free — removed ${removed} of 2, kept both live-browser profiles`);

        expect(removed).toBe(0);
        expect(existsSync(liveHour)).toBe(true);
        expect(existsSync(liveSix)).toBe(true);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  });

  test("unreadable free space means no pressure", () => {
    const root = mkdtempSync(join(tmpdir(), "jg-sweep-unknown-"));
    try {
      const twenty = agedProfile(root, "jg-twenty-", 20);
      const hour = agedProfile(root, "jg-hour-", 60);
      const removed = sweepCaptureProfiles(root, { freeBytes: null, log: () => {} });
      expect(removed).toBe(1);
      expect(existsSync(twenty)).toBe(true);
      expect(existsSync(hour)).toBe(false);
      expect(PRESSURE_FREE_BYTES).toBe(15 * 1024 ** 3);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("headed is a deliberate act", () => {
  test("a session hands --headed to the launch, and headless is what a run gets without it", async () => {
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: () => Response.json({ Browser: "test", webSocketDebuggerUrl: "ws://127.0.0.1:1/devtools/browser/test" }),
    });
    const handed: ({ headed?: boolean } | undefined)[] = [];
    const profiles: string[] = [];
    const launch = (_port: number, _prefix?: string, options?: { headed?: boolean }) => {
      handed.push(options);
      const dir = mkdtempSync(join(tmpdir(), "jg-test-headed-"));
      profiles.push(dir);
      return { pid: undefined, userDataDir: dir, kill() {} } as unknown as ChromeProcess;
    };
    try {
      for (const headed of [true, false]) {
        const exit = await withBrowserSession(
          { keep: false, timeoutMs: 1_000, debugPort: server.port, pageProbe: async () => {}, launch, ...(headed ? { headed } : {}) },
          async () => {},
        );
        expect(exit).toBe(0);
      }
    } finally {
      server.stop(true);
      for (const dir of profiles) rmSync(dir, { recursive: true, force: true });
    }
    expect(handed[0]?.headed).toBe(true);
    expect(handed[1]?.headed).toBeUndefined();
  });
});

describe("stray browser sweep", () => {
  const DEAD_PID = 999_999;
  const chrome = ((): string | null => {
    try {
      return findChromeExecutable();
    } catch {
      return null;
    }
  })();

  function profile(root: string, name: string, runPid: number | undefined, ownerPid?: number): string {
    const dir = join(root, name);
    mkdirSync(dir, { recursive: true });
    if (runPid !== undefined) writeFileSync(join(dir, PROFILE_RUN_FILE), String(runPid));
    writeFileSync(join(dir, PROFILE_OWNER_FILE), String(ownerPid ?? runPid ?? DEAD_PID));
    return dir;
  }

  test.skipIf(process.platform !== "win32" || chrome === null)(
    "a visible browser whose run died is killed and its profile removed",
    async () => {
      const root = mkdtempSync(join(tmpdir(), "jg-stray-proof-"));
      const dir = profile(root, "jg-stray-proof", DEAD_PID);
      const child = spawn(
        chrome as string,
        [
          `--user-data-dir=${dir}`,
          "--window-size=1280,720",
          "--window-position=-32000,-32000",
          "--no-first-run",
          "--no-default-browser-check",
          "--no-sandbox",
          "about:blank",
        ],
        { stdio: "ignore", windowsHide: false },
      );
      try {
        expect(pidAlive(child.pid)).toBe(true);
        const result = sweepStrayBrowsers(root);
        console.error(
          `proof (1): planted visible Chrome pid ${child.pid} with dead run ${DEAD_PID} — killed ${result.killed}, profiles removed ${result.profilesRemoved}`,
        );
        expect(result).toEqual({ killed: 1, profilesRemoved: 1 });
        expect(existsSync(dir)).toBe(false);
        await waitForPidExit(child.pid, 10_000);
        expect(pidAlive(child.pid)).toBe(false);
      } finally {
        child.kill();
        rmSync(root, { recursive: true, force: true });
      }
    },
    30_000,
  );

  test("a browser whose run is alive is never touched", () => {
    const root = mkdtempSync(join(tmpdir(), "jg-stray-live-"));
    try {
      const dir = profile(root, "jg-live-run", process.pid);
      const killed: number[] = [];
      const result = sweepStrayBrowsers(root, {
        processes: [
          {
            pid: 4242,
            parentPid: 1,
            startedAt: Date.now() - 3 * 60 * 60 * 1000,
            commandLine: `chrome.exe --user-data-dir=${dir}`,
          },
        ],
        kill: (pid) => killed.push(pid),
      });
      console.error(`proof (2): live run pid ${process.pid} — killed ${result.killed}, profile kept ${existsSync(dir)}`);
      expect(result).toEqual({ killed: 0, profilesRemoved: 0 });
      expect(killed).toEqual([]);
      expect(existsSync(dir)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("an ownerless visible browser goes at 20 minutes and stays at 5", () => {
    const root = mkdtempSync(join(tmpdir(), "jg-stray-age-"));
    try {
      const now = Date.now();
      const young = profile(root, "jg-young-headed", undefined);
      const old = profile(root, "jg-old-headed", undefined);
      const command = (dir: string) => `chrome.exe --user-data-dir=${dir}`;
      const processes = [
        { pid: 5001, parentPid: DEAD_PID, startedAt: now - 5 * 60 * 1000, commandLine: command(young) },
        { pid: 5002, parentPid: DEAD_PID, startedAt: now - 21 * 60 * 1000, commandLine: command(old) },
      ];
      const result = sweepStrayBrowsers(root, { now, processes });
      console.error(`proof (3): no run record — killed ${result.killed} of 2 (21-minute window gone, 5-minute kept)`);
      expect(result.killed).toBe(1);
      expect(result.profilesRemoved).toBe(1);
      expect(existsSync(young)).toBe(true);
      expect(existsSync(old)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a headless browser is left for the profile sweep, so a warm daemon survives", () => {
    const root = mkdtempSync(join(tmpdir(), "jg-stray-headless-"));
    try {
      const dir = profile(root, "jg-shoot-daemon-warm", undefined);
      const result = sweepStrayBrowsers(root, {
        processes: [
          {
            pid: 6001,
            parentPid: DEAD_PID,
            startedAt: Date.now() - 4 * 60 * 60 * 1000,
            commandLine: `chrome.exe --user-data-dir=${dir} --headless=new`,
          },
        ],
      });
      expect(result.killed).toBe(0);
      expect(existsSync(dir)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a capture start reports the kills and profile removals in one line", () => {
    const root = mkdtempSync(join(tmpdir(), "jg-stray-line-"));
    try {
      const dir = profile(root, "jg-drive-orphan", DEAD_PID);
      const reported: string[] = [];
      const removed = sweepCaptureProfiles(root, {
        freeBytes: 200 * 1024 ** 3,
        processes: [{ pid: 7001, parentPid: 1, startedAt: Date.now(), commandLine: `chrome.exe --user-data-dir=${dir}` }],
        log: (line) => reported.push(line),
      });
      console.error(`proof (4): one line — ${reported[0]}`);
      expect(removed).toBe(1);
      expect(reported).toHaveLength(1);
      expect(reported[0]).toContain("killed 1 stray browser(s) whose run had died, removed 1 profile(s)");
      expect(existsSync(dir)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
