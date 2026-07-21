/**
 * Shoot: launch system Chrome, wait for page `data-jg-capture=ready` (tiny
 * handshake), pull pixels via CDP Page.captureScreenshot, write binary PNG.
 * No Playwright. PNG never travels through the page console.
 *
 * Persistent service: `shoot daemon start` keeps headless Chrome warm and
 * starts apps/dev or apps/web lazily on first use. Manual `--keep`/`--connect`
 * remains available. See `jgengine-verify`.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import type { ChildProcess } from "node:child_process";
import { join, resolve } from "node:path";
import {
  type CdpSession,
  DEVICES,
  applyDevice,
  checkoutIdentity,
  ensureDevServer,
  ensureWebServer,
  isUp,
  normalizeLoopbackUrl,
  navigateCapturePageWithRetry,
  openPageSession,
  parseSizeArg,
  sizeSuffix,
  withBrowserSession,
  writePngAtomic,
  type Device,
  type SizeMode,
} from "./browser-lib";
import { decodePng } from "./png-reader";
import { computeShotMetrics, evaluateThresholds } from "./shot-metrics";
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
  stage?: boolean;
  state?: string;
  preview?: string;
  fixture?: string;
  listFixtures: boolean;
  run?: string[];
  settle?: number;
  spawn?: string;
  out?: string;
  url?: string;
  site?: string;
  connect?: number;
  keep: boolean;
  inspect: boolean;
  help: boolean;
  timeoutMs: number;
  timeoutExplicit: boolean;
};

const HELP = `bun run shoot [game] [options]

  --game <id>         game id (default world-of-warcraft; positional arg also works)
  --mode <ui|play|poster|preview>   capture mode (default ui)
  --device <desktop|mobile|mobile-landscape|both>   viewport (default desktop)
  --size <full|half>  half halves both dimensions (~1/4 the pixels) for cheap
                      mid-loop judge shots — use full (default) for final/PR shots
  --state <name>      capture.states entry instead of live play
  --preview [key]     preview.tsx state instead of the full shell
  --fixture [name]    capture an exported engine preview fixture (real @jgengine/react
                      component) by name — no game boot, no hand-rolled --url page.
                      With no name (or --list), prints the registered fixtures and exits
  --list              list the registered engine preview fixtures and exit
  --run <cmd[,cmd]>   script past a start screen before capture
  --settle <ms>       wait past an intro before capture
  --spawn <x,y,z>     override the authored player spawn for this shot only (adds a
                      ?spawn= overlay like --cam/?cam=); never mutates editor.scene.json.
                      Accepts x,y,z or x,y,z,yaw (yaw radians)
  --out <path>        explicit output path
  --url <url>         capture an arbitrary URL instead of the dev runner
                      (page MUST set document.documentElement.dataset.jgCapture
                      = "ready" when the frame is honest; otherwise shoot times out)
  --site <path>       capture a route from the managed apps/web server, e.g.
                      --site '/playground?inspect=1&junction=5'
  --connect <port>    attach to an already-running Chrome (skips launch/kill)
  --keep              leave the dev server + Chrome (per-worktree warm debug port)
                      running after this shot — pair with --connect <port>
                      on every following shot in the loop (warm-loop pattern)
  --serve             keep Chrome warm; start the requested Vite lazily
  --inspect           run the pixel-metrics pass on the PNG we already have
                      in memory (no second browser launch) and write
                      shots/<name>.metrics.json beside it
  --timeout <s>       per-shot timeout (default 60; --site: 10 local, 30 Linux/CI)
  --help              show this text

Persistent daemon (preferred for multi-shot loops):
  bun run shoot --serve                      # keep Chrome warm; Vite starts on demand
  bun run shoot daemon start|status|stop     # managed background service
  bun run shoot <game> --mode play           # auto-attaches when daemon is live (<5s)
  bun run shoot --site '/playground'         # use the managed apps/web target

Manual warm loop (still supported):
  bun run shoot <game> --mode play --keep                       # first shot: cold boot, stays warm
  bun run shoot <game> --mode play --connect <port> --size half # re-shots: <10s, cheap judge PNG
  bun run shoot <game> --mode play --connect <port>             # final full-res shot for the PR
  # port is printed after --keep; each worktree gets its own default
`;

function parseArgs(argv: string[]): Args {
  const args: Args = {
    game: "world-of-warcraft",
    mode: "ui",
    device: "desktop",
    size: "full",
    connect: undefined,
    keep: false,
    inspect: false,
    help: false,
    listFixtures: false,
    timeoutMs: 60_000,
    timeoutExplicit: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--game") args.game = argv[++index] ?? args.game;
    else if (value === "--mode") args.mode = (argv[++index] as Mode) ?? args.mode;
    else if (value === "--device") {
      const device = argv[++index] as DeviceArg | undefined;
      if (device !== "desktop" && device !== "mobile" && device !== "mobile-landscape" && device !== "both") {
        throw new Error(`--device must be desktop, mobile, mobile-landscape, or both (got ${device ?? "nothing"})`);
      }
      args.device = device;
    } else if (value === "--size") {
      args.size = parseSizeArg(argv[++index]);
    } else if (value === "--stage") args.stage = true;
    else if (value === "--state") args.state = argv[++index];
    else if (value === "--preview") {
      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith("--")) {
        args.preview = next;
        index += 1;
      } else {
        args.preview = "";
      }
    } else if (value === "--fixture") {
      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith("--")) {
        args.fixture = next;
        index += 1;
      } else {
        args.fixture = "";
      }
    } else if (value === "--list" || value === "--list-fixtures") {
      args.listFixtures = true;
    } else if (value === "--run") {
      const list = (argv[++index] ?? "")
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name.length > 0);
      args.run = list.length > 0 ? list : args.run;
    } else if (value === "--settle") args.settle = Number(argv[++index]);
    else if (value === "--spawn") args.spawn = argv[++index];
    else if (value === "--out") args.out = argv[++index];
    else if (value === "--url") {
      const raw = argv[++index];
      args.url = raw === undefined ? undefined : normalizeLoopbackUrl(raw);
    }
    else if (value === "--site") args.site = argv[++index];
    else if (value === "--connect") args.connect = Number(argv[++index]);
    else if (value === "--keep") args.keep = true;
    else if (value === "--inspect") args.inspect = true;
    else if (value === "--help" || value === "-h") args.help = true;
    else if (value === "--timeout") {
      args.timeoutMs = Number(argv[++index]) * 1000;
      args.timeoutExplicit = true;
    }
    else if (!value.startsWith("--")) args.game = value;
  }
  if (args.mode === "preview" && args.preview === undefined) args.preview = "";
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
  const suffix = `${device === "mobile" ? "-mobile" : ""}${sizeSuffix(args.size)}`;
  if (args.fixture !== undefined && args.fixture.length > 0) {
    const key = args.fixture.replace(/[^A-Za-z0-9._-]+/g, "_");
    return join(outDir, `fixture-${key}${suffix}.png`);
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
  return url.toString();
}

async function readLayoutStatus(
  session: CdpSession,
): Promise<{ overflow: string | null; collision: string | null }> {
  const value = await session.evaluate<{ overflow?: unknown; collision?: unknown }>(`({
    overflow: document.querySelector("[data-hud-overflow]")?.getAttribute("data-hud-overflow") ?? null,
    collision: document.querySelector("[data-jg-layout-collision]")?.getAttribute("data-jg-layout-collision") ?? null
  })`);
  return {
    overflow:
      typeof value?.overflow === "string" && value.overflow.length > 0 ? value.overflow : null,
    collision:
      typeof value?.collision === "string" && value.collision.length > 0 ? value.collision : null,
  };
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
  try {
    await session.send("Page.enable");
    await session.send("Runtime.enable");
    await applyDevice(session, device, args.size);
    mark("setup");
    const url = targetUrl(args, device, devBase);
    await navigateCapturePageWithRetry(session, url, devBase, args.timeoutMs, CAPTURE_MAX_ATTEMPTS);
    mark("ready");
    await new Promise((r) => setTimeout(r, 600));
    mark("settle");
    const { overflow, collision } = await readLayoutStatus(session);
    mark("layout");
    const shot = await session.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
      optimizeForSpeed: true,
    });
    const data = shot.data;
    if (typeof data !== "string" || data.length === 0) {
      throw new Error("Page.captureScreenshot returned empty data");
    }
    const bytes = Buffer.from(data, "base64");
    writePngAtomic(outPath, bytes);
    console.log(outPath);
    mark("capture");
    const profile = DEVICES[device];
    const label = `${device} ${profile.width}x${profile.height}${args.size === "half" ? " (half-res)" : ""}`;
    let ok = true;
    if (overflow !== null) {
      console.error(`HUD OVERFLOW [${label}]: panels escape the viewport — ${overflow}`);
      ok = false;
    }
    if (collision !== null) {
      console.error(`MOBILE LAYOUT COLLISION [${label}]: ${formatCollisionReport(collision)}`);
      ok = false;
    }
    if (args.inspect) {
      try {
        const decoded = decodePng(bytes);
        const metrics = computeShotMetrics(decoded.width, decoded.height, decoded.data);
        const metricsPath = outPath.replace(/\.png$/, ".metrics.json");
        writeFileSync(metricsPath, JSON.stringify(metrics, null, 2));
        console.log(metricsPath);
        if (!metrics.nonblank) {
          console.error(`inspect-shot [${label}]: blank or broken screenshot`);
          ok = false;
        }
        for (const warning of evaluateThresholds(metrics)) {
          console.error(`inspect-shot [${label}]: ${warning.message}`);
        }
      } catch (error) {
        console.error(`inspect-shot [${label}]: failed — ${error instanceof Error ? error.message : error}`);
        ok = false;
      }
    }
    mark("inspect");
    console.error(
      `shoot: timing ${device} ${timings.join(" ")} total=${((performance.now() - startedAt) / 1_000).toFixed(2)}s`,
    );
    return ok;
  } finally {
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

const daemon: ShootDaemonState | null =
  args.connect === undefined && args.url === undefined ? await attachDaemon() : null;

let server: ChildProcess | null = null;
let serverPid: number | undefined;
let devBase = "";
let attachedDaemon = false;
if (daemon !== null) {
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
} else if (!(await isUp(args.url))) {
  const dev = await ensureDevServer();
  if (args.url.startsWith(dev.base) || args.url.startsWith("http://127.0.0.1:")) {
    server = dev.child;
    serverPid = dev.pid;
    devBase = dev.base;
  } else {
    throw new Error(
      `shoot: nothing is listening at ${args.url} — start that server first (auto-start only covers this worktree's dev port)`,
    );
  }
} else {
  devBase = args.url;
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
    hardDeadlineMs:
      args.site === undefined
        ? args.timeoutMs * Math.max(targets.length, 1) + 120_000
        : args.timeoutMs * CAPTURE_MAX_ATTEMPTS * Math.max(targets.length, 1) + 10_000,
  },
  async ({ debugPort, chrome }) => {
    let code = 0;
    for (const device of targets) {
      const fits = await shootOne(debugPort, args, device, outPathFor(args, device, outDir), devBase);
      if (!fits) code = 1;
    }
    if (args.keep && !attachedDaemon) {
      const state: ShootDaemonState = {
        identity: checkoutIdentity(),
        chromePort: debugPort,
        chromePid: chrome?.pid,
        startedAt: new Date().toISOString(),
      };
      const target = { port: Number(new URL(devBase).port), base: devBase, pid: serverPid ?? server?.pid };
      if (args.site === undefined) {
        state.devPort = target.port;
        state.devBase = target.base;
        state.devPid = target.pid;
      } else {
        state.webPort = target.port;
        state.webBase = target.base;
        state.webPid = target.pid;
      }
      writeDaemonState(state);
      console.error(`shoot: kept warm — chrome debug port ${debugPort}, dev server on ${devBase}`);
      console.error(`shoot: next shot → bun run shoot ${args.game} --mode ${args.mode} (daemon auto-attach)`);
      console.error(`shoot: or explicit → bun run shoot ${args.game} --mode ${args.mode} --connect ${debugPort} --size half`);
    }
    return code;
  },
);
process.exit(exitCode);
