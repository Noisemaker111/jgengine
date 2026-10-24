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
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import {
  CdpSession,
  applyCaptureQuality,
  applyDevice,
  captureProfile,
  captureViewportPng,
  ensureDevServer,
  ensureWebServer,
  forwardPageConsole,
  isUp,
  navigateCapturePageWithRetry,
  openPageSession,
  parseQualityArg,
  parseSizeArg,
  qualitySuffix,
  readCapturePageState,
  sizeForQuality,
  screencastCapturesFully,
  sizeSuffix,
  sweepCaptureProfiles,
  withBrowserSession,
  writePngAtomic,
  type CaptureQuality,
  type SizeMode,
  type Device,
  type ViewportOverride,
} from "./browser-lib";
import { acquireWarmCapture, daemonDiedUnder, ensureDaemonTarget, withDaemonWatch, type ShootDaemonState } from "./shoot-daemon";
import { lookSearchParams, parseLookAim } from "./lookArg";
import { driveTargetUrl, externalCaptureUrl, parseCaptureDevice, requireReusableCaptureStorage } from "./captureTarget";
import {
  QUICK_DRIVE_WINDOW_MS,
  assertQuickIsIterationOnly,
  quickProfile,
  quickSuffix,
  quickTimingLine,
  splitQuickFlag,
} from "./capture-preset";
import { driveInputPointExpr } from "../packages/jgengine/src/templates/driveInput";
import { CAPTURE_FLAGS, captureFlagHelp, describeFlow, describeStepFile, parseCaptureArgs, parseStepFile, rejectMixedStepFlags, type CaptureStep, type FlowFile, type FlowSource } from "../packages/jgengine/src/templates/captureArgs";
import { awaitDriveCondition, awaitGameView, holdDriveInput, type DriveConditionClock, type DriveInputDeps, type DriveSession } from "../packages/jgengine/src/templates/driveSteps";
import { driveProjectDir, flowSourceFrom, flowsDirOf, listFlowNames, missingFlowsMessage } from "./driveFlows";
import { evaluateAssertStep, runDriveSteps, type DriveStepRecord } from "./driveRun";
import { gameSurfaceCenter, mouseButtonForCode } from "../packages/jgengine/src/templates/gameSurfaceFocus";
import { dispatchClickAt, parseClickAt } from "../packages/jgengine/src/clickInput";
import { decodePng } from "./png-reader";
import { shotSignature } from "./shot-metrics";
import { buildShotRecord, clearShotTarget, describeReplacement, writeShotRecord, type PreviousShot } from "./shotProvenance";
import { classifyRenderCadence, summarizePlaytest, type ProbeSample } from "./playtest";
import { focusGameSurface, holdComplete } from "./gameSurfaceFocus";
import { framesFromTimeline, thinFrames, type TimedPng } from "./apng";
import { assembleGif } from "./gif";
import { assembleMp4 } from "./video";

type Step = CaptureStep;

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
  quality: CaptureQuality;
  connect?: number;
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
  spawn?: string;
  params: [string, string][];
  look?: string;
  lookFrom?: string;
  view?: string;
  state?: string;
  site?: string;
  url?: string;
  record?: string;
  recordWidth: number;
  recordFps: number;
  recordRealtime: boolean;
  reuseStorage: boolean;
  port?: number;
  width?: number;
  height?: number;
  settle?: number;
  run?: string;
  style?: string;
  /** Show a real window (off-screen) instead of headless Chrome. */
  headed: boolean;
  /** `--cold`: boot Chrome and Vite directly, proving a clean start. */
  cold: boolean;
  /** 960x540 iteration preset: one settled frame in a 2s window, no video, no perf pass. */
  quick: boolean;
  /** Step file this run reads, when it reads one. */
  stepsFile?: string;
  /** Named flow this run reads, when it reads one. */
  flow?: string;
  /** List the game's flows and exit. */
  flows: boolean;
  /** Parse and print the step file, then exit without a browser. */
  check: boolean;
  /** Also write one JSONL line per step here. */
  log?: string;
};

/** GitHub's camo image proxy stops serving around 5 MB — stay safely under it
 * so a recorded clip actually animates in the PR body. */
const RECORD_BUDGET_BYTES = 4_500_000;

const HELP = `bun run drive <gameId> --steps <file>   (scripted drive: checked, no flags)
bun run drive <gameId> --flow <name>     (a named route from <game>/proofs/flows/)
bun run drive <gameId> [options] --click "TEXT" --shot name ...   (one-off drive)

${captureFlagHelp("drive", "engine", CAPTURE_FLAGS)}

Script a drive:
  bun run drive ember-command --steps proofs/skirmish.json --check   # list the resolved steps, no browser
  bun run drive ember-command --steps proofs/skirmish.json

  { "steps": [
    { "click": "Free skirmish",
      "before": { "is": "menu.ready", "timeoutMs": 15000 },
      "after":  { "is": "skirmish.started" } },
    { "assert": "skirmish.units.length", "is": 4,
      "note": "arrival means four units on the field, not that the click landed" },
    { "key": "KeyH", "ms": 120,
      "before": { "is": "selection.count >= 2" },
      "after":  { "is": "squad.formationCount >= 2" } },
    { "shot": "formation-line",
      "before": { "is": "squad.formation === 'line'" } }
  ] }

  A step waits for its before condition, acts, then waits for its after condition, so
  each step starts the instant the previous one is really done. Conditions are page
  expressions polled every 50ms (default timeout 15000ms, per-condition timeoutMs). A
  timeout stops the run at that step and prints the index, the expression, the last
  value and the elapsed time; nothing after it runs.
  An "assert" step evaluates its expression once and compares it to "is" (default true).
  A mismatch stops the run there — no later key, click or shot — and prints the index,
  the expression, the expected and actual value, and the elapsed ms. Assert arrival
  ("the skirmish started, four units present"), never that a click happened.
  "shot" is a bare name: it lands in <game>/docs/<name>.png, never an absolute path,
  and a site target lands in apps/web/docs/. Coordinates are [x, y] numbers.
  "waitFor": "<expression>" is sugar for a step with only a before condition.
  A fixed "wait" still parses for CI compatibility, but it is the last resort: a guessed
  sleep either wastes the difference or races the frame. Say what must be true instead.
  --steps cannot be mixed with step flags (--click, --key, --wait, --shot, ...).

Named flows:
  A flow is a step file at <game>/proofs/flows/<name>.json holding the route every proof
  needs once: to-menu, to-skirmish, to-level-1. Run it whole, or include it:
    bun run drive ember-command --flow to-skirmish
    bun run drive ember-command --flows                       # names, step counts, asserts
    { "flow": "to-skirmish" }                                 # inside any step file
  A flow's asserts are its contract: the route is done when they pass, so a flow that
  only clicks is unfinished. Includes nest up to 4 deep; a repeated name is rejected as
  a cycle. Both errors name the flow and the chain.
  Every run prints one line per step (#3 key KeyH 120ms ok before 18ms after 21ms total
  810ms) and a passed/failed/wall/virtual summary; --log <path> also writes JSONL,
  one { index, name, kind, ms, pass, detail } object per step.

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

Warm capture (started for you; no lane starts the daemon by hand):
  bun run drive <game> --click START --shot before      # reuses or starts the daemon
  --cold skips the daemon entirely: fresh Chrome and Vite, for evidence runs that
  must prove a clean boot. Each run prints which happened and how long it took:
    warm: reused :9261 (0.2s)      cold: started :9261 (4.1s)
  bun run drive <game> --click START --shot after --connect <port> --quick
`;

/** The game (or site) project a run targets: its flows, docs/ and evidence live under it. */
function projectDirOf(args: Args): string {
  return driveProjectDir(
    { game: args.game, ...(args.site === undefined ? {} : { site: args.site }), external: args.game === "url" },
    process.cwd(),
    resolve(import.meta.dir, ".."),
    existsSync,
  );
}

/** Read a named flow; a missing name lists the ones that do exist, so the next agent picks a route instead of guessing. */
function flowSource(dir: string): FlowSource {
  return flowSourceFrom(dir, (path) => readFileSync(path, "utf8"), () => listFlowNames(dir));
}

/** Map the shared capture command line (packages/jgengine/src/templates/captureArgs.ts) onto drive's options. */
function parseArgs(argv: string[]): Args {  // `--headed` is parsed here, not in CAPTURE_FLAGS: the scaffold's drive.mjs has no local window to
  // show, so the flag stays engine-only instead of parsing there and doing nothing.
  const quick = splitQuickFlag("drive", argv);
  // `--cold` is parsed here, not in CAPTURE_FLAGS: the portable harness has no daemon to skip.
  const cold = quick.argv.includes("--cold");
  const headed = quick.argv.includes("--headed");
  const parsed = parseCaptureArgs("drive", quick.argv.filter((arg) => arg !== "--headed" && arg !== "--cold"), CAPTURE_FLAGS);
  const o = parsed.options;
  const str = (name: string): string | undefined => (typeof o[name] === "string" ? (o[name] as string) : undefined);
  const num = (name: string): number | undefined => (str(name) === undefined ? undefined : Number(str(name)));
  if (parsed.positionals.length > 1) throw new Error(`drive: one game id, got ${parsed.positionals.join(" ")}`);
  const args: Args = {
    game: str("game") ?? parsed.positionals[0] ?? "",
    mode: str("mode") ?? "play",
    modeExplicit: str("mode") !== undefined,
    device: parseCaptureDevice(str("device") ?? "desktop"),
    quality: parseQualityArg(str("quality") ?? "full"),
    size: sizeForQuality(parseQualityArg(str("quality") ?? "full"), str("size") === undefined ? undefined : parseSizeArg(str("size"))),
    connect: num("connect"),
    keep: o.keep === true,
    cold,
    help: parsed.help,
    timeoutMs: (num("timeout") ?? 60) * 1000,
    timeoutExplicit: str("timeout") !== undefined,
    steps: parsed.steps,
    params: ((o.param as string[] | undefined) ?? []).map((pair) => [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)] as [string, string]),
    playtest: o.playtest === true,
    strict: o.strict === true,
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
    stepsFile: str("steps"),
    flow: str("flow"),
    flows: o.flows === true,
    check: o.check === true,
    log: str("log"),
  };
  if (args.help) return args;
  if (args.check && args.stepsFile === undefined && args.flow === undefined) throw new Error("drive: --check needs --steps <file> or --flow <name>");
  if (args.flow !== undefined && args.stepsFile !== undefined) throw new Error("drive: --flow runs a committed flow; drop --steps (or --flow and keep the file)");
  if (args.flows && (args.flow !== undefined || args.stepsFile !== undefined || args.steps.length > 0)) {
    throw new Error("drive: --flows only lists the game's flows; drop the other step options");
  }
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
    args.timeoutMs = process.platform === "linux" || process.env.CI !== undefined ? 30_000 : 10_000;
  }
  if (args.stepsFile !== undefined || args.flow !== undefined) {
    rejectMixedStepFlags("drive", quick.argv, CAPTURE_FLAGS);
    const projectDir = projectDirOf(args);
    const docs = join(projectDir, "docs");
    const flows = flowSource(join(projectDir, "proofs", "flows"));
    let raw: unknown;
    let source: string;
    if (args.flow !== undefined) {
      if (args.flow.includes("/") || args.flow.includes("\\") || args.flow.endsWith(".json")) {
        throw new Error(`drive: --flow takes a bare name; the file lives at ${join(projectDir, "proofs", "flows", "<name>.json")} (got "${args.flow}")`);
      }
      const file = flows(args.flow);
      if (file === undefined) throw new Error("drive: no flow at " + join(projectDir, "proofs", "flows", args.flow + ".json"));
      raw = file.json;
      source = file.source;
      args.stepsFile = source;
    } else {
      if (!existsSync(resolve(args.stepsFile!))) throw new Error("drive: no step file at " + args.stepsFile);
      try {
        raw = JSON.parse(readFileSync(resolve(args.stepsFile!), "utf8"));
      } catch (error) {
        throw new Error("drive: " + args.stepsFile + " is not valid JSON (" + (error instanceof Error ? error.message : String(error)) + ")");
      }
      source = resolve(args.stepsFile!);
    }
    args.steps = parseStepFile(raw, source, { flows }).map((step) => step.kind === "shot" ? { ...step, out: join(docs, step.name + ".png") } : step);
  }
  if (
    args.stepsFile === undefined &&
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
// Match the portable drive: software GL can queue each DOM sample behind a
// multi-second rendered frame, even when the control is already actionable.
const SETTLE_TIMEOUT_MS = 45_000;
const SETTLE_MAX_SAMPLES = 10;

async function findClickPoint(session: CdpSession, text: string, input = false): Promise<{ x: number; y: number }> {
  const deadline = Date.now() + SETTLE_TIMEOUT_MS;
  let last: { x: number; y: number } | null = null;
  let stableRuns = 0;
  for (let samples = 0; samples < SETTLE_MAX_SAMPLES && Date.now() < deadline; samples += 1) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const point = (await Promise.race([
      session.evaluate<{ x: number; y: number } | null>(driveInputPointExpr(text, input)),
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), Math.max(1, deadline - Date.now())); }),
    ]).finally(() => { if (timer !== undefined) clearTimeout(timer); })) ?? null;
    if (Date.now() >= deadline) break;
    const moved = point !== null && last !== null &&
      (Math.abs(point.x - last.x) > SETTLE_EPSILON_PX || Math.abs(point.y - last.y) > SETTLE_EPSILON_PX);
    if (point !== null && last !== null && !moved) {
      stableRuns += 1;
      if (stableRuns >= SETTLE_SAMPLES - 1) return point;
    } else stableRuns = 0;
    last = point;
    await new Promise((r) => setTimeout(r, Math.min(deadline - Date.now(), point === null || moved ? 1_000 : SETTLE_INTERVAL_MS)));
  }
  throw new Error(`drive: no settled actionable element matching "${text}"`);
}

async function click(session: CdpSession, text: string, count = 1, input = false): Promise<void> {
  await session.send("Page.bringToFront");
  const point = await findClickPoint(session, text, input);
  for (let clickCount = 1; clickCount <= count; clickCount += 1) {
    for (const type of ["mousePressed", "mouseReleased"] as const) {
      await session.send("Input.dispatchMouseEvent", { type, x: point.x, y: point.y, button: "left", clickCount });
    }
  }
}

async function fill(session: CdpSession, label: string, value: string): Promise<void> {
  await click(session, label, 1, true);
  if (!await session.evaluate<boolean>(driveInputPointExpr(label, true, true))) {
    throw new Error(`drive: text field "${label}" did not receive focus`);
  }
  await session.send("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", modifiers: 2, commands: ["selectAll"] });
  await session.send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", modifiers: 2 });
  await session.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
  await session.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
  if (value) await session.send("Input.insertText", { text: value });
  await session.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await session.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
}

/**
 * Focus the game's key-input surface so CDP keys reach the play-mode handler
 * (a React `onKeyDown` on the `tabIndex` wrapper) instead of `document.body`.
 * Serialises {@link focusGameSurface} into the page. Returns whether a surface
 * became the active element.
 */
async function focusSurface(session: CdpSession): Promise<boolean> {
  await session.send("Page.bringToFront");
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

async function sendKeys(session: CdpSession, chord: string, type: "keyDown" | "keyUp"): Promise<void> {
  for (const code of chord.split("+")) {
    const key = code.startsWith("Key") ? code.slice(3).toLowerCase() : code;
    await session.send("Input.dispatchKeyEvent", { type, code, key });
  }
}

const driveDeps = {
  focusGameSurface, holdComplete, mouseButtonForCode, gameSurfaceCenter,
  sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  now: () => Date.now(),
} as unknown as DriveInputDeps;

/** Shared with the portable drive.mjs: key, chord or mouse hold that waits for a rendered frame. */
function holdKey(session: CdpSession, chord: string, holdMs: number): Promise<void> {
  return holdDriveInput(session as unknown as DriveSession, chord, holdMs, driveDeps);
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
 * Clear localStorage / IndexedDB / origin storage for the capture target BEFORE
 * navigating to it, so a game that auto-restores a save boots clean instead of
 * resuming a prior drive's session off a warm/persistent Chrome profile (issue
 * #1505). `Storage.clearDataForOrigin` takes an explicit origin, so it works
 * from the initial `about:blank` page without a round-trip navigation. Best
 * effort: a Chrome build that lacks the verb must not abort the drive.
 */
async function clearOriginStorage(session: CdpSession, origin: string): Promise<void> {
  try {
    await session.send("Storage.clearDataForOrigin", {
      origin,
      storageTypes: "local_storage,indexeddb,websql,cache_storage,service_workers",
    });
  } catch (error) {
    console.error(
      `drive: could not clear ${origin} storage before capture (${error instanceof Error ? error.message : error}) — a restored save may corrupt the probe; pass --reuse-storage to silence`,
    );
  }
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
  private virtualNow = 0;
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
    if (process.env.JG_CAPTURE_SCREENCAST === "0") {
      await this.captureFrame();
      return;
    }
    this.stopPump = this.session.on("Page.screencastFrame", (params) => {
      const sessionId = params.sessionId;
      if (typeof sessionId === "number" || typeof sessionId === "string") {
        void this.session.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
      }
      const data = params.data;
      const timestamp = (params.metadata as { timestamp?: number } | undefined)?.timestamp;
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
      this.virtualNow += budget;
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
      (await this.session.send("Page.captureScreenshot", { format: "jpeg", quality: 85, fromSurface: true })).data;
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
  await awaitGameView(session as unknown as DriveSession, settleWindowMs, driveDeps);
  const profile = captureProfile(device, size, viewport);
  const { region } = await readCapturePageState(session);
  const editor = await session.evaluate<boolean>(`document.documentElement.dataset.jgEditor === "1"`);
  const { bytes, via } = await captureViewportPng(session, {
    screencast: screencast && editor !== true && screencastCapturesFully(profile),
    expect: {
      width: Math.round(profile.width * profile.deviceScaleFactor),
      height: Math.round(profile.height * profile.deviceScaleFactor),
    },
    ...(region === undefined ? {} : { liveRegion: region }),
  });
  console.error(`drive: frame(${via})${editor === true ? " — synchronous editor snapshot" : ""}`);
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
  });
  writeShotRecord(outPath, record);
  console.log(outPath);
  const replacement = describeReplacement(record);
  if (replacement !== null) console.error(`drive: ${replacement}`);
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(HELP);
  process.exit(0);
}
if (args.check) {
  console.log(describeStepFile(args.steps, args.stepsFile ?? "steps"));
  process.exit(0);
}
if (args.flows) {
  const dir = flowsDirOf(projectDirOf(args));
  const names = listFlowNames(dir, (path) => readdirSync(path));
  if (names.length === 0) {
    console.error("drive: " + missingFlowsMessage(dir));
    process.exit(1);
  }
  const flows = flowSource(dir);
  for (const name of names) {
    try {
      const file = flows(name)!;
      console.log(describeFlow(name, parseStepFile(file.json, file.source, { flows })));
    } catch (error) {
      console.log(name + ": INVALID — " + (error instanceof Error ? error.message : String(error)));
    }
  }
  process.exit(0);
}

sweepCaptureProfiles();
const startedAt = performance.now();

const outDir = resolve(import.meta.dir, "../shots");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
for (const step of args.steps) {
  if (step.kind === "shot" && step.out !== undefined) mkdirSync(dirname(step.out), { recursive: true });
}
const preparedShots = new Map<string, PreviousShot | undefined>();
for (const step of args.steps) {
  if (step.kind !== "shot") continue;
  const path = step.out ?? join(outDir, `${args.game}-${step.name}${sizeSuffix(args.size)}${qualitySuffix(args.quality)}${quickSuffix(args.quick)}.png`);
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
if (args.port !== undefined) process.env.JG_DEV_PORT = String(args.port);
async function driveSession(daemon: ShootDaemonState | null): Promise<number> {
  requireReusableCaptureStorage(args.reuseStorage, args.connect !== undefined, daemon !== null);
  if (args.url !== undefined && !(await isUp(args.url))) {
    throw new Error(`drive: nothing is listening at ${args.url} — start that external server first`);
  }
  const dev = args.url !== undefined
    ? { base: args.url, child: null, pid: undefined }
    : daemon === null
      ? args.site === undefined ? await ensureDevServer() : await ensureWebServer()
      : await ensureDaemonTarget(daemon, args.site === undefined ? "dev" : "web");

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
        const url = applyCaptureQuality(driveTargetUrl(args, dev.base), args.quality);
        url.searchParams.set("capture", "1");
        if (args.spawn !== undefined && args.spawn.length > 0) url.searchParams.set("spawn", args.spawn);
        for (const [key, value] of args.params) url.searchParams.set(key, value);
        if (args.view !== undefined) url.searchParams.set("view", args.view);
        if (args.state !== undefined) url.searchParams.set("state", args.state);
        if (args.run !== undefined) url.searchParams.set("run", args.run);
        if (args.style !== undefined) url.searchParams.set("style", args.style);
        if (args.settle !== undefined) url.searchParams.set("settle", String(args.settle));
        const aim = parseLookAim(args.look, args.lookFrom, { withNamedView: args.view !== undefined });
        if (aim !== undefined) {
          for (const [key, value] of Object.entries(lookSearchParams(aim))) url.searchParams.set(key, value);
        }
        if (args.playtest) url.searchParams.set("seed", String(args.seed));
        if (!args.reuseStorage) await clearOriginStorage(session, new URL(url.toString()).origin);
        await navigateCapturePageWithRetry(session, url.toString(), dev.base, args.timeoutMs, 2, { legacyCanvas: args.url !== undefined });
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

        const conditionClock = (): DriveConditionClock => recorder === null
          ? { sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)), now: () => Date.now() }
          : { sleep: (ms: number) => recorder!.advance(ms), now: () => recorder!.virtualNow };
        const waitOn = (label: string, entry: { is: string; value?: unknown; timeoutMs?: number; note?: string }) =>
          awaitDriveCondition(session as unknown as DriveSession, label, entry, conditionClock());

        const logPath = args.log === undefined ? undefined : resolve(args.log);
        if (logPath !== undefined) {
          mkdirSync(dirname(logPath), { recursive: true });
          writeFileSync(logPath, "");
        }

        const done = await runDriveSteps(args.steps, {
          now: () => performance.now(),
          line: (text) => console.error(text),
          ...(recorder === null ? {} : { virtualNow: () => recorder!.virtualNow }),
          ...(logPath === undefined ? {} : { record: (entry: DriveStepRecord) => appendFileSync(logPath, JSON.stringify(entry) + "\n") }),
          run: async (step, index) => {
            const label = "steps[" + index + "]";
            const timings: string[] = [];
            if (step.before !== undefined) timings.push("before " + (await waitOn(label + ".before", step.before)).elapsedMs + "ms");
            if (step.kind === "click" || step.kind === "double-click") {
              await click(session, step.text, step.kind === "double-click" ? 2 : 1);
              // Let the UI react on the virtual clock so the click's effect is in frame.
              if (recorder !== null) await recorder.advance(300);
            } else if (step.kind === "fill") {
              await fill(session, step.label, step.value);
              if (recorder !== null) await recorder.advance(300);
            } else if (step.kind === "key") {
              if (recorder !== null) {
                // Lockstep hold: the virtual clock guarantees the sim steps under the
                // held key, so no frame-starvation grace dance is needed.
                await focusSurface(session);
                await sendKeys(session, step.code, "keyDown");
                await recorder.advance(step.holdMs);
                await sendKeys(session, step.code, "keyUp");
              } else {
                await holdKey(session, step.code, step.holdMs);
              }
            } else if (step.kind === "wait") {
              if (recorder !== null) await recorder.advance(step.ms);
              else await new Promise((r) => setTimeout(r, step.ms));
            } else if (step.kind === "waitFor") {
              timings.push("waitFor " + (await waitOn(label + ".waitFor", { is: step.expression, timeoutMs: step.timeoutMs })).elapsedMs + "ms");
            } else if (step.kind === "assert") {
              timings.push("actual " + JSON.stringify((await evaluateAssertStep(session as unknown as DriveSession, step)) ?? null));
            } else if (step.kind === "reload") {
              await navigateCapturePageWithRetry(session, url.toString(), dev.base, args.timeoutMs, 2, { legacyCanvas: args.url !== undefined });
              await installFrameCounter(session);
            } else if (step.kind === "click-at") {
              await session.send("Page.bringToFront");
              await dispatchClickAt(session, clickPoints.get(step)!, step.button);
              if (recorder !== null) await recorder.advance(300);
            } else if (step.kind === "rpc") {
              await rpc(session, step.json);
              if (step.summarized) console.error(`drive: debug_snapshot printed its summary; pass {"method":"debug_snapshot","detail":"full"} for everything`);
            }
            else if (step.kind === "probe") {
              const metrics = await readProbe(session);
              console.log(JSON.stringify({ probe: step.name, metrics }));
            } else {
              // A recording owns the screencast pump; a shot must not start/stop it underneath.
              const path = step.out ?? join(outDir, `${args.game}-${step.name}${sizeSuffix(args.size)}${qualitySuffix(args.quality)}${quickSuffix(args.quick)}.png`);
              const previous = preparedShots.has(path) ? preparedShots.get(path) : clearShotTarget(path);
              preparedShots.delete(path);
              await screenshot(
                session,
                path,
                args.size,
                args.device,
                args.record === undefined,
                previous,
                viewport,
                args.quick ? QUICK_DRIVE_WINDOW_MS : 60_000,
              );
            }
            if (step.after !== undefined) timings.push("after " + (await waitOn(label + ".after", step.after)).elapsedMs + "ms");
            return timings.join(" ");
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
