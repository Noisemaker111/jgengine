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
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  CdpSession,
  applyDevice,
  ensureDevServer,
  openPageSession,
  parseSizeArg,
  sizeSuffix,
  waitCaptureReady,
  withBrowserSession,
  writePngAtomic,
  type SizeMode,
} from "./browser-lib";
import { summarizePlaytest, type ProbeSample } from "./playtest";

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
  playtest: boolean;
  strict: boolean;
  seed: number;
  sampleMs: number;
  softlockMs: number;
  epsilon: number;
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
  --keep              leave the dev server + Chrome (per-worktree warm debug port)
                      running after this drive — pair with --connect <port>
                      on every following drive in the loop (warm-loop pattern)
  --timeout <s>       page-ready timeout in seconds (default 60)
  --playtest          bot-playtest rung: drive input, sample the game's
                      capture.probe over time, print a progress/softlock verdict
                      as JSON (needs a --key hold to drive; game must expose
                      capture.probe). No screenshot unless one is asked for.
  --strict            with --playtest, exit nonzero on a softlock or missing probe
  --seed <n>          playtest seed, forwarded as ?seed=n and echoed (default 1)
  --sample <ms>       playtest probe sampling interval (default 250; lower over-samples
                      and can starve a heavy scene's render thread into a false softlock)
  --softlock <ms>     flat-progress span under input that counts as a softlock (default 2000)
  --epsilon <n>       smallest metric change that counts as progress (default 0.001)
  --help              show this text

Warm loop:
  bun run drive <game> --click START --shot before --keep                       # first: cold boot, stays warm
  bun run drive <game> --click START --shot after --connect <port> --size half  # <10s, cheap judge PNG
  bun run drive <game> --click START --shot final --connect <port>              # final full-res shot for the PR
  # port is printed after --keep; each worktree gets its own default so parallel ships don't collide
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
    playtest: false,
    strict: false,
    seed: 1,
    sampleMs: 250,
    softlockMs: 2000,
    epsilon: 1e-3,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--mode") args.mode = argv[++index] ?? args.mode;
    else if (value === "--size") {
      args.size = parseSizeArg(argv[++index]);
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
    else if (value === "--playtest") args.playtest = true;
    else if (value === "--strict") args.strict = true;
    else if (value === "--seed") args.seed = Number(argv[++index] ?? args.seed);
    else if (value === "--sample") args.sampleMs = Number(argv[++index] ?? args.sampleMs);
    else if (value === "--softlock") args.softlockMs = Number(argv[++index] ?? args.softlockMs);
    else if (value === "--epsilon") args.epsilon = Number(argv[++index] ?? args.epsilon);
    else if (value === "--help" || value === "-h") args.help = true;
    else if (value !== undefined && !value.startsWith("--")) args.game = value;
  }
  if (args.help) return args;
  if (args.game === "") throw new Error("drive: pass a game id, e.g. bun run drive the-robots --click START");
  if (!args.playtest && !args.steps.some((step) => step.kind === "shot" || step.kind === "rpc")) {
    args.steps.push({ kind: "shot", name: "drive" });
  }
  return args;
}

const SETTLE_EPSILON_PX = 0.5;
const SETTLE_SAMPLES = 3;
const SETTLE_INTERVAL_MS = 100;
const SETTLE_TIMEOUT_MS = 5_000;

async function measureClickPoint(session: CdpSession, text: string): Promise<{ x: number; y: number } | null> {
  const expression = `(() => {
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
    })()`;
  return (await session.evaluate<{ x: number; y: number } | null>(expression)) ?? null;
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
  const value = await session.evaluate<string>(
    `(async () => {
      const host = globalThis.__jgengineAgent ?? globalThis.__jgengineEditorHost;
      if (host === undefined) return JSON.stringify({ ok: false, error: "no agent bridge or editor host on this page" });
      return JSON.stringify(await host.handle(${json}));
    })()`,
    { awaitPromise: true },
  );
  console.log(value ?? JSON.stringify({ ok: false, error: "rpc evaluation returned nothing" }));
}

async function readProbe(session: CdpSession): Promise<Record<string, number> | null> {
  const value = await session.evaluate<Record<string, number> | null>(`(() => {
      const probe = globalThis.__jgProbe;
      if (typeof probe !== "function") return null;
      try {
        const value = probe();
        if (value === null || typeof value !== "object") return null;
        const out = {};
        for (const key of Object.keys(value)) {
          const n = value[key];
          if (typeof n === "number" && Number.isFinite(n)) out[key] = n;
        }
        return out;
      } catch {
        return null;
      }
    })()`);
  return value ?? null;
}

async function screenshot(session: CdpSession, outPath: string): Promise<void> {
  const shot = await session.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  const data = shot.data;
  if (typeof data !== "string" || data.length === 0) throw new Error("Page.captureScreenshot returned empty data");
  writePngAtomic(outPath, Buffer.from(data, "base64"));
  console.log(outPath);
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(HELP);
  process.exit(0);
}

const outDir = resolve(import.meta.dir, "../shots");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const dev = await ensureDevServer();

const exitCode = await withBrowserSession(
  {
    keep: args.keep,
    connect: args.connect,
    timeoutMs: args.timeoutMs,
    server: dev.child,
    chromePrefix: "jg-drive-",
  },
  async ({ debugPort }) => {
    let code = 0;
    const session = await openPageSession(debugPort);
    try {
      await session.send("Page.enable");
      await session.send("Runtime.enable");
      await applyDevice(session, "desktop", args.size);
      const url = new URL(dev.base);
      url.searchParams.set("game", args.game);
      url.searchParams.set("mode", args.mode);
      url.searchParams.set("capture", "1");
      if (args.playtest) url.searchParams.set("seed", String(args.seed));
      await session.send("Page.navigate", { url: url.toString() });
      await waitCaptureReady(session, args.timeoutMs);
      await new Promise((r) => setTimeout(r, 500));

      const samples: ProbeSample[] = [];
      let sampling = args.playtest;
      const sampleStart = Date.now();
      const sampler = args.playtest
        ? (async () => {
            while (sampling) {
              const metrics = await readProbe(session);
              if (metrics !== null) samples.push({ t: Date.now() - sampleStart, metrics });
              await new Promise((r) => setTimeout(r, args.sampleMs));
            }
          })()
        : Promise.resolve();

      for (const step of args.steps) {
        if (step.kind === "click") await click(session, step.text);
        else if (step.kind === "key") await holdKey(session, step.code, step.holdMs);
        else if (step.kind === "wait") await new Promise((r) => setTimeout(r, step.ms));
        else if (step.kind === "rpc") await rpc(session, step.json);
        else await screenshot(session, join(outDir, `${args.game}-${step.name}${sizeSuffix(args.size)}.png`));
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
            `drive: no progress probe read — ${args.game} exposes no capture.probe (or it returned no metrics). Declare capture.probe to run the playtest rung.`,
          );
          if (args.strict) code = 1;
        } else if (result.softlocked) {
          console.error(
            `drive: SOFTLOCK — progress stayed flat for ${result.softlockWindowMs}ms under active input (threshold ${args.softlockMs}ms, seed ${args.seed}). The loop did not advance.`,
          );
          if (args.strict) code = 1;
        } else if (args.steps.every((step) => step.kind !== "key")) {
          console.error("drive: --playtest ran with no --key hold — nothing drove input, so progress is unproven.");
        }
      }
      if (args.keep) {
        console.error(`drive: kept warm — chrome debug port ${debugPort}, dev server on ${dev.base}`);
        console.error(`drive: next drive → bun run drive ${args.game} --mode ${args.mode} --connect ${debugPort} --size half ...`);
      }
    } finally {
      session.close();
    }
    return code;
  },
);
process.exit(exitCode);
