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
import { existsSync, mkdirSync, statSync } from "node:fs";
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
import { focusGameSurface, holdComplete } from "./gameSurfaceFocus";
import { framesFromTimeline, thinFrames, type TimedPng } from "./apng";
import { assembleGif } from "./gif";
import { assembleMp4 } from "./video";

type Step =
  | { kind: "click"; text: string }
  | { kind: "key"; code: string; holdMs: number }
  | { kind: "wait"; ms: number }
  | { kind: "shot"; name: string }
  | { kind: "rpc"; json: string }
  | { kind: "probe"; name: string };

/** Extra wall-clock a frame-starved page gets to render one frame under a held
 * key before {@link holdKey} gives up (see {@link holdComplete}). */
const FRAME_STARVE_GRACE_MS = 20_000;

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
  spawn?: string;
  record?: string;
  recordWidth: number;
  recordFps: number;
  recordRealtime: boolean;
};

/** GitHub's camo image proxy stops serving around 5 MB — stay safely under it
 * so a recorded clip actually animates in the PR body. */
const RECORD_BUDGET_BYTES = 4_500_000;

const HELP = `bun run drive <gameId> [options] --click "TEXT" --shot name ...

  --mode <ui|play>    capture mode (default play)
  --size <full|half>  half halves both dimensions (~1/4 the pixels) for cheap
                      mid-loop judge shots — use full (default) for final/PR shots
  --click "<text>"    click the first visible element containing this text
  --wait <ms>         pause before the next step
  --key <CODE:ms>     hold a key (e.g. KeyW:2500) for the given milliseconds
  --shot <name>       screenshot to shots/<game>-<name>.png — pass a bare name,
                      not a path (a path/slash yields shots/<game>-<path>.png and ENOENTs)
  --spawn <x,y,z>     override the authored player spawn for this run only (adds a
                      ?spawn= overlay like ?cam=); never mutates editor.scene.json.
                      Accepts x,y,z or x,y,z,yaw (yaw radians)
  --rpc <json>        call the page's agent/editor bridge with this JSON payload.
                      Compose an editor aerial in one call, e.g.
                      --rpc '{"method":"camera_frame","pitch":60}' (auto-fits the
                      region) or '{"method":"camera_goto","x":40,"z":-20,"distance":80,"pitch":55}'
  --record <name>     record the drive to shots/<game>-<name>.mp4. Records in
                      LOCKSTEP: the page's rAF/clocks are taken over and game time
                      advances one fixed tick per captured frame, so the clip plays
                      smoothly at --record-fps no matter how slowly headless GL
                      renders — but every output frame costs ~1s of real render, so
                      choreograph drives short (8-15s of game time), not minutes.
                      Share via pr-shots / the /pr-video comment
  --record-fps <n>    lockstep output frame rate (default 24; lower it to fit a
                      longer drive in the same wall-clock budget)
  --record-realtime   old behavior: capture only the frames the page really renders
                      (CDP screencast, wall-clock timing — expect ~1fps on software
                      GL; useful for honest performance evidence)
  --record-width <px> screencast max width in realtime mode (default 640); lockstep
                      captures at the page viewport size — use --size half
  --probe [name]      print the game's live capture.probe metrics (e.g. player
                      position) as JSON — pair one before and one after a --key
                      hold to prove a non-zero movement delta via RPC, which is
                      the honest movement check on a low-fps headless GL page
                      where held-key motion is too small to read off screenshots
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
    recordWidth: 640,
    recordFps: 24,
    recordRealtime: false,
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
    } else if (value === "--shot") {
      const name = argv[++index] ?? "drive";
      if (name.includes("/") || name.includes("\\")) {
        throw new Error(`drive: --shot takes a bare name, not a path (got "${name}") — output always lands in shots/<game>-<name>.png`);
      }
      args.steps.push({ kind: "shot", name });
    } else if (value === "--rpc") args.steps.push({ kind: "rpc", json: argv[++index] ?? "{}" });
    else if (value === "--probe") {
      const next = argv[index + 1];
      const name = next !== undefined && !next.startsWith("--") ? argv[++index]! : "probe";
      args.steps.push({ kind: "probe", name });
    } else if (value === "--connect") args.connect = Number(argv[++index]);
    else if (value === "--keep") args.keep = true;
    else if (value === "--playtest") args.playtest = true;
    else if (value === "--strict") args.strict = true;
    else if (value === "--seed") args.seed = Number(argv[++index] ?? args.seed);
    else if (value === "--sample") args.sampleMs = Number(argv[++index] ?? args.sampleMs);
    else if (value === "--softlock") args.softlockMs = Number(argv[++index] ?? args.softlockMs);
    else if (value === "--epsilon") args.epsilon = Number(argv[++index] ?? args.epsilon);
    else if (value === "--spawn") args.spawn = argv[++index];
    else if (value === "--record") {
      const name = argv[++index] ?? "clip";
      if (name.includes("/") || name.includes("\\")) {
        throw new Error(`drive: --record takes a bare name, not a path (got "${name}") — output always lands in shots/<game>-<name>.gif`);
      }
      args.record = name;
    } else if (value === "--record-width") args.recordWidth = Number(argv[++index] ?? args.recordWidth);
    else if (value === "--record-fps") args.recordFps = Number(argv[++index] ?? args.recordFps);
    else if (value === "--record-realtime") args.recordRealtime = true;
    else if (value === "--help" || value === "-h") args.help = true;
    else if (value !== undefined && !value.startsWith("--")) args.game = value;
  }
  if (args.help) return args;
  if (args.game === "") throw new Error("drive: pass a game id, e.g. bun run drive the-robots --click START");
  if (
    !args.playtest &&
    args.record === undefined &&
    !args.steps.some((step) => step.kind === "shot" || step.kind === "rpc" || step.kind === "probe")
  ) {
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

/**
 * Focus the game's key-input surface so CDP keys reach the play-mode handler
 * (a React `onKeyDown` on the `tabIndex` wrapper) instead of `document.body`.
 * Serialises {@link focusGameSurface} into the page. Returns whether a surface
 * became the active element.
 */
async function focusSurface(session: CdpSession): Promise<boolean> {
  const expression = `(${focusGameSurface.toString()})(document)`;
  return (await session.evaluate<boolean>(expression)) ?? false;
}

/** Install a standalone rAF counter so the hold loop can tell when the page
 * actually rendered a frame (one simulation step) under the held key. */
async function installFrameCounter(session: CdpSession): Promise<void> {
  await session.evaluate(`(() => {
    if (globalThis.__jgFrames !== undefined) return;
    globalThis.__jgFrames = 0;
    const tick = () => { globalThis.__jgFrames++; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  })()`);
}

async function readFrames(session: CdpSession): Promise<number> {
  return (await session.evaluate<number>(`globalThis.__jgFrames ?? 0`)) ?? 0;
}

/**
 * Hold a key so it moves the player. Focuses the surface first (keys are dead
 * without it), then keeps the key down for the wall-clock budget and, on a
 * frame-starved headless GL page, a bounded moment longer until at least one
 * frame has rendered under it — otherwise the sim never steps and the player
 * sits exactly at spawn (see {@link holdComplete}).
 */
async function holdKey(session: CdpSession, code: string, holdMs: number): Promise<void> {
  const key = code.startsWith("Key") ? code.slice(3).toLowerCase() : code;
  await focusSurface(session);
  const startFrames = await readFrames(session);
  const start = Date.now();
  const deadlineMs = start + holdMs;
  const hardCapMs = deadlineMs + FRAME_STARVE_GRACE_MS;
  await session.send("Input.dispatchKeyEvent", { type: "keyDown", code, key });
  for (;;) {
    await new Promise((r) => setTimeout(r, 100));
    const framesElapsed = (await readFrames(session)) - startFrames;
    if (holdComplete({ nowMs: Date.now(), deadlineMs, hardCapMs, framesElapsed })) break;
  }
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

/**
 * Lockstep recorder: takes over the page's `requestAnimationFrame` and clocks
 * (the timeweb/timecut technique) so game time only advances when we say so —
 * exactly ONE rendered frame per `1000/fps` ms tick, captured after it draws.
 * The sim sees ordinary frame deltas, so the assembled clip plays smoothly at
 * the target fps no matter how slowly software GL actually renders. (CDP
 * virtual time is the wrong tool here: it fires rAF at 60 virtual fps, costing
 * six SwiftShader renders per captured frame.) The honest cost is wall-clock —
 * one real render per output frame — so choreograph recorded drives in seconds
 * of game time, not minutes.
 */
class LockstepRecorder {
  readonly frames: TimedPng[] = [];
  readonly frameMs: number;
  private virtualNow = 0;

  constructor(
    private readonly session: CdpSession,
    fps: number,
  ) {
    this.frameMs = Math.max(20, Math.round(1000 / fps));
  }

  /** Install the clock takeover. Call only after `data-jg-capture=ready` — a
   * page still booting under a frozen rAF would never reach ready. */
  async start(): Promise<void> {
    await this.session.evaluate(`(() => {
      if (globalThis.__jgVtStep !== undefined) return;
      const epoch = Date.now();
      const baseVirtual = performance.now();
      let virtual = baseVirtual;
      let nextId = 1;
      const queue = new Map();
      window.requestAnimationFrame = (cb) => { const id = nextId++; queue.set(id, cb); return id; };
      window.cancelAnimationFrame = (id) => { queue.delete(id); };
      performance.now = () => virtual;
      Date.now = () => epoch + (virtual - baseVirtual);
      globalThis.__jgVtStep = (dt) => {
        virtual += dt;
        const cbs = [...queue.values()];
        queue.clear();
        for (const cb of cbs) { try { cb(virtual); } catch (err) { console.error(err); } }
      };
    })()`);
    await this.captureFrame();
  }

  /** Advance game time by `ms`, rendering + capturing one frame per tick. */
  async advance(ms: number): Promise<void> {
    for (let done = 0; done < ms; done += this.frameMs) {
      const budget = Math.min(this.frameMs, ms - done);
      await this.session.evaluate(`globalThis.__jgVtStep(${budget})`);
      this.virtualNow += budget;
      await this.captureFrame();
    }
  }

  private async captureFrame(): Promise<void> {
    // JPEG: the composite dominates the cost either way (~1s on SwiftShader),
    // but JPEG cuts the CDP transfer ~10x. Lockstep output is mp4-only, which
    // takes JPEG frames directly.
    const shot = await this.session.send("Page.captureScreenshot", {
      format: "jpeg",
      quality: 85,
      fromSurface: true,
    });
    const data = shot.data;
    if (typeof data !== "string" || data.length === 0) return;
    this.frames.push({ png: Buffer.from(data, "base64"), tMs: this.virtualNow });
  }
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

const lockstep = args.record !== undefined && !args.recordRealtime && !args.playtest;
const lockstepVirtualMs = args.steps.reduce(
  (sum, step) => sum + (step.kind === "key" ? step.holdMs : step.kind === "wait" ? step.ms : 0),
  0,
);
const lockstepProjected = Math.ceil(lockstepVirtualMs / Math.max(20, Math.round(1000 / args.recordFps)));

const exitCode = await withBrowserSession(
  {
    keep: args.keep,
    connect: args.connect,
    timeoutMs: args.timeoutMs,
    server: dev.child,
    chromePrefix: "jg-drive-",
    // One real render + capture per output frame — give the watchdog room.
    ...(lockstep ? { hardDeadlineMs: args.timeoutMs + 120_000 + lockstepProjected * 3_000 } : {}),
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
      if (args.spawn !== undefined && args.spawn.length > 0) url.searchParams.set("spawn", args.spawn);
      if (args.playtest) url.searchParams.set("seed", String(args.seed));
      await session.send("Page.navigate", { url: url.toString() });
      await waitCaptureReady(session, args.timeoutMs);
      await new Promise((r) => setTimeout(r, 500));
      await installFrameCounter(session);

      let recorder: LockstepRecorder | null = null;
      if (lockstep) {
        if (lockstepProjected > 900) {
          throw new Error(
            `drive: --record would capture ~${lockstepProjected} frames (${Math.round(lockstepVirtualMs / 1000)}s at ${args.recordFps}fps) — every frame costs a real render on software GL. Choreograph a shorter drive or lower --record-fps.`,
          );
        }
        if (lockstepProjected > 450) {
          console.error(
            `drive: --record will capture ~${lockstepProjected} frames — expect several minutes of wall clock; consider a shorter drive or lower --record-fps`,
          );
        }
        recorder = new LockstepRecorder(session, args.recordFps);
        await recorder.start();
      }

      const recorded: TimedPng[] = [];
      if (args.record !== undefined && !lockstep) {
        session.on("Page.screencastFrame", (params) => {
          const data = params.data;
          const sessionId = params.sessionId;
          const metadata = params.metadata as { timestamp?: number } | undefined;
          if (typeof sessionId === "number" || typeof sessionId === "string") {
            void session.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
          }
          if (typeof data !== "string" || data.length === 0) return;
          const tSec = metadata?.timestamp;
          recorded.push({
            png: Buffer.from(data, "base64"),
            tMs: typeof tSec === "number" ? tSec * 1000 : Date.now(),
          });
        });
        await session.send("Page.startScreencast", {
          format: "png",
          maxWidth: args.recordWidth,
          maxHeight: args.recordWidth,
          everyNthFrame: 1,
        });
      }

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
        if (step.kind === "click") {
          await click(session, step.text);
          // Let the UI react on the virtual clock so the click's effect is in frame.
          if (recorder !== null) await recorder.advance(300);
        } else if (step.kind === "key") {
          if (recorder !== null) {
            // Lockstep hold: the virtual clock guarantees the sim steps under the
            // held key, so no frame-starvation grace dance is needed.
            const key = step.code.startsWith("Key") ? step.code.slice(3).toLowerCase() : step.code;
            await focusSurface(session);
            await session.send("Input.dispatchKeyEvent", { type: "keyDown", code: step.code, key });
            await recorder.advance(step.holdMs);
            await session.send("Input.dispatchKeyEvent", { type: "keyUp", code: step.code, key });
          } else {
            await holdKey(session, step.code, step.holdMs);
          }
        } else if (step.kind === "wait") {
          if (recorder !== null) await recorder.advance(step.ms);
          else await new Promise((r) => setTimeout(r, step.ms));
        } else if (step.kind === "rpc") await rpc(session, step.json);
        else if (step.kind === "probe") {
          const metrics = await readProbe(session);
          console.log(JSON.stringify({ probe: step.name, metrics }));
        } else await screenshot(session, join(outDir, `${args.game}-${step.name}${sizeSuffix(args.size)}.png`));
      }

      if (recorder !== null) {
        const mp4Path = join(outDir, `${args.game}-${args.record}${sizeSuffix(args.size)}.mp4`);
        if (recorder.frames.length === 0) {
          console.error(`drive: --record captured no frames`);
          code = 1;
        } else {
          const frames = recorder.frames.map((frame) => ({ png: frame.png, delayMs: recorder.frameMs }));
          assembleMp4(frames, mp4Path);
          console.log(mp4Path);
          const bytes = statSync(mp4Path).size;
          console.error(
            `drive: recorded ${frames.length} frame(s) at ${args.recordFps}fps, ${(bytes / 1_000_000).toFixed(2)}MB mp4 (${(frames.length / args.recordFps).toFixed(1)}s of game time)`,
          );
        }
      } else if (args.record !== undefined) {
        await session.send("Page.stopScreencast");
        // Let an in-flight frame land before assembling.
        await new Promise((r) => setTimeout(r, 300));
        let frames = framesFromTimeline(recorded);
        if (frames.length === 0) {
          console.error(`drive: --record captured no frames — the page never repainted during the drive`);
          code = 1;
        } else {
          const mp4Path = join(outDir, `${args.game}-${args.record}${sizeSuffix(args.size)}.mp4`);
          try {
            assembleMp4(frames, mp4Path);
            console.log(mp4Path);
          } catch (error) {
            console.error(
              `drive: mp4 encode failed (${error instanceof Error ? error.message : error}) — the GIF still carries the clip`,
            );
          }
          let gif = assembleGif(frames);
          let thinned = 0;
          while (gif.length > RECORD_BUDGET_BYTES && frames.length > 2) {
            frames = thinFrames(frames);
            gif = assembleGif(frames);
            thinned += 1;
          }
          const outPath = join(outDir, `${args.game}-${args.record}${sizeSuffix(args.size)}.gif`);
          writePngAtomic(outPath, gif);
          console.log(outPath);
          console.error(
            `drive: recorded ${frames.length} frame(s), ${(gif.length / 1_000_000).toFixed(2)}MB animated GIF` +
              (thinned > 0 ? ` (thinned x${thinned} to fit the ~4.5MB GitHub camo budget)` : ""),
          );
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
      await session.close();
    }
    return code;
  },
);
process.exit(exitCode);
