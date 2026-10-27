import { dispatchClickAt, parseClickAt } from "../clickInput";
import { BROWSER_LAUNCH_BLOCK } from "./browserLaunch";
import { CAPTURE_FLAGS, captureFlagHelp, parseCaptureArgs, rejectEngineOnlyFlags } from "./captureArgs";
import { awaitGameView, holdDriveInput } from "./driveSteps";
import { acquireDrivePointerLock, aimDriveAt, lookDrivePointer, moveDrivePointer } from "./driveAim";
import { driveInputPointExpr } from "./driveInput";
import { focusGameSurface, gameSurfaceCenter, holdComplete, mouseButtonForCode } from "./gameSurfaceFocus";

// The dependency-free WebGL capture + drive harness `jgengine shoot` / `jgengine drive` run for any
// game project: browser.mjs holds the shared Chrome/CDP plumbing; shoot.mjs and drive.mjs are thin
// CLIs over it. Games do not carry copies; the CLI writes these to a temp folder and runs them with
// node. All three are kept free of backticks and \${ so they embed cleanly here.
export const browserLibMjs = `/**
 * browser.mjs — shared Chrome/CDP machinery for scripts/shoot.mjs and
 * scripts/drive.mjs. No Playwright, no npm deps — just Chrome/Chromium +
 * Node 22+ (or Bun). If Chrome is not auto-detected, set CHROME_PATH.
 * Not a CLI; run shoot.mjs or drive.mjs instead.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { inflateSync } from "node:zlib";

export ${parseClickAt.toString()}

export ${dispatchClickAt.toString()}

// Shared with the engine's bun run shoot/drive (packages/jgengine/src/templates/captureArgs.ts).
export const CAPTURE_FLAGS = ${JSON.stringify(CAPTURE_FLAGS)};

export ${parseCaptureArgs.toString()}

export ${rejectEngineOnlyFlags.toString()}

export ${captureFlagHelp.toString()}

export ${holdDriveInput.toString()}

export ${awaitGameView.toString()}

export ${acquireDrivePointerLock.toString()}

export ${moveDrivePointer.toString()}

export ${lookDrivePointer.toString()}

export ${aimDriveAt.toString()}

/** Parse argv for a portable harness: the shared flag table, minus what only the engine runner honors. */
export function parsePortableArgs(tool, argv) {
  const parsed = parseCaptureArgs(tool, argv, CAPTURE_FLAGS);
  if (!parsed.help) rejectEngineOnlyFlags(parsed, CAPTURE_FLAGS);
  return parsed;
}

/** Viewport for a portable run: device defaults, --width/--height overrides, then --size half. */
export function portableViewport(options) {
  const profile = DEVICES[options.device ?? "desktop"];
  if (profile === undefined) throw new Error("--device both is engine-only here; pass desktop, mobile, or mobile-landscape");
  const scale = options.size === "half" ? 0.5 : 1;
  const width = Math.round((options.width !== undefined ? Number(options.width) : profile.width) * scale);
  const height = Math.round((options.height !== undefined ? Number(options.height) : profile.height) * scale);
  return { profile, width, height };
}

export const DEVICES = {
  desktop: { width: 1600, height: 900, dsf: 1, mobile: false },
  mobile: { width: 390, height: 844, dsf: 2, mobile: true },
  "mobile-landscape": { width: 844, height: 390, dsf: 2, mobile: true },
};

export async function emulateDevice(session, profile, width = profile.width, height = profile.height) {
  await session.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: profile.dsf,
    mobile: profile.mobile,
  });
  await session.send("Emulation.setTouchEmulationEnabled", {
    enabled: profile.mobile,
    maxTouchPoints: profile.mobile ? 5 : 1,
  });
}

export const driveInputPointExpr = ${driveInputPointExpr.toString()};

export function clickPointExpr(text) {
  return driveInputPointExpr(text);
}

const SETTLE_EPSILON_PX = 0.5;
const SETTLE_SAMPLES = 3;
const SETTLE_INTERVAL_MS = 100;
const SETTLE_TIMEOUT_MS = 45_000;
const SETTLE_MAX_SAMPLES = 10;

export async function findClickPoint(session, text, options = {}) {
  const deadline = (options.now || Date.now)() + (options.timeoutMs || SETTLE_TIMEOUT_MS);
  let last = null;
  let stableRuns = 0;
  for (let samples = 0; samples < SETTLE_MAX_SAMPLES && (options.now || Date.now)() < deadline; samples += 1) {
    const point = (await session.evaluate(driveInputPointExpr(text, options.input), { timeoutMs: Math.max(1, deadline - (options.now || Date.now)()) })) ?? null;
    if ((options.now || Date.now)() >= deadline) break;
    const moved = point !== null && last !== null &&
      (Math.abs(point.x - last.x) > SETTLE_EPSILON_PX || Math.abs(point.y - last.y) > SETTLE_EPSILON_PX);
    if (point !== null && last !== null && !moved) {
      stableRuns += 1;
      if (stableRuns >= SETTLE_SAMPLES - 1) return point;
    } else {
      stableRuns = 0;
    }
    last = point;
    await (options.sleep || sleep)(Math.min(deadline - (options.now || Date.now)(), point === null || moved ? 1_000 : SETTLE_INTERVAL_MS));
  }
  if (last === null) throw new Error('no actionable element matching "' + text + '"');
  throw new Error('element matching "' + text + '" did not settle');
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.JG_CHROME,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe",
    "C:\\\\Program Files (x86)\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];
  for (const c of candidates) {
    if (c !== undefined && c.length > 0 && existsSync(c)) return c;
  }
  // Playwright's bundled Chromium (also present in many CI/agent images).
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";
  if (existsSync(root)) {
    const direct = join(root, "chromium");
    if (existsSync(direct) && statSync(direct).isFile()) return direct;
    for (const entry of readdirSync(root)) {
      if (!entry.startsWith("chromium")) continue;
      for (const c of [
        join(root, entry, "chrome-linux", "chrome"),
        join(root, entry, "chrome-linux", "headless_shell"),
      ]) {
        if (existsSync(c)) return c;
      }
    }
  }
  throw new Error("No Chrome/Chromium found. Install Chrome or set CHROME_PATH.");
}

/**
 * Launch headless Chrome. Every attempt gets its own profile directory, so a launch retry
 * never reuses the profile the failed attempt left behind.
 */
export function launchChrome(port, prefix) {
  const chrome = findChrome();
  const userDataDir = mkdtempSync(join(tmpdir(), prefix ?? "jg-shoot-"));
  const child = spawn(
    chrome,
    [
      "--remote-debugging-port=" + port,
      "--user-data-dir=" + userDataDir,
      "--headless=new",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--mute-audio",
      "--hide-scrollbars",
      // Software WebGL so the scene renders even with no GPU (headless/CI).
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  child.userDataDir = userDataDir;
  return child;
}

export async function isUp(url) {
  try {
    await localGet(url, 1000);
    return true;
  } catch (error) {
    // a served-but-routed page still means Vite is up
    return error !== null && typeof error === "object" && error.status === 404;
  }
}

${BROWSER_LAUNCH_BLOCK}

/** Kill the launched Chrome and server when this process is interrupted, so no browser outlives it. */
export function shutdownOnSignal(getChrome, server) {
  for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]]) {
    process.once(signal, () => {
      shutdown(getChrome(), server);
      process.exit(code);
    });
  }
}

/** Start the game's Vite dev server if nothing is already serving base. */
export async function ensureDevServer(base, port) {
  if (await isUp(base)) return null;
  // Run vite's own JS entry with this node: Windows refuses to spawn a .cmd shim without a shell.
  let bin = null;
  try {
    bin = join(dirname(createRequire(join(process.cwd(), "package.json")).resolve("vite/package.json")), "bin", "vite.js");
  } catch {
    bin = null;
  }
  if (bin === null || !existsSync(bin)) {
    throw new Error(
      "nothing is serving " + base + " and this project has no vite installed.\\n" +
        "Start your dev server first (bun dev) or run 'bun install'.",
    );
  }
  const child = spawn(process.execPath, [bin, "--port", String(port), "--host", "127.0.0.1", "--strictPort"], {
    stdio: "ignore",
    detached: process.platform !== "win32",
  });
  for (let i = 0; i < 120; i += 1) {
    await sleep(500);
    if (await isUp(base)) return child;
  }
  child.kill();
  throw new Error("dev server failed to start on port " + port);
}

export class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 0;
    this.pending = new Map();
    ws.addEventListener("message", (event) => {
      let msg;
      try {
        msg = JSON.parse(typeof event.data === "string" ? event.data : "");
      } catch {
        return;
      }
      if (msg.id === undefined) return;
      const waiter = this.pending.get(msg.id);
      if (waiter === undefined) return;
      this.pending.delete(msg.id);
      clearTimeout(waiter.timer);
      if (msg.error !== undefined) waiter.reject(new Error(msg.error.message));
      else waiter.resolve(msg.result ?? {});
    });
    ws.addEventListener("close", () => this.rejectPending("CDP connection closed"));
    ws.addEventListener("error", () => this.rejectPending("CDP connection error"));
  }

  static connect(url, timeoutMs) {
    return new Promise((res, rej) => {
      const ws = new WebSocket(url);
      const timer = setTimeout(() => {
        ws.close();
        rej(new Error("CDP connect timeout"));
      }, timeoutMs);
      ws.addEventListener("open", () => {
        clearTimeout(timer);
        res(new Cdp(ws));
      });
      ws.addEventListener("error", () => {
        clearTimeout(timer);
        rej(new Error("CDP connect error"));
      });
    });
  }

  send(method, params, timeoutMs = 30_000) {
    const id = ++this.nextId;
    return new Promise((res, rej) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rej(new Error("CDP " + method + " timed out after " + timeoutMs + "ms"));
      }, timeoutMs);
      this.pending.set(id, { resolve: res, reject: rej, timer });
      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        rej(error);
      }
    });
  }

  rejectPending(message) {
    for (const waiter of this.pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error(message));
    }
    this.pending.clear();
  }

  async evaluate(expression, opts) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      ...(opts && opts.awaitPromise ? { awaitPromise: true } : {}),
    }, opts && opts.timeoutMs !== undefined ? opts.timeoutMs : 30_000);
    return result.result ? result.result.value : undefined;
  }

  close() {
    this.rejectPending("CDP session closed");
    this.ws.close();
  }
}

export async function openPage(debugPort) {
  for (const method of ["PUT", "GET"]) {
    try {
      const info = JSON.parse(await localGet("http://127.0.0.1:" + debugPort + "/json/new?about:blank", 10_000, method));
      if (info.webSocketDebuggerUrl) return Cdp.connect(info.webSocketDebuggerUrl, 15_000);
    } catch {
      /* try next */
    }
  }
  const pages = JSON.parse(await localGet("http://127.0.0.1:" + debugPort + "/json/list", 5_000));
  const page = pages.find((p) => p.type === "page" && p.webSocketDebuggerUrl);
  if (!page) throw new Error("no CDP page target available");
  return Cdp.connect(page.webSocketDebuggerUrl, 15_000);
}

// Reads the honesty signals in one round-trip: the optional jgCapture handshake
// (set by some hosts) plus the live canvas element size + backing-store size.
export const HONESTY_EXPR =
  "(function(){var r=document.documentElement;var c=document.querySelector('canvas');" +
  "return {cap:r.dataset.jgCapture||null,err:r.dataset.jgCaptureError||null," +
  "hasCanvas:!!c,cw:c?c.clientWidth:0,ch:c?c.clientHeight:0,bw:c?c.width:0,bh:c?c.height:0," +
  "loading:!!document.querySelector('[data-shell-code-loading]')};})()";
export const RAF_EXPR =
  "new Promise(function(res){requestAnimationFrame(function(){requestAnimationFrame(function(){res(1);});});})";

export function writePngAtomic(outPath, bytes) {
  mkdirSync(dirname(outPath), { recursive: true });
  const tmp = outPath + ".tmp";
  writeFileSync(tmp, bytes);
  if (existsSync(outPath)) unlinkSync(outPath);
  renameSync(tmp, outPath);
}

export async function waitForHonestFrame(session, url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last;
  let handshakeSeen = false;
  while (Date.now() < deadline) {
    const s = await session.evaluate(HONESTY_EXPR, { timeoutMs: Math.max(1, deadline - Date.now()) });
    last = s;
    if (s && s.cap !== null && s.cap !== undefined) handshakeSeen = true;
    if (s && s.cap === "error") throw new Error("page reported a capture error: " + (s.err || "unknown"));
    if (s && s.cap === "ready") return s;
    // The shell's "Loading game view…" fallback can sit beside an already-sized canvas; never call that ready.
    if (!handshakeSeen && s && !s.loading && s.hasCanvas && s.cw > 10 && s.ch > 10 && s.bw > 10 && s.bh > 10) return s;
    await sleep(100);
  }
  throw new Error(
    "timed out after " +
      Math.round(timeoutMs / 1000) +
      "s waiting for an honest frame at " +
      url +
      (handshakeSeen
        ? " — data-jg-capture stayed " + JSON.stringify(last && last.cap) + "; the page must report ready or error."
        : " — no sized <canvas> with a nonempty backing store (last: " + JSON.stringify(last) + "). Is the game being served there?"),
  );
}

/** Decode an 8-bit, non-interlaced PNG (what Page.captureScreenshot emits) into raw pixels. */
export function decodePng(bytes) {
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[data[9]] ?? 0;
      if (data[8] !== 8 || data[12] !== 0) channels = 0;
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  if (channels === 0) return null;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? px[row + x - channels] : 0;
      const b = y > 0 ? px[row - stride + x] : 0;
      const c = x >= channels && y > 0 ? px[row - stride + x - channels] : 0;
      let v = raw[src + x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[row + x] = v & 255;
    }
  }
  return { width, height, channels, px };
}

// A viewport that is one flat fill (a canvas that never drew, a cleared background
// with nothing on it) has almost no luminance spread; any rendered scene has plenty.
export function isBlankFrame(pngBytes) {
  const image = decodePng(pngBytes);
  if (image === null || image.width === 0 || image.height === 0) return false;
  const { width, height, channels, px } = image;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 64));
  let n = 0;
  let sum = 0;
  let sumSq = 0;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * channels;
      const lum = channels >= 3 ? 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2] : px[i];
      n += 1;
      sum += lum;
      sumSq += lum * lum;
    }
  }
  const mean = sum / n;
  return Math.sqrt(Math.max(0, sumSq / n - mean * mean)) < 2;
}

/**
 * Capture the current frame to a PNG (atomic write). A blank viewport is retried for
 * up to blankWaitMs, then refused: nothing is written and the capture fails.
 */
export async function screenshotTo(session, outPath, blankWaitMs = 10_000, timeoutMs = 30_000) {
  const deadline = Date.now() + blankWaitMs;
  const captureDeadline = Date.now() + timeoutMs;
  for (;;) {
    if (Date.now() >= captureDeadline) throw new Error("Page.captureScreenshot timed out after " + timeoutMs + "ms");
    const shot = await session.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
    }, Math.max(1, captureDeadline - Date.now()));
    if (typeof shot.data !== "string" || shot.data.length === 0) {
      throw new Error("Page.captureScreenshot returned no data");
    }
    const bytes = Buffer.from(shot.data, "base64");
    if (!isBlankFrame(bytes)) {
      writePngAtomic(outPath, bytes);
      return;
    }
    if (Date.now() >= deadline) {
      throw new Error(
        "viewport stayed one flat color for " +
          Math.round(blankWaitMs / 1000) +
          "s — the game drew nothing. Check the page console, or raise --settle if it loads slowly.",
      );
    }
    await sleep(500);
  }
}

/** Delete a capture's temp Chrome profile; Chrome releases its files a moment after it exits. */
export function removeProfileDir(userDataDir) {
  if (!userDataDir) return;
  const pause = new Int32Array(new SharedArrayBuffer(4));
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      rmSync(userDataDir, { recursive: true, force: true });
      return;
    } catch {
      Atomics.wait(pause, 0, 0, 200);
    }
  }
}

/** Kill the launched Chrome and (when we started it) the dev server tree, then drop the profile. */
export function shutdown(chrome, server) {
  try {
    if (chrome) chrome.kill();
  } catch {
    /* ignore */
  }
  if (server) {
    try {
      if (process.platform !== "win32" && server.pid) process.kill(-server.pid, "SIGKILL");
      else server.kill();
    } catch {
      /* ignore */
    }
  }
  if (chrome) removeProfileDir(chrome.userDataDir);
}
`;

export const shootMjs = `#!/usr/bin/env node
/**
 * shoot.mjs — dependency-free WebGL/R3F screenshot for this JGengine game.
 *
 * Why this exists: generic "screenshot this tab" tools routinely fail on a
 * WebGL canvas. They grab a frame before the GPU has drawn, and
 * React-Three-Fiber's canvas stays stuck at its 300x150 default whenever its
 * parent never reports a real size. This script drives your own Vite dev
 * server through Chrome's DevTools Protocol instead: it forces a real viewport
 * (so the canvas sizes correctly), waits for an honestly-painted frame, then
 * pulls pixels with Page.captureScreenshot. No Playwright, no npm deps — just
 * Chrome/Chromium + Node 22+ (or Bun).
 *
 *   node scripts/shoot.mjs                          # 1600x900 -> shots/shot.png
 *   node scripts/shoot.mjs --device mobile          # 390x844
 *   node scripts/shoot.mjs --out shots/hud.png --settle 1500
 *   node scripts/shoot.mjs --url http://127.0.0.1:5173/?mode=editor
 *
 * Runs under 'bun scripts/shoot.mjs' too. If Chrome is not auto-detected, set
 * CHROME_PATH. The dev server is started for you when it is not already up.
 * To drive the game (clicks, key holds, RPC, playtest), use scripts/drive.mjs.
 */
import { join, resolve } from "node:path";
import {
  awaitGameView,
  captureFlagHelp,
  CAPTURE_FLAGS,
  emulateDevice,
  ensureDevServer,
  openPage,
  parsePortableArgs,
  portableViewport,
  RAF_EXPR,
  screenshotTo,
  shutdown,
  shutdownOnSignal,
  sleep,
  startBrowser,
  waitForHonestFrame,
} from "./browser.mjs";

const HELP = [
  "shoot.mjs — screenshot this JGengine game (WebGL-safe, dependency-free)",
  "",
  captureFlagHelp("shoot", "bundled", CAPTURE_FLAGS),
  "",
  "Needs Chrome/Chromium (set CHROME_PATH if not auto-detected).",
  "To play/test the game from the CLI, see scripts/drive.mjs (bun run drive).",
].join("\\n");

async function main() {
  const parsed = parsePortableArgs("shoot", process.argv.slice(2));
  if (parsed.help) {
    console.log(HELP);
    return 0;
  }
  const o = parsed.options;
  const { profile, width, height } = portableViewport(o);
  const port = o.port !== undefined ? Number(o.port) : 5173;
  const settle = o.settle !== undefined ? Number(o.settle) : 2000;
  const timeoutMs = (o.timeout !== undefined ? Number(o.timeout) : 60) * 1000;
  const base = "http://127.0.0.1:" + port;
  const target = new URL(o.url ?? base);
  target.searchParams.set("capture", "1"); // honored by hosts that set data-jg-capture; ignored otherwise
  for (const pair of o.param ?? []) target.searchParams.set(pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1));
  const url = target.toString();
  const outPath = resolve(o.out ?? join("shots", "shot.png"));

  const server = await ensureDevServer(o.url ?? base, port);
  let chrome = null;
  shutdownOnSignal(() => chrome, server);

  let exitCode = 0;
  try {
    const started = await startBrowser({ debugPort: 0, prefix: "jg-shoot-" });
    chrome = started.chrome;
    const session = await openPage(started.debugPort);
    try {
      await session.send("Page.enable");
      await session.send("Runtime.enable");
      // The fix for R3F's 300x150 default: give the page a real viewport BEFORE it lays out.
      await emulateDevice(session, profile, width, height);
      await session.send("Page.navigate", { url });
      const frame = await waitForHonestFrame(session, url, timeoutMs);
      if (frame && frame.bw === 300 && frame.bh === 150) {
        console.error(
          "shoot: warning — canvas backing store is 300x150 (React-Three-Fiber's unsized default). " +
            "Its parent has no real size; ensure html/body/#root have height:100%.",
        );
      }
      // Let the scene paint a couple of frames, then settle for late assets.
      await session.evaluate(RAF_EXPR, { awaitPromise: true });
      await sleep(settle);
      await awaitGameView(session, timeoutMs, { sleep, now: () => Date.now() });
      await screenshotTo(session, outPath, 10_000, timeoutMs);
      console.log(outPath + " (" + width + "x" + height + " " + (o.device ?? "desktop") + ")");
    } finally {
      session.close();
    }
  } catch (error) {
    exitCode = 1;
    console.error("shoot: " + (error instanceof Error ? error.message : String(error)).replace(/^(drive|shoot): /, ""));
  } finally {
    shutdown(chrome, server);
  }
  return exitCode;
}

try {
  process.exit(await main());
} catch (error) {
  console.error("shoot: " + (error instanceof Error ? error.message : String(error)).replace(/^(drive|shoot): /, ""));
  process.exit(1);
}
`;

export const driveMjs = `#!/usr/bin/env node
/**
 * drive.mjs — play and test this JGengine game from the CLI: ordered clicks,
 * key holds, waits, screenshots, agent-bridge RPC, and a bot-playtest
 * softlock verdict. Dependency-free (Chrome/Chromium + Node 22+ or Bun) — the
 * supported way to drive a running game headlessly. Never hand-roll a
 * Playwright/Puppeteer/CDP script for this game; whatever that script would
 * do, a drive invocation (or an engine issue) is the answer.
 *
 *   node scripts/drive.mjs --click "START" --shot menu-cleared
 *   node scripts/drive.mjs --key KeyW:2500 --shot walked
 *   node scripts/drive.mjs --key mouse0:1200 --shot fired   (hold a mouse button over the canvas)
 *   node scripts/drive.mjs --rpc '{"method":"agent_status"}'
 *   node scripts/drive.mjs --rpc '{"method":"debug_snapshot"}'
 *   node scripts/drive.mjs --playtest --key KeyW:4000 --strict
 *
 * The dev server is started for you when it is not already up. RPC talks to
 * window.__jgengineAgent — agent_status, debug_snapshot, editor verbs — on the
 * running page. --playtest samples the game's capture.probe metrics while your
 * --key/--click-at steps drive input and prints a JSON progress/softlock verdict.
 */
import { isAbsolute, join, resolve } from "node:path";
import {
  awaitGameView,
  captureFlagHelp,
  CAPTURE_FLAGS,
  dispatchClickAt,
  parseClickAt,
  findClickPoint,
  driveInputPointExpr,
  emulateDevice,
  ensureDevServer,
  holdDriveInput,
  openPage,
  parsePortableArgs,
  portableViewport,
  RAF_EXPR,
  screenshotTo,
  shutdown,
  shutdownOnSignal,
  sleep,
  startBrowser,
  waitForHonestFrame,
} from "./browser.mjs";

const HELP = [
  "drive.mjs — play/test this JGengine game from the CLI (WebGL-safe, dependency-free)",
  "",
  captureFlagHelp("drive", "bundled", CAPTURE_FLAGS),
  "",
  "Needs Chrome/Chromium (set CHROME_PATH if not auto-detected).",
].join("\\n");

function parseArgs(argv) {
  const parsed = parsePortableArgs("drive", argv);
  const o = parsed.options;
  const args = {
    help: parsed.help,
    url: o.url,
    port: o.port !== undefined ? Number(o.port) : 5173,
    device: o.device ?? "desktop",
    viewport: portableViewport(o),
    settle: o.settle !== undefined ? Number(o.settle) : 0,
    params: o.param ?? [],
    timeoutMs: (o.timeout !== undefined ? Number(o.timeout) : 60) * 1000,
    steps: parsed.steps,
    playtest: o.playtest === true,
    strict: o.strict === true,
    seed: o.seed !== undefined ? Number(o.seed) : 1,
    sampleMs: o.sample !== undefined ? Number(o.sample) : 250,
    softlockMs: o.softlock !== undefined ? Number(o.softlock) : 2000,
    epsilon: o.epsilon !== undefined ? Number(o.epsilon) : 1e-3,
  };
  if (!args.help && !args.playtest && !args.steps.some((s) => s.kind === "shot" || s.kind === "rpc" || s.kind === "probe")) {
    args.steps.push({ kind: "shot", name: "drive" });
  }
  if (args.steps.some((s) => s.kind === "reload") && args.playtest) {
    throw new Error("--reload cannot reset the clock during --playtest; use a separate recovery drive");
  }
  return args;
}

async function click(session, text, count = 1, input = false) {
  await session.send("Page.bringToFront");
  const point = await findClickPoint(session, text, { input });
  for (let clickCount = 1; clickCount <= count; clickCount += 1) {
    for (const type of ["mousePressed", "mouseReleased"]) {
      await session.send("Input.dispatchMouseEvent", {
        type, x: point.x, y: point.y, button: "left", clickCount,
      });
    }
  }
}

async function fill(session, label, value) {
  await click(session, label, 1, true);
  if (!await session.evaluate(driveInputPointExpr(label, true, true))) {
    throw new Error('text field "' + label + '" did not receive focus');
  }
  await session.send("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", modifiers: 2, commands: ["selectAll"] });
  await session.send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", modifiers: 2 });
  await session.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
  await session.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
  if (value) await session.send("Input.insertText", { text: value });
  await session.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await session.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
}

const focusGameSurface = ${focusGameSurface.toString()};
const holdComplete = ${holdComplete.toString()};
const mouseButtonForCode = ${mouseButtonForCode.toString()};
const gameSurfaceCenter = ${gameSurfaceCenter.toString()};

async function holdKey(session, code, holdMs, until) {
  await holdDriveInput(session, code, holdMs, { focusGameSurface, holdComplete, mouseButtonForCode, gameSurfaceCenter, sleep, now: () => Date.now() }, until);
}

async function rpc(session, json) {
  const value = await session.evaluate(
    "(async function(){var host=globalThis.__jgengineAgent||globalThis.__jgengineEditorHost;" +
      "if(host===undefined)return JSON.stringify({ok:false,error:'no agent bridge or editor host on this page'});" +
      "return JSON.stringify(await host.handle(" + json + "));})()",
    { awaitPromise: true },
  );
  console.log(value ?? JSON.stringify({ ok: false, error: "rpc evaluation returned nothing" }));
}

async function readProbe(session) {
  const value = await session.evaluate(
    "(function(){var probe=globalThis.__jgProbe;" +
      "if(typeof probe!=='function')return null;" +
      "try{var v=probe();if(v===null||typeof v!=='object')return null;" +
      "var out={};for(var k in v){var n=v[k];if(typeof n==='number'&&isFinite(n))out[k]=n;}return out;}" +
      "catch(e){return null;}})()",
  );
  return value ?? null;
}

// Playtest verdict logic, mirroring the engine's playtest rung: progress is any
// probe metric moving beyond epsilon; a span where every metric stays flat
// longer than the softlock threshold, while input is driven, is a softlock.
function metricKeys(samples) {
  const keys = new Set();
  for (const sample of samples) {
    for (const key of Object.keys(sample.metrics)) keys.add(key);
  }
  return [...keys];
}

function progressDelta(samples) {
  const out = {};
  for (const key of metricKeys(samples)) {
    let first;
    let last;
    for (const sample of samples) {
      const value = sample.metrics[key];
      if (value === undefined) continue;
      if (first === undefined) first = value;
      last = value;
    }
    if (first !== undefined && last !== undefined) out[key] = last - first;
  }
  return out;
}

// Longest contiguous span (ms) where every metric's range stays within epsilon.
// A bot that circles back to its start still shows a wide range and reads as
// moving; only a genuinely stuck loop stays flat.
function longestFlatWindowMs(samples, epsilon) {
  if (samples.length < 2) return 0;
  const keys = metricKeys(samples);
  let best = 0;
  for (let start = 0; start < samples.length; start += 1) {
    const min = {};
    const max = {};
    for (let end = start; end < samples.length; end += 1) {
      const metrics = samples[end].metrics;
      for (const key of keys) {
        const value = metrics[key];
        if (value === undefined) continue;
        min[key] = key in min ? Math.min(min[key], value) : value;
        max[key] = key in max ? Math.max(max[key], value) : value;
      }
      let flat = true;
      for (const key of Object.keys(max)) {
        if (max[key] - min[key] > epsilon) {
          flat = false;
          break;
        }
      }
      if (!flat) break;
      const span = samples[end].t - samples[start].t;
      if (span > best) best = span;
    }
  }
  return best;
}

function summarizePlaytest(samples, options) {
  const probed = samples.length > 0;
  const delta = progressDelta(samples);
  const totalProgress = Object.values(delta).reduce((sum, value) => sum + Math.abs(value), 0);
  const softlockWindowMs = longestFlatWindowMs(samples, options.epsilon);
  const durationMs = probed ? samples[samples.length - 1].t - samples[0].t : 0;
  const softlocked =
    probed && durationMs >= options.softlockThresholdMs && softlockWindowMs >= options.softlockThresholdMs;
  return {
    seed: options.seed,
    framesElapsed: samples.length,
    durationMs,
    progressDelta: delta,
    totalProgress,
    softlockWindowMs,
    softlocked,
    probed,
  };
}

async function navigate(session, url, timeoutMs, settle) {
  await session.send("Page.navigate", { url });
  await waitForHonestFrame(session, url, timeoutMs);
  await session.evaluate(RAF_EXPR, { awaitPromise: true });
  await sleep(500 + settle);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return 0;
  }

  const { profile, width, height } = args.viewport;
  for (const step of args.steps) {
    if (step.kind === "click-at") step.point = parseClickAt(step.spec, width, height);
  }
  let pointer = null;
  const base = "http://127.0.0.1:" + args.port;
  const target = new URL(args.url ?? base);
  target.searchParams.set("capture", "1");
  for (const pair of args.params) target.searchParams.set(pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1));
  if (args.playtest) target.searchParams.set("seed", String(args.seed));
  const url = target.toString();

  const server = await ensureDevServer(args.url ?? base, args.port);
  let chrome = null;
  shutdownOnSignal(() => chrome, server);

  let exitCode = 0;
  try {
    const started = await startBrowser({ debugPort: 0, prefix: "jg-drive-" });
    chrome = started.chrome;
    const session = await openPage(started.debugPort);
    try {
      await session.send("Page.enable");
      await session.send("Runtime.enable");
      await emulateDevice(session, profile, width, height);
      await navigate(session, url, args.timeoutMs, args.settle);

      const samples = [];
      let sampling = args.playtest;
      const sampleStart = Date.now();
      const sampler = args.playtest
        ? (async () => {
            while (sampling) {
              const metrics = await readProbe(session);
              if (metrics !== null) samples.push({ t: Date.now() - sampleStart, metrics });
              await sleep(args.sampleMs);
            }
          })()
        : Promise.resolve();

      for (const step of args.steps) {
        if (step.kind === "click" || step.kind === "double-click") await click(session, step.text, step.kind === "double-click" ? 2 : 1);
        else if (step.kind === "fill") await fill(session, step.label, step.value);
        else if (step.kind === "click-at") await dispatchClickAt(session, step.point, step.button);
        else if (step.kind === "move-mouse") pointer = { x: step.x, y: step.y }, await moveDrivePointer(session, pointer);
        else if (step.kind === "look") {
          await acquireDrivePointerLock(session);
          const turned = await lookDrivePointer(session, step.dx, step.dy);
          console.error("look: moved " + Math.round(turned.movement.x) + "," + Math.round(turned.movement.y) + "px");
        } else if (step.kind === "aim-at") {
          await acquireDrivePointerLock(session).catch(() => false);
          const aimed = await aimDriveAt(session, pointer, step.expression, step.tolerancePx);
          pointer = aimed.from;
          console.error("aimAt: aimed " + Math.round(aimed.point.x) + "," + Math.round(aimed.point.y) + " in " + aimed.moves + " move(s)");
        }
        else if (step.kind === "key") await holdKey(session, step.code, step.holdMs, step.until === undefined ? undefined : { ...step.until, label: "until" });
        else if (step.kind === "wait") await sleep(step.ms);
        else if (step.kind === "reload") await navigate(session, url, args.timeoutMs, args.settle);
        else if (step.kind === "rpc") {
          await rpc(session, step.json);
          if (step.summarized) console.error('drive: debug_snapshot printed its summary; pass {"method":"debug_snapshot","detail":"full"} for everything');
        } else if (step.kind === "probe") console.log(JSON.stringify({ probe: step.name, metrics: await readProbe(session) }));
        else {
          const outPath = step.out !== undefined && isAbsolute(step.out) ? step.out : resolve(join("shots", step.name + ".png"));
          await awaitGameView(session, args.timeoutMs, { sleep, now: () => Date.now() });
          await screenshotTo(session, outPath, 10_000, args.timeoutMs);
          console.log(outPath);
        }
      }

      if (args.playtest) {
        sampling = false;
        await sampler;
        const result = summarizePlaytest(samples, {
          seed: args.seed,
          softlockThresholdMs: args.softlockMs,
          epsilon: args.epsilon,
        });
        console.log(JSON.stringify(result));
        if (!result.probed) {
          console.error(
            "drive: no progress probe read — this game exposes no capture.probe (or it returned no metrics). " +
              "Declare capture.probe in defineGame to run the playtest rung.",
          );
          if (args.strict) exitCode = 1;
        } else if (result.softlocked) {
          console.error(
            "drive: SOFTLOCK — progress stayed flat for " + result.softlockWindowMs + "ms under active input " +
              "(threshold " + args.softlockMs + "ms, seed " + args.seed + "). The loop did not advance.",
          );
          if (args.strict) exitCode = 1;
        } else if (args.steps.every((step) => step.kind !== "key" && step.kind !== "click-at")) {
          console.error("drive: --playtest ran with no --key or --click-at step — gameplay input is unproven.");
        }
      }
    } finally {
      session.close();
    }
  } catch (error) {
    exitCode = 1;
    console.error("drive: " + (error instanceof Error ? error.message : String(error)).replace(/^(drive|shoot): /, ""));
  } finally {
    shutdown(chrome, server);
  }
  return exitCode;
}

try {
  process.exit(await main());
} catch (error) {
  console.error("drive: " + (error instanceof Error ? error.message : String(error)).replace(/^(drive|shoot): /, ""));
  process.exit(1);
}
`;
