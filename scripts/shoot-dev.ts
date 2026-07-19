/**
 * Shoot: launch system Chrome, wait for page `data-jg-capture=ready` (tiny
 * handshake), pull pixels via CDP Page.captureScreenshot, write binary PNG.
 * No Playwright. PNG never travels through the page console.
 *
 * Persistent service: `bun run shoot --serve` (or `shoot daemon start`) keeps
 * one Vite + headless Chrome warm; later plain `shoot <id>` calls attach in
 * seconds. Manual warm loop still works: `--keep` / `--connect <port>` /
 * `--size half`. See `jgengine-verify` / `jgengine-ui`.
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
  isUp,
  openPageSession,
  parseSizeArg,
  sizeSuffix,
  waitCaptureReady,
  withBrowserSession,
  writePngAtomic,
  type Device,
  type SizeMode,
} from "./browser-lib";
import { decodePng } from "./png-reader";
import { computeShotMetrics, evaluateThresholds } from "./shot-metrics";
import {
  attachDaemon,
  isDaemonArgv,
  runDaemonCommand,
  startDaemon,
  writeDaemonState,
  type ShootDaemonState,
} from "./shoot-daemon";

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
  run?: string[];
  settle?: number;
  spawn?: string;
  out?: string;
  url?: string;
  connect?: number;
  keep: boolean;
  inspect: boolean;
  help: boolean;
  timeoutMs: number;
};

const HELP = `bun run shoot [game] [options]

  --game <id>         game id (default world-of-warcraft; positional arg also works)
  --mode <ui|play|poster|preview>   capture mode (default ui)
  --device <desktop|mobile|mobile-landscape|both>   viewport (default desktop)
  --size <full|half>  half halves both dimensions (~1/4 the pixels) for cheap
                      mid-loop judge shots — use full (default) for final/PR shots
  --state <name>      capture.states entry instead of live play
  --preview [key]     preview.tsx state instead of the full shell
  --run <cmd[,cmd]>   script past a start screen before capture
  --settle <ms>       wait past an intro before capture
  --spawn <x,y,z>     override the authored player spawn for this shot only (adds a
                      ?spawn= overlay like --cam/?cam=); never mutates editor.scene.json.
                      Accepts x,y,z or x,y,z,yaw (yaw radians)
  --out <path>        explicit output path
  --url <url>         capture an arbitrary URL instead of the dev runner
                      (page MUST set document.documentElement.dataset.jgCapture
                      = "ready" when the frame is honest; otherwise shoot times out)
  --connect <port>    attach to an already-running Chrome (skips launch/kill)
  --keep              leave the dev server + Chrome (per-worktree warm debug port)
                      running after this shot — pair with --connect <port>
                      on every following shot in the loop (warm-loop pattern)
  --serve             start the persistent screenshot daemon (Vite + Chrome stay warm)
  --inspect           run the pixel-metrics pass on the PNG we already have
                      in memory (no second browser launch) and write
                      shots/<name>.metrics.json beside it
  --timeout <s>       per-shot timeout in seconds (default 60)
  --help              show this text

Persistent daemon (preferred for multi-shot loops):
  bun run shoot --serve                      # keep Vite + Chrome warm
  bun run shoot daemon start|status|stop     # managed background service
  bun run shoot <game> --mode play           # auto-attaches when daemon is live (<5s)

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
    timeoutMs: 60_000,
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
    } else if (value === "--run") {
      const list = (argv[++index] ?? "")
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name.length > 0);
      args.run = list.length > 0 ? list : args.run;
    } else if (value === "--settle") args.settle = Number(argv[++index]);
    else if (value === "--spawn") args.spawn = argv[++index];
    else if (value === "--out") args.out = argv[++index];
    else if (value === "--url") args.url = argv[++index];
    else if (value === "--connect") args.connect = Number(argv[++index]);
    else if (value === "--keep") args.keep = true;
    else if (value === "--inspect") args.inspect = true;
    else if (value === "--help" || value === "-h") args.help = true;
    else if (value === "--timeout") args.timeoutMs = Number(argv[++index]) * 1000;
    else if (!value.startsWith("--")) args.game = value;
  }
  if (args.mode === "preview" && args.preview === undefined) args.preview = "";
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
  if (args.state !== undefined) {
    const key = args.state.replace(/[^A-Za-z0-9._-]+/g, "_");
    return join(outDir, `${args.game}-state-${key}${suffix}.png`);
  }
  if (args.preview !== undefined) {
    const state = args.preview === "" ? "default" : args.preview.replace(/[^A-Za-z0-9._-]+/g, "_");
    return join(outDir, `${args.game}-preview-${state}${suffix}.png`);
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
    await session.send("Page.navigate", { url });
    mark("navigate");
    await waitCaptureReady(session, args.timeoutMs);
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
let devBase = "";
let attachedDaemon = false;
if (daemon !== null) {
  devBase = daemon.devBase;
  attachedDaemon = true;
  console.error(`shoot: attached to daemon — chrome :${daemon.chromePort}, dev ${daemon.devBase}`);
} else if (args.url === undefined) {
  const dev = await ensureDevServer();
  server = dev.child;
  devBase = dev.base;
} else if (!(await isUp(args.url))) {
  const dev = await ensureDevServer();
  if (args.url.startsWith(dev.base) || args.url.startsWith("http://127.0.0.1:")) {
    server = dev.child;
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
    debugPort: daemon !== null ? daemon.chromePort : undefined,
    attach: attachedDaemon,
    leaveWarm: args.keep || attachedDaemon,
    chromePrefix: "jg-shoot-",
    hardDeadlineMs: args.timeoutMs * Math.max(targets.length, 1) + 120_000,
  },
  async ({ debugPort, chrome }) => {
    let code = 0;
    for (const device of targets) {
      const fits = await shootOne(debugPort, args, device, outPathFor(args, device, outDir), devBase);
      if (!fits) code = 1;
    }
    if (args.keep && !attachedDaemon) {
      const devPort = Number(new URL(devBase).port);
      writeDaemonState({
        identity: checkoutIdentity(),
        chromePort: debugPort,
        devPort,
        devBase,
        chromePid: chrome?.pid,
        devPid: server?.pid,
        startedAt: new Date().toISOString(),
      });
      console.error(`shoot: kept warm — chrome debug port ${debugPort}, dev server on ${devBase}`);
      console.error(`shoot: next shot → bun run shoot ${args.game} --mode ${args.mode} (daemon auto-attach)`);
      console.error(`shoot: or explicit → bun run shoot ${args.game} --mode ${args.mode} --connect ${debugPort} --size half`);
    }
    return code;
  },
);
process.exit(exitCode);
