import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { chromium, type Browser } from "playwright-core";

type Args = {
  game: string;
  mode: "ui" | "play";
  out?: string;
  url?: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { game: "world-of-warcraft", mode: "ui" };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--game") args.game = argv[++index] ?? args.game;
    else if (value === "--mode") args.mode = (argv[++index] as Args["mode"]) ?? args.mode;
    else if (value === "--out") args.out = argv[++index];
    else if (value === "--url") args.url = argv[++index];
    else if (!value.startsWith("--")) args.game = value;
  }
  return args;
}

function findChromiumExecutable(): string | undefined {
  for (const candidate of [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ]) {
    if (process.platform === "win32" && existsSync(candidate)) return candidate;
  }
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";
  if (!existsSync(root)) return undefined;
  const direct = join(root, "chromium");
  if (existsSync(direct) && statSync(direct).isFile()) return direct;
  for (const entry of readdirSync(root)) {
    if (!entry.startsWith("chromium")) continue;
    for (const candidate of [
      join(root, entry, "chrome-linux", "chrome"),
      join(root, entry, "chrome-linux", "headless_shell"),
    ]) {
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

async function launchBrowser(): Promise<Browser> {
  const launchArgs = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"];
  try {
    return await chromium.launch({ args: launchArgs, timeout: 30_000 });
  } catch {
    const executablePath = findChromiumExecutable();
    if (executablePath === undefined) {
      throw new Error("No chromium found; run `bunx playwright install chromium` or set PLAYWRIGHT_BROWSERS_PATH");
    }
    return chromium.launch({ executablePath, args: launchArgs, timeout: 30_000 });
  }
}

async function isUp(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
    return response.ok;
  } catch {
    return false;
  }
}

const PORT = 4517;
const BASE = `http://localhost:${PORT}`;

async function ensureServer(): Promise<ChildProcess | null> {
  if (await isUp(BASE)) return null;
  const child = spawn("bunx", ["vite", "--port", String(PORT)], {
    cwd: resolve(import.meta.dir, "../apps/dev"),
    stdio: "ignore",
    detached: process.platform !== "win32",
  });
  child.unref();
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
    if (await isUp(BASE)) return child;
  }
  child.kill();
  throw new Error("Dev server failed to start on :4517");
}

const args = parseArgs(process.argv.slice(2));
const targetUrl = args.url ?? `${BASE}/?game=${encodeURIComponent(args.game)}&mode=${args.mode}`;
const outDir = resolve(import.meta.dir, "../shots");
mkdirSync(outDir, { recursive: true });
const outPath = args.out !== undefined ? resolve(args.out) : join(outDir, `${args.game}-${args.mode}.png`);

const server = args.url !== undefined ? null : await ensureServer();
const browser = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  if (args.mode === "ui" && args.url === undefined) {
    await page.waitForSelector("[data-ui-preview-ready]", { timeout: 20_000 });
    await page.waitForTimeout(750);
  } else {
    await page.waitForTimeout(5_000);
  }
  await page.screenshot({ path: outPath });
  console.log(outPath);
} finally {
  await browser.close();
  if (server?.pid !== undefined) {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      try {
        process.kill(-server.pid);
      } catch {
        server.kill();
      }
    }
  }
}
process.exit(0);
