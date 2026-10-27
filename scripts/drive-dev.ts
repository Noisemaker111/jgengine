/**
 * Drive: navigate a game in the dev runner, perform ordered interactions
 * (click text, hold keys, wait), and take screenshots at any point — the
 * verification tool for games gated behind menus/character-select screens.
 *
 *   bun run drive <gameId> [--mode play] \
 *     --click "SALVADOR" --wait 2000 --shot picked \
 *     --key KeyW:2500 --shot walked
 *
 * Clicks and double-clicks require stable, enabled, unobstructed targets.
 * Fill matches a text field's accessible label and uses native keyboard/text
 * input, then Tab to commit changes. Keys hold for the given milliseconds.
 *
 * Managed warm loop: `shoot daemon start` keeps Chrome warm and lazily retains
 * the requested game or website Vite target. Manual `--keep`/`--connect` also
 * remains available. `--size half` is the cheap iteration mode; `--quick` is the
 * cheaper one (960x540, one settled frame in a 2s window, no video, no perf pass).
 */
import { provisionCapturedGame } from "./provisionCapture";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import {
  CdpSession,
  applyCaptureQuality,
  applyDevice,
  assertQualityApplied,
  captureProfile,
  captureViewportPng,
  draftSuffix,
  ensureDevServer,
  ensureWebServer,
  forwardPageConsole,
  isUp,
  navigateCapturePageWithRetry,
  openPageSession,
  parseSizeArg,
  qualitySuffix,
  readCapturePageState,
  readMissingModels,
  missingModelsProblem,
  readReportedQuality,
  sizeForDraft,
  screencastCapturesFully,
  sizeSuffix,
  sweepCaptureProfiles,
  withBrowserSession,
  writePngAtomic,
  type SizeMode,
  type Device,
  type ViewportOverride,
} from "./browser-lib";
import { markStep, SERVER_STEP_MS, withStepDeadline } from "./hangReport";
import { acquireWarmCapture, daemonDiedUnder, ensureDaemonTarget, withDaemonWatch, brokerTurn, type ShootDaemonState } from "./shoot-daemon";
import { lookSearchParams, parseLookAim } from "./lookArg";
import { driveTargetUrl, externalCaptureUrl, parseCaptureDevice, requireReusableCaptureStorage } from "./captureTarget";
import { assertOneTarget, serveGameDir, splitGameDir } from "./servedGame";
import {
  QUICK_DRIVE_WINDOW_MS,
  assertQuickIsIterationOnly,
  quickProfile,
  quickSuffix,
  quickTimingLine,
  splitQuickFlag,
} from "./capture-preset";
import { CAPTURE_FLAGS, captureFlagHelp, parseCaptureArgs, parseGraphicsTier, stepDurationMs, type CaptureStep, type GraphicsTier } from "../packages/jgengine/src/templates/captureArgs";
import { awaitGameView, sendDriveChord } from "../packages/jgengine/src/templates/driveSteps";
import { driveProjectDir, flowsDirOf, listFlowNames, loadFlow, missingFlowsMessage } from "./driveFlows";
import { runDriveSteps, type DriveStepRecord } from "./driveRun";
import { createBrowserFlow } from "./browserFlow";
import { runLiveSteps, splitStepFlags } from "./driveStep";
import { clearOriginStorage, clickText, driveDeps, fillField, focusSurface, holdKey, installFrameCounter, pageFlowDriver, readFrames, readProbe, rpc } from "./drivePage";
import { createFlowStepper, describeFlowReport, runFlowReport, type FlowRunReport } from "../packages/core/src/play/flowSteps";
import { runFlowHeadless } from "../packages/core/src/play/headlessFlow.draw";
import type { ProofFlow } from "../packages/core/src/play/flow";
import { dispatchClickAt, parseClickAt } from "../packages/jgengine/src/clickInput";
import { decodePng } from "../packages/assets/src/imageCodec";
import { engineRecord, resolveEngineIdentity, type EngineRecord } from "./engineIdentity";
import { shotSignature } from "./shot-metrics";
import { buildShotRecord, clearShotTarget, describeReplacement, writeShotRecord, type PreviousShot } from "./shotProvenance";
import { classifyRenderCadence, summarizePlaytest, type ProbeSample } from "./playtest";
import { framesFromTimeline, thinFrames, type TimedPng } from "./apng";
import { assembleGif } from "./gif";
import { assembleMp4 } from "./video";
import { driveShotPath, shotsDir } from "./shotPath";

type Step = CaptureStep;

/** What this run served, set once the engine gate passes and stamped into every saved record. */
let engineForRecord: EngineRecord | null = null;

/** A lockstep step that commits no new frame falls back to a forced capture after this. */
const LOCKSTEP_FRAME_TIMEOUT_MS = 20_000;

/** Below this effective render cadence (frames actually drawn per second over the
 * playtest window) a held key advances the sim too little to distinguish real
 * progress from a softlock, so the `--playtest` verdict degrades to a warning
 * instead of a (false) SOFTLOCK — see issue #1506. */
const LOW_FPS_THRESHOLD = 5;

type Args = {
  game: string;
  mode: string;
  modeExplicit: boolean;
  device: Device;
  size: SizeMode;
  /** The tier `--quality` pinned; undefined leaves the game's own tier, which the summary still reports. */
  quality?: GraphicsTier;
  /** `--draft`: the low-tier half-size iteration preset. */
  draft: boolean;
  connect?: number | undefined;
  keep: boolean;
  help: boolean;
  timeoutMs: number;
  timeoutExplicit: boolean;
  steps: Step[];
  playtest: boolean;
  strict: boolean;
  seed: number;
  sampleMs: number;
  softlockMs: number;
  epsilon: number;
  spawn?: string | undefined;
  params: [string, string][];
  look?: string | undefined;
  lookFrom?: string | undefined;
  view?: string | undefined;
  state?: string | undefined;
  site?: string | undefined;
  url?: string | undefined;
  record?: string | undefined;
  recordWidth: number;
  recordFps: number;
  recordRealtime: boolean;
  reuseStorage: boolean;
  port?: number | undefined;
  width?: number | undefined;
  height?: number | undefined;
  settle?: number | undefined;
  run?: string | undefined;
  style?: string | undefined;
  /** Show a real window (off-screen) instead of headless Chrome. */
  headed: boolean;
  /** `--cold`: boot Chrome and Vite directly, proving a clean start. */
  cold: boolean;
  /** 960x540 iteration preset: one settled frame in a 2s window, no video, no perf pass. */
  quick: boolean;
  /** `--game-dir`: serve this game from another checkout instead of `games/<game>`. */
  gameDir: string | null;
  /** Named flow this run plays, when it plays one. */
  flow?: string | undefined;
  /** `--browser`: play a headless flow in the browser. */
  browser: boolean;
  /** List the game's flows and exit. */
  flows: boolean;
  /** Also write one JSONL line per step here. */
  log?: string | undefined;
};

/** GitHub's camo image proxy stops serving around 5 MB — stay safely under it
 * so a recorded clip actually animates in the PR body. */
const RECORD_BUDGET_BYTES = 4_500_000;

const HELP = `bun run drive <gameId> --flow <name>     (a TypeScript route from <game>/proofs/flows/)
bun run drive <gameId> [options] --click "TEXT" --shot name ...   (one-off drive)

${captureFlagHelp("drive", "engine", CAPTURE_FLAGS)}

Flows:
  A flow is <game>/proofs/flows/<name>.flow.ts: the route a proof needs, written in TypeScript
  against the game's own typed probe, so a typo in a key or a probe field is a compile error.

    import { defineFlow } from "@jgengine/core/play/flow";
    import { game } from "../../src/game.config";

    export default defineFlow(game, {
      async run(f) {
        await f.command("debug.grantGold", { amount: 500 });
        await f.heading(Math.PI / 2);
        await f.hold("KeyW", { until: (p) => p.x > 40 });
        await f.waitFor((p) => p.wave >= 2, { note: "second wave started" });
        await f.expect((p) => p.gold < 500, "the shop took the gold");
        await f.shot("second-wave");
      },
    });

  bun run drive ember-command --flow to-skirmish      # headless: no browser, game time, seconds
  bun run drive ember-command --flow to-skirmish --browser --size half   # the same route on the page
  bun run drive ember-command --flows                 # names, and which need the browser

  Headless is the default: the real game ticks at 60 Hz with keys mapped to its own bindings, so
  a key it binds nowhere fails the step. Shots are skipped headless. A flow that needs the page
  (menus, DOM text, clicks, real mouse look) sets browser: true and gets click, clickAt,
  moveMouse, look, aimAt, fill, see, page, waitForPage, expectPage, reload and rpc. state: "<name>" boots a capture.states entry.
  A passing run prints one line; a failing one prints the step, what it expected, the probe
  readings at that moment and the steps before it.

Live steps (try a flow call before writing it into the flow):
  bun run drive ember-command --step 'f.click("Pause battle")'
  bun run drive ember-command --step 'f.see("Paused")' --step 'f.probe()'
  bun run drive ember-command --fresh --step 'f.waitFor((p) => p.wave >= 1)'

  --step runs one browser-flow call (or statements using f) on a page of the game that stays
  running in the warm browser, so the next --step carries on from where this one left it and
  answers in seconds. Repeat --step to run several in order on one page; the first failure stops
  them. --fresh boots the page again (also --state, --param and the other page options start a
  new page). A failed click, probe check or page-text check names the closest controls, probe
  keys or text; a misspelt f.call names the closest calls.

Notes:
  --probe before and after a --key hold proves movement by RPC on a low-fps headless page.
  --record runs LOCKSTEP: game time advances one tick per captured frame, so choreograph
  8-15s of game time. --reuse-storage needs a live daemon or --connect.
  --port starts (or reuses) the dev runner on that port instead of the per-checkout default.
  --headed opens a real Chrome window off-screen, for debugging a drive; every run is
  headless unless you ask, and the window never lands on the desktop.
  --quick is the iteration preset: 960x540, one settled frame in a 2s window, no
  video, no perf pass. It cannot support a 1600x900 pixel claim or a frame-time
  claim, so asking for either alongside it fails; re-run without --quick for
  evidence.

Engine:
  Every run prints the engine it actually renders: the dev runner serves this
  checkout's source, so the line names its version and commit.

  --game-dir <path> serves <game> from another checkout - a lane's worktree, not
  this repo's games/<game> clone - and reads that checkout's flows and writes its
  shots beside them. The folder is named after the game, and its parent is read for
  the engine pin.

Warm capture (started for you; no lane starts the daemon by hand):
  bun run drive <game> --click START --shot before      # reuses or starts the daemon
  --cold skips the daemon entirely: fresh Chrome and Vite, for evidence runs that
  must prove a clean boot. Each run prints which happened and how long it took:
    warm: reused :9261 (0.2s)      cold: started :9261 (4.1s)
  bun run drive <game> --click START --shot after --connect <port> --quick
`;

/** The game (or site) project a run targets: its flows and evidence live under it; shots go in shots/. */
function projectDirOf(args: Args): string {
  // A game served from another checkout keeps its flows there too.
  if (args.gameDir !== null) return resolve(args.gameDir);
  return driveProjectDir(
    { game: args.game, ...(args.site === undefined ? {} : { site: args.site }), external: args.game === "url" },
    process.cwd(),
    resolve(import.meta.dir, ".."),
    existsSync,
  );
}

/** Map the shared capture command line (packages/jgengine/src/templates/captureArgs.ts) onto drive's options. */
function parseArgs(argv: string[]): Args {  // `--headed` is parsed here, not in CAPTURE_FLAGS: the scaffold's drive.mjs has no local window to
  // show, so the flag stays engine-only instead of parsing there and doing nothing.
  const quick = splitQuickFlag("drive", argv);
  // `--cold` is parsed here, not in CAPTURE_FLAGS: the portable harness has no daemon to skip.
  const cold = quick.argv.includes("--cold");
  const headed = quick.argv.includes("--headed");
  // `--game-dir` is parsed here, not in CAPTURE_FLAGS: the portable harness has no `games/` to swap.
  const served = splitGameDir(quick.argv);
  // Flows resolve inside parseCaptureArgs, so the served folder must be known first or `--flow`
  // reads the engine's own `games/<game>` copy. serveGameDir validates the folder later.
  if (served.dir !== null) process.env["JG_GAME_DIR"] = resolve(served.dir);
  const parsed = parseCaptureArgs(
    "drive",
    served.argv.filter((arg) => arg !== "--headed" && arg !== "--cold"),
    CAPTURE_FLAGS,
  );
  const o = parsed.options;
  const str = (name: string): string | undefined => (typeof o[name] === "string" ? (o[name] as string) : undefined);
  const num = (name: string): number | undefined => (str(name) === undefined ? undefined : Number(str(name)));
  if (parsed.positionals.length > 1) throw new Error(`drive: one game id, got ${parsed.positionals.join(" ")}`);
  const draft = o["draft"] === true;
  const quality = draft ? "low" : str("quality") === undefined ? undefined : parseGraphicsTier(str("quality"));
  const args: Args = {
    game: str("game") ?? parsed.positionals[0] ?? "",
    mode: str("mode") ?? "play",
    modeExplicit: str("mode") !== undefined,
    device: parseCaptureDevice(str("device") ?? "desktop"),
    ...(quality === undefined ? {} : { quality }),
    draft,
    size: sizeForDraft(draft, str("size") === undefined ? undefined : parseSizeArg(str("size"))),
    connect: num("connect"),
    keep: o["keep"] === true,
    cold,
    help: parsed.help,
    timeoutMs: (num("timeout") ?? 60) * 1000,
    timeoutExplicit: str("timeout") !== undefined,
    steps: parsed.steps,
    params: ((o["param"] as string[] | undefined) ?? []).map((pair) => [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)] as [string, string]),
    playtest: o["playtest"] === true,
    strict: o["strict"] === true,
    seed: num("seed") ?? 1,
    sampleMs: num("sample") ?? 250,
    softlockMs: num("softlock") ?? 2000,
    epsilon: num("epsilon") ?? 1e-3,
    spawn: str("spawn"),
    look: str("look"),
    lookFrom: str("look-from"),
    view: str("view") === "" ? undefined : str("view"),
    state: str("state"),
    site: str("site"),
    url: str("url") === undefined ? undefined : externalCaptureUrl(str("url")),
    record: str("record"),
    recordWidth: num("record-width") ?? 640,
    recordFps: num("record-fps") ?? 24,
    recordRealtime: o["record-realtime"] === true,
    reuseStorage: o["reuse-storage"] === true,
    port: num("port"),
    width: num("width"),
    height: num("height"),
    settle: num("settle"),
    run: str("run"),
    style: str("style"),
    headed,
    quick: quick.quick,
    gameDir: served.dir,
    flow: str("flow"),
    browser: o["browser"] === true,
    flows: o["flows"] === true,
    log: str("log"),
  };
  if (args.help) return args;
  if (args.flows && (args.flow !== undefined || args.steps.length > 0)) {
    throw new Error("drive: --flows only lists the game's flows; drop the other step options");
  }
  if (args.flow !== undefined && args.steps.length > 0) {
    throw new Error("drive: --flow plays a committed route, so drop the step flags (" + args.steps.map((step) => step.kind).join(", ") + "); put them in the flow");
  }
  if (args.browser && args.flow === undefined) throw new Error("drive: --browser picks where a --flow plays; pass --flow <name>");
  assertQuickIsIterationOnly({
    tool: "drive",
    quick: args.quick,
    width: args.width,
    height: args.height,
    size: str("size"),
    device: str("device"),
    playtest: args.playtest,
    record: args.record,
    recordRealtime: args.recordRealtime,
    recordFps: str("record-fps") === undefined ? undefined : args.recordFps,
    recordWidth: str("record-width") === undefined ? undefined : args.recordWidth,
  });
  if (args.quick) {
    const preset = quickProfile(true);
    args.width = preset.width;
    args.height = preset.height;
    args.size = "full";
  }
  if (args.record !== undefined && (args.record.includes("/") || args.record.includes("\\"))) {
    throw new Error(`drive: --record takes a bare name, not a path (got "${args.record}")`);
  }
  if (args.url !== undefined && (args.site !== undefined || args.game !== "")) {
    throw new Error("drive: --url selects an external target; omit the game id and --site");
  }
  if (args.steps.some((step) => step.kind === "reload") &&
    (args.playtest || (args.record !== undefined && !args.recordRealtime))) {
    throw new Error("drive: --reload cannot reset the clock during lockstep recording or --playtest; use a separate recovery drive");
  }
  if (args.game === "" && args.site === undefined && args.url === undefined) {
    throw new Error("drive: pass a game id, --site <path>, or --url <url>, e.g. bun run drive the-robots --click START");
  }
  if (args.game === "") args.game = args.url === undefined ? "site" : "url";
  if (args.site !== undefined && !args.timeoutExplicit) {
    args.timeoutMs = process.platform === "linux" || process.env["CI"] !== undefined ? 30_000 : 10_000;
  }
  if (
    args.flow === undefined &&
    !args.playtest &&
    args.record === undefined &&
    !args.steps.some((step) => step.kind === "shot" || step.kind === "rpc" || step.kind === "probe")
  ) {
    args.steps.push({ kind: "shot", name: "drive" });
  }
  return args;
}

/**
 * Read the page's live WebGL renderer string and classify it as software GL.
 * Cloud containers run headless Chrome on SwiftShader/ANGLE-software at a tiny
 * fraction of real-time fps, so held-key movement barely advances and every
 * game reads as a false SOFTLOCK (issue #1506). Detecting the software backend
 * lets `--playtest` degrade its verdict to a warning instead of a hard failure.
 */
async function detectSoftwareGl(session: CdpSession): Promise<{ renderer: string | null; software: boolean }> {
  const value = await session.evaluate<{ renderer: string | null; software: boolean }>(`(() => {
      try {
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
        if (gl === null) return { renderer: null, software: true };
        const ext = gl.getExtension("WEBGL_debug_renderer_info");
        const raw = ext !== null ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
        const renderer = typeof raw === "string" ? raw : null;
        const software = renderer !== null && /swiftshader|llvmpipe|software|basic render|microsoft basic/i.test(renderer);
        return { renderer, software };
      } catch {
        return { renderer: null, software: false };
      }
    })()`);
  return value ?? { renderer: null, software: false };
}

/**
 * Lockstep recorder: takes over the page's `requestAnimationFrame` and clocks
 * (the timeweb/timecut technique) so game time only advances when we say so —
 * exactly ONE rendered frame per `1000/fps` ms tick, captured after it draws.
 * The sim sees ordinary frame deltas, so the assembled clip plays smoothly at
 * the target fps no matter how slowly software GL actually renders. (CDP
 * virtual time is the wrong tool here: it fires rAF at 60 virtual fps, causing
 * several unnecessary renders per captured frame.) The honest cost is wall-clock —
 * one real render per output frame — so choreograph recorded drives in seconds
 * of game time, not minutes.
 */
class LockstepRecorder {
  readonly frames: TimedPng[] = [];
  readonly frameMs: number;
  private virtualMs = 0;
  /** The clock this recorder has advanced to; the run reads it as the time source under a lockstep record. */
  get virtualNow(): number {
    return this.virtualMs;
  }
  private pump: ((frame: { data: string; timestamp: number }) => void) | null = null;
  private stopPump: (() => void) | null = null;

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
    if (process.env["JG_CAPTURE_SCREENCAST"] === "0") {
      await this.captureFrame();
      return;
    }
    this.stopPump = this.session.on("Page.screencastFrame", (params) => {
      const sessionId = params["sessionId"];
      if (typeof sessionId === "number" || typeof sessionId === "string") {
        void this.session.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
      }
      const data = params["data"];
      const timestamp = (params["metadata"] as { timestamp?: number } | undefined)?.timestamp;
      if (typeof data !== "string" || data.length === 0) return;
      this.pump?.({ data, timestamp: typeof timestamp === "number" ? timestamp : Date.now() / 1000 });
    });
    await this.session.send("Page.startScreencast", { format: "jpeg", quality: 85, everyNthFrame: 1 });
    await this.captureFrame();
  }

  /** Release the screencast pump; safe to call twice. */
  async stop(): Promise<void> {
    this.stopPump?.();
    this.stopPump = null;
    this.pump = null;
    await this.session.send("Page.stopScreencast").catch(() => {});
  }

  /** Advance game time by `ms`, rendering + capturing one frame per tick. */
  async advance(ms: number): Promise<void> {
    for (let done = 0; done < ms; done += this.frameMs) {
      const budget = Math.min(this.frameMs, ms - done);
      await this.session.evaluate(`globalThis.__jgVtStep(${budget})`);
      this.virtualMs += budget;
      await this.captureFrame();
    }
  }

  /**
   * Take the frame the step just drew. The screencast pump hands over the composited
   * frame for roughly one render; `Page.captureScreenshot` forces its own re-raster on
   * top of that one and costs several (measured ~2s vs ~1s per half-res frame here), so
   * it is only the fallback for a step that commits nothing. JPEG throughout — lockstep
   * output is mp4, which takes JPEG frames directly.
   */
  private async captureFrame(): Promise<void> {
    const notBefore = Date.now() / 1000;
    const streamed = this.stopPump === null ? null : await new Promise<string | null>((resolvePromise) => {
      const timer = setTimeout(() => {
        this.pump = null;
        resolvePromise(null);
      }, LOCKSTEP_FRAME_TIMEOUT_MS);
      this.pump = (frame) => {
        if (frame.timestamp < notBefore) return;
        clearTimeout(timer);
        this.pump = null;
        resolvePromise(frame.data);
      };
    });
    const data =
      streamed ??
      (await this.session.send("Page.captureScreenshot", { format: "jpeg", quality: 85, fromSurface: true }))["data"];
    if (typeof data !== "string" || data.length === 0) return;
    this.frames.push({ png: Buffer.from(data, "base64"), tMs: this.virtualNow });
  }
}

async function screenshot(
  session: CdpSession,
  outPath: string,
  size: SizeMode,
  device: Device,
  screencast: boolean,
  previous: PreviousShot | undefined,
  viewport: ViewportOverride,
  settleWindowMs: number,
): Promise<void> {
  await awaitGameView(session, settleWindowMs, driveDeps);
  const profile = captureProfile(device, size, viewport);
  const { region } = await readCapturePageState(session);
  const editor = await session.evaluate<boolean>(`document.documentElement.dataset.jgEditor === "1"`);
  const { bytes } = await captureViewportPng(session, {
    screencast: screencast && editor !== true && screencastCapturesFully(profile),
    expect: {
      width: Math.round(profile.width * profile.deviceScaleFactor),
      height: Math.round(profile.height * profile.deviceScaleFactor),
    },
    ...(region === undefined ? {} : { liveRegion: region }),
  });
  writePngAtomic(outPath, bytes);
  const decoded = decodePng(bytes);
  const record = buildShotRecord({
    bytes,
    command: ["bun run drive", ...process.argv.slice(2)].join(" "),
    capturedAt: new Date().toISOString(),
    signature: shotSignature(decoded.width, decoded.height, decoded.data),
    width: decoded.width,
    height: decoded.height,
    ...(previous === undefined ? {} : { previous }),
    ...(engineForRecord === null ? {} : { engine: engineForRecord }),
  });
  writeShotRecord(outPath, record);
  console.log(outPath);
  const replacement = describeReplacement(record);
  if (replacement !== null) console.error(`drive: ${replacement}`);
}

const live = splitStepFlags(process.argv.slice(2));
const args = parseArgs(live.argv);
if (args.help) {
  console.log(HELP);
  process.exit(0);
}
if (args.gameDir !== null) {
  assertOneTarget({ served: args.gameDir, ...(args.url === undefined ? {} : { url: args.url }), ...(args.site === undefined ? {} : { site: args.site }) });
  serveGameDir(args.gameDir, args.game);
}
if (args.flows) {
  const dir = flowsDirOf(projectDirOf(args));
  const names = listFlowNames(dir, (path) => readdirSync(path));
  if (names.length === 0) {
    console.error("drive: " + missingFlowsMessage(dir));
    process.exit(1);
  }
  for (const name of names) {
    try {
      const flow = await loadFlow(dir, name);
      console.log(name + ": " + (flow.browser ? "browser" : "headless") + (flow.state === undefined ? "" : ", state " + flow.state));
    } catch (error) {
      console.log(name + ": INVALID — " + (error instanceof Error ? error.message : String(error)));
    }
  }
  process.exit(0);
}

/** The flow this run plays, loaded once; `null` for a run of step flags. */
const flow: ProofFlow | null = args.flow === undefined ? null : await loadFlow(flowsDirOf(projectDirOf(args)), args.flow).catch((error: unknown) => {
  console.error("drive: " + (error instanceof Error ? error.message : String(error)));
  process.exit(1);
});

/** Print a flow's result the quiet way, write its --log rows, and give the exit code. */
function finishFlow(name: string, report: FlowRunReport): number {
  for (const line of describeFlowReport(name, report)) (report.ok ? console.log : console.error)(line);
  if (args.log !== undefined) {
    const logPath = resolve(args.log);
    mkdirSync(dirname(logPath), { recursive: true });
    const failedAt = report.ok ? -1 : report.failure.index;
    const rows = report.steps.map((step) =>
      JSON.stringify({ index: step.index, name: step.label, ms: step.ms, pass: step.index !== failedAt, ...(step.index === failedAt && !report.ok ? { detail: report.failure.message } : {}) }));
    writeFileSync(logPath, rows.map((row) => row + "\n").join(""));
  }
  return report.ok ? 0 : 1;
}

// A headless flow needs no browser, no dev server and no assets: the game ticks in this process.
if (flow !== null && !flow.browser && !args.browser) {
  process.exit(finishFlow(args.flow ?? "flow", await runFlowHeadless(flow, args.state === undefined ? {} : { state: args.state })));
}

sweepCaptureProfiles();
// A game captured from this checkout pulls the packs it references first, the way its own `dev` does,
// so a missing model in the shot is a real path bug rather than an unprovisioned checkout.
if (args.url === undefined && args.site === undefined) await provisionCapturedGame(args.gameDir ?? resolve(import.meta.dir, "../games", args.game));

if (live.steps.length > 0) {
  const stepFlags = args.steps.filter((step) => !(step.kind === "shot" && step.name === "drive" && step.out === undefined));
  if (flow !== null || stepFlags.length > 0 || args.record !== undefined || args.playtest) {
    console.error("drive: --step runs flow calls on the live page; drop --flow, --record, --playtest and the step flags");
    process.exit(1);
  }
  if (args.url !== undefined || args.site !== undefined || args.connect !== undefined || args.cold || args.headed) {
    console.error("drive: --step runs on a game in the warm browser; drop --url, --site, --connect, --cold and --headed");
    process.exit(1);
  }
  const stepViewport: ViewportOverride = { width: args.width, height: args.height };
  process.exit(await runLiveSteps({
    steps: live.steps,
    fresh: live.fresh,
    targetUrl,
    device: args.device,
    size: args.size,
    viewport: stepViewport,
    timeoutMs: args.timeoutMs,
    reuseStorage: args.reuseStorage,
    async shot(session, name) {
      const path = driveShotPath(shotsDir(join(import.meta.dir, "..")), args.game, name);
      mkdirSync(dirname(path), { recursive: true });
      await screenshot(session, path, args.size, args.device, true, clearShotTarget(path), stepViewport, args.quick ? QUICK_DRIVE_WINDOW_MS : 60_000);
    },
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }));
}
const startedAt = performance.now();

const outDir = resolve(import.meta.dir, "../shots");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
for (const step of args.steps) {
  if (step.kind === "shot" && step.out !== undefined) mkdirSync(dirname(step.out), { recursive: true });
}
const preparedShots = new Map<string, PreviousShot | undefined>();
for (const step of args.steps) {
  if (step.kind !== "shot") continue;
  const path = step.out ?? join(outDir, `${args.game}-${step.name}${sizeSuffix(args.size)}${qualitySuffix(args.quality)}${draftSuffix(args.draft)}${quickSuffix(args.quick)}.png`);
  if (!preparedShots.has(path)) preparedShots.set(path, clearShotTarget(path));
}

const viewport: ViewportOverride = { width: args.width, height: args.height };
const clickPoints = new Map<CaptureStep, { x: number; y: number }>();
{
  const profile = captureProfile(args.device, args.size, viewport);
  for (const step of args.steps) {
    if (step.kind === "click-at") clickPoints.set(step, parseClickAt(step.spec, profile.width, profile.height));
  }
}
if (args.port !== undefined) process.env["JG_DEV_PORT"] = String(args.port);

/** The page a run opens on the dev server at `base`: the game, mode and every option the page reads. */
function targetUrl(base: string): URL {
  const url = applyCaptureQuality(driveTargetUrl(args, base), args.quality);
  url.searchParams.set("capture", "1");
  if (args.spawn !== undefined && args.spawn.length > 0) url.searchParams.set("spawn", args.spawn);
  for (const [key, value] of args.params) url.searchParams.set(key, value);
  if (args.view !== undefined) url.searchParams.set("view", args.view);
  const state = args.state ?? flow?.state;
  if (state !== undefined) url.searchParams.set("state", state);
  if (args.run !== undefined) url.searchParams.set("run", args.run);
  if (args.style !== undefined) url.searchParams.set("style", args.style);
  if (args.settle !== undefined) url.searchParams.set("settle", String(args.settle));
  const aim = parseLookAim(args.look, args.lookFrom, { withNamedView: args.view !== undefined });
  if (aim !== undefined) {
    for (const [key, value] of Object.entries(lookSearchParams(aim))) url.searchParams.set(key, value);
  }
  if (args.playtest) url.searchParams.set("seed", String(args.seed));
  return url;
}

async function driveSession(daemon: ShootDaemonState | null): Promise<number> {
  requireReusableCaptureStorage(args.reuseStorage, args.connect !== undefined, daemon !== null);
  if (args.url !== undefined && !(await isUp(args.url))) {
    throw new Error(`drive: nothing is listening at ${args.url} — start that external server first`);
  }
  const dev = args.url !== undefined
    ? { base: args.url, child: null, pid: undefined }
    : await withStepDeadline("start or reuse the dev server", SERVER_STEP_MS, async () =>
        daemon === null
          ? args.site === undefined ? await ensureDevServer() : await ensureWebServer()
          : await ensureDaemonTarget(daemon, args.site === undefined ? "dev" : "web"));

  const lockstep = args.record !== undefined && !args.recordRealtime && !args.playtest;
  const lockstepVirtualMs = args.steps.reduce(
    (sum, step) => sum + (step.kind === "key" ? step.holdMs : step.kind === "wait" ? step.ms : 0),
    0,
  );
  const lockstepProjected = Math.ceil(lockstepVirtualMs / Math.max(20, Math.round(1000 / args.recordFps)));

  return withDaemonWatch(daemon, withBrowserSession(
    {
      keep: args.keep,
      connect: args.connect,
      timeoutMs: args.timeoutMs,
      server: dev.child,
      serverPid: dev.pid,
      debugPort: daemon?.chromePort,
      attach: daemon !== null,
      leaveWarm: args.keep || daemon !== null,
      chromePrefix: "jg-drive-",
      turn: brokerTurn(daemon),
      headed: args.headed,
      // One real render + capture per output frame — give the watchdog room.
      ...(lockstep ? { hardDeadlineMs: args.timeoutMs + 120_000 + lockstepProjected * 3_000 } : {}),
    },
    async ({ debugPort }) => {
      let code = 0;
      const session = await openPageSession(debugPort);
      const stopConsoleForward = forwardPageConsole(session, "drive:");
      try {
        await session.send("Page.enable");
        await session.send("Runtime.enable");
        await applyDevice(session, args.device, args.size, viewport);
        const url = targetUrl(dev.base);
        const aim = parseLookAim(args.look, args.lookFrom, { withNamedView: args.view !== undefined });
        if (!args.reuseStorage) await clearOriginStorage(session, new URL(url.toString()).origin);
        markStep(`open ${url.pathname}${url.search}`);
        await navigateCapturePageWithRetry(session, url.toString(), dev.base, args.timeoutMs, 2, { legacyCanvas: args.url !== undefined });
        // The tier the game resolved, not the flag: a tier that never reached the render path is
        // the failure this readout exists to catch, and the run summary repeats it.
        const reportedTier = await readReportedQuality(session);
        if (args.quality !== undefined) assertQualityApplied(args.quality, reportedTier);
        if (aim !== undefined) {
          const applied = await session.evaluate<string | null>(`document.documentElement.dataset.jgLook ?? null`);
          if (typeof applied !== "string" || applied.length === 0) {
            throw new Error(`--look ${args.look} never reached the camera — the runner reported no applied aim`);
          }
          console.error(`drive: look applied ${applied}`);
        }
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
            const data = params["data"];
            const sessionId = params["sessionId"];
            const metadata = params["metadata"] as { timestamp?: number } | undefined;
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

        // Renderer classification for the playtest verdict: a software-GL host
        // (cloud SwiftShader) delivers a tiny fraction of real-time fps, so a
        // flat progress probe cannot be trusted as a genuine softlock (#1506).
        const gl = args.playtest ? await detectSoftwareGl(session) : { renderer: null, software: false };
        const samples: ProbeSample[] = [];
        let sampling = args.playtest;
        const sampleStart = Date.now();
        const framesAtStart = args.playtest ? await readFrames(session) : 0;
        const sampler = args.playtest
          ? (async () => {
              while (sampling) {
                const metrics = await readProbe(session);
                if (metrics !== null) samples.push({ t: Date.now() - sampleStart, metrics });
                await new Promise((r) => setTimeout(r, args.sampleMs));
              }
            })()
          : Promise.resolve();

        const takeShot = async (path: string, previous: PreviousShot | undefined) =>
          screenshot(session, path, args.size, args.device, args.record === undefined, previous, viewport, args.quick ? QUICK_DRIVE_WINDOW_MS : 60_000);

        if (flow !== null) {
          const driver = pageFlowDriver(session, {
            clock: recorder,
            async reload() {
              await navigateCapturePageWithRetry(session, url.toString(), dev.base, args.timeoutMs, 2, { legacyCanvas: args.url !== undefined });
              await installFrameCounter(session);
            },
            async shot(name) {
              const path = driveShotPath(shotsDir(join(import.meta.dir, "..")), args.game, name);
              mkdirSync(dirname(path), { recursive: true });
              await takeShot(path, clearShotTarget(path));
            },
          });
          const stepper = createFlowStepper(() => readProbe(session));
          const reports: { label: string; probe: unknown }[] = [];
          const browserFlow = createBrowserFlow(driver, stepper, reports);
          code = finishFlow(args.flow ?? "flow", await runFlowReport(stepper, reports, () => flow.run(browserFlow)));
        }

        const logPath = flow !== null || args.log === undefined ? undefined : resolve(args.log);
        if (logPath !== undefined) {
          mkdirSync(dirname(logPath), { recursive: true });
          writeFileSync(logPath, "");
        }

        const done = flow !== null ? { failed: 0 } : await runDriveSteps(args.steps, {
          now: () => performance.now(),
          line: (text) => console.error(text),
          tier: reportedTier,
          // A lockstep frame is a real render, up to ~3s each on software GL, so virtual time costs more wall clock.
          stepTimeoutMs: (step) =>
            args.timeoutMs + stepDurationMs(step) * (lockstep ? 3_000 / Math.max(20, Math.round(1000 / args.recordFps)) : 1),
          ...(recorder === null ? {} : { virtualNow: () => recorder!.virtualNow }),
          ...(logPath === undefined
            ? {}
            : {
                record: (entry: DriveStepRecord) =>
                  appendFileSync(logPath, JSON.stringify(engineForRecord === null ? entry : { ...entry, engine: engineForRecord }) + "\n"),
              }),
          run: async (step) => {
            if (step.kind === "click" || step.kind === "double-click") {
              await clickText(session, step.text, step.kind === "double-click" ? 2 : 1);
              // Let the UI react on the virtual clock so the click's effect is in frame.
              if (recorder !== null) await recorder.advance(300);
            } else if (step.kind === "fill") {
              await fillField(session, step.label, step.value);
              if (recorder !== null) await recorder.advance(300);
            } else if (step.kind === "key") {
              if (recorder !== null) {
                // Lockstep hold: the virtual clock guarantees the sim steps under the
                // held key, so no frame-starvation grace dance is needed.
                await focusSurface(session);
                await sendDriveChord(session, step.code, "keyDown");
                try {
                  await recorder.advance(step.holdMs);
                } finally {
                  await sendDriveChord(session, step.code, "keyUp");
                }
              } else {
                await holdKey(session, step.code, step.holdMs);
              }
            } else if (step.kind === "wait") {
              if (recorder !== null) await recorder.advance(step.ms);
              else await new Promise((r) => setTimeout(r, step.ms));
            } else if (step.kind === "reload") {
              await navigateCapturePageWithRetry(session, url.toString(), dev.base, args.timeoutMs, 2, { legacyCanvas: args.url !== undefined });
              await installFrameCounter(session);
            } else if (step.kind === "click-at") {
              await session.send("Page.bringToFront");
              const point = clickPoints.get(step);
              if (point === undefined) throw new Error("click-at " + step.spec + " has no resolved point");
              await dispatchClickAt(session, point, step.button);
              if (recorder !== null) await recorder.advance(300);
            } else if (step.kind === "rpc") {
              await rpc(session, step.json);
              if (step.summarized) console.error(`drive: debug_snapshot printed its summary; pass {"method":"debug_snapshot","detail":"full"} for everything`);
            } else if (step.kind === "probe") {
              const metrics = await readProbe(session);
              console.log(JSON.stringify({ probe: step.name, metrics }));
            } else {
              // The last kind is a shot; a new CaptureStep kind fails to compile here until it has an executor.
              const shot: { kind: "shot"; name: string; out?: string } = step;
              // A recording owns the screencast pump; a shot must not start/stop it underneath.
              const path = shot.out ?? join(outDir, `${args.game}-${shot.name}${sizeSuffix(args.size)}${qualitySuffix(args.quality)}${draftSuffix(args.draft)}${quickSuffix(args.quick)}.png`);
              const previous = preparedShots.has(path) ? preparedShots.get(path) : clearShotTarget(path);
              preparedShots.delete(path);
              await takeShot(path, previous);
            }
            return "";
          },
        });
        if (done.failed > 0) code = 1;

        if (recorder !== null) {
          await recorder.stop();
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
                `drive: mp4 encode failed (${error instanceof Error ? error.message : error}) — no usable video evidence was produced`,
              );
              code = 1;
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
          const framesRendered = (await readFrames(session)) - framesAtStart;
          const result = summarizePlaytest(samples, {
            seed: args.seed,
            softlockThresholdMs: args.softlockMs,
            epsilon: args.epsilon,
          });
          // Effective render cadence over the sampled window. Below LOW_FPS a held
          // key advances the sim only a few frames total, so a flat progress probe
          // is indistinguishable from a genuine softlock — the verdict is unsafe.
          const { effectiveFps, unreliable: unreliableRender } = classifyRenderCadence(
            framesRendered,
            result.durationMs,
            gl.software,
            LOW_FPS_THRESHOLD,
          );
          console.log(JSON.stringify({ ...result, effectiveFps: Number(effectiveFps.toFixed(2)), softwareGl: gl.software, renderer: gl.renderer }));
          if (!result.probed) {
            console.error(
              `drive: no progress probe read — ${args.game} exposes no capture.probe (or it returned no metrics). Declare capture.probe to run the playtest rung.`,
            );
            if (args.strict) code = 1;
          } else if (result.softlocked && unreliableRender) {
            // Do NOT report a false softlock on a software-GL / frame-starved host.
            console.error(
              `drive: playtest rung UNRELIABLE on this host — ${gl.software ? `software GL (${gl.renderer ?? "unknown renderer"})` : `only ~${effectiveFps.toFixed(1)}fps effective`} rendered ${framesRendered} frame(s) in ${(result.durationMs / 1000).toFixed(1)}s, so flat progress does NOT prove a softlock (#1506). Not treating this as a failure.`,
            );
            console.error(
              `drive: for a trustworthy verdict, run on a GPU host, or use the deterministic headless rung — step the sim directly with stepPlayerMovement / createHeadlessRunner(...).step(1/60) instead of real-time frames (see jgengine-verify "Scene and gameplay proof").`,
            );
            // Intentionally does not set code=1 even under --strict: an untrustworthy
            // signal must not fail CI as if it were a real softlock.
          } else if (result.softlocked) {
            console.error(
              `drive: SOFTLOCK — progress stayed flat for ${result.softlockWindowMs}ms under active input (threshold ${args.softlockMs}ms, seed ${args.seed}). The loop did not advance.`,
            );
            if (args.strict) code = 1;
          } else if (unreliableRender && args.steps.some((step) => step.kind === "key")) {
            console.error(
              `drive: note — playtest ran under ${gl.software ? "software GL" : `~${effectiveFps.toFixed(1)}fps`} (${framesRendered} frame(s) in ${(result.durationMs / 1000).toFixed(1)}s); progress read as advancing, but on a frame-starved host prefer the deterministic stepPlayerMovement rung for firm evidence.`,
            );
          } else if (args.steps.every((step) => step.kind !== "key")) {
            console.error("drive: --playtest ran with no --key hold — nothing drove input, so progress is unproven.");
          }
        }
        const missingModels = missingModelsProblem(await readMissingModels(session));
        if (missingModels !== null) {
          console.error(`drive: ${missingModels}`);
          code = 1;
        }
        if (args.quick) {
          const shotProfile = captureProfile(args.device, args.size, viewport);
          console.error(
            quickTimingLine("drive", {
              seconds: (performance.now() - startedAt) / 1_000,
              width: Math.round(shotProfile.width * shotProfile.deviceScaleFactor),
              height: Math.round(shotProfile.height * shotProfile.deviceScaleFactor),
              device: args.device,
            }),
          );
        }
        if (args.keep) {
          console.error(`drive: kept warm — chrome debug port ${debugPort}, dev server on ${dev.base}`);
          console.error(`drive: next drive → bun run drive ${args.url === undefined ? `${args.game} --mode ${args.mode}` : `--url ${args.url}`} --connect ${debugPort} --size half ...`);
        }
      } finally {
        stopConsoleForward();
        await session.close();
      }
      return code;
    },
  ));
}

/** Run one drive, reporting a failure the same way `withBrowserSession` does. */
async function attempt(daemon: ShootDaemonState | null): Promise<number> {
  try {
    return await driveSession(daemon);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return 1;
  }
}

/**
 * Name the engine this run renders, and stop before any browser starts when it is older than the
 * version the game pins. A `--url` page belongs to whatever server it points at, so it is not checked.
 */
{
  const identity = resolveEngineIdentity();
  if (args.url === undefined) {
    console.error(identity.line);
    engineForRecord = engineRecord(identity);
  }
}

const explicitTarget = args.connect !== undefined || args.port !== undefined || args.url !== undefined;
// The daemon's Chrome was launched headless with the display frame clock, so a run that needs a
// window of its own must not borrow it. An external --url is not this checkout's app either.
const ownBrowser = args.headed ? "--headed needs its own browser window" : undefined;
const warm = explicitTarget
  ? { daemon: null, mode: "cold" as const, seconds: 0 }
  : await acquireWarmCapture({
      cold: args.cold || ownBrowser !== undefined,
      ...(ownBrowser === undefined ? {} : { because: ownBrowser }),
    });
let exitCode = await attempt(warm.daemon);
if (warm.daemon !== null && exitCode !== 0 && (await daemonDiedUnder(warm.daemon))) {
  console.error(
    `cold: the daemon on :${warm.daemon.chromePort} died mid-run — falling back to a direct launch, no retry`,
  );
  exitCode = await attempt(null);
}
process.exit(exitCode);

