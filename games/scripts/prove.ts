/**
 * One command that produces the evidence an item needs, instead of a lane hand-assembling it:
 * one capture per view and size, a same-code control pair for that machine's noise floor, a
 * pixel diff between the two states, a driven flow with its step log, and one manifest listing
 * every artefact and its numbers.
 *
 *   bun run shoot --prove harbor-heat --view boulevard --view downtown --sizes 1600x900,1024x640 \
 *     --flow to-chase --state chase
 *
 * Evidence is captured by the engine's own `shoot`/`drive`, pointed at the game directory this
 * checkout owns (`--game-dir`), so the run renders the tree under test and not the engine's
 * own `games/<game>` - their guards still decide what is provable: no 3D canvas, a flat frame, a
 * missing graphics tier fail the capture and the bundle, with the
 * reason in the manifest. A cell that could not be captured is a failure, never a blank line.
 *
 * The manifest names the tree the runner served - its directory, its hash, the engine commit and
 * mode - and re-reads that hash after the captures: a bundle whose served tree is not the tree
 * under test fails with both hashes instead of describing someone else's checkout.
 *
 * Artefacts are cached on the code state that produced them - the game's git tree, the engine
 * commit and the capture tools, plus the view, size and tier. An identical input reuses the
 * cached PNG and says so; a changed input re-runs.
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

import { parseGraphicsTier } from "../../packages/jgengine/src/templates/captureArgs";

import { repoCommit, repoRoot, root as gamesRoot } from "./repo";

export interface SizeSpec {
  width: number;
  height: number;
  label: string;
}

export interface DiffNumbers {
  /** Mean absolute per-channel difference, 0-255. */
  meanAbs: number;
  /** Share of pixels with any channel differing by more than 8, 0-1. */
  over8Share: number;
  pixels: number;
}

export type StateDiff =
  | ({ taken: true; baseline: string; baselineKey: string; aboveNoise: number } & DiffNumbers)
  | { taken: false; reason: string };

export interface Artefact {
  view: string;
  size: string;
  tier: string;
  key: string;
  png: string;
  controlPng: string;
  sha: string;
  controlSha: string;
  /** What the capture reported as the applied camera, when it reported one. */
  camera: string | null;
  /** Same-code pair: this machine's noise floor for this view and size. */
  control: DiffNumbers;
  state: StateDiff;
  reused: boolean;
  seconds: number;
}

export interface FlowProof {
  name: string;
  state: string | null;
  size: string;
  log: string;
  passed: number;
  failed: number;
  steps: { index: number; kind: string; pass: boolean; ms?: number }[];
  wallMs: number;
  ok: boolean;
  output: string;
}

export interface Manifest {
  v: 1;
  game: string;
  capturedAt: string;
  code: {
    /** Hash of the game's working tree: committed tree plus uncommitted diff and untracked files. */
    gameTree: string;
    head: string;
    dirty: boolean;
    engineCommit: string;
    tools: string;
    /** The directory the dev runner was told to serve - the tree this bundle describes. */
    servedDir: string;
    /**
     * The same hash read again after the captures. It equals `gameTree` or the bundle failed:
     * a proof only describes the tree it served.
     */
    servedTree: string;
  };
  sizes: string[];
  views: string[];
  tier: string;
  artefacts: Artefact[];
  flow: FlowProof | null;
  failures: string[];
  seconds: number;
  ok: boolean;
}

export interface ProveArgs {
  game: string;
  views: string[];
  sizes: SizeSpec[];
  tier: string;
  flow?: string;
  flowState?: string;
  params: string[];
  out?: string;
  baseline?: string;
  refresh: boolean;
  keepGoing: boolean;
}

export function parseSizes(value: string): SizeSpec[] {
  const sizes = value.split(",").map((entry) => entry.trim()).filter((entry) => entry !== "");
  if (sizes.length === 0) throw new Error("--sizes needs at least one WxH, such as 1600x900");
  return sizes.map((entry) => {
    const match = /^(\d+)x(\d+)$/.exec(entry);
    if (match === null) throw new Error(`--sizes: "${entry}" is not WxH, such as 1600x900`);
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (width < 320 || height < 240) throw new Error(`--sizes: ${entry} is below 320x240, which cannot show a scene`);
    return { width, height, label: `${width}x${height}` };
  });
}

export function parseProveArgs(argv: string[]): ProveArgs {
  const views: string[] = [];
  const params: string[] = [];
  let sizes = "1600x900,1024x640";
  let tier = "high";
  let game: string | undefined;
  let flow: string | undefined;
  let flowState: string | undefined;
  let out: string | undefined;
  let baseline: string | undefined;
  let refresh = false;
  let keepGoing = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    const next = (): string => {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`${arg} needs a value`);
      index += 1;
      return value;
    };
    if (arg === "--view") views.push(next());
    else if (arg === "--sizes" || arg === "--size") sizes = next();
    else if (arg === "--tier" || arg === "--quality") tier = next();
    else if (arg === "--flow") flow = next();
    else if (arg === "--state") flowState = next();
    else if (arg === "--param") params.push(next());
    else if (arg === "--out") out = next();
    else if (arg === "--baseline") baseline = next();
    else if (arg === "--refresh") refresh = true;
    else if (arg === "--keep-going") keepGoing = true;
    else if (arg === "--help" || arg === "-h") throw new HelpRequested();
    else if (arg.startsWith("--")) throw new Error(`prove: unknown flag ${arg}`);
    else if (game === undefined) game = arg;
    else throw new Error(`prove: one game id, got "${game}" and "${arg}"`);
  }
  if (game === undefined) throw new HelpRequested();
  parseGraphicsTier(tier);
  if (views.length === 0) throw new Error("prove: pass --view <name> at least once; a proof names the framing it judged (bun run shoot <game> --list-views)");
  return {
    game,
    views: [...new Set(views)],
    sizes: parseSizes(sizes),
    tier,
    ...(flow === undefined ? {} : { flow }),
    ...(flowState === undefined ? {} : { flowState }),
    params,
    ...(out === undefined ? {} : { out }),
    ...(baseline === undefined ? {} : { baseline }),
    refresh,
    keepGoing,
  };
}

export class HelpRequested extends Error {}

function git(cwd: string, args: string[]): { ok: boolean; out: string } {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { ok: result.status === 0, out: (result.stdout ?? "").trim() };
}

/** Tracked tree at HEAD for one game, or "" before its first commit. */
function headTree(repo: string, game: string): string {
  const result = git(repo, ["rev-parse", `HEAD:${game}`]);
  return result.ok ? result.out : "";
}

/**
 * A hash of one game's working tree: its HEAD tree, the binary diff HEAD..worktree and the
 * content of untracked source files. A lane's uncommitted edit changes the key; an unrelated
 * file elsewhere in the repo does not, and neither does captured evidence another lane left
 * in docs/ or shots/.
 */
export function gameTreeHash(repo: string, game: string): { hash: string; head: string; dirty: boolean } {
  const head = git(repo, ["rev-parse", "HEAD"]).out || "no-head";
  const tree = headTree(repo, game);
  const diff = git(repo, ["diff", "--binary", "HEAD", "--", game]).out;
  const untracked = git(repo, ["ls-files", "--others", "--exclude-standard", "--", game]).out;
  const evidence = /^(docs|shots|\.scratch)\//;
  const artifact = /\.(png|jpe?g|webp|gif|mp4|webm|glb|gltf|ktx2?|bin|shot\.json)$/i;
  const sources = untracked.split("\n").filter((entry) => entry !== "").filter((path) => !evidence.test(path.slice(game.length + 1)) && !artifact.test(path)).sort();
  const hash = createHash("sha256");
  hash.update(`tree:${tree}\n`);
  hash.update(`diff:${diff}\n`);
  for (const path of sources) {
    hash.update(`untracked:${path}:`);
    try {
      hash.update(createHash("sha256").update(readFileSync(join(repo, path))).digest("hex"));
    } catch {
      hash.update("unreadable");
    }
    hash.update("\n");
  }
  return { hash: hash.digest("hex"), head, dirty: diff !== "" || sources.length > 0 };
}

/** The capture tools' own bytes, so a change to shoot/drive cannot reuse an older proof. */
export function toolsHash(engine: string): string {
  const hash = createHash("sha256");
  for (const name of ["shoot-dev.ts", "drive-dev.ts", "png-reader.ts", "servedGame.ts"]) {
    const path = join(engine, "scripts", name);
    hash.update(`${name}:`);
    try {
      hash.update(createHash("sha256").update(readFileSync(path)).digest("hex"));
    } catch {
      hash.update("missing");
    }
    hash.update("\n");
  }
  return hash.digest("hex");
}

/** The cache key: every input that can change the pixels, and nothing else. */
export function proofKey(input: {
  gameTree: string;
  engineCommit: string;
  tools: string;
  view: string;
  size: string;
  tier: string;
  params: readonly string[];
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        v: 1,
        game: input.gameTree,
        engine: input.engineCommit,
        tools: input.tools,
        view: input.view,
        size: input.size,
        tier: input.tier,
        params: [...input.params].sort(),
      }),
    )
    .digest("hex")
    .slice(0, 24);
}

/** Mean absolute channel difference and the share of visibly changed pixels. */
export function diffFrames(a: { width: number; height: number; data: Uint8Array }, b: { width: number; height: number; data: Uint8Array }): DiffNumbers {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`diff: ${a.width}x${a.height} against ${b.width}x${b.height} is not the same frame`);
  }
  const pixels = a.width * a.height;
  const channels = Math.min(a.data.length, b.data.length) / pixels;
  let sum = 0;
  let over = 0;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    let worst = 0;
    for (let channel = 0; channel < Math.min(3, channels); channel += 1) {
      const index = pixel * channels + channel;
      const delta = Math.abs(a.data[index]! - b.data[index]!);
      sum += delta;
      if (delta > worst) worst = delta;
    }
    if (worst > 8) over += 1;
  }
  const compared = pixels * Math.min(3, channels);
  return {
    meanAbs: round(sum / compared, 2),
    over8Share: round(over / pixels, 4),
    pixels,
  };
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function formatPercent(share: number, digits = 2): string {
  return `${(share * 100).toFixed(digits)}%`;
}

interface CaptureResult {
  png: string;
  camera: string | null;
  sha: string;
  seconds: number;
}

export interface ProveDeps {
  /** Run one capture; a thrown error is the reason the cell is unprovable. */
  shoot: (args: { view: string; size: SizeSpec; tier: string; out: string; params: string[] }) => CaptureResult;
  drive: (args: { flow: string; state?: string; size: SizeSpec; tier: string; log: string; params: string[] }) => { ok: boolean; wallMs: number; output: string };
  diff: (a: string, b: string) => DiffNumbers;
  now: () => number;
  /** The served tree's hash read again after the captures finished. */
  rereadServedTree: () => string;
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function lastLine(text: string, suffix: string): string | null {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== "");
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index]!.endsWith(suffix)) return lines[index]!;
  }
  return null;
}

function spawnCapture(command: string[], cwd: string, timeoutMs: number): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(command[0]!, command.slice(1), { cwd, encoding: "utf8", timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 });
  const killed = result.signal !== null && result.signal !== undefined;
  return {
    status: killed ? 124 : (result.status ?? 1),
    stdout: result.stdout ?? "",
    stderr: `${result.stderr ?? ""}${killed ? `\nprove: capture killed after ${Math.round(timeoutMs / 1000)}s` : ""}`,
  };
}

export interface CacheLookup {
  hit: boolean;
  dir: string;
}

export function cacheDirFor(bundleRoot: string, key: string): string {
  return join(bundleRoot, "cache", key);
}

export function cacheLookup(bundleRoot: string, key: string): CacheLookup {
  const dir = cacheDirFor(bundleRoot, key);
  const hit = ["after.png", "control.png", "numbers.json"].every((name) => existsSync(join(dir, name)));
  return { hit, dir };
}

/** Copy a cached cell into this run's bundle and return what the cache says it held. */
function reuseCached(cache: string, artefactDir: string): { png: string; controlPng: string; numbers: DiffNumbers; sha: string; controlSha: string; camera: string | null } {
  mkdirSync(artefactDir, { recursive: true });
  const png = join(artefactDir, "after.png");
  const controlPng = join(artefactDir, "control.png");
  copyFileSync(join(cache, "after.png"), png);
  copyFileSync(join(cache, "control.png"), controlPng);
  const cached = JSON.parse(readFileSync(join(cache, "numbers.json"), "utf8")) as { control: DiffNumbers; camera?: string | null };
  return { png, controlPng, numbers: cached.control, sha: sha256File(png), controlSha: sha256File(controlPng), camera: cached.camera ?? null };
}

function writeCellCache(cache: string, png: string, controlPng: string, control: DiffNumbers, camera: string | null, key: string): void {
  mkdirSync(cache, { recursive: true });
  copyFileSync(png, join(cache, "after.png"));
  copyFileSync(controlPng, join(cache, "control.png"));
  writeFileSync(join(cache, "numbers.json"), `${JSON.stringify({ key, control, camera }, null, 2)}\n`);
}

export interface ProveResult {
  manifest: Manifest;
  manifestPath: string;
}

/** Find the newest earlier bundle for this game with the same view/size/tier and another code state. */
export function findBaseline(bundleRoot: string, input: { view: string; size: string; tier: string; key: string }): { path: string; png: string; key: string } | null {
  const runs = join(bundleRoot, "runs");
  if (!existsSync(runs)) return null;
  const candidates = readdirSync(runs, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(runs, entry.name, "manifest.json"))
    .filter((path) => existsSync(path))
    .sort()
    .reverse();
  for (const path of candidates) {
    let manifest: Manifest;
    try {
      manifest = JSON.parse(readFileSync(path, "utf8")) as Manifest;
    } catch {
      continue;
    }
    const match = manifest.artefacts?.find((entry) => entry.view === input.view && entry.size === input.size && entry.tier === input.tier && entry.key !== input.key);
    if (match !== undefined && existsSync(match.png)) return { path, png: match.png, key: match.key };
  }
  return null;
}

export interface CodeState {
  hash: string;
  head: string;
  dirty: boolean;
  engineCommit: string;
  tools: string;
  /** The directory the dev runner serves for this run. */
  servedDir: string;
}

export function runProve(args: ProveArgs, deps: ProveDeps, paths: { bundleRoot: string; code: CodeState }): ProveResult {
  const started = deps.now();
  const capturedAt = new Date().toISOString();
  const stamp = capturedAt.replace(/[:.]/g, "-");
  let bundle = join(paths.bundleRoot, "runs", stamp);
  for (let suffix = 2; existsSync(bundle); suffix += 1) bundle = join(paths.bundleRoot, "runs", `${stamp}-${suffix}`);
  mkdirSync(bundle, { recursive: true });

  const code = paths.code;
  const failures: string[] = [];
  const artefacts: Artefact[] = [];
  for (const view of args.views) {
    for (const size of args.sizes) {
      const key = proofKey({ gameTree: code.hash, engineCommit: code.engineCommit, tools: code.tools, view, size: size.label, tier: args.tier, params: args.params });
      const artefactDir = join(bundle, "views", view, size.label);
      const cached = cacheLookup(paths.bundleRoot, key);
      const cellStart = deps.now();
      if (cached.hit && !args.refresh) {
        const reused = reuseCached(cached.dir, artefactDir);
        artefacts.push({
          view,
          size: size.label,
          tier: args.tier,
          key,
          png: reused.png,
          controlPng: reused.controlPng,
          sha: reused.sha,
          controlSha: reused.controlSha,
          camera: reused.camera,
          control: reused.numbers,
          state: { taken: false, reason: "pending baseline lookup" },
          reused: true,
          seconds: round((deps.now() - cellStart) / 1000, 2),
        });
        continue;
      }
      try {
        const after = deps.shoot({ view, size, tier: args.tier, out: join(artefactDir, "after.png"), params: args.params });
        const control = deps.shoot({ view, size, tier: args.tier, out: join(artefactDir, "control.png"), params: args.params });
        const numbers = deps.diff(after.png, control.png);
        writeCellCache(cached.dir, after.png, control.png, numbers, after.camera, key);
        artefacts.push({
          view,
          size: size.label,
          tier: args.tier,
          key,
          png: after.png,
          controlPng: control.png,
          sha: after.sha,
          controlSha: control.sha,
          camera: after.camera,
          control: numbers,
          state: { taken: false, reason: "pending baseline lookup" },
          reused: false,
          seconds: round((deps.now() - cellStart) / 1000, 2),
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        failures.push(`${args.game} ${view} ${size.label} tier ${args.tier}: ${reason}`);
        if (!args.keepGoing) break;
      }
    }
    if (failures.length > 0 && !args.keepGoing) break;
  }

  for (const artefact of artefacts) {
    const baseline = args.baseline !== undefined
      ? baselineFrom(args.baseline, artefact)
      : findBaseline(paths.bundleRoot, { view: artefact.view, size: artefact.size, tier: artefact.tier, key: artefact.key });
    if (baseline === null) {
      artefact.state = { taken: false, reason: "no earlier bundle for this view, size and tier with a different code state; run prove again after the change" };
      continue;
    }
    try {
      const numbers = deps.diff(artefact.png, baseline.png);
      artefact.state = {
        taken: true,
        baseline: baseline.path,
        baselineKey: baseline.key,
        aboveNoise: round(numbers.meanAbs - artefact.control.meanAbs, 2),
        ...numbers,
      };
    } catch (error) {
      artefact.state = { taken: false, reason: error instanceof Error ? error.message : String(error) };
      failures.push(`${artefact.view} ${artefact.size}: state diff failed: ${artefact.state.reason}`);
    }
  }

  let flow: FlowProof | null = null;
  if (args.flow !== undefined) {
    const size = args.sizes[0]!;
    const log = join(bundle, "flow", `${args.flow}-${size.label}.jsonl`);
    mkdirSync(join(bundle, "flow"), { recursive: true });
    const flowStart = deps.now();
    const run = deps.drive({ flow: args.flow, ...(args.flowState === undefined ? {} : { state: args.flowState }), size, tier: args.tier, log, params: args.params });
    const steps = existsSync(log)
      ? readFileSync(log, "utf8")
          .split(/\r?\n/)
          .filter((line) => line.trim() !== "")
          .flatMap((line) => {
            try {
              const entry = JSON.parse(line) as { index?: number; kind?: string; name?: string; pass?: boolean; ms?: number };
              return [{ index: entry.index ?? 0, kind: entry.kind ?? entry.name ?? "step", pass: entry.pass !== false, ...(entry.ms === undefined ? {} : { ms: entry.ms }) }];
            } catch {
              return [];
            }
          })
      : [];
    flow = {
      name: args.flow,
      state: args.flowState ?? null,
      size: size.label,
      log,
      passed: steps.filter((step) => step.pass).length,
      failed: steps.filter((step) => !step.pass).length,
      steps,
      wallMs: round(deps.now() - flowStart, 0),
      ok: run.ok,
      output: join(bundle, "flow", `${args.flow}-${size.label}.txt`),
    };
    writeFileSync(flow.output, run.output);
    if (!run.ok) failures.push(`flow ${args.flow} at ${size.label}: the driven round trip failed (${flow.failed} failed step${flow.failed === 1 ? "" : "s"}); see ${flow.output}`);
  }

  // The bundle describes the tree the runner served, so read that tree again once the captures
  // are done: an edit during the run, or a runner that ignored --game-dir, must fail here with
  // both hashes rather than ship pixels of one tree under the other's name.
  const servedTree = deps.rereadServedTree();
  if (servedTree !== code.hash) {
    failures.push(
      `${args.game}: served tree ${servedTree.slice(0, 12)} is not the tree under test ${code.hash.slice(0, 12)} at ${code.servedDir}; this bundle would describe another checkout`,
    );
  }

  const manifest: Manifest = {
    v: 1,
    game: args.game,
    capturedAt,
    code: {
      gameTree: code.hash,
      head: code.head,
      dirty: code.dirty,
      engineCommit: code.engineCommit ?? "unknown",
      tools: code.tools ?? "unknown",
      servedDir: code.servedDir,
      servedTree,
    },
    sizes: args.sizes.map((size) => size.label),
    views: args.views,
    tier: args.tier,
    artefacts,
    flow,
    failures,
    seconds: round((deps.now() - started) / 1000, 1),
    ok: failures.length === 0 && artefacts.length === args.views.length * args.sizes.length,
  };
  const manifestPath = join(bundle, "manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, manifestPath };
}

function baselineFrom(path: string, artefact: Artefact): { path: string; png: string; key: string } | null {
  let manifestPath = path;
  if (!existsSync(path)) return null;
  if (!path.endsWith(".json")) manifestPath = join(resolve(path), "manifest.json");
  if (!existsSync(manifestPath)) return null;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
  const match = manifest.artefacts?.find((entry) => entry.view === artefact.view && entry.size === artefact.size && entry.tier === artefact.tier && entry.key !== artefact.key);
  if (match === undefined || !existsSync(match.png)) return null;
  return { path: manifestPath, png: match.png, key: match.key };
}

/** The manifest numbers a lane pastes into its PR body, in the order it reads them. */
export function summarise(manifest: Manifest): string {
  const lines: string[] = [];
  const head = `${manifest.game}: ${manifest.views.length} view(s) x ${manifest.sizes.length} size(s), tier ${manifest.tier}, game tree ${manifest.code.gameTree.slice(0, 12)}${manifest.code.dirty ? " (dirty)" : ""}, engine ${manifest.code.engineCommit}`;
  lines.push(head);
  lines.push(`  served ${manifest.code.servedDir} (tree ${manifest.code.servedTree.slice(0, 12)}${manifest.code.servedTree === manifest.code.gameTree ? "" : " - NOT the tree under test"})`);
  for (const artefact of manifest.artefacts) {
    const noise = `noise ${artefact.control.meanAbs.toFixed(2)} mean-abs, ${formatPercent(artefact.control.over8Share)} >8`;
    const state = artefact.state.taken
      ? `state ${artefact.state.meanAbs.toFixed(2)} mean-abs, ${formatPercent(artefact.state.over8Share)} >8 (${artefact.state.aboveNoise >= 0 ? "+" : ""}${artefact.state.aboveNoise.toFixed(2)} over noise)`
      : `state not diffed: ${artefact.state.reason}`;
    lines.push(`  ${artefact.view} ${artefact.size}: ${noise}; ${state}${artefact.reused ? " [cached]" : ""}`);
  }
  if (manifest.flow !== null) {
    lines.push(`  flow ${manifest.flow.name}${manifest.flow.state === null ? "" : ` (state ${manifest.flow.state})`} ${manifest.flow.size}: ${manifest.flow.failed === 0 ? "passed" : "FAILED"} ${manifest.flow.passed} step(s) in ${manifest.flow.wallMs}ms`);
  }
  for (const failure of manifest.failures) lines.push(`  FAILED: ${failure}`);
  lines.push(`  ${manifest.seconds}s wall, ${manifest.ok ? "provable" : "not provable"}`);
  return lines.join("\n");
}

function help(): string {
  return [
    "bun run shoot --prove <game> --view <name> [--view <name>] [--sizes 1600x900,1024x640]",
    "  [--flow <name>] [--state <capture state>] [--tier low|medium|high|ultra]",
    "  [--param k=v] [--out <dir>] [--baseline <manifest|bundle>] [--refresh]",
    "",
    "Captures each view at each size in play mode, adds a same-code control pair for this",
    "machine's noise floor and a pixel diff against the previous bundle of another code state,",
    "runs the flow with its step log, and writes one manifest. Identical input reuses the cache.",
    "",
    `The run serves this checkout's ${"<game>"} directory through the engine's --game-dir, so the`,
    "capture renders the tree under test; the manifest names that directory and its hash.",
  ].join("\n");
}

async function main(): Promise<number> {
  let args: ProveArgs;
  try {
    args = parseProveArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof HelpRequested) {
      console.log(help());
      return process.argv.length <= 2 ? 2 : 0;
    }
    console.error(`prove: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }

  const cwd = process.cwd();
  const engine = repoRoot;
  const repo = gamesRoot;
  if (!existsSync(join(repo, args.game, "package.json"))) {
    console.error(`prove: no game at ${join(repo, args.game)}`);
    return 2;
  }
  const gameDir = join(repo, args.game);
  const gameDirFlag = ["--game-dir", gameDir];

  const treeUnderTest = gameTreeHash(repo, args.game);

  const code = {
    ...treeUnderTest,
    engineCommit: repoCommit(engine),
    tools: toolsHash(engine),
    servedDir: gameDir,
  };
  const bundleRoot = resolve(args.out ?? join(cwd, ".scratch", "proofs", args.game));

  const shootOne = (request: { view: string; size: SizeSpec; tier: string; out: string; params: string[] }): CaptureResult => {
    mkdirSync(dirname(request.out), { recursive: true });
    const command = [
      process.execPath,
      join(engine, "scripts", "shoot-dev.ts"),
      args.game,
      "--mode",
      "play",
      "--view",
      request.view,
      "--quality",
      request.tier,
      "--width",
      String(request.size.width),
      "--height",
      String(request.size.height),
      "--out",
      request.out,
      ...gameDirFlag,
      ...request.params.flatMap((param) => ["--param", param]),
    ];
    const startedAt = Date.now();
    const result = spawnCapture(command, engine, 240_000);
    if (result.status !== 0) {
      const reason = lastLine(result.stderr, "nothing was written") ?? result.stderr.split(/\r?\n/).filter((line) => line.trim() !== "").slice(-3).join(" / ");
      throw new Error(reason === "" ? `shoot exited ${result.status} with no message` : reason.replace(/ - nothing was written$/, ""));
    }
    const printed = lastLine(result.stdout, ".png");
    if (printed === null || !existsSync(printed)) throw new Error(`shoot exited 0 but wrote no PNG (stdout: ${result.stdout.trim().slice(-200)})`);
    const applied = /applied (.+)$/m.exec(result.stderr);
    return { png: printed, camera: applied?.[1]?.trim() ?? null, sha: sha256File(printed), seconds: round((Date.now() - startedAt) / 1000, 2) };
  };

  const driveFlow = (request: { flow: string; state?: string; size: SizeSpec; tier: string; log: string; params: string[] }) => {
    const command = [
      process.execPath,
      join(engine, "scripts", "drive-dev.ts"),
      args.game,
      "--flow",
      request.flow,
      "--quality",
      request.tier,
      "--width",
      String(request.size.width),
      "--height",
      String(request.size.height),
      "--log",
      request.log,
      ...gameDirFlag,
      ...(request.state === undefined ? [] : ["--state", request.state]),
      ...request.params.flatMap((param) => ["--param", param]),
    ];
    const startedAt = Date.now();
    const result = spawnCapture(command, engine, 900_000);
    return { ok: result.status === 0, wallMs: Date.now() - startedAt, output: `${result.stdout}\n${result.stderr}`.trim() };
  };

  const png = (await import(pathToFileURL(join(engine, "scripts", "png-reader.ts")).href)) as {
    decodePng: (bytes: Uint8Array) => { width: number; height: number; data: Uint8Array };
  };
  const diff = (a: string, b: string): DiffNumbers => diffFrames(png.decodePng(readFileSync(a)), png.decodePng(readFileSync(b)));

  const result = runProve(
    args,
    { shoot: shootOne, drive: driveFlow, diff, now: () => performance.now(), rereadServedTree: () => gameTreeHash(repo, args.game).hash },
    { bundleRoot, code },
  );

  console.log(summarise(result.manifest));
  console.log(`manifest: ${result.manifestPath}`);
  return result.manifest.ok ? 0 : 1;
}

if (import.meta.main) {
  process.exit(await main());
}
