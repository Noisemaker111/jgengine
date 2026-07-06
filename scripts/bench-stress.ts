import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { chromium, type Browser } from "playwright-core";

type Args = {
  small: number;
  large: number;
  chaos: number;
  seconds: number;
  settle: number;
  url?: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { small: 100000, large: 40, chaos: 8, seconds: 15, settle: 4 };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--small") args.small = Number(argv[++index]);
    else if (value === "--large") args.large = Number(argv[++index]);
    else if (value === "--chaos") args.chaos = Number(argv[++index]);
    else if (value === "--seconds") args.seconds = Number(argv[++index]);
    else if (value === "--settle") args.settle = Number(argv[++index]);
    else if (value === "--url") args.url = argv[++index];
  }
  return args;
}

function findChromiumExecutable(): string | undefined {
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
    if (executablePath === undefined) throw new Error("No chromium found");
    return chromium.launch({ executablePath, args: launchArgs, timeout: 30_000 });
  }
}

async function isUp(url: string): Promise<boolean> {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(1_000) })).ok;
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
    await new Promise((r) => setTimeout(r, 500));
    if (await isUp(BASE)) return child;
  }
  child.kill();
  throw new Error("Dev server failed to start on :4517");
}

const args = parseArgs(process.argv.slice(2));
const url =
  args.url ??
  `${BASE}/?game=stress-bench&mode=play&small=${args.small}&large=${args.large}&chaos=${args.chaos}`;

const server = args.url !== undefined ? null : await ensureServer();
const browser = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => (window as unknown as { __stressBenchStats?: unknown }).__stressBenchStats !== undefined, {
    timeout: 30_000,
  });
  await page.waitForTimeout(args.settle * 1000);

  const samples = await page.evaluate(async (seconds: number) => {
    const read = () => ({ ...(window as unknown as { __stressBenchStats: Record<string, number> }).__stressBenchStats });
    const out: Record<string, number>[] = [];
    const end = performance.now() + seconds * 1000;
    while (performance.now() < end) {
      out.push(read());
      await new Promise((r) => setTimeout(r, 250));
    }
    return out;
  }, args.seconds);

  const pick = (key: string) => samples.map((s) => s[key] ?? 0);
  const avg = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
  const min = (xs: number[]) => (xs.length === 0 ? 0 : Math.min(...xs));
  const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
  const last = samples[samples.length - 1] ?? {};

  const report = {
    params: { small: args.small, large: args.large, chaos: args.chaos },
    samples: samples.length,
    total: last.total ?? 0,
    awakeAtEnd: last.awake ?? 0,
    sleepingAtEnd: last.sleeping ?? 0,
    fps: { avg: round(avg(pick("fps"))), low1: round(min(pick("fpsLow1"))) },
    physicsMs: { avg: round(avg(pick("physicsMs"))), max: round(Math.max(...pick("physicsMs"))) },
    renderMs: { avg: round(avg(pick("renderMs"))) },
    frameMs: { avg: round(avg(pick("frameMs"))) },
    contactsAtEnd: last.contacts ?? 0,
    pairsAtEnd: last.pairs ?? 0,
    drawCalls: last.drawCalls ?? 0,
    note: "render/fps are swiftshader (software GL) in headless; physicsMs is hardware-independent",
  };
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  if (server?.pid !== undefined) {
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else {
      try {
        process.kill(-server.pid);
      } catch {
        server.kill();
      }
    }
  }
}
process.exit(0);
