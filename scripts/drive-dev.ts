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
 * insensitive), wait for its center to hold still across consecutive
 * samples (entrance animations and hydration shift positions for ~2s),
 * then dispatch a raw CDP mouse press at that center — no actionability
 * checks to time out on hover overlays. Keys dispatch
 * keyDown/keyUp with the given code, held for the given milliseconds.
 *
 * Warm loop: `--keep` on the first drive leaves the dev server and Chrome
 * (fixed debug port) running after this process exits; later drives in the
 * same edit/re-shoot loop pass `--connect <port>` to reuse both, skipping
 * vite's ~60-90s boot and Chrome's cold launch. `--size half` halves both
 * dimensions (~1/4 the pixels) for cheap mid-loop judge shots.
 */
import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ChildProcess } from "node:child_process";
import {
  CdpSession,
  DEV_BASE,
  WARM_CHROME_PORT,
  applyDevice,
  ensureDevServer,
  killProcessTree,
  launchChrome,
  openPageSession,
  pickDebugPort,
  waitForDebugger,
  type SizeMode,
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
  size: SizeMode;
  connect?: number;
  keep: boolean;
  help: boolean;
  timeoutMs: number;
  steps: Step[];
};

const HELP = `bun run drive <gameId> [options] --click "TEXT" --shot name ...

  --mode <ui|play>    capture mode (default play)
  --size <full|half>  half halves both dimensions (~1/4 the pixels) for cheap
                      mid-loop judge shots — use full (default) for final/PR shots
  --click "<text>"    click the first visible element containing this text
  --wait <ms>         pause before the next step
  --key <CODE:ms>     hold a key (e.g. KeyW:2500) for the given milliseconds
  --shot <name>       screenshot to shots/<game>-<name>.png (default step if none given)
  --rpc <json>        call the page's agent/editor bridge with this JSON payload
  --connect <port>    attach to an already-running Chrome (skips launch/kill)
  --keep              leave the dev server + Chrome (fixed port ${WARM_CHROME_PORT})
                      running after this drive — pair with --connect ${WARM_CHROME_PORT}
                      on every following drive in the loop (warm-loop pattern)
  --timeout <s>       page-ready timeout in seconds (default 60)
  --help              show this text

Warm loop:
  bun run drive <game> --click START --shot before --keep                       # first: cold boot, stays warm
  bun run drive <game> --click START --shot after --connect ${WARM_CHROME_PORT} --size half   # <10s, cheap judge PNG
  bun run drive <game> --click START --shot final --connect ${WARM_CHROME_PORT}               # final full-res shot for the PR
`;

function parseArgs(argv: string[]): Args {
  const args: Args = {
    game: "",
    mode: "play",
    size: "full",
    connect: undefined,
    keep: false,
    help: false,
    timeoutMs: 60_000,
    steps: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--mode") args.mode = argv[++index] ?? args.mode;
    else if (value === "--size") {
      const size = argv[++index] as SizeMode | undefined;
      if (size !== "full" && size !== "half") {
        throw new Error(`--size must be full or half (got ${size ?? "nothing"})`);
      }
      args.size = size;
    } else if (value === "--timeout") args.timeoutMs = Number(argv[++index]) * 1000;
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
    else if (value === "--connect") args.connect = Number(argv[++index]);
    else if (value === "--keep") args.keep = true;
    else if (value === "--help" || value === "-h") args.help = true;
    else if (value !== undefined && !value.startsWith("--")) args.game = value;
  }
  if (args.help) return args;
  if (args.game === "") throw new Error("drive: pass a game id, e.g. bun run drive the-robots --click START");
  if (!args.steps.some((step) => step.kind === "shot" || step.kind === "rpc")) {
    args.steps.push({ kind: "shot", name: "drive" });
  }
  return args;
}

const SETTLE_EPSILON_PX = 0.5;
const SETTLE_SAMPLES = 3;
const SETTLE_INTERVAL_MS = 100;
const SETTLE_TIMEOUT_MS = 5_000;

async function measureClickPoint(session: CdpSession, text: string): Promise<{ x: number; y: number } | null> {
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
  return (result.result as { value?: { x: number; y: number } | null } | undefined)?.value ?? null;
}

async function findClickPoint(session: CdpSession, text: string): Promise<{ x: number; y: number }> {
  const deadline = Date.now() + SETTLE_TIMEOUT_MS;
  let last: { x: number; y: number } | null = null;
  let stableRuns = 0;
  while (Date.now() < deadline) {
    const point = await measureClickPoint(session, text);
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
    await new Promise((r) => setTimeout(r, SETTLE_INTERVAL_MS));
  }
  if (last === null) throw new Error(`drive: no visible element matching "${text}"`);
  return last;
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
    expression: `(async () => {
      const host = globalThis.__jgengineAgent ?? globalThis.__jgengineEditorHost;
      if (host === undefined) return JSON.stringify({ ok: false, error: "no agent bridge or editor host on this page" });
      return JSON.stringify(await host.handle(${json}));
    })()`,
    awaitPromise: true,
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
if (args.help) {
  console.log(HELP);
  process.exit(0);
}

const outDir = resolve(import.meta.dir, "../shots");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

function sizeSuffix(size: SizeMode): string {
  return size === "half" ? "-half" : "";
}

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
  const debugPort = args.connect ?? (args.keep ? WARM_CHROME_PORT : pickDebugPort());
  if (args.connect === undefined) {
    chrome = launchChrome(debugPort, "jg-drive-");
    await waitForDebugger(debugPort, 30_000);
  } else {
    await waitForDebugger(debugPort, 5_000);
  }
  const session = await openPageSession(debugPort);
  try {
    await session.send("Page.enable");
    await session.send("Runtime.enable");
    await applyDevice(session, "desktop", args.size);
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
      else await screenshot(session, join(outDir, `${args.game}-${step.name}${sizeSuffix(args.size)}.png`));
    }
    if (args.keep) {
      console.error(`drive: kept warm — chrome debug port ${debugPort}, dev server on ${DEV_BASE}`);
      console.error(`drive: next drive → bun run drive ${args.game} --mode ${args.mode} --connect ${debugPort} --size half ...`);
    }
  } finally {
    session.close();
  }
} catch (error) {
  exitCode = 1;
  console.error(error instanceof Error ? error.message : error);
} finally {
  if (!args.keep) {
    killProcessTree(chrome);
    killProcessTree(server);
  }
}
process.exit(exitCode);
