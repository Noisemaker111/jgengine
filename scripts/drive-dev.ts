/**
 * Drive: navigate a game in the dev runner, perform ordered interactions
 * (click text, hold keys, wait), and take screenshots at any point — the
 * verification tool for games gated behind menus/character-select screens.
 *
 *   bun run drive <gameId> [--mode play] \
 *     --click "SALVADOR" --wait 2000 --shot picked \
 *     --key KeyW:2500 --shot walked
 *
 * Clicks resolve the first visible element whose text matches (case-
 * insensitive) and dispatch a raw CDP mouse press at its center — no
 * actionability checks to time out on hover overlays. Keys dispatch
 * keyDown/keyUp with the given code, held for the given milliseconds.
 */
import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ChildProcess } from "node:child_process";
import {
  CdpSession,
  DEV_BASE,
  ensureDevServer,
  killProcessTree,
  launchChrome,
  openPageSession,
  pickDebugPort,
  waitForDebugger,
} from "./browser-lib";

type Step =
  | { kind: "click"; text: string }
  | { kind: "key"; code: string; holdMs: number }
  | { kind: "wait"; ms: number }
  | { kind: "shot"; name: string }
  | { kind: "rpc"; json: string };

type Args = {
  game: string;
  mode: string;
  timeoutMs: number;
  steps: Step[];
};

function parseArgs(argv: string[]): Args {
  const args: Args = { game: "", mode: "play", timeoutMs: 60_000, steps: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--mode") args.mode = argv[++index] ?? args.mode;
    else if (value === "--timeout") args.timeoutMs = Number(argv[++index]) * 1000;
    else if (value === "--click") args.steps.push({ kind: "click", text: argv[++index] ?? "" });
    else if (value === "--wait") args.steps.push({ kind: "wait", ms: Number(argv[++index] ?? 500) });
    else if (value === "--key") {
      const spec = argv[++index] ?? "KeyW:1000";
      const colon = spec.lastIndexOf(":");
      const code = colon > 0 ? spec.slice(0, colon) : spec;
      const holdMs = colon > 0 ? Number(spec.slice(colon + 1)) : 1000;
      args.steps.push({ kind: "key", code, holdMs });
    } else if (value === "--shot") args.steps.push({ kind: "shot", name: argv[++index] ?? "drive" });
    else if (value === "--rpc") args.steps.push({ kind: "rpc", json: argv[++index] ?? "{}" });
    else if (value !== undefined && !value.startsWith("--")) args.game = value;
  }
  if (args.game === "") throw new Error("drive: pass a game id, e.g. bun run drive borderlands2 --click START");
  if (!args.steps.some((step) => step.kind === "shot" || step.kind === "rpc")) {
    args.steps.push({ kind: "shot", name: "drive" });
  }
  return args;
}

async function findClickPoint(session: CdpSession, text: string): Promise<{ x: number; y: number }> {
  const result = await session.send("Runtime.evaluate", {
    expression: `(() => {
      const needle = ${JSON.stringify(text)}.toLowerCase();
      const nodes = Array.from(document.querySelectorAll("button, [role=button], a, span, div, h1, h2, h3"));
      let best = null;
      for (const node of nodes) {
        const own = (node.textContent ?? "").trim().toLowerCase();
        if (own === "" || !own.includes(needle)) continue;
        if (best === null || own.length < best.len) {
          const rect = node.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            best = { len: own.length, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
          }
        }
      }
      return best === null ? null : { x: best.x, y: best.y };
    })()`,
    returnByValue: true,
  });
  const point = (result.result as { value?: { x: number; y: number } | null } | undefined)?.value;
  if (point === null || point === undefined) throw new Error(`drive: no visible element matching "${text}"`);
  return point;
}

async function click(session: CdpSession, text: string): Promise<void> {
  const point = await findClickPoint(session, text);
  for (const type of ["mousePressed", "mouseReleased"] as const) {
    await session.send("Input.dispatchMouseEvent", {
      type,
      x: point.x,
      y: point.y,
      button: "left",
      clickCount: 1,
    });
  }
}

async function holdKey(session: CdpSession, code: string, holdMs: number): Promise<void> {
  const key = code.startsWith("Key") ? code.slice(3).toLowerCase() : code;
  await session.send("Input.dispatchKeyEvent", { type: "keyDown", code, key });
  await new Promise((r) => setTimeout(r, holdMs));
  await session.send("Input.dispatchKeyEvent", { type: "keyUp", code, key });
}

async function rpc(session: CdpSession, json: string): Promise<void> {
  JSON.parse(json);
  const result = await session.send("Runtime.evaluate", {
    expression: `JSON.stringify(globalThis.__jgengineEditorHost?.handle(${json}) ?? { ok: false, error: "no editor host on this page (use --mode editor)" })`,
    returnByValue: true,
  });
  const value = (result.result as { value?: string } | undefined)?.value;
  console.log(value ?? JSON.stringify({ ok: false, error: "rpc evaluation returned nothing" }));
}

async function screenshot(session: CdpSession, outPath: string): Promise<void> {
  const shot = await session.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  const data = shot.data;
  if (typeof data !== "string" || data.length === 0) throw new Error("Page.captureScreenshot returned empty data");
  const tmpPath = `${outPath}.tmp`;
  writeFileSync(tmpPath, Buffer.from(data, "base64"));
  if (existsSync(outPath)) unlinkSync(outPath);
  renameSync(tmpPath, outPath);
  console.log(outPath);
}

async function waitReady(session: CdpSession, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await session.send("Runtime.evaluate", {
      expression: `document.documentElement.dataset.jgCapture ?? null`,
      returnByValue: true,
    });
    const status = (result.result as { value?: string | null } | undefined)?.value;
    if (status === "ready") return;
    if (status === "error") throw new Error("capture reported error during load");
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`drive: timed out waiting for data-jg-capture=ready (${timeoutMs}ms)`);
}

const args = parseArgs(process.argv.slice(2));
const outDir = resolve(import.meta.dir, "../shots");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

let server: ChildProcess | null = null;
let chrome: ChildProcess | null = null;
let exitCode = 0;

const watchdog = setTimeout(() => {
  console.error("drive: hard deadline hit — force-killing Chrome and dev server");
  killProcessTree(chrome);
  killProcessTree(server);
  process.exit(124);
}, args.timeoutMs + 120_000);
watchdog.unref();

try {
  server = await ensureDevServer();
  const debugPort = pickDebugPort();
  chrome = launchChrome(debugPort);
  await waitForDebugger(debugPort, 30_000);
  const session = await openPageSession(debugPort);
  try {
    await session.send("Page.enable");
    await session.send("Runtime.enable");
    await session.send("Emulation.setDeviceMetricsOverride", {
      width: 1600,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const url = new URL(DEV_BASE);
    url.searchParams.set("game", args.game);
    url.searchParams.set("mode", args.mode);
    url.searchParams.set("capture", "1");
    await session.send("Page.navigate", { url: url.toString() });
    await waitReady(session, args.timeoutMs);
    await new Promise((r) => setTimeout(r, 500));

    for (const step of args.steps) {
      if (step.kind === "click") await click(session, step.text);
      else if (step.kind === "key") await holdKey(session, step.code, step.holdMs);
      else if (step.kind === "wait") await new Promise((r) => setTimeout(r, step.ms));
      else if (step.kind === "rpc") await rpc(session, step.json);
      else await screenshot(session, join(outDir, `${args.game}-${step.name}.png`));
    }
  } finally {
    session.close();
  }
} catch (error) {
  exitCode = 1;
  console.error(error instanceof Error ? error.message : error);
} finally {
  killProcessTree(chrome);
  killProcessTree(server);
}
process.exit(exitCode);
