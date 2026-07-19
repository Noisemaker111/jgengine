import { escapeHtml } from "../escapeHtml";
import type { EditorSceneDoc, TemplateVariant } from "./types";

const indexHtml = (name: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>${escapeHtml(name)}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

const engineAliases = `[
          { find: /^@jgengine\\/core\\/(.*)$/, replacement: \`\${engineSrc("core")}/$1\` },
          { find: /^@jgengine\\/react\\/(.*)$/, replacement: \`\${engineSrc("react")}/$1\` },
          { find: /^@jgengine\\/ws\\/(.*)$/, replacement: \`\${engineSrc("ws")}/$1\` },
          { find: /^@jgengine\\/shell\\/(.*)$/, replacement: \`\${engineSrc("shell")}/$1\` },
          { find: /^@jgengine\\/editor$/, replacement: \`\${engineSrc("editor")}/index.ts\` },
          { find: /^@jgengine\\/editor\\/(.*)$/, replacement: \`\${engineSrc("editor")}/$1\` },
          { find: /^@jgengine\\/assets$/, replacement: \`\${engineSrc("assets")}/index.ts\` },
          { find: /^@jgengine\\/assets\\/(.*)$/, replacement: \`\${engineSrc("assets")}/$1\` },
        ]`;

// The two variants differ only in the save middleware: a standalone project uses the packaged
// @jgengine/node preset; an in-repo game imports the dev runner's source plugin so a fresh
// monorepo checkout needs no package build before `bun dev`.
const viteConfig = (variant: TemplateVariant) =>
  variant === "in-repo"
    ? `import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { devSavePlugin } from "../../apps/dev/devSavePlugin";

const engineSrc = (pkg: string) => fileURLToPath(new URL(\`../../packages/\${pkg}/src\`, import.meta.url));
const gamesDir = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss(), devSavePlugin(gamesDir)],
  clearScreen: false,
  build: { target: "es2022" },
  resolve: {
    extensions: [".ts", ".tsx", ".mjs", ".js", ".jsx", ".json"],
    alias: existsSync(engineSrc("core"))
      ? ${engineAliases}
      : [],
  },
});
`
    : `import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { standaloneSavePlugin } from "@jgengine/node/devSavePlugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const engineSrc = (pkg: string) => fileURLToPath(new URL(\`../../packages/\${pkg}/src\`, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss(), standaloneSavePlugin()],
  clearScreen: false,
  build: { target: "es2022" },
  resolve: {
    extensions: [".ts", ".tsx", ".mjs", ".js", ".jsx", ".json"],
    alias: existsSync(engineSrc("core"))
      ? ${engineAliases}
      : [],
  },
});
`;

const standalonePackageJson = (id: string, engineVersion: string) => `${JSON.stringify(
  {
    name: id,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      dev: "vite",
      build: "vite build",
      desktop: "jgengine desktop",
      preview: "vite preview",
      shoot: "node scripts/shoot.mjs",
      drive: "node scripts/drive.mjs",
      "check-types": "tsc --noEmit -p tsconfig.json",
      test: "bun test src",
    },
    dependencies: {
      "@jgengine/assets": `^${engineVersion}`,
      "@jgengine/core": `^${engineVersion}`,
      "@jgengine/editor": `^${engineVersion}`,
      "@jgengine/react": `^${engineVersion}`,
      "@jgengine/shell": `^${engineVersion}`,
      "@react-three/drei": "^10.7.7",
      "@react-three/fiber": "^9.5.0",
      react: "19.2.3",
      "react-dom": "19.2.3",
      three: "^0.182.0",
    },
    devDependencies: {
      "@jgengine/node": `^${engineVersion}`,
      "@tailwindcss/vite": "^4.0.15",
      "@types/react": "^19",
      "@types/react-dom": "^19",
      "@types/three": "^0.182.0",
      "@vitejs/plugin-react": "^4.3.4",
      tailwindcss: "^4.0.15",
      typescript: "^5",
      vite: "^6.2.2",
    },
  },
  null,
  2,
)}
`;

const inRepoPackageJson = (id: string) => `${JSON.stringify(
  {
    name: `@games/${id}`,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      dev: "vite",
      build: "vite build",
      desktop: "jgengine desktop",
      shoot: "node scripts/shoot.mjs",
      drive: "node scripts/drive.mjs",
      "check-types": "tsgo --noEmit -p tsconfig.json",
      test: "bun test src",
    },
    dependencies: {
      "@jgengine/assets": "workspace:*",
      "@jgengine/core": "workspace:*",
      "@jgengine/editor": "workspace:*",
      "@jgengine/react": "workspace:*",
      "@jgengine/shell": "workspace:*",
      "@react-three/drei": "^10.7.7",
      "@react-three/fiber": "^9.5.0",
      react: "19.2.3",
      "react-dom": "19.2.3",
      three: "^0.182.0",
    },
    devDependencies: {
      "@jgengine/node": "workspace:*",
      "@tailwindcss/vite": "^4.0.15",
      "@types/react": "^19",
      "@types/react-dom": "^19",
      "@types/three": "^0.182.0",
      "@vitejs/plugin-react": "^4.3.4",
      tailwindcss: "^4.0.15",
      typescript: "^5",
      vite: "^6.2.2",
    },
    exports: {
      ".": "./src/index.tsx",
      "./*": "./src/*",
    },
  },
  null,
  2,
)}
`;

const sharedCompilerOptions = {
  target: "ES2022",
  lib: ["ES2022", "DOM"],
  module: "ESNext",
  moduleResolution: "bundler",
  jsx: "react-jsx",
  strict: true,
  skipLibCheck: true,
  isolatedModules: true,
  verbatimModuleSyntax: true,
  types: ["vite/client"],
};

export const IN_REPO_TSCONFIG_PATHS: Record<string, string[]> = {
  "@jgengine/core/*": ["../../packages/core/src/*"],
  "@jgengine/react": ["../../packages/react/src/index.ts"],
  "@jgengine/react/*": ["../../packages/react/src/*"],
  "@jgengine/ws/*": ["../../packages/ws/src/*"],
  "@jgengine/shell/*": ["../../packages/shell/src/*"],
  "@jgengine/editor": ["../../packages/editor/src/index.ts"],
  "@jgengine/editor/*": ["../../packages/editor/src/*"],
  "@jgengine/assets": ["../../packages/assets/src/index.ts"],
  "@jgengine/assets/*": ["../../packages/assets/src/*"],
};

const tsconfigJson = (variant: TemplateVariant) => `${JSON.stringify(
  {
    compilerOptions:
      variant === "in-repo" ? { ...sharedCompilerOptions, paths: IN_REPO_TSCONFIG_PATHS } : sharedCompilerOptions,
    include: ["src"],
    exclude: ["src/**/*.test.ts"],
  },
  null,
  2,
)}
`;

// Tailwind v4 only emits utility classes it finds in @source-scanned files. The F2+E editor summon
// (GameHost) mounts @jgengine/editor's chrome into THIS page, so its classes must be scanned here too
// — omit the editor @source and the summoned editor renders unstyled (all-white, no theme) from day one.
const indexCss = (variant: TemplateVariant, editor: boolean) => `@import "tailwindcss";
@import "./style.css";
${
  variant === "in-repo"
    ? `@source "../../../packages/react/src";
@source "../../../packages/shell/src";${editor ? `\n@source "../../../packages/editor/src";` : ""}`
    : `@source "../node_modules/@jgengine/react/dist";
@source "../node_modules/@jgengine/shell/dist";${editor ? `\n@source "../node_modules/@jgengine/editor/dist";` : ""}`
}
`;

const styleCss = `html,
body,
#root {
  height: 100%;
  margin: 0;
  background: #0a0a0a;
}
`;

const gitignore = `node_modules/
dist/
shots/
*.log
.DS_Store
`;

// Dependency-free WebGL capture + drive machinery. Ships with every scaffold so
// a game built outside the monorepo has reliable visual-capture AND play-driving
// rungs (the engine's own `bun run shoot` / `bun run drive` live in apps/dev +
// scripts/ and do not travel with a created game). scripts/browser.mjs holds the
// shared Chrome/CDP plumbing; scripts/shoot.mjs and scripts/drive.mjs are thin
// CLIs over it. All three are kept free of backticks and \${ so they embed
// cleanly here.
const browserLibMjs = `/**
 * browser.mjs — shared Chrome/CDP machinery for scripts/shoot.mjs and
 * scripts/drive.mjs. No Playwright, no npm deps — just Chrome/Chromium +
 * Node 22+ (or Bun). If Chrome is not auto-detected, set CHROME_PATH.
 * Not a CLI; run shoot.mjs or drive.mjs instead.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const DEVICES = {
  desktop: { width: 1600, height: 900, dsf: 1, mobile: false },
  mobile: { width: 390, height: 844, dsf: 2, mobile: true },
  "mobile-landscape": { width: 844, height: 390, dsf: 2, mobile: true },
};

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

export function launchChrome(port, prefix) {
  const chrome = findChrome();
  const userDataDir = join(tmpdir(), (prefix ?? "jg-shoot-") + process.pid + "-" + port);
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
  return child;
}

export async function isUp(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(1000) });
    return r.ok || r.status === 404; // a served-but-routed page still means Vite is up
  } catch {
    return false;
  }
}

export async function waitForDebugger(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch("http://127.0.0.1:" + port + "/json/version", { signal: AbortSignal.timeout(500) });
      if (r.ok) return;
    } catch {
      /* retry */
    }
    await sleep(150);
  }
  throw new Error("Chrome debugger never came up on port " + port);
}

/** Start the game's Vite dev server if nothing is already serving base. */
export async function ensureDevServer(base, port) {
  if (await isUp(base)) return null;
  const bin = join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite");
  if (!existsSync(bin)) {
    throw new Error(
      "nothing is serving " + base + " and node_modules/.bin/vite is missing.\\n" +
        "Start your dev server first (bun dev) or run 'bun install'.",
    );
  }
  const child = spawn(bin, ["--port", String(port), "--host", "127.0.0.1", "--strictPort"], {
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
      if (msg.error !== undefined) waiter.reject(new Error(msg.error.message));
      else waiter.resolve(msg.result ?? {});
    });
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

  send(method, params) {
    const id = ++this.nextId;
    return new Promise((res, rej) => {
      this.pending.set(id, { resolve: res, reject: rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression, opts) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      ...(opts && opts.awaitPromise ? { awaitPromise: true } : {}),
    });
    return result.result ? result.result.value : undefined;
  }

  close() {
    this.ws.close();
  }
}

export async function openPage(debugPort) {
  for (const method of ["PUT", "GET"]) {
    try {
      const r = await fetch("http://127.0.0.1:" + debugPort + "/json/new?about:blank", {
        method,
        signal: AbortSignal.timeout(10_000),
      });
      if (r.ok) {
        const info = await r.json();
        if (info.webSocketDebuggerUrl) return Cdp.connect(info.webSocketDebuggerUrl, 15_000);
      }
    } catch {
      /* try next */
    }
  }
  const list = await fetch("http://127.0.0.1:" + debugPort + "/json/list", { signal: AbortSignal.timeout(5000) });
  const pages = await list.json();
  const page = pages.find((p) => p.type === "page" && p.webSocketDebuggerUrl);
  if (!page) throw new Error("no CDP page target available");
  return Cdp.connect(page.webSocketDebuggerUrl, 15_000);
}

// Reads the honesty signals in one round-trip: the optional jgCapture handshake
// (set by some hosts) plus the live canvas element size + backing-store size.
export const HONESTY_EXPR =
  "(function(){var r=document.documentElement;var c=document.querySelector('canvas');" +
  "return {cap:r.dataset.jgCapture||null,err:r.dataset.jgCaptureError||null," +
  "hasCanvas:!!c,cw:c?c.clientWidth:0,ch:c?c.clientHeight:0,bw:c?c.width:0,bh:c?c.height:0};})()";
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
  while (Date.now() < deadline) {
    const s = await session.evaluate(HONESTY_EXPR);
    last = s;
    if (s && s.cap === "error") throw new Error("page reported a capture error: " + (s.err || "unknown"));
    if (s && s.cap === "ready") return s;
    if (s && s.hasCanvas && s.cw > 10 && s.ch > 10) return s;
    await sleep(100);
  }
  if (last && last.hasCanvas) return last; // canvas exists but small — capture it anyway, caller may warn
  throw new Error(
    "timed out after " +
      Math.round(timeoutMs / 1000) +
      "s waiting for a sized <canvas> at " +
      url +
      " — is the game being served there?",
  );
}

/** Capture the current frame to a PNG (atomic write). */
export async function screenshotTo(session, outPath) {
  const shot = await session.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  if (typeof shot.data !== "string" || shot.data.length === 0) {
    throw new Error("Page.captureScreenshot returned no data");
  }
  writePngAtomic(outPath, Buffer.from(shot.data, "base64"));
}

/** Kill the launched Chrome and (when we started it) the dev server tree. */
export function shutdown(chrome, server) {
  try {
    chrome.kill();
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
}
`;

const shootMjs = `#!/usr/bin/env node
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
  DEVICES,
  ensureDevServer,
  launchChrome,
  openPage,
  RAF_EXPR,
  screenshotTo,
  shutdown,
  sleep,
  waitForDebugger,
  waitForHonestFrame,
} from "./browser.mjs";

const HELP = [
  "shoot.mjs — screenshot this JGengine game (WebGL-safe, dependency-free)",
  "",
  "  --url <url>       page to capture (default http://127.0.0.1:<port>)",
  "  --port <n>        dev-server port to use/start (default 5173)",
  "  --device <name>   desktop | mobile | mobile-landscape (default desktop)",
  "  --width <n>       viewport width override",
  "  --height <n>      viewport height override",
  "  --out <path>      output PNG (default shots/shot.png)",
  "  --settle <ms>     extra wait after first honest frame (default 2000)",
  "  --timeout <s>     max seconds to wait for a sized canvas (default 60)",
  "  --help            show this text",
  "",
  "Needs Chrome/Chromium (set CHROME_PATH if not auto-detected).",
  "To play/test the game from the CLI, see scripts/drive.mjs (bun run drive).",
].join("\\n");

function parseArgs(argv) {
  const args = {
    url: undefined,
    port: 5173,
    device: "desktop",
    width: undefined,
    height: undefined,
    out: undefined,
    settle: 2000,
    timeoutMs: 60_000,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === "--url") args.url = argv[++i];
    else if (v === "--port") args.port = Number(argv[++i]);
    else if (v === "--device") args.device = argv[++i];
    else if (v === "--width") args.width = Number(argv[++i]);
    else if (v === "--height") args.height = Number(argv[++i]);
    else if (v === "--out") args.out = argv[++i];
    else if (v === "--settle") args.settle = Number(argv[++i]);
    else if (v === "--timeout") args.timeoutMs = Number(argv[++i]) * 1000;
    else if (v === "--help" || v === "-h") args.help = true;
    else throw new Error("unknown argument: " + v);
  }
  if (!DEVICES[args.device]) {
    throw new Error("--device must be desktop, mobile, or mobile-landscape (got " + args.device + ")");
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return 0;
  }

  const profile = DEVICES[args.device];
  const width = Number.isFinite(args.width) ? args.width : profile.width;
  const height = Number.isFinite(args.height) ? args.height : profile.height;
  const base = "http://127.0.0.1:" + args.port;
  const target = new URL(args.url ?? base);
  target.searchParams.set("capture", "1"); // honored by hosts that set data-jg-capture; ignored otherwise
  const url = target.toString();
  const outPath = resolve(args.out ?? join("shots", "shot.png"));

  const server = await ensureDevServer(args.url ?? base, args.port);
  const debugPort = 9200 + Math.floor(Date.now() % 700);
  const chrome = launchChrome(debugPort, "jg-shoot-");

  let exitCode = 0;
  try {
    await waitForDebugger(debugPort, 30_000);
    const session = await openPage(debugPort);
    try {
      await session.send("Page.enable");
      await session.send("Runtime.enable");
      // The fix for R3F's 300x150 default: give the page a real viewport BEFORE it lays out.
      await session.send("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: profile.dsf,
        mobile: profile.mobile,
      });
      await session.send("Page.navigate", { url });
      const frame = await waitForHonestFrame(session, url, args.timeoutMs);
      if (frame && frame.bw === 300 && frame.bh === 150) {
        console.error(
          "shoot: warning — canvas backing store is 300x150 (React-Three-Fiber's unsized default). " +
            "Its parent has no real size; ensure html/body/#root have height:100%.",
        );
      }
      // Let the scene paint a couple of frames, then settle for late assets.
      await session.evaluate(RAF_EXPR, { awaitPromise: true });
      await sleep(Number.isFinite(args.settle) ? args.settle : 2000);
      await screenshotTo(session, outPath);
      console.log(outPath + " (" + width + "x" + height + " " + args.device + ")");
    } finally {
      session.close();
    }
  } catch (error) {
    exitCode = 1;
    console.error("shoot: " + (error instanceof Error ? error.message : String(error)));
  } finally {
    shutdown(chrome, server);
  }
  return exitCode;
}

try {
  process.exit(await main());
} catch (error) {
  console.error("shoot: " + (error instanceof Error ? error.message : String(error)));
  process.exit(1);
}
`;

const driveMjs = `#!/usr/bin/env node
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
 *   node scripts/drive.mjs --rpc '{"method":"agent_status"}'
 *   node scripts/drive.mjs --rpc '{"method":"debug_snapshot"}'
 *   node scripts/drive.mjs --playtest --key KeyW:4000 --strict
 *
 * The dev server is started for you when it is not already up. RPC talks to
 * window.__jgengineAgent — agent_status, debug_snapshot, editor verbs — on the
 * running page. --playtest samples the game's capture.probe metrics while your
 * --key steps drive input and prints a JSON progress/softlock verdict.
 */
import { join, resolve } from "node:path";
import {
  DEVICES,
  ensureDevServer,
  launchChrome,
  openPage,
  RAF_EXPR,
  screenshotTo,
  shutdown,
  sleep,
  waitForDebugger,
  waitForHonestFrame,
} from "./browser.mjs";

const HELP = [
  "drive.mjs — play/test this JGengine game from the CLI (WebGL-safe, dependency-free)",
  "",
  "Steps run in the order given:",
  '  --click "<text>"    click the first visible element containing this text',
  "  --key <CODE:ms>     hold a key (e.g. KeyW:2500) for the given milliseconds",
  "  --wait <ms>         pause before the next step",
  "  --shot <name>       screenshot to shots/<name>.png (default step if none given)",
  "  --rpc <json>        call the page's agent/editor bridge with this JSON payload",
  "",
  "Session:",
  "  --url <url>         page to drive (default http://127.0.0.1:<port>)",
  "  --port <n>          dev-server port to use/start (default 5173)",
  "  --device <name>     desktop | mobile | mobile-landscape (default desktop)",
  "  --width/--height    viewport overrides",
  "  --timeout <s>       page-ready timeout in seconds (default 60)",
  "",
  "Playtest (softlock/progress rung — game must expose capture.probe):",
  "  --playtest          sample probe metrics while steps run; print JSON verdict",
  "  --strict            exit nonzero on a softlock or missing probe",
  "  --seed <n>          forwarded as ?seed=n and echoed (default 1)",
  "  --sample <ms>       probe sampling interval (default 250)",
  "  --softlock <ms>     flat-progress span under input that counts as a softlock (default 2000)",
  "  --epsilon <n>       smallest metric change that counts as progress (default 0.001)",
  "  --help              show this text",
  "",
  "Needs Chrome/Chromium (set CHROME_PATH if not auto-detected).",
].join("\\n");

function parseArgs(argv) {
  const args = {
    url: undefined,
    port: 5173,
    device: "desktop",
    width: undefined,
    height: undefined,
    timeoutMs: 60_000,
    steps: [],
    playtest: false,
    strict: false,
    seed: 1,
    sampleMs: 250,
    softlockMs: 2000,
    epsilon: 1e-3,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === "--url") args.url = argv[++i];
    else if (v === "--port") args.port = Number(argv[++i]);
    else if (v === "--device") args.device = argv[++i];
    else if (v === "--width") args.width = Number(argv[++i]);
    else if (v === "--height") args.height = Number(argv[++i]);
    else if (v === "--timeout") args.timeoutMs = Number(argv[++i]) * 1000;
    else if (v === "--click") args.steps.push({ kind: "click", text: argv[++i] ?? "" });
    else if (v === "--wait") args.steps.push({ kind: "wait", ms: Number(argv[++i] ?? 500) });
    else if (v === "--key") {
      const spec = argv[++i] ?? "KeyW:1000";
      const colon = spec.lastIndexOf(":");
      const code = colon > 0 ? spec.slice(0, colon) : spec;
      const holdMs = colon > 0 ? Number(spec.slice(colon + 1)) : 1000;
      args.steps.push({ kind: "key", code, holdMs });
    } else if (v === "--shot") args.steps.push({ kind: "shot", name: argv[++i] ?? "drive" });
    else if (v === "--rpc") args.steps.push({ kind: "rpc", json: argv[++i] ?? "{}" });
    else if (v === "--playtest") args.playtest = true;
    else if (v === "--strict") args.strict = true;
    else if (v === "--seed") args.seed = Number(argv[++i] ?? args.seed);
    else if (v === "--sample") args.sampleMs = Number(argv[++i] ?? args.sampleMs);
    else if (v === "--softlock") args.softlockMs = Number(argv[++i] ?? args.softlockMs);
    else if (v === "--epsilon") args.epsilon = Number(argv[++i] ?? args.epsilon);
    else if (v === "--help" || v === "-h") args.help = true;
    else throw new Error("unknown argument: " + v);
  }
  if (!DEVICES[args.device]) {
    throw new Error("--device must be desktop, mobile, or mobile-landscape (got " + args.device + ")");
  }
  if (!args.help && !args.playtest && !args.steps.some((s) => s.kind === "shot" || s.kind === "rpc")) {
    args.steps.push({ kind: "shot", name: "drive" });
  }
  return args;
}

// Clicks wait for the element's center to hold still across consecutive samples
// (entrance animations and hydration shift positions for ~2s), then dispatch a
// raw CDP mouse press at that center — no actionability checks to time out on
// hover overlays.
const SETTLE_EPSILON_PX = 0.5;
const SETTLE_SAMPLES = 3;
const SETTLE_INTERVAL_MS = 100;
const SETTLE_TIMEOUT_MS = 5_000;

function clickPointExpr(text) {
  return (
    "(function(){var needle=" + JSON.stringify(text) + ".toLowerCase();" +
    "var nodes=Array.prototype.slice.call(document.querySelectorAll('button, [role=button], a, span, div, h1, h2, h3'));" +
    "var best=null;" +
    "for (var i=0;i<nodes.length;i+=1){var node=nodes[i];" +
    "var own=(node.textContent||'').trim().toLowerCase();" +
    "if(own===''||own.indexOf(needle)===-1)continue;" +
    "if(best===null||own.length<best.len){var rect=node.getBoundingClientRect();" +
    "if(rect.width>0&&rect.height>0){best={len:own.length,x:rect.left+rect.width/2,y:rect.top+rect.height/2};}}}" +
    "return best===null?null:{x:best.x,y:best.y};})()"
  );
}

async function findClickPoint(session, text) {
  const deadline = Date.now() + SETTLE_TIMEOUT_MS;
  let last = null;
  let stableRuns = 0;
  while (Date.now() < deadline) {
    const point = (await session.evaluate(clickPointExpr(text))) ?? null;
    if (
      point !== null &&
      last !== null &&
      Math.abs(point.x - last.x) <= SETTLE_EPSILON_PX &&
      Math.abs(point.y - last.y) <= SETTLE_EPSILON_PX
    ) {
      stableRuns += 1;
      if (stableRuns >= SETTLE_SAMPLES - 1) return point;
    } else {
      stableRuns = 0;
    }
    last = point;
    await sleep(SETTLE_INTERVAL_MS);
  }
  if (last === null) throw new Error('no visible element matching "' + text + '"');
  return last;
}

async function click(session, text) {
  const point = await findClickPoint(session, text);
  for (const type of ["mousePressed", "mouseReleased"]) {
    await session.send("Input.dispatchMouseEvent", {
      type,
      x: point.x,
      y: point.y,
      button: "left",
      clickCount: 1,
    });
  }
}

async function holdKey(session, code, holdMs) {
  const key = code.startsWith("Key") ? code.slice(3).toLowerCase() : code;
  await session.send("Input.dispatchKeyEvent", { type: "keyDown", code, key });
  await sleep(holdMs);
  await session.send("Input.dispatchKeyEvent", { type: "keyUp", code, key });
}

async function rpc(session, json) {
  JSON.parse(json); // fail fast on malformed payloads, before touching the page
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return 0;
  }

  const profile = DEVICES[args.device];
  const width = Number.isFinite(args.width) ? args.width : profile.width;
  const height = Number.isFinite(args.height) ? args.height : profile.height;
  const base = "http://127.0.0.1:" + args.port;
  const target = new URL(args.url ?? base);
  target.searchParams.set("capture", "1");
  if (args.playtest) target.searchParams.set("seed", String(args.seed));
  const url = target.toString();

  const server = await ensureDevServer(args.url ?? base, args.port);
  const debugPort = 9200 + Math.floor(Date.now() % 700);
  const chrome = launchChrome(debugPort, "jg-drive-");

  let exitCode = 0;
  try {
    await waitForDebugger(debugPort, 30_000);
    const session = await openPage(debugPort);
    try {
      await session.send("Page.enable");
      await session.send("Runtime.enable");
      await session.send("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: profile.dsf,
        mobile: profile.mobile,
      });
      await session.send("Page.navigate", { url });
      await waitForHonestFrame(session, url, args.timeoutMs);
      await session.evaluate(RAF_EXPR, { awaitPromise: true });
      await sleep(500);

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
        if (step.kind === "click") await click(session, step.text);
        else if (step.kind === "key") await holdKey(session, step.code, step.holdMs);
        else if (step.kind === "wait") await sleep(step.ms);
        else if (step.kind === "rpc") await rpc(session, step.json);
        else {
          const outPath = resolve(join("shots", step.name + ".png"));
          await screenshotTo(session, outPath);
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
        } else if (args.steps.every((step) => step.kind !== "key")) {
          console.error("drive: --playtest ran with no --key hold — nothing drove input, so progress is unproven.");
        }
      }
    } finally {
      session.close();
    }
  } catch (error) {
    exitCode = 1;
    console.error("drive: " + (error instanceof Error ? error.message : String(error)));
  } finally {
    shutdown(chrome, server);
  }
  return exitCode;
}

try {
  process.exit(await main());
} catch (error) {
  console.error("drive: " + (error instanceof Error ? error.message : String(error)));
  process.exit(1);
}
`;

// GameHost owns the whole editor summon (F2+E / ?mode=editor), the agent bridge hook, and the
// DEV-guarded save endpoint — main.tsx stays a mount point.
const mainTsx = (editor: boolean) =>
  editor
    ? `import { createRoot } from "react-dom/client";
import { GameHost } from "@jgengine/shell/GameHost";
import { game } from "./game.config";
import "./index.css";

const root = document.getElementById("root");
if (root === null) throw new Error("missing #root");
createRoot(root).render(<GameHost playable={game} editor={() => import("@jgengine/editor")} />);
`
    : `import { createRoot } from "react-dom/client";
import { GameHost } from "@jgengine/shell/GameHost";
import { game } from "./game.config";
import "./index.css";

const root = document.getElementById("root");
if (root === null) throw new Error("missing #root");
createRoot(root).render(<GameHost playable={game} />);
`;

const indexTsx = (editor: boolean) =>
  editor
    ? `export { game } from "./game.config";
export { editorLayers } from "./editorLayers";
`
    : `export { game } from "./game.config";
`;

// Starter scene document: the authored spawn plus a few placed catalog props, so the very first
// `bun dev` already renders editor-owned content and F2+E opens a non-empty document.
const editorSceneJson = `{
  "version": 1,
  "markers": [
    {
      "id": "player_spawn",
      "kind": "player_spawn",
      "position": { "x": 0, "y": 0, "z": 8 },
      "label": "Player spawn",
      "color": "#22d3ee"
    },
    { "id": "crate_1", "kind": "prop", "position": { "x": 3, "y": 0, "z": -4 }, "rotationY": 0.4, "label": "Crate", "catalogId": "crate" },
    { "id": "crate_2", "kind": "prop", "position": { "x": 4.4, "y": 0, "z": -2.8 }, "rotationY": 1.2, "label": "Crate", "catalogId": "crate" },
    { "id": "tree_1", "kind": "prop", "position": { "x": -8, "y": 0, "z": -10 }, "label": "Tree", "catalogId": "tree" },
    { "id": "tree_2", "kind": "prop", "position": { "x": 10, "y": 0, "z": -14 }, "rotationY": 2.1, "label": "Tree", "catalogId": "tree" },
    { "id": "tree_3", "kind": "prop", "position": { "x": -12, "y": 0, "z": 4 }, "rotationY": 4.2, "label": "Tree", "catalogId": "tree" },
    {
      "id": "goal",
      "kind": "goal",
      "position": { "x": 0, "y": 0, "z": -18 },
      "label": "Goal — walk here to win",
      "color": "#22c55e",
      "meta": { "on": "enter", "action": "win", "message": "You reached the goal — you win!", "triggerRadius": 3 }
    }
  ]
}
`;

const editorLayersTs = `import { normalizeEditorLayers, type EditorDocument } from "@jgengine/core/editor/index";

import sceneJson from "./editor.scene.json";

/**
 * The authored scene for this game — spawn, props, and everything you place later (paths, zones,
 * terrain, foliage). Edit it in the editor (F2+E; Ctrl+S saves back to editor.scene.json) instead
 * of hand-editing the JSON or hardcoding coordinates in game code.
 */
export const editorLayers: EditorDocument = normalizeEditorLayers(sceneJson as unknown as EditorDocument);
`;

const editorLayersTest = `import { describe, expect, test } from "bun:test";

import { authoredSpawnPosition } from "@jgengine/core/world/authoredSpawn";

import { editorLayers } from "./editorLayers";

describe("authored scene", () => {
  test("ships a player_spawn marker the runtime honors", () => {
    expect(authoredSpawnPosition(editorLayers)).not.toBeNull();
  });

  test("ships placed content", () => {
    expect(editorLayers.markers.length).toBeGreaterThan(1);
  });

  test("ships an authored goal that wins on enter — no game code", () => {
    const goal = editorLayers.markers.find((marker) => marker.kind === "goal");
    expect(goal?.meta?.on).toBe("enter");
    expect(goal?.meta?.action).toBe("win");
  });
});
`;

/** Does this document ship a goal marker that wins the moment the player walks into it? */
function sceneHasWinGoal(scene: EditorSceneDoc): boolean {
  return (scene.markers ?? []).some(
    (marker) => marker.kind === "goal" && marker.meta?.on === "enter" && marker.meta?.action === "win",
  );
}

// The scene test is generated to match the scene it ships: any runnable scene honors an authored
// spawn, so that assertion is always emitted; the win-goal assertion is only emitted when the scene
// actually carries such a goal, so a promoted scene without one still passes.
function editorLayersTestFor(scene: EditorSceneDoc): string {
  const goalBlock = sceneHasWinGoal(scene)
    ? `
  test("ships an authored goal that wins on enter — no game code", () => {
    const goal = editorLayers.markers.find((marker) => marker.kind === "goal");
    expect(goal?.meta?.on).toBe("enter");
    expect(goal?.meta?.action).toBe("win");
  });
`
    : "";
  return `import { describe, expect, test } from "bun:test";

import { authoredSpawnPosition } from "@jgengine/core/world/authoredSpawn";

import { editorLayers } from "./editorLayers";

describe("authored scene", () => {
  test("ships a player_spawn marker the runtime honors", () => {
    expect(authoredSpawnPosition(editorLayers)).not.toBeNull();
  });
${goalBlock}});
`;
}

const gameAssetsTs = `import { createStarterCatalog } from "@jgengine/assets/catalogs/starter";

/** Curated people/props/nature/urban starter packs — resolve asset:person_casual etc. */
export const assets = createStarterCatalog({ basePath: "/models" });
`;

const gameModelsTs = `import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { resolveModelPlan } from "@jgengine/shell/render/resolveModel";

import { assets } from "./assets";

/** Drop-in GLTF figures from the curated starter packs (asset:person_casual, …). */
export const entityModels: Record<string, ModelConfig> = resolveModelPlan(assets, {
  player: { model: "asset:person_casual", style: { targetHeight: 1.8 } },
});

export const objectModels: Record<string, ModelConfig> = resolveModelPlan(assets, {
  crate: { model: "asset:prop_crate", style: { targetHeight: 1.2 } },
  tree: { model: "asset:nature_tree", style: { targetHeight: 4.5 } },
});
`;

export interface GameConfigOptions {
  /** Ship world.ts + game/assets.ts + game/models.ts (create --world). */
  world: boolean;
  /** Ship the authored scene document + editor wiring (dropped by create --no-editor). */
  editor: boolean;
}

const gameConfigTs = (name: string, options: GameConfigOptions) => {
  const imports = [
    'import { defineGame } from "@jgengine/shell/gameKit";',
    "",
    ...(options.editor ? ['import { editorLayers } from "./editorLayers";'] : []),
    ...(options.world
      ? ['import { assets } from "./game/assets";', 'import { entityModels, objectModels } from "./game/models";']
      : []),
    'import { GameUI } from "./game/ui/GameUI";',
    'import { onNewPlayer, systems } from "./loop";',
    ...(options.world ? ['import { world } from "./world";'] : []),
  ];
  const fields = [
    `  name: ${JSON.stringify(name)},`,
    // The world carries its own physics (laws of the place) — no separate physics field to wire.
    ...(options.world ? ["  assets,", "  world,"] : []),
    "  // Binding any movement action makes the shell drive the walk controller — a fresh game walks.",
    "  input: {",
    '    moveForward: ["KeyW"],',
    '    moveBack: ["KeyS"],',
    '    moveLeft: ["KeyA"],',
    '    moveRight: ["KeyD"],',
    '    jump: ["Space"],',
    '    interact: ["KeyE"],',
    "  },",
    "  systems,",
    "  loop: { onNewPlayer },",
    "  GameUI,",
    ...(options.editor
      ? [
          "  // The authored scene renders and opens in the editor (F2+E) with zero extra wiring.",
          "  editorLayers,",
        ]
      : []),
    ...(options.world ? ["  entityModels,", "  objectModels,"] : []),
  ];
  return `${imports.join("\n")}

export const game = defineGame({
${fields.join("\n")}
});
`;
};

const worldTs = (id: string) => `import { world as place } from "@jgengine/core/world/place";

// The world is the place you play in: substrate + laws. Dress the place — sky look, foliage,
// props, sculpt — in the editor (F2+E), which writes editor.scene.json; never here. With no
// authored sky the engine renders its default sky.
export const world = place({
  id: "${id}",
  ground: { mode: "flat", size: { x: Infinity, z: Infinity } },
  physics: { gravity: -24 },
});
`;

const editorLoopTs = `import type { GameContext } from "@jgengine/core/runtime/gameContext";
import {
  createAuthoredTriggerRuntime,
  createTriggerOutcome,
  registerBuiltinTriggerActions,
  type AuthoredTriggerRuntime,
} from "@jgengine/core/scene/authoredTriggers";
import { authoredEntitySpawns } from "@jgengine/core/world/authoredEntities";
import { authoredSpawnPosition } from "@jgengine/core/world/authoredSpawn";
import { defineSystem } from "@jgengine/shell/gameKit";

import { editorLayers } from "./editorLayers";

// Built-in announce/win/advance actions are authorable in the editor (select an object → Triggers).
// The starter scene ships a "goal" marker with { on: enter, action: win }, so walking to it wins —
// authored in the document, zero game code. Add your own rules in the editor, not here.
registerBuiltinTriggerActions();

/** The win/announce/objective read-model the built-in actions write; GameUI renders it. */
export const outcome = createTriggerOutcome();

const ORIGIN: [number, number, number] = [0, 0, 0];
let triggers: AuthoredTriggerRuntime | null = null;

/** Spawns the authored scene's entities and steps its triggers — content stays in the editor. */
export const systems = [
  defineSystem({
    id: "authored-scene",
    tick: { type: "frame" },
    create(ctx) {
      // Every authored mob/boss marker spawns at its placed position — place entities in the
      // editor (F2+E), not here.
      for (const spawn of authoredEntitySpawns(editorLayers)) {
        ctx.scene.entity.spawn(spawn.catalogId, { id: spawn.markerId, position: spawn.position });
      }
      triggers = createAuthoredTriggerRuntime({ document: editorLayers, handlers: outcome.handlers });
    },
    update(ctx) {
      // Feed the local player's pose to the authored triggers; enter/exit/interact fire from the scene.
      const player = ctx.scene.entity.get(ctx.player.userId);
      if (player === null || triggers === null) return;
      triggers.step({
        actors: [{ id: ctx.player.userId, position: player.position }],
        interact: ctx.input.justPressed("interact") ? [ctx.player.userId] : [],
      });
    },
  }),
];

/** @internal */
export function onNewPlayer(ctx: GameContext): void {
  // Spawns at the scene's authored player_spawn marker — move it in the editor (F2+E), not here.
  ctx.scene.entity.spawn("player", {
    id: ctx.player.userId,
    position: authoredSpawnPosition(editorLayers) ?? ORIGIN,
  });
}
`;

const plainLoopTs = `import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineSystem } from "@jgengine/shell/gameKit";

const ORIGIN: [number, number, number] = [0, 0, 0];

/** Your game rules tick here — one system per meaningful capability. */
export const systems = [
  defineSystem({
    id: "rules",
    tick: { type: "fixed" },
    update(_ctx, _dt) {},
  }),
];

/** @internal */
export function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn("player", { id: ctx.player.userId, position: ORIGIN });
}
`;

const loopTs = (editor: boolean) => (editor ? editorLoopTs : plainLoopTs);

const gameUiTsx = (id: string, name: string, editor: boolean) => {
  const header = `// ${name} — GameUI starts empty on purpose. Every game owns its UI: write a short UI art
// direction, then build custom panels for this pitch. The engine supplies layout (HudCanvas /
// HudPanel), data hooks, and interaction models — not a finished stock HUD. Do not ship
// default StatBar/Hotbar/Coins/glass frames as the product face; compose game-owned chrome
// (see jgengine-ui). Panel placement is editable live in canvas mode (F2+C) and can persist
// to the scene document's ui.panels.`;
  if (!editor) {
    return `import { HudCanvas, useHudLayout } from "@jgengine/react";

${header}

/** @internal */
export function GameUI() {
  const layout = useHudLayout({ storageKey: ${JSON.stringify(id)} });
  return <HudCanvas layout={layout} className="z-20 font-sans text-slate-100" />;
}
`;
  }
  return `import { useSyncExternalStore } from "react";
import { HudCanvas, useHudLayout } from "@jgengine/react";

import { outcome } from "../../loop";

${header}

/** @internal */
export function GameUI() {
  const layout = useHudLayout({ storageKey: ${JSON.stringify(id)} });
  // The built-in trigger actions (announce/win/advance) write here; the starter goal wins on enter.
  const status = useSyncExternalStore(outcome.subscribe, outcome.get, outcome.get);
  const tone = status.won
    ? "bg-emerald-600/90 text-white"
    : status.tone === "warn"
      ? "bg-amber-600/90 text-white"
      : "bg-slate-800/85 text-slate-100";
  return (
    <>
      <HudCanvas layout={layout} className="z-20 font-sans text-slate-100" />
      {status.message !== null ? (
        <div className={"pointer-events-none absolute left-1/2 top-6 z-30 -translate-x-1/2 rounded-lg px-4 py-2 text-center font-sans text-sm font-semibold shadow-lg " + tone}>
          {status.message}
        </div>
      ) : null}
    </>
  );
}
`;
};

const agentsMd = (name: string, variant: TemplateVariant) => `# ${name} — agent briefing

You are in a **JGengine** game project. JGengine is a pure-TypeScript game engine SDK on npm (\`@jgengine/core\`, \`react\`, \`shell\`, …). Site: https://jgengine.com · source: https://github.com/Noisemaker111/jgengine

**How people use JGengine:** they say *Make a game that … with jgengine* to an agent. They do **not** start from a CLI tutorial. \`npx jgengine\` is for **you** (scaffold, skills, docs).

**This project is the game.** Build here, on the \`@jgengine/*\` npm packages. Never clone the jgengine GitHub repo, and never copy code, assets, or content from its \`Games/*\` directory — those are private in-repo test games, not templates, and their content is not licensed for reuse.

## Path to a playable game

1. Start from \`.claude/skills/jgengine/recipes/minimal-game.md\` — the default end-to-end path, installed with the project skills. Skills missing (your problem, not the user's): \`npx jgengine skills -p\` restores the minimal set; add \`--all\` for the full domain skills when the game outgrows it.
2. Discovery ladder: a skill's \`capabilities.md\` → its recipes → package source under \`node_modules/@jgengine/<pkg>/\` — never a full api inventory.
3. Import from \`@jgengine/shell/gameKit\` first — the happy-path surface (\`defineGame\`, \`defineSystem\`, \`GameHost\`, HUD primitives, editor-layer helpers). Reach for deeper module paths only when the kit lacks the seam.
4. **User-facing first reply is short** — game name, fantasy in 2–4 lines, POV (1st / 3rd / top-down / HUD-only), world kind, scale vibe. Ask a few tight questions. **Do not** dump file trees, catalog ids, keybind tables, or full phase plans to the user. Keep the engineering plan internal.
5. Setup broken or UI unstyled: \`npx jgengine doctor\`. Dev: \`bun dev\`. Windows installer: \`npx jgengine desktop\`.

## Built-in modes — engine-owned via GameHost, use them

\`GameHost\` owns the F2 chord family in every JGengine game, and it is **your** toolkit, not just the player's:

- **F2+E — editor mode** (also \`?mode=editor\`): the scene editor on \`src/editor.scene.json\` — place spawns, props, zones, paths, vegetation; Ctrl+S saves. Leave it via the top-bar **Exit to game** button or **F2+Q**; the mode mirrors to the URL, so stripping \`?mode=editor\` (and reloading) also drops back to the game.
- **F2+D — debug mode** (also \`?debug\`): engine devtools overlay (perf, logs, keybinds, live tunables with Save-to-source). Open/close mirrors to the \`?debug\` param — share the URL to reopen it, strip the param to close.
- **F2+C — canvas mode**: drag/resize HUD panels; layout persists to the scene document's \`ui.panels\`.

Author world content in the editor — never as coordinate tables in code. Agents drive all three headlessly through \`window.__jgengineAgent.handle({ method: ... })\` on any running game page (\`agent_status\`, \`debug_snapshot\`, \`canvas_move_panel\`, \`editor_summon\`, editor verbs, \`save_scene\`) — the easiest way is \`bun run drive -- --rpc '{"method":"agent_status"}'\`, which boots the dev server and Chrome for you; a browser tool on the \`bun dev\` page works too. See the \`jgengine-editor\` skill.

## Hit an engine bug or gap? File it upstream, don't just work around it

\`@jgengine/*\` is the shared engine, not your game. When a primitive misbehaves, clamps or ignores a value you passed, lacks a seam your game needs, or its API misled you into a false negative, that is an **engine** problem — every other game hits it too. Do not bury the finding in a local workaround comment, a hardcoded fallback, or your own notes. Keep your game moving with a minimal workaround if you must, then **file a short issue** at https://github.com/Noisemaker111/jgengine/issues (open it with your GitHub tooling, or hand the user the link) so it gets fixed once, for everyone. Include:

- **What** you were doing and what you expected.
- **Cause** — the underlying behavior you traced, precisely. e.g. *"\`HeadlessRunner.step(dt)\` clamps game-dt to \`maxStepSeconds\` (default 0.05s) regardless of the dt passed, so time-based tests need ~20 steps per second of game-time."*
- **Why** it bit you — the false negative, wrong result, wasted time, or blocked path it caused.
- **How** to reproduce (smallest steps) and, if you can see it, a suggested fix or the missing seam.
- A **screenshot** whenever the problem is visual.

Title it \`[BUG] …\` for wrong behavior or \`[FEATURE] …\` for a missing capability. One clear report beats a paragraph of workaround apologetics — the fix belongs in the engine, not in your game.

## Project rules

- Shape: \`src/\` holds only \`game.config.ts\`, \`index.tsx\`, \`main.tsx\`, \`index.css\`, \`style.css\` plus optional \`loop.ts\`, \`world.ts\`, \`editorLayers.ts\`, \`editorLayers.test.ts\`, \`editor.scene.json\`; everything else under \`src/game/\`.
- Entry: \`defineGame({...})\` in \`game.config.ts\`; \`editorLayers\` passed to defineGame auto-mounts the authored scene, and the player spawns at the authored \`player_spawn\` marker.
- Spawn player with \`id === ctx.player.userId\` in \`onNewPlayer\`; systems (\`defineSystem\`) own the rules tick.
- Tailwind v4: \`@source\` in \`src/index.css\` must cover \`@jgengine/react\`, \`@jgengine/shell\`, and \`@jgengine/editor\`${
  variant === "in-repo" ? " (engine source under packages/)" : " (dist under node_modules)"
}, or the HUD — and the F2+E editor chrome mounted into this same page — is silently unstyled.
- Visual claims are screenshot-judged, by you, harshly — flat untextured ground and an empty horizon fail. Prove content with \`bun test\`, prove looks with your eyes (\`jgengine-verify\` skill).
- Screenshots: \`bun run shoot\` (or \`node scripts/shoot.mjs\`) captures the running game to \`shots/shot.png\` — it starts the dev server if needed, forces a real viewport so the WebGL canvas is not stuck at 300x150, waits for an honest frame, and works headless. Add \`--device mobile\`, \`--out shots/hud.png\`, \`--settle <ms>\`, or \`--url <page>\`; \`--help\` for all flags. Do **not** rely on a browser tool's "screenshot" button for the 3D canvas — it captures before the GPU draws.
- Play & test from the CLI: \`bun run drive\` (or \`node scripts/drive.mjs\`) drives the running game headlessly — ordered \`--click "TEXT"\`, \`--key KeyW:2500\`, \`--wait <ms>\`, \`--shot <name>\`, and \`--rpc '{"method":"agent_status"}'\` steps, plus \`--playtest --strict\` for a progress/softlock verdict off the game's \`capture.probe\`; \`--help\` for all flags. **Never hand-roll a Playwright/Puppeteer/CDP script to play or test this game** — if drive cannot express what you need, that is an engine gap: file it upstream (see below).
`;

export {
  agentsMd,
  browserLibMjs,
  driveMjs,
  editorLayersTest,
  editorLayersTestFor,
  editorLayersTs,
  editorSceneJson,
  gameAssetsTs,
  gameConfigTs,
  gameModelsTs,
  gameUiTsx,
  gitignore,
  indexCss,
  indexHtml,
  indexTsx,
  inRepoPackageJson,
  loopTs,
  mainTsx,
  shootMjs,
  standalonePackageJson,
  styleCss,
  tsconfigJson,
  viteConfig,
  worldTs,
};
