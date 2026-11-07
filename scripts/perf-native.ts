// `bun run perf native <game> [--rows A,B,C,D] [--desktop <app.exe>] [--reuse] [--seconds 8]`
// `bun run perf native export <game> [--seconds 8]`
//
// The 360 fps experiment (native/README.md): the same scene, camera path and resolution four ways.
//   A  the current engine: a diagnostic desktop build (WebView2) run with `--uncapped` (perf desktop --launch)
//   B  jg-native: the wgpu replay of three's frames + Rune HUD + the real TypeScript tick in V8
//   C  jg-native with the Rust port of the tick
//   D  jg-web: the same replay in wasm32 + WebGPU in headless Chrome on the uncapped clock
// Each row reports frame p50/p99, CPU ms, GPU ms and fps; image match comes from jg-replay's pixel
// diff of the native replay against three's own readbacks (and the web build's check for D).
// Needs `cargo build --release` in native/ and, for D, the wasm package in native/web/pkg.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openPageSession, withBrowserSession } from "./browser-lib";
import { launchAndMeasure } from "./perf-desktop";
import { exportNativeScene } from "./native-export";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nativeDir = join(repoRoot, "native");
const exe = (name: string) => join(nativeDir, "target", "release", process.platform === "win32" ? `${name}.exe` : name);


export interface Row {
  row: string;
  label: string;
  fps: number;
  frameP50: number;
  frameP99: number;
  cpuP50: number | null;
  gpuP50: number | null;
  image: string;
  note: string;
}

interface Args { game: string; rows: Set<string>; desktop: string | null; reuse: boolean; seconds: number }

function parseArgs(argv: readonly string[]): Args {
  const value = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const game = argv.find((a, i) => !a.startsWith("--") && !["--rows", "--desktop", "--seconds"].includes(argv[i - 1] ?? ""));
  if (game === undefined) throw new Error("usage: bun run perf native <game> [--rows A,B,C,D] [--desktop <app.exe>] [--reuse] [--seconds 8]");
  return { game, rows: new Set((value("--rows") ?? "A,B,C,D").split(",").map((r) => r.trim().toUpperCase())), desktop: value("--desktop") ?? null, reuse: argv.includes("--reuse"), seconds: Number(value("--seconds") ?? 8) };
}

function run(cmd: string, args: string[], what: string): string {
  const r = spawnSync(cmd, args, { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  if (r.status !== 0) throw new Error(`${what} failed (${r.status}):\n${(r.stderr ?? "").slice(-4000)}\n${(r.stdout ?? "").slice(-2000)}`);
  if (r.stderr) process.stderr.write(r.stderr.split("\n").filter((l) => l.startsWith("jg-")).map((l) => `${l}\n`).join(""));
  return r.stdout;
}

const lastJson = <T>(stdout: string): T => JSON.parse(stdout.trim().split("\n").filter((l) => l.startsWith("{")).at(-1) ?? "null") as T;

interface DiffFrame { frame: number; meanAbs: number; maxAbs: number; over2: number; over8: number; psnr: number; staleTargets?: number[] }
interface DiffReport { frames: DiffFrame[]; warnings: { warning: string; count: number }[] }

function framesSummary(frames: DiffFrame[]): string {
  const mean = frames.reduce((a, f) => a + f.meanAbs, 0) / frames.length;
  const worst = frames.reduce((a, f) => (f.over8 > a.over8 ? f : a));
  const psnr = Math.min(...frames.map((f) => f.psnr));
  return `mean |d| ${mean.toFixed(2)}/255, PSNR ≥ ${psnr.toFixed(1)} dB, worst frame ${worst.frame}: ${(worst.over8 * 100).toFixed(2)}% px > 8 levels (${frames.length} frames)`;
}

/**
 * Image match over the compared frames. Frames that sample a render target the recording had not
 * drawn yet (a shadow map the game last rendered before recording began) are summarized apart:
 * three had that content and the replay an empty target, so their difference is the recording's.
 */
function imageSummary(frames: DiffFrame[]): string {
  if (frames.length === 0) return "no readbacks";
  const stale = frames.filter((f) => (f.staleTargets ?? []).length > 0);
  const clean = frames.filter((f) => (f.staleTargets ?? []).length === 0);
  if (stale.length === 0) return framesSummary(frames);
  const targets = [...new Set(stale.flatMap((f) => f.staleTargets ?? []))].join(", ");
  const rest = `${stale.length} frame(s) sample render targets ${targets} drawn before the recording began: ${framesSummary(stale)}`;
  return clean.length === 0 ? rest : `${framesSummary(clean)}; ${rest}`;
}

/**
 * Row A: `perf desktop --launch` on the diagnostic desktop build, uncapped and at the export's size:
 * the game's `capture.play`, the settle, then the same "walk" path the export recorded.
 */
async function desktopRow(appExe: string, size: [number, number], seconds: number, out: string): Promise<Row> {
  const r = await launchAndMeasure({ exe: appExe, uncapped: true, seconds, port: 9391, out, maps: `${dirname(appExe)}.private-maps`, size: { width: size[0], height: size[1] } });
  const b = r.breakdown;
  return { row: "A", label: "current engine, desktop WebView2 uncapped", fps: r.frame.fps, frameP50: r.rafP50Ms, frameP99: r.rafP99Ms, cpuP50: b?.work.p50 ?? null, gpuP50: b?.gpu?.p50 ?? null, image: "reference (three.js)", note: `${r.viewport}, ${b?.counts.drawsAvg.toFixed(0) ?? "?"} draws avg; ${r.start}` };
}

interface NativeResult { fps: number; frameP50: number; frameP99: number; cpuP50: number; gpuP50: number | null; gpuSamples: number; rulesP50: number; rulesTicks: number; presentMode: string; adapter: string; hudInstances: number; sceneP50: number; encodeP50: number }

/** `ported`: the game's rules and HUD have native versions (Deepward); otherwise the row is the renderer alone. */
function nativeRow(row: string, recording: string, ported: boolean, rules: "js" | "rust", files: { bundle: string; world: string }, out: string, image: string): Row {
  const args = ported ? [recording, "--rules", rules, "--bundle", files.bundle, "--world", files.world, "--out", out] : [recording, "--rules", "none", "--no-hud", "--out", out];
  const r = lastJson<NativeResult>(run(exe("jg-native"), args, `jg-native --rules ${rules}`));
  const rulesNote = !ported ? "renderer only (rules and HUD not ported)" : `rules ${rules === "js" ? "TS in V8" : "Rust"} p50 ${r.rulesP50.toFixed(3)} ms/tick`;
  return { row, label: !ported ? "Rust native renderer" : rules === "js" ? "Rust native + embedded TS rules + Rune HUD" : "Rust native + Rust rules + Rune HUD", fps: r.fps, frameP50: r.frameP50, frameP99: r.frameP99, cpuP50: r.cpuP50, gpuP50: r.gpuP50, image, note: `${r.presentMode}, ${rulesNote}, scene update p50 ${r.sceneP50.toFixed(3)} ms, encode p50 ${r.encodeP50.toFixed(2)} ms (CPU less submit and present)` };
}

/** Row D: serve native/web and the export, open it in headless Chrome on the uncapped clock, read its result. */
async function webRow(recording: string, out: string): Promise<Row> {
  const pkg = join(nativeDir, "web", "pkg", "jg_web.js");
  if (!existsSync(pkg)) throw new Error(`no ${pkg}: build it with cargo build --release --target wasm32-unknown-unknown -p jg-web and wasm-bindgen --target web --out-dir native/web/pkg`);
  const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".wasm": "application/wasm", ".json": "application/json" };
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const path = decodeURIComponent(new URL(request.url).pathname);
      if (path.includes("..")) return new Response("no", { status: 400 });
      const file = path.startsWith("/rec/") ? join(recording, path.slice(5)) : join(nativeDir, "web", path === "/" ? "index.html" : path.slice(1));
      if (!existsSync(file)) return new Response("missing", { status: 404 });
      const ext = file.slice(file.lastIndexOf("."));
      return new Response(Bun.file(file), { headers: { "content-type": types[ext] ?? "application/octet-stream" } });
    },
  });
  try {
    let result: Record<string, unknown> | null = null;
    const code = await withBrowserSession({ keep: false, timeoutMs: 600_000, frameClock: "uncapped" }, async ({ debugPort }) => {
      const session = await openPageSession(debugPort);
      try {
        await session.send("Page.navigate", { url: `http://127.0.0.1:${server.port}/` });
        for (let i = 0; i < 1200 && result === null; i += 1) {
          await Bun.sleep(500);
          result = (await session.evaluate<Record<string, unknown> | null>("globalThis.__jgWebResult ?? null").catch(() => null)) ?? null;
        }
      } finally {
        await session.close();
      }
    });
    if (code !== 0 || result === null) throw new Error("the web harness gave no result");
    const r = result as Record<string, unknown> & { error?: string; pixels: DiffReport["frames"]; adapter: string };
    if (r.error !== undefined) throw new Error(`web harness: ${r.error}`);
    writeFileSync(out, `${JSON.stringify(r, null, 1)}\n`);
    // Chrome resolves only the first few timestamp readbacks of a run (rows/D.json's gpuCounts: frames
    // stamped, left untimed with every slot in flight, failed, empty), too few to call a GPU time.
    const gpuSamples = Number(r["gpuSamples"]);
    const gpuNote = gpuSamples >= 30 ? "" : `; GPU ms n/a: Chrome returned ${gpuSamples} of the run's timestamp readbacks`;
    return { row: "D", label: "wasm + WebGPU, headless Chrome", fps: Number(r["fps"]), frameP50: Number(r["frameP50"]), frameP99: Number(r["frameP99"]), cpuP50: Number(r["cpuP50"]), gpuP50: gpuSamples >= 30 ? Number(r["gpuP50"]) : null, image: imageSummary(r.pixels), note: `uncapped clock (a normal tab is held to the display's refresh), no HUD or rules${gpuNote}` };
  } finally {
    server.stop(true);
  }
}

const fmt = (n: number | null, digits = 2) => (n === null || !Number.isFinite(n) ? "n/a" : n.toFixed(digits));

export function renderTable(game: string, rows: readonly Row[]): string {
  const head = `| Row | ${game} | fps | frame p50 ms | frame p99 ms | CPU ms p50 | GPU ms p50 | image vs three.js | notes |\n|---|---|---|---|---|---|---|---|---|`;
  return [head, ...rows.map((r) => `| ${r.row} | ${r.label} | ${fmt(r.fps, 0)} | ${fmt(r.frameP50)} | ${fmt(r.frameP99)} | ${fmt(r.cpuP50)} | ${fmt(r.gpuP50)} | ${r.image} | ${r.note} |`)].join("\n");
}

async function main(argv: string[]): Promise<number> {
  if (argv[0] === "export") {
    const game = argv[1];
    if (game === undefined) throw new Error("usage: bun run perf native export <game> [--seconds 8]");
    const s = argv.indexOf("--seconds");
    return exportNativeScene({ game, seconds: s >= 0 ? Number(argv[s + 1]) : 8, out: join(repoRoot, ".scratch", "native", game), width: 1920, height: 1080 });
  }
  const args = parseArgs(argv);
  const recording = join(repoRoot, ".scratch", "native", args.game);
  if (!args.reuse || !existsSync(join(recording, "stream.json"))) {
    const code = await exportNativeScene({ game: args.game, seconds: args.seconds, out: recording, width: 1920, height: 1080 });
    if (code !== 0) return code;
  }
  for (const bin of ["jg-replay", "jg-native"]) if (!existsSync(exe(bin))) throw new Error(`no ${exe(bin)}: run cargo build --release in native/`);
  const manifest = JSON.parse(readFileSync(join(recording, "stream.json"), "utf8")) as { canvas: [number, number] };
  const files = { bundle: join(repoRoot, ".scratch", "native", "rules", `${args.game}.js`), world: join(repoRoot, ".scratch", "native", "rules", `${args.game}.world.json`) };
  // A ported game ships `scripts/native-rules.ts` (bundle the TS tick, export the Rust port's world)
  // and has its HUD in jg-hud; any other game's native rows are the renderer alone.
  const rulesScript = join(repoRoot, "games", args.game, "scripts", "native-rules.ts");
  const hasRules = existsSync(rulesScript);
  if (hasRules && (args.rows.has("B") || args.rows.has("C"))) {
    run("bun", [rulesScript, "bundle", files.bundle], "native rules bundle");
    run("bun", [rulesScript, "world", files.world], "native rules world");
  }
  // Image match: every readback frame of the native replay against three's pixels.
  const diffDir = join(recording, "diff");
  run(exe("jg-replay"), [recording, "--out", diffDir], "jg-replay");
  const diff = JSON.parse(readFileSync(join(diffDir, "diff.json"), "utf8")) as DiffReport;
  const image = imageSummary(diff.frames);
  const rows: Row[] = [];
  const results = join(recording, "rows");
  mkdirSync(results, { recursive: true });
  if (args.rows.has("A")) {
    if (args.desktop === null) throw new Error(`row A needs --desktop <app.exe> from: bun run jgengine desktop games/${args.game} --diagnostics`);
    rows.push(await desktopRow(resolve(args.desktop), manifest.canvas, args.seconds, join(results, "A.json")));
  }
  if (args.rows.has("B")) rows.push(nativeRow("B", recording, hasRules, "js", files, join(results, "B.json"), image));
  if (args.rows.has("C") && hasRules) rows.push(nativeRow("C", recording, hasRules, "rust", files, join(results, "C.json"), image));
  if (args.rows.has("D")) rows.push(await webRow(recording, join(results, "D.json")));
  const table = renderTable(args.game, rows);
  writeFileSync(join(recording, "compare.json"), `${JSON.stringify({ game: args.game, at: new Date().toISOString(), canvas: manifest.canvas, seconds: args.seconds, rows, diff }, null, 1)}\n`);
  console.log(table);
  if (diff.warnings.length > 0) console.log(`replay warnings: ${diff.warnings.map((w) => `${w.warning} x${w.count}`).join("; ")}`);
  return 0;
}

if (import.meta.main) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
}
