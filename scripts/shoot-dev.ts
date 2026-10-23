/**
 * Shoot: launch system Chrome, wait for page `data-jg-capture=ready` (tiny
 * handshake), pull pixels off the CDP screencast pump (see `captureViewportPng`),
 * write binary PNG. No Playwright. PNG never travels through the page console.
 *
 * Persistent service: `shoot daemon start` keeps headless Chrome warm and
 * starts apps/dev or apps/web lazily on first use. Manual `--keep`/`--connect`
 * remains available. See `jgengine-verify`.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import type { ChildProcess } from "node:child_process";
import { join, resolve } from "node:path";
import {
  type CdpSession,
  DEVICES,
  applyCaptureQuality,
  applyDevice,
  captureViewportPng,
  checkoutIdentity,
  ensureDevServer,
  ensureWebServer,
  forwardPageConsole,
  readCapturePageState,
  captureProfile,
  ensureCaptureFreeSpace,
  screencastCapturesFully,
  isUp,
  navigateCapturePageWithRetry,
  openPageSession,
  parseQualityArg,
  parseSizeArg,
  qualitySuffix,
  sizeForQuality,
  sizeSuffix,
  sweepCaptureProfiles,
  withBrowserSession,
  writePngAtomic,
  type CaptureQuality,
  type Device,
  type SizeMode,
} from "./browser-lib";
import { decodePng } from "./png-reader";
import { externalCaptureUrl } from "./captureTarget";
import { CAPTURE_FLAGS, captureFlagHelp, parseCaptureArgs } from "../packages/jgengine/src/templates/captureArgs";
import { lookSearchParams, parseLookAim } from "./lookArg";
import {
  MIN_SAMPLED_SHARE,
  computeShotMetrics,
  deadViewport,
  evaluateThresholds,
  metricsPathFor,
  shotSignature,
} from "./shot-metrics";
import {
  buildShotRecord,
  clearShotTarget,
  describeReplacement,
  writeShotRecord,
  type PreviousShot,
} from "./shotProvenance";
import {
  attachDaemon,
  ensureDaemonTarget,
  isDaemonArgv,
  runDaemonCommand,
  startDaemon,
  writeDaemonState,
  type ShootDaemonState,
} from "./shoot-daemon";

/** One reload retry absorbs Vite's transient post-HMR rebuild window; see capture-retry.ts. */
const CAPTURE_MAX_ATTEMPTS = 2;

/**
 * Navigate to `url` and wait for an honest frame, reloading fresh once if the
 * first attempt lands in Vite's transient post-HMR rebuild window (stale module
 * graph → "start menu still on screen" / readiness timeout). The retry waits for
 * the dev server to settle, disables the page HTTP cache so no stale module is
 * reused, and re-navigates — turning the old "fails twice until daemon stop/start"
 * into an automatic in-invocation recovery. Deterministic failures (unknown state,
 * unregistered command) are not stale-shaped, so they surface on the first attempt.
 */
type Mode = "ui" | "play" | "poster" | "preview";
type DeviceArg = Device | "both";

type Args = {
  game: string;
  mode: Mode;
  device: DeviceArg;
  size: SizeMode;
  quality: CaptureQuality;
  stage?: boolean;
  state?: string;
  preview?: string;
  fixture?: string;
  listFixtures: boolean;
  run?: string[];
  settle?: number;
  spawn?: string;
  style?: string;
  look?: string;
  lookFrom?: string;
  view?: string;
  listViews: boolean;
  out?: string;
  url?: string;
  site?: string;
  connect?: number;
  keep: boolean;
  inspect: boolean;
  /** Show a real window (off-screen) instead of headless Chrome. */
  headed: boolean;
  help: boolean;
  timeoutMs: number;
  timeoutExplicit: boolean;
  port?: number;
  width?: number;
  height?: number;
  params: [string, string][];
};

const HELP = `bun run shoot [game] [options]

${captureFlagHelp("shoot", "engine", CAPTURE_FLAGS)}

  JG_CAPTURE_SCREENCAST=0 forces Page.captureScreenshot instead of the screencast
  frame pump (same pixels, several times slower on software GL).

Persistent daemon (preferred for multi-shot loops):
  bun run shoot --serve                      # keep Chrome warm; Vite starts on demand
  bun run shoot daemon start|status|stop     # managed background service
  bun run shoot <game> --mode play           # auto-attaches when daemon is live (<5s)

Manual warm loop:
  bun run shoot <game> --mode play --keep                       # cold boot, stays warm
  bun run shoot <game> --mode play --connect <port> --size half # cheap judge PNG

  --headed opens a real Chrome window off-screen, for debugging a capture; every
  run is headless unless you ask, and the window never lands on the desktop.
`;

/** Map the shared capture command line (packages/jgengine/src/templates/captureArgs.ts) onto shoot's options. */
function parseArgs(argv: string[]): Args {
  // `--headed` is parsed here, not in CAPTURE_FLAGS: the scaffold's shoot.mjs has no local window to
  // show, so the flag stays engine-only instead of parsing there and doing nothing.
  const headed = argv.includes("--headed");
  const parsed = parseCaptureArgs("shoot", argv.filter((arg) => arg !== "--headed"), CAPTURE_FLAGS);
  const o = parsed.options;
  const str = (name: string): string | undefined => (typeof o[name] === "string" ? (o[name] as string) : undefined);
  const num = (name: string): number | undefined => (str(name) === undefined ? undefined : Number(str(name)));
  if (parsed.positionals.length > 1) throw new Error(`shoot: one game id, got ${parsed.positionals.join(" ")}`);
  const mode = str("mode") ?? "ui";
  if (!["ui", "play", "poster", "preview"].includes(mode)) throw new Error(`--mode must be ui, play, poster, or preview (got ${mode})`);
  const run = str("run")?.split(",").map((name) => name.trim()).filter((name) => name.length > 0);
  const view = str("view");
  const args: Args = {
    game: str("game") ?? parsed.positionals[0] ?? "world-of-warcraft",
    mode: mode as Mode,
    device: (str("device") ?? "desktop") as DeviceArg,
    quality: parseQualityArg(str("quality") ?? "full"),
    size: sizeForQuality(parseQualityArg(str("quality") ?? "full"), str("size") === undefined ? undefined : parseSizeArg(str("size"))),
    stage: o.stage === true ? true : undefined,
    state: str("state"),
    preview: str("preview") ?? (mode === "preview" ? "" : undefined),
    fixture: str("fixture"),
    listFixtures: o.list === true,
    run: run !== undefined && run.length > 0 ? run : undefined,
    settle: num("settle"),
    spawn: str("spawn"),
    style: str("style"),
    look: str("look"),
    lookFrom: str("look-from"),
    view: view === "" ? undefined : view,
    listViews: o["list-views"] === true || view === "",
    out: str("out"),
    url: str("url") === undefined ? undefined : externalCaptureUrl(str("url")),
    site: str("site"),
    connect: num("connect"),
    keep: o.keep === true,
    inspect: o.inspect === true,
    headed,
    help: parsed.help,
    timeoutMs: (num("timeout") ?? 60) * 1000,
    timeoutExplicit: str("timeout") !== undefined,
    port: num("port"),
    width: num("width"),
    height: num("height"),
    params: ((o.param as string[] | undefined) ?? []).map((pair) => [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)] as [string, string]),
  };
  if (args.site !== undefined && !args.timeoutExplicit) {
    args.timeoutMs = process.platform === "linux" || process.env.CI !== undefined ? 30_000 : 10_000;
  }
  return args;
}

function devicesFor(arg: DeviceArg): Device[] {
  return arg === "both" ? ["desktop", "mobile"] : [arg];
}

function outPathFor(args: Args, device: Device, outDir: string): string {
  if (args.out !== undefined) {
    const resolved = resolve(args.out);
    if (args.device !== "both") return resolved;
    if (device === "desktop") return resolved;
    const dot = resolved.lastIndexOf(".");
    if (dot <= 0) return `${resolved}-mobile`;
    return `${resolved.slice(0, dot)}-mobile${resolved.slice(dot)}`;
  }
  const suffix = `${device === "mobile" ? "-mobile" : ""}${sizeSuffix(args.size)}${qualitySuffix(args.quality)}`;
  if (args.fixture !== undefined && args.fixture.length > 0) {
    const key = args.fixture.replace(/[^A-Za-z0-9._-]+/g, "_");
    return join(outDir, `fixture-${key}${suffix}.png`);
  }
  if (args.view !== undefined) {
    const key = args.view.replace(/[^A-Za-z0-9._-]+/g, "_");
    return join(outDir, `${args.game}-view-${key}${suffix}.png`);
  }
  if (args.state !== undefined) {
    const key = args.state.replace(/[^A-Za-z0-9._-]+/g, "_");
    return join(outDir, `${args.game}-state-${key}${suffix}.png`);
  }
  if (args.preview !== undefined) {
    const state = args.preview === "" ? "default" : args.preview.replace(/[^A-Za-z0-9._-]+/g, "_");
    return join(outDir, `${args.game}-preview-${state}${suffix}.png`);
  }
  if (args.site !== undefined) {
    const pathname = new URL(args.site.startsWith("/") ? args.site : `/${args.site}`, "http://site").pathname;
    const key = pathname.replace(/^\/+|\/+$/g, "").replace(/[^A-Za-z0-9._-]+/g, "_") || "home";
    return join(outDir, `site-${key}${suffix}.png`);
  }
  return join(outDir, `${args.game}-${args.mode}${suffix}.png`);
}

function targetUrl(args: Args, device: Device, devBase: string): string {
  if (args.url !== undefined) {
    const url = new URL(args.url);
    url.searchParams.set("capture", "1");
    url.searchParams.set("device", device === "mobile-landscape" ? "mobile" : device);
    return url.toString();
  }
  if (args.site !== undefined) {
    const path = args.site.startsWith("/") ? args.site : `/${args.site}`;
    const url = new URL(path, devBase);
    url.searchParams.set("capture", "1");
    url.searchParams.set("device", device === "mobile-landscape" ? "mobile" : device);
    return url.toString();
  }
  if (args.fixture !== undefined && args.fixture.length > 0) {
    const url = new URL(devBase);
    url.searchParams.set("fixture", args.fixture);
    url.searchParams.set("device", device === "mobile-landscape" ? "mobile" : device);
    url.searchParams.set("capture", "1");
    return url.toString();
  }
  const url = new URL(devBase);
  url.searchParams.set("game", args.game);
  url.searchParams.set("mode", args.mode);
  url.searchParams.set("device", device === "mobile-landscape" ? "mobile" : device);
  url.searchParams.set("capture", "1");
  if (args.stage === true) url.searchParams.set("stage", "1");
  if (args.state !== undefined) url.searchParams.set("state", args.state);
  if (args.preview !== undefined) url.searchParams.set("preview", args.preview);
  if (args.run !== undefined && args.run.length > 0) url.searchParams.set("run", args.run.join(","));
  if (args.settle !== undefined && Number.isFinite(args.settle)) url.searchParams.set("settle", String(args.settle));
  if (args.spawn !== undefined && args.spawn.length > 0) url.searchParams.set("spawn", args.spawn);
  if (args.style !== undefined && args.style.length > 0) url.searchParams.set("style", args.style);
  if (args.view !== undefined) url.searchParams.set("view", args.view);
  const aim = parseLookAim(args.look, args.lookFrom, { withNamedView: args.view !== undefined });
  if (aim !== undefined) {
    for (const [key, value] of Object.entries(lookSearchParams(aim))) url.searchParams.set(key, value);
  }
  return applyCaptureQuality(url, args.quality).toString();
}

function shotCommand(): string {
  return ["bun run shoot", ...process.argv.slice(2)].join(" ");
}

function gitProvenance(): { head: string; dirty: boolean } | undefined {
  try {
    const head = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
    if (head.status !== 0) return undefined;
    const status = spawnSync("git", ["status", "--porcelain"], { encoding: "utf8" });
    return { head: head.stdout.trim(), dirty: (status.stdout ?? "").trim().length > 0 };
  } catch {
    return undefined;
  }
}

/**
 * Read back the aim the runner actually applied. An accepted `--look` always publishes it, so a
 * missing readout means the override never reached the camera — the silent-no-op that used to
 * return a plausible screenshot of the game's own view and cost a whole round of re-shooting.
 */
async function reportAppliedAim(session: CdpSession, args: Args): Promise<void> {
  const aimed = args.look !== undefined && args.look.length > 0;
  // A `--view` can carry the aim instead of `--look`, and a view whose framing silently failed to
  // apply is the same wrong-view-that-looks-fine failure as a dropped `--look`.
  if (!aimed && args.view === undefined) return;
  const { applied, shot } = (await session.evaluate<{ applied: string | null; shot: string | null }>(`({
    applied: document.documentElement.dataset.jgLook ?? null,
    shot: document.documentElement.dataset.jgView ?? null
  })`)) ?? { applied: null, shot: null };
  if (args.view !== undefined && shot !== args.view) {
    throw new Error(`--view ${args.view} never reached the runner — no declared view was applied`);
  }
  if (typeof applied !== "string" || applied.length === 0) {
    if (!aimed && args.view !== undefined) {
      console.error(`shoot: view ${args.view} applied (no camera override)`);
      return;
    }
    throw new Error(
      `--look ${args.look} never reached the camera — the runner reported no applied aim. ` +
        `--look only works on the dev-runner game shell (not --url/--site/--preview/--fixture captures).`,
    );
  }
  console.error(`shoot: ${args.view === undefined ? "look" : `view ${args.view}`} applied ${applied}`);
}

function formatCollisionReport(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { a: string; b: string; area: number }[];
    return parsed.map((c) => `${c.a} ∩ ${c.b} (${c.area}px²)`).join(", ");
  } catch {
    return raw;
  }
}

async function shootOne(
  debugPort: number,
  args: Args,
  device: Device,
  outPath: string,
  devBase: string,
  previous: PreviousShot | undefined,
): Promise<boolean> {
  const startedAt = performance.now();
  let phaseStartedAt = startedAt;
  const timings: string[] = [];
  const mark = (name: string): void => {
    const now = performance.now();
    timings.push(`${name}=${((now - phaseStartedAt) / 1_000).toFixed(2)}s`);
    phaseStartedAt = now;
  };
  const session = await openPageSession(debugPort);
  mark("target");
  let stopConsoleForward: (() => void) | undefined;
  try {
    await session.send("Page.enable");
    await session.send("Runtime.enable");
    stopConsoleForward = forwardPageConsole(session, "shoot:");
    mark("enable");
    const viewportSize = { width: args.width, height: args.height };
    await applyDevice(session, device, args.size, viewportSize);
    mark("device");
    const target = new URL(targetUrl(args, device, devBase));
    for (const [key, value] of args.params) target.searchParams.set(key, value);
    const url = target.toString();
    await navigateCapturePageWithRetry(session, url, devBase, args.timeoutMs, CAPTURE_MAX_ATTEMPTS, { legacyCanvas: args.url !== undefined });
    mark("ready");
    await reportAppliedAim(session, args);
    await new Promise((r) => setTimeout(r, 600));
    mark("settle");
    const expected = captureProfile(device, args.size, viewportSize);
    // Read before capturing, not alongside it: the region is what lets the fast path reject a
    // frame whose 3D viewport the canvas never committed into, and a shot that is a black hole
    // where the world should be is worth more than the frame time the overlap saved.
    const { overflow, collision, ...regions } = await readCapturePageState(session);
    const editor = await session.evaluate<boolean>(`document.documentElement.dataset.jgEditor === "1"`);
    const { bytes, via } = await captureViewportPng(session, {
      screencast: editor !== true && screencastCapturesFully(expected),
      expect: {
        width: Math.round(expected.width * expected.deviceScaleFactor),
        height: Math.round(expected.height * expected.deviceScaleFactor),
      },
      ...(regions.region === undefined ? {} : { liveRegion: regions.region }),
    });
    mark(`frame(${via})`);
    writePngAtomic(outPath, bytes);
    const decoded = decodePng(bytes);
    const frame = computeShotMetrics(decoded.width, decoded.height, decoded.data);
    const scoped = computeShotMetrics(decoded.width, decoded.height, decoded.data, regions);
    const viewport = (scoped.sampledShare ?? 1) >= MIN_SAMPLED_SHARE ? scoped : null;
    const record = buildShotRecord({
      bytes,
      command: shotCommand(),
      capturedAt: new Date().toISOString(),
      signature: shotSignature(decoded.width, decoded.height, decoded.data),
      width: decoded.width,
      height: decoded.height,
      ...(previous === undefined ? {} : { previous }),
      git: gitProvenance(),
    });
    writeShotRecord(outPath, record);
    console.log(outPath);
    mark("score");
    const profile = DEVICES[device];
    const label = `${device} ${profile.width}x${profile.height}${args.size === "half" ? " (half-res)" : ""}${args.quality === "draft" ? " (draft)" : ""}`;
    let ok = true;
    if (overflow !== null) {
      console.error(`HUD OVERFLOW [${label}]: panels escape the viewport — ${overflow}`);
      ok = false;
    }
    if (collision !== null) {
      console.error(`MOBILE LAYOUT COLLISION [${label}]: ${formatCollisionReport(collision)}`);
      ok = false;
    }
    const replacement = describeReplacement(record);
    if (replacement !== null) console.error(`shoot [${label}]: ${replacement}`);
    // Viewport metrics are scored on every shot, not only under --inspect: a dead 3D view
    // that nobody opens the PNG to notice is the failure this rung exists to catch. Skipped
    // when the region is mostly covered (a HUD/menu capture has no 3D view to judge).
    if (viewport !== null) {
      const dead = deadViewport(viewport);
      if (dead !== null) {
        console.error(`shoot [${label}]: ${dead} — the HUD alone is carrying this frame`);
        ok = false;
      }
      for (const warning of evaluateThresholds(viewport)) {
        console.error(`shoot [${label}]: viewport ${warning.message}`);
      }
    }
    if (args.inspect) {
      const metricsPath = metricsPathFor(outPath);
      writeFileSync(metricsPath, JSON.stringify({ frame, viewport }, null, 2));
      console.log(metricsPath);
    }
    mark("inspect");
    console.error(
      `shoot: timing ${device} ${timings.join(" ")} total=${((performance.now() - startedAt) / 1_000).toFixed(2)}s`,
    );
    return ok;
  } finally {
    stopConsoleForward?.();
    await session.close();
  }
}

const rawArgv = process.argv.slice(2);
if (isDaemonArgv(rawArgv)) {
  if (rawArgv.includes("--serve")) {
    await startDaemon({ foreground: true });
    process.exit(0);
  }
  const daemonArgv = rawArgv[0] === "daemon" ? rawArgv.slice(1) : rawArgv;
  process.exit(await runDaemonCommand(daemonArgv));
}

const args = parseArgs(rawArgv);
if (args.help) {
  console.log(HELP);
  process.exit(0);
}

// Discovery: `shoot --list` or `shoot --fixture` (no name) prints the registered
// engine preview fixtures from the @jgengine/react registry (single source of truth).
if (args.listFixtures || (args.fixture !== undefined && args.fixture.length === 0)) {
  // The @jgengine/react registry is the single source of truth; scripts resolve it from
  // source (bare `@jgengine/*` specifiers only type-resolve through dist, not at bun runtime).
  const { PREVIEW_FIXTURES, previewFixtureNames } = await import(
    resolve(import.meta.dir, "../packages/react/src/previewFixtures.ts")
  );
  console.log("engine preview fixtures (bun run shoot --fixture <name>):");
  for (const name of previewFixtureNames()) {
    console.log(`  ${name.padEnd(18)} ${PREVIEW_FIXTURES[name]!.description}`);
  }
  process.exit(0);
}

const outDir = resolve(import.meta.dir, "../shots");
try {
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
} catch (error) {
  const code = error instanceof Error && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
  if (code !== "EEXIST" || !existsSync(outDir)) throw error;
}
const targets = devicesFor(args.device);
const preparedShots = new Map<string, PreviousShot | undefined>();
if (!args.listViews) {
  for (const device of targets) {
    const path = outPathFor(args, device, outDir);
    preparedShots.set(path, clearShotTarget(path));
  }
}

if (args.port !== undefined) process.env.JG_DEV_PORT = String(args.port);
// Reclaim profiles that killed runs left behind before this one can add to them, and refuse to
// start on a drive that cannot hold this capture.
sweepCaptureProfiles();
ensureCaptureFreeSpace();
const daemon: ShootDaemonState | null =
  args.connect === undefined && args.port === undefined ? await attachDaemon() : null;

let server: ChildProcess | null = null;
let serverPid: number | undefined;
let devBase = "";
let attachedDaemon = false;
if (args.url !== undefined) {
  if (args.site !== undefined) throw new Error("shoot: --url and --site select different targets; pass one");
  if (!(await isUp(args.url))) {
    throw new Error(`shoot: nothing is listening at ${args.url} — start that external server first`);
  }
  devBase = args.url;
  attachedDaemon = daemon !== null;
} else if (daemon !== null) {
  const target = await ensureDaemonTarget(daemon, args.site !== undefined ? "web" : "dev");
  devBase = target.base;
  attachedDaemon = true;
  console.error(`shoot: attached to daemon — chrome :${daemon.chromePort}, target ${devBase}`);
} else if (args.site !== undefined) {
  const web = await ensureWebServer();
  server = web.child;
  serverPid = web.pid;
  devBase = web.base;
} else if (args.url === undefined) {
  const dev = await ensureDevServer();
  server = dev.child;
  serverPid = dev.pid;
  devBase = dev.base;
}
/**
 * Print the game's declared `capture.views`. The runner publishes them on `data-jg-shots` as soon
 * as the game module resolves — well before an honest frame — so discovery costs a navigation, not
 * a capture, and still works when the `?shot=` that sent you here was the wrong name.
 */
async function listViews(debugPort: number, base: string, game: string): Promise<number> {
  const session = await openPageSession(debugPort);
  try {
    await session.send("Page.enable");
    await session.send("Runtime.enable");
    const url = new URL(base);
    url.searchParams.set("game", game);
    await session.send("Page.navigate", { url: url.toString() });
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const raw = await session.evaluate<string | null>(`document.documentElement.dataset.jgViews ?? null`);
      if (typeof raw === "string") {
        const shots = JSON.parse(raw) as string[];
        if (shots.length === 0) {
          console.log(`${game} declares no capture.views — add them to defineGame({ capture: { views } })`);
          return 0;
        }
        console.log(`declared views (bun run shoot ${game} --view <name>):`);
        for (const shot of shots) console.log(`  ${shot}`);
        return 0;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`timed out reading ${game}'s declared views`);
  } finally {
    await session.close();
  }
}

const exitCode = await withBrowserSession(
  {
    keep: args.keep,
    connect: args.connect,
    timeoutMs: args.timeoutMs,
    server,
    serverPid,
    debugPort: daemon !== null ? daemon.chromePort : undefined,
    attach: attachedDaemon,
    leaveWarm: args.keep || attachedDaemon,
    chromePrefix: "jg-shoot-",
    headed: args.headed,
    hardDeadlineMs:
      args.site === undefined
        ? args.timeoutMs * Math.max(targets.length, 1) + 120_000
        : args.timeoutMs * CAPTURE_MAX_ATTEMPTS * Math.max(targets.length, 1) + 10_000,
  },
  async ({ debugPort, chrome }) => {
    if (args.listViews) return listViews(debugPort, devBase, args.game);
    let code = 0;
    for (const device of targets) {
      const outPath = outPathFor(args, device, outDir);
      const previous = preparedShots.get(outPath);
      const fits = await shootOne(debugPort, args, device, outPath, devBase, previous);
      if (!fits) code = 1;
    }
    if (args.keep && !attachedDaemon) {
      const state: ShootDaemonState = {
        identity: checkoutIdentity(),
        chromePort: debugPort,
        chromePid: chrome?.pid,
        userDataDir: chrome?.userDataDir,
        startedAt: new Date().toISOString(),
      };
      const target = { port: Number(new URL(devBase).port), base: devBase, pid: serverPid ?? server?.pid };
      if (args.url === undefined && args.site === undefined) {
        state.devPort = target.port;
        state.devBase = target.base;
        state.devPid = target.pid;
      } else if (args.url === undefined) {
        state.webPort = target.port;
        state.webBase = target.base;
        state.webPid = target.pid;
      }
      writeDaemonState(state);
      console.error(`shoot: kept warm — chrome debug port ${debugPort}, dev server on ${devBase}`);
      console.error(`shoot: next shot → bun run shoot ${args.url === undefined ? `${args.game} --mode ${args.mode}` : `--url ${args.url}`} (daemon auto-attach)`);
      console.error(`shoot: or explicit → bun run shoot ${args.url === undefined ? `${args.game} --mode ${args.mode}` : `--url ${args.url}`} --connect ${debugPort} --size half`);
    }
    return code;
  },
);
process.exit(exitCode);
