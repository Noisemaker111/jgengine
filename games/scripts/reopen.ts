/**
 * Open, close and reopen a game in one browser page, and read what it left behind: live listeners on
 * window and document, animation-frame callbacks still pending, page globals, and WebGL contexts that
 * were never released. Run against this checkout's runner (`bun games/scripts/reopen.ts [game...]`);
 * `reopen.test.ts` runs it for all ten games.
 */
import { readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";

import { chromeGraphicsArgs, ensureDevServer, findChromeExecutable } from "../../scripts/browser-lib";

const REPO = resolve(import.meta.dir, "../..");

export interface PageLeftovers {
  listeners: string[];
  listenerSources: string[];
  frames: number;
  frameSources: string[];
  globals: string[];
  contexts: number;
}

export interface ReopenResult {
  game: string;
  baseline: PageLeftovers;
  afterClose: PageLeftovers;
  afterReopen: PageLeftovers;
  errors: string[];
}

const INSTRUMENT = `(() => {
  const live = new Map();
  const sources = new Map();
  const ids = new WeakMap(); let next = 0;
  const id = (fn) => { if (fn === null || (typeof fn !== "function" && typeof fn !== "object")) return String(fn); if (!ids.has(fn)) ids.set(fn, ++next); return ids.get(fn); };
  const named = (target) => target === window ? "window" : target === document ? "document" : target === window.visualViewport ? "visualViewport" : null;
  const capture = (options) => typeof options === "boolean" ? options : options?.capture === true;
  const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, options) {
    const where = named(this);
    if (where !== null && fn != null) {
      const key = where + ":" + type + ":" + id(fn) + ":" + capture(options);
      if (!live.has(key)) {
        live.set(key, where + ":" + type);
        sources.set(key, new Error().stack.split(String.fromCharCode(10)).slice(2, 7).join(" < "));
        options?.signal?.addEventListener?.("abort", () => live.delete(key));
      }
    }
    return add.call(this, type, fn, options);
  };
  EventTarget.prototype.removeEventListener = function (type, fn, options) {
    const where = named(this);
    if (where !== null) live.delete(where + ":" + type + ":" + id(fn) + ":" + capture(options));
    return remove.call(this, type, fn, options);
  };
  const pending = new Map();
  const raf = window.requestAnimationFrame.bind(window), caf = window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => { let handle = 0; handle = raf((t) => { pending.delete(handle); cb(t); }); pending.set(handle, new Error().stack.split(String.fromCharCode(10)).slice(2, 6).join(" < ")); return handle; };
  window.cancelAnimationFrame = (handle) => { pending.delete(handle); caf(handle); };
  const contexts = [];
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
    const ctx = getContext.call(this, kind, ...rest);
    if (ctx !== null && (kind === "webgl" || kind === "webgl2") && !contexts.some((entry) => entry.deref() === ctx)) contexts.push(new WeakRef(ctx));
    return ctx;
  };
  const startGlobals = new Set(Object.keys(window));
  window.__leftovers = () => ({
    listeners: [...live.values()].sort(),
    listenerSources: [...live.keys()].map((key) => live.get(key) + " from " + sources.get(key)),
    frames: pending.size,
    frameSources: [...pending.values()],
    globals: Object.keys(window).filter((key) => !startGlobals.has(key) && key !== "__leftovers" && key !== "__reopen").sort(),
    contexts: contexts.filter((ref) => { const ctx = ref.deref(); return ctx !== undefined && !ctx.isContextLost(); }).length,
  });
})();`;

/** Replaces the runner's entry so the page loads its app code but mounts nothing until asked. */
function harnessEntry(game: string): string {
  const fs = (path: string) => `/@fs/${join(REPO, path).replace(/\\/g, "/")}`;
  return `import "/src/appEnv.ts";
import "/src/index.css";
import { createRoot } from "${fs("packages/core/src/ui/jsx/client.view.ts")}";
import { jsx } from "${fs("packages/core/src/ui/jsx/jsx-runtime.ts")}";
import { DevApp } from "/src/DevApp.tsx";
import { gameRegistry, loadGameStyle } from "/src/registries.tsx";
// Loading a game's code is not opening it: module side effects land before the baseline.
await gameRegistry[${JSON.stringify(game)}]();
await loadGameStyle(${JSON.stringify(game)});
let root = null;
window.__reopen = {
  mount() { root = createRoot(document.getElementById("root")); root.render(jsx(DevApp, { gameId: ${JSON.stringify(game)} })); },
  unmount() { root?.unmount(); root = null; },
};`;
}

const leftovers = (page: Page) => page.evaluate(() => (window as unknown as { __leftovers(): PageLeftovers }).__leftovers());
const settle = (page: Page) => page.evaluate(() => new Promise<void>((done) => { let n = 0; const tick = () => (++n >= 4 ? done() : requestAnimationFrame(tick)); requestAnimationFrame(tick); }));

async function openGame(page: Page): Promise<void> {
  await page.evaluate(() => { delete document.documentElement.dataset["jgPhase"]; (window as unknown as { __reopen: { mount(): void } }).__reopen.mount(); });
  await page.waitForFunction(() => document.documentElement.dataset["jgPhase"] !== undefined, undefined, { timeout: 60_000 });
  await settle(page);
}

async function closeGame(page: Page, baseline: PageLeftovers): Promise<void> {
  await page.evaluate(() => (window as unknown as { __reopen: { unmount(): void } }).__reopen.unmount());
  await settle(page);
  // Some libraries let go a moment after their last subscriber leaves (nanostores waits a second); wait
  await page
    .waitForFunction((count) => (window as unknown as { __leftovers(): PageLeftovers }).__leftovers().listeners.length <= count, baseline.listeners.length, { timeout: 5_000, polling: 100 })
    .catch(() => undefined);
}

export async function reopenGame(browser: Browser, base: string, game: string): Promise<ReopenResult> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  if (process.env["JG_REOPEN_DEBUG"] === "1") page.on("console", (message) => console.log(`  [${game}] ${message.type()}: ${message.text().slice(0, 240)}`));
  await page.addInitScript(INSTRUMENT);
  await page.route(/\/src\/main\.tsx(\?.*)?$/, (route) => route.fulfill({ contentType: "text/javascript", body: harnessEntry(game) }));
  await page.goto(`${base}/?game=${game}`);
  await page.waitForFunction(() => "__reopen" in window, undefined, { timeout: 60_000 });
  await settle(page);
  const step = (name: string) => { if (process.env["JG_REOPEN_DEBUG"] === "1") console.log(`  [${game}] -- ${name}`); };
  const baseline = await leftovers(page);
  step("open");
  await openGame(page);
  step("close");
  await closeGame(page, baseline);
  const afterClose = await leftovers(page);
  step("reopen");
  await openGame(page);
  step("close again");
  await closeGame(page, baseline);
  const afterReopen = await leftovers(page);
  await page.close();
  return { game, baseline, afterClose, afterReopen, errors };
}

export function leftBehind(result: ReopenResult): string[] {
  const { baseline, afterReopen } = result;
  const problems: string[] = [];
  const counts = (list: string[]) => list.reduce((map, key) => map.set(key, (map.get(key) ?? 0) + 1), new Map<string, number>());
  const before = counts(baseline.listeners);
  for (const [key, n] of counts(afterReopen.listeners)) if (n > (before.get(key) ?? 0)) problems.push(`${n - (before.get(key) ?? 0)} ${key} listener(s)${process.env["JG_REOPEN_DEBUG"] === "1" ? ` (${afterReopen.listenerSources.filter((source) => source.startsWith(`${key} `) && !baseline.listenerSources.includes(source)).join(" | ")})` : ""}`);
  if (afterReopen.frames > baseline.frames) problems.push(`${afterReopen.frames - baseline.frames} animation-frame callback(s) still pending (${afterReopen.frameSources.filter((source) => !baseline.frameSources.includes(source)).join(" | ")})`);
  for (const key of afterReopen.globals) if (!baseline.globals.includes(key)) problems.push(`page global ${key}`);
  if (afterReopen.contexts > baseline.contexts) problems.push(`${afterReopen.contexts - baseline.contexts} WebGL context(s) not released`);
  return problems;
}

export function allGames(): string[] {
  const dir = resolve(import.meta.dir, "..");
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(dir, entry.name, "src", "game.config.ts")))
    .map((entry) => entry.name)
    .sort();
}

export async function withRunner<T>(run: (browser: Browser, base: string) => Promise<T>): Promise<T> {
  const server = await ensureDevServer(REPO);
  const browser = await chromium.launch({ executablePath: findChromeExecutable(), args: ["--headless=new", ...chromeGraphicsArgs()] });
  try {
    return await run(browser, server.base);
  } finally {
    await browser.close();
  }
}

if (import.meta.main) {
  const games = process.argv.slice(2).length > 0 ? process.argv.slice(2) : allGames();
  let failed = 0;
  await withRunner(async (browser, base) => {
    for (const game of games) {
      const result = await reopenGame(browser, base, game);
      const problems = leftBehind(result);
      if (problems.length > 0 || result.errors.length > 0) failed += 1;
      console.log(`${problems.length === 0 && result.errors.length === 0 ? "ok  " : "FAIL"} ${game}${problems.length > 0 ? ` - ${problems.join("; ")}` : ""}${result.errors.length > 0 ? ` - page errors: ${result.errors.slice(0, 3).join(" | ")}` : ""}`);
    }
  });
  console.log(`${games.length - failed} of ${games.length} games leave the page as they found it`);
  process.exit(failed === 0 ? 0 : 1);
}
