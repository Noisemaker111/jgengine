/**
 * `bun run drive`'s command line: the options a run takes, its help text, and the project a run
 * targets. The run itself is drive-dev.ts.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { parseSizeArg, sizeForDraft, type Device, type SizeMode } from "./browser-lib";
import { externalCaptureUrl, parseCaptureDevice } from "./captureTarget";
import { splitGameDir } from "./servedGame";
import { assertQuickIsIterationOnly, quickProfile, splitQuickFlag } from "./capture-preset";
import { CAPTURE_FLAGS, captureFlagHelp, parseCaptureArgs, parseGraphicsTier, type CaptureStep, type GraphicsTier } from "../packages/jgengine/src/templates/captureArgs";
import { driveProjectDir } from "./driveFlows";

export type DriveArgs = {
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
  steps: CaptureStep[];
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

export const DRIVE_HELP = `bun run drive <gameId> --flow <name>     (a TypeScript route from <game>/proofs/flows/)
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
  Output is the result, its warnings and any failure in full; --verbose adds the progress,
  reuse and timing lines.
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
  must prove a clean boot. --verbose prints which happened and how long it took:
    warm: reused :9261 (0.2s)      cold: started :9261 (4.1s)
  bun run drive <game> --click START --shot after --connect <port> --quick
`;

/** The game (or site) project a run targets: its flows and evidence live under it; shots go in shots/. */
export function projectDirOf(args: DriveArgs): string {
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
export function parseDriveArgs(argv: string[]): DriveArgs {
  // `--headed` is parsed here, not in CAPTURE_FLAGS: the scaffold's drive.mjs has no local window to
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
  const str = (name: string): string | undefined => {
    const value = o[name];
    return typeof value === "string" ? value : undefined;
  };
  const num = (name: string): number | undefined => {
    const value = str(name);
    return value === undefined ? undefined : Number(value);
  };
  const paramPairs = o["param"];
  if (parsed.positionals.length > 1) throw new Error(`drive: one game id, got ${parsed.positionals.join(" ")}`);
  const draft = o["draft"] === true;
  const quality = draft ? "low" : str("quality") === undefined ? undefined : parseGraphicsTier(str("quality"));
  const args: DriveArgs = {
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
    params: (Array.isArray(paramPairs) ? paramPairs : []).map((pair): [string, string] => [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)]),
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
