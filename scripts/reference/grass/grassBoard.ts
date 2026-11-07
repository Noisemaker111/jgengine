// `bun run shoot --board`: the grass reference boards. Shoots the `grass-reference` demo's photo
// views (at each requested realism), the 18 grass game views and, on request, every grass-looks
// species, then lays real photos beside our matching views and our games' stylised art beside the
// realism ends they set. `--diff <board>` compares this board with an earlier one, shot by shot.
//
// A full board is a few hundred captures of 40 s to 2 min each, hours on a busy PC, so one run never
// shoots it all: it shoots for `--budget` seconds (default 6 min), records each shot in the board
// folder's `board.json` as it lands, and exits 3 while shots remain. Running the same command again
// carries on where it stopped; the run that takes the last shot lays out the sheets and exits 0. A
// failed capture is named and the run exits 1; the board stays unfinished, with no sheets, until it
// lands. A killed run loses at most the capture in flight. Shots belong to the exact code they were taken
// with: when the working tree changes, the next run retakes them (`--resume` keeps them instead).
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

import jpeg from "jpeg-js";

import { GRASS_GAME_VIEWS, GRASS_REFERENCE_PHOTOS, GRASS_STYLE_TARGETS } from "../../../apps/dev/src/demo/grassReference";
import { GRASS_PRESETS } from "../../../packages/core/src/grass/grassKind";
import { STENCIL_GLYPHS } from "../../../packages/core/src/scene/decalTexture";
import { decodePng, encodePng, type RgbaImage } from "../../../packages/assets/src/imageCodec";
import { markStep } from "../../hangReport";
import { printHelpIfAsked } from "../../script-help";
import { BOARD_BUDGET_SECONDS } from "../../shoot";

const root = resolve(import.meta.dir, "../../..");
const PHOTOS = join(import.meta.dir, "photos");

/** What one board run shoots and where it writes. */
export interface BoardArgs {
  out: string;
  /** Realism levels to shoot the reference views at; empty shoots the demo as it is ("today"). */
  realism: number[];
  views: boolean;
  species: boolean;
  /** Board ids to keep (reference photos, game views or species numbers); empty keeps all. */
  only: string[];
  /** An earlier board to compare with. */
  diff?: string;
  /** Keep every shot file already in the board folder, whatever code took it, and shoot only the missing ones. */
  resume: boolean;
  /** Seconds one run shoots for before it stops and leaves the rest to the next run. */
  budget: number;
  /** Extra arguments for every capture (`--quality high`, `--timeout 240`). */
  shoot: string[];
}

/** Exit code of a run that stopped at its budget with shots still to take: run the same command again. */
export const BOARD_MORE_EXIT = 3;

/** Parse `--board` flags. @internal */
export function parseBoardArgs(argv: readonly string[]): BoardArgs {
  const args: BoardArgs = { out: join(root, ".scratch", "boards", "grass"), realism: [], views: false, species: false, only: [], shoot: [], resume: false, budget: BOARD_BUDGET_SECONDS };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]!;
    const value = (): string => {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) throw new Error(`${flag} needs a value`);
      index += 1;
      return next;
    };
    if (flag === "--out") args.out = resolve(value());
    else if (flag === "--realism") {
      args.realism = value().split(",").map((part) => {
        const level = Number(part);
        if (part.trim() === "" || !Number.isFinite(level) || level < 0 || level > 1) throw new Error(`--realism takes numbers in 0..1 (got "${part}")`);
        return level;
      });
    } else if (flag === "--views") args.views = true;
    else if (flag === "--species") args.species = true;
    else if (flag === "--only") args.only = value().split(",").map((part) => part.trim()).filter((part) => part.length > 0);
    else if (flag === "--diff") args.diff = resolve(value());
    else if (flag === "--quality") args.shoot.push("--quality", value());
    else if (flag === "--timeout") args.shoot.push("--timeout", value());
    else if (flag === "--resume") args.resume = true;
    else if (flag === "--budget") {
      const raw = value();
      args.budget = Number(raw);
      if (!Number.isFinite(args.budget) || args.budget <= 0) throw new Error(`--budget takes seconds above 0 (got "${raw}")`);
    } else throw new Error(`unknown flag ${flag} (bun run shoot --board --help lists them)`);
  }
  return args;
}

/** One capture the board needs: the shoot arguments and the file it writes, relative to the board. @internal */
export interface BoardShot {
  file: string;
  argv: string[];
}

function realismTag(level: number | undefined): string {
  return level === undefined ? "today" : `r${level}`;
}

/** Every capture a board run takes, in order. @internal */
export function boardShots(args: Pick<BoardArgs, "realism" | "views" | "species" | "only">): BoardShot[] {
  const keep = (id: string) => args.only.length === 0 || args.only.includes(id);
  const levels: (number | undefined)[] = args.realism.length === 0 ? [undefined] : args.realism;
  const shots: BoardShot[] = [];
  for (const level of levels) {
    for (const photo of GRASS_REFERENCE_PHOTOS) {
      if (!keep(photo.id)) continue;
      shots.push({
        file: `ref/${photo.id}-${realismTag(level)}.png`,
        argv: ["grass-reference", "--mode", "play", "--view", `ref-${photo.id}`, ...(level === undefined ? [] : ["--param", `realism=${level}`])],
      });
    }
  }
  const styled = new Set(GRASS_STYLE_TARGETS.flatMap((target) => target.views));
  for (const view of GRASS_GAME_VIEWS) {
    if (!(args.views || styled.has(view.id)) || !keep(view.id)) continue;
    shots.push({ file: `views/${view.id}.png`, argv: [view.game, "--mode", "play", "--look", view.look, "--look-from", view.lookFrom] });
  }
  if (args.species) {
    GRASS_PRESETS.forEach((_preset, index) => {
      const number = String(index + 1);
      if (!keep(number)) return;
      for (const kind of ["look", "close"]) shots.push({ file: `species/${kind}-${number}.png`, argv: ["grass-looks", "--mode", "play", "--view", `${kind}-${number}`] });
    });
  }
  return shots;
}

function readImage(path: string): RgbaImage {
  const bytes = new Uint8Array(readFileSync(path));
  if (path.endsWith(".png")) return decodePng(bytes);
  const decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
  return { width: decoded.width, height: decoded.height, data: new Uint8Array(decoded.data) };
}

function blank(width: number, height: number, shade = 24): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = shade;
    data[i + 1] = shade;
    data[i + 2] = shade;
    data[i + 3] = 255;
  }
  return { width, height, data };
}

/** Centre-crop `image` to the cell's aspect and box-sample it down to `width` x `height`. @internal */
export function coverResize(image: RgbaImage, width: number, height: number): RgbaImage {
  const scale = Math.min(image.width / width, image.height / height);
  const cropW = width * scale, cropH = height * scale;
  const x0 = (image.width - cropW) / 2, y0 = (image.height - cropH) / 2;
  const out = blank(width, height);
  for (let y = 0; y < height; y += 1) {
    const sy0 = Math.floor(y0 + y * scale), sy1 = Math.max(sy0 + 1, Math.floor(y0 + (y + 1) * scale));
    for (let x = 0; x < width; x += 1) {
      const sx0 = Math.floor(x0 + x * scale), sx1 = Math.max(sx0 + 1, Math.floor(x0 + (x + 1) * scale));
      let r = 0, g = 0, b = 0, n = 0;
      for (let sy = sy0; sy < Math.min(sy1, image.height); sy += 1) {
        for (let sx = sx0; sx < Math.min(sx1, image.width); sx += 1) {
          const at = (sy * image.width + sx) * 4;
          r += image.data[at]!;
          g += image.data[at + 1]!;
          b += image.data[at + 2]!;
          n += 1;
        }
      }
      const to = (y * width + x) * 4;
      out.data[to] = Math.round(r / Math.max(1, n));
      out.data[to + 1] = Math.round(g / Math.max(1, n));
      out.data[to + 2] = Math.round(b / Math.max(1, n));
    }
  }
  return out;
}

function blit(target: RgbaImage, source: RgbaImage, left: number, top: number): void {
  for (let y = 0; y < source.height; y += 1) {
    const ty = top + y;
    if (ty < 0 || ty >= target.height) continue;
    for (let x = 0; x < source.width; x += 1) {
      const tx = left + x;
      if (tx < 0 || tx >= target.width) continue;
      const from = (y * source.width + x) * 4, to = (ty * target.width + tx) * 4;
      target.data[to] = source.data[from]!;
      target.data[to + 1] = source.data[from + 1]!;
      target.data[to + 2] = source.data[from + 2]!;
      target.data[to + 3] = 255;
    }
  }
}

function fill(target: RgbaImage, left: number, top: number, width: number, height: number, rgb: readonly [number, number, number]): void {
  for (let y = Math.max(0, top); y < Math.min(target.height, top + height); y += 1) {
    for (let x = Math.max(0, left); x < Math.min(target.width, left + width); x += 1) {
      const to = (y * target.width + x) * 4;
      target.data[to] = rgb[0];
      target.data[to + 1] = rgb[1];
      target.data[to + 2] = rgb[2];
      target.data[to + 3] = 255;
    }
  }
}

/** Width in pixels of `text` drawn at `scale`. @internal */
export function labelWidth(text: string, scale: number): number {
  return Math.max(0, text.length * 6 - 1) * scale;
}

/** Draw `text` in the 5x7 stencil font on a dark plate at the cell's lower left. @internal */
export function drawLabel(target: RgbaImage, text: string, left: number, top: number, scale = 2): void {
  const chars = [...text.toUpperCase()];
  fill(target, left, top, labelWidth(text, scale) + scale * 4, 7 * scale + scale * 4, [0, 0, 0]);
  chars.forEach((char, index) => {
    const glyph = STENCIL_GLYPHS[char];
    if (glyph === undefined) return;
    for (let row = 0; row < 7; row += 1) {
      for (let column = 0; column < 5; column += 1) {
        if (glyph[row * 5 + column] === "1") fill(target, left + scale * 2 + (index * 6 + column) * scale, top + scale * 2 + row * scale, scale, scale, [255, 255, 255]);
      }
    }
  });
}

/** One sheet cell: an image file (or none, for a gap) and its label. */
interface Cell {
  path?: string;
  label: string;
}

/** Lay cells out in rows on a dark sheet, each cover-cropped to `cellW` x `cellH` and labelled. */
function composeSheet(rows: readonly (readonly Cell[])[], cellW: number, cellH: number, title: string): RgbaImage {
  const gap = 4, head = 30;
  const columns = Math.max(...rows.map((row) => row.length));
  const sheet = blank(columns * cellW + (columns + 1) * gap, head + rows.length * cellH + (rows.length + 1) * gap, 12);
  drawLabel(sheet, title, gap, 4, 3);
  rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      const left = gap + c * (cellW + gap), top = head + gap + r * (cellH + gap);
      if (cell.path !== undefined && existsSync(cell.path)) blit(sheet, coverResize(readImage(cell.path), cellW, cellH), left, top);
      else fill(sheet, left, top, cellW, cellH, [60, 20, 20]);
      drawLabel(sheet, cell.label, left, top + cellH - 22, 2);
    });
  });
  return sheet;
}

function save(path: string, image: RgbaImage): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePng(image));
  console.log(`board: ${relative(root, path)}`);
}

/** Mean luma difference (0..255) and the share of pixels whose luma moved more than 24, between two same-size shots. @internal */
export function shotDifference(a: RgbaImage, b: RgbaImage): { mean: number; changed: number } {
  if (a.width !== b.width || a.height !== b.height) return { mean: 255, changed: 1 };
  let total = 0, changed = 0;
  const pixels = a.width * a.height;
  for (let i = 0; i < pixels * 4; i += 4) {
    const la = a.data[i]! * 0.299 + a.data[i + 1]! * 0.587 + a.data[i + 2]! * 0.114;
    const lb = b.data[i]! * 0.299 + b.data[i + 1]! * 0.587 + b.data[i + 2]! * 0.114;
    const d = Math.abs(la - lb);
    total += d;
    if (d > 24) changed += 1;
  }
  return { mean: total / pixels, changed: changed / pixels };
}

/** One guarded capture of a shot into the board folder; true when it wrote its file. */
function captureShot(args: BoardArgs, shot: BoardShot): boolean {
  const out = join(args.out, shot.file);
  mkdirSync(dirname(out), { recursive: true });
  rmSync(out, { force: true });
  const run = spawnSync(process.execPath, ["scripts/shoot.ts", ...shot.argv, ...args.shoot, "--out", out], { cwd: root, encoding: "utf8" });
  if (run.status === 0 && existsSync(out)) return true;
  console.error(`board: ${shot.file} failed (exit ${run.status})\n${(run.stdout + run.stderr).trim().split("\n").slice(-6).join("\n")}`);
  return false;
}

function speciesSheets(args: BoardArgs): void {
  const per = 30;
  for (const kind of ["close", "look"]) {
    for (let start = 0; start < GRASS_PRESETS.length; start += per) {
      const cells = GRASS_PRESETS.slice(start, start + per).map((preset, offset) => ({ path: join(args.out, "species", `${kind}-${start + offset + 1}.png`), label: `${start + offset + 1} ${preset.id}` }));
      const rows: Cell[][] = [];
      for (let i = 0; i < cells.length; i += 6) rows.push(cells.slice(i, i + 6));
      save(join(args.out, `species-${kind}-${start / per + 1}.png`), composeSheet(rows, 400, 225, `SPECIES ${kind} ${start + 1}-${start + cells.length}`));
    }
  }
}

function pngsUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((file) => file.endsWith(".png")).map((file) => file.replaceAll("\\", "/"));
}

function diffBoards(args: BoardArgs, before: string): void {
  const lines = ["shot\tmean\tchanged"];
  const pairs: Cell[][] = [];
  for (const group of ["ref", "views", "species"]) {
    for (const file of pngsUnder(join(before, group)).sort()) {
      const after = join(args.out, group, file);
      if (!existsSync(after)) continue;
      const { mean, changed } = shotDifference(readImage(join(before, group, file)), readImage(after));
      lines.push(`${group}/${file}\t${mean.toFixed(2)}\t${(changed * 100).toFixed(1)}%`);
      if (group !== "species") pairs.push([{ path: join(before, group, file), label: `BEFORE ${file.replace(".png", "")}` }, { path: after, label: `AFTER ${file.replace(".png", "")}` }]);
    }
  }
  writeFileSync(join(args.out, "diff.tsv"), `${lines.join("\n")}\n`);
  console.log(lines.join("\n"));
  for (let i = 0; i < pairs.length; i += 6) save(join(args.out, `compare-${i / 6 + 1}.png`), composeSheet(pairs.slice(i, i + 6), 640, 360, `BEFORE AFTER ${i / 6 + 1}`));
}

/** A board folder's progress: the code its shots were taken with, the shots landed, and failed tries. @internal */
export interface BoardManifest {
  version: 1;
  /** {@link boardSource} of the code every landed shot was taken with. */
  source: string;
  /** Landed shots: file -> the capture arguments that took it. */
  done: Record<string, string>;
  /** Failed captures per file still missing. */
  failed: Record<string, number>;
}

/** What a shot depicts: its capture arguments and the graphics tier, not how long a capture may wait (`--timeout`). */
function shotKey(shot: BoardShot, args: Pick<BoardArgs, "shoot">): string {
  const depicts = args.shoot.filter((_arg, index, all) => all[index] !== "--timeout" && all[index - 1] !== "--timeout");
  return [...shot.argv, ...depicts].join(" ");
}

export function manifestPath(out: string): string {
  return join(out, "board.json");
}

export function readManifest(out: string): BoardManifest | null {
  try {
    const parsed = JSON.parse(readFileSync(manifestPath(out), "utf8")) as Partial<BoardManifest>;
    if (parsed.version !== 1 || typeof parsed.source !== "string") return null;
    return { version: 1, source: parsed.source, done: parsed.done ?? {}, failed: parsed.failed ?? {} };
  } catch {
    return null;
  }
}

function writeManifest(out: string, manifest: BoardManifest): void {
  mkdirSync(out, { recursive: true });
  const path = manifestPath(out);
  writeFileSync(`${path}.tmp`, `${JSON.stringify(manifest, null, 2)}\n`);
  rmSync(path, { force: true });
  copyFileSync(`${path}.tmp`, path);
  rmSync(`${path}.tmp`, { force: true });
}

/**
 * The exact code a shot is taken with: the tree id of the working copy as it stands (tracked
 * changes and untracked, unignored files included), the same before and after it is committed.
 * Written through a copy of the index, so the checkout's own index is never touched.
 */
export function boardSource(cwd: string = root): string {
  const git = (args: string[], env: NodeJS.ProcessEnv = process.env) => spawnSync("git", args, { cwd, encoding: "utf8", env });
  const index = git(["rev-parse", "--path-format=absolute", "--git-path", "index"]).stdout.trim();
  const scratch = join(tmpdir(), `jg-board-index-${process.pid}-${Date.now()}`);
  try {
    if (index !== "" && existsSync(index)) copyFileSync(index, scratch);
    const env = { ...process.env, GIT_INDEX_FILE: scratch };
    const add = git(["add", "-A", "--", "."], env);
    const tree = git(["write-tree"], env);
    if (add.status === 0 && tree.status === 0 && tree.stdout.trim() !== "") return tree.stdout.trim();
  } finally {
    rmSync(scratch, { force: true });
  }
  // No git: every run is new code, so nothing is kept without --resume.
  return `unknown-${createHash("sha1").update(String(Date.now())).digest("hex").slice(0, 12)}`;
}

/** What a run starts from: the folder's manifest when it was taken with this code (or `--resume` keeps any shot file), else a fresh one. @internal */
export function startManifest(args: Pick<BoardArgs, "out" | "resume" | "shoot">, shots: readonly BoardShot[], source: string, exists: (path: string) => boolean = existsSync): { manifest: BoardManifest; note?: string } {
  const previous = readManifest(args.out);
  const manifest: BoardManifest = { version: 1, source, done: {}, failed: {} };
  if (args.resume) {
    for (const shot of shots) if (exists(join(args.out, shot.file))) manifest.done[shot.file] = shotKey(shot, args);
    if (previous?.source === source) manifest.failed = { ...previous.failed };
    return { manifest };
  }
  if (previous === null) return { manifest };
  if (previous.source !== source) {
    const kept = Object.keys(previous.done).length;
    return { manifest, ...(kept > 0 ? { note: `the code changed since this board's ${kept} shots were taken: retaking them (--resume keeps them)` } : {}) };
  }
  for (const shot of shots) {
    if (previous.done[shot.file] === shotKey(shot, args) && exists(join(args.out, shot.file))) manifest.done[shot.file] = previous.done[shot.file]!;
  }
  manifest.failed = { ...previous.failed };
  return { manifest };
}

/**
 * Every shot not yet landed: untried ones first, then ones that failed before, so one broken view
 * never holds up the rest. Nothing is ever dropped: a board is finished only when every shot lands.
 * @internal
 */
export function shotsToTake(manifest: BoardManifest, shots: readonly BoardShot[]): BoardShot[] {
  const open = shots.filter((shot) => manifest.done[shot.file] === undefined);
  return [...open.filter((shot) => manifest.failed[shot.file] === undefined), ...open.filter((shot) => manifest.failed[shot.file] !== undefined)];
}

/** Whether one more capture still fits: the first always does, later ones when the slowest so far would end inside the budget. @internal */
export function fitsBudget(elapsedMs: number, slowestMs: number, taken: number, budgetSeconds: number): boolean {
  return taken === 0 || elapsedMs + slowestMs <= budgetSeconds * 1000;
}

/** What a board run needs from the world, so a test can stand in for the captures, the clock and the code identity. */
export interface BoardDeps {
  capture: (args: BoardArgs, shot: BoardShot) => boolean;
  now: () => number;
  source: () => string;
  compose: (args: BoardArgs, shots: readonly BoardShot[]) => void;
  log: (line: string) => void;
}

const REAL_DEPS: BoardDeps = { capture: captureShot, now: Date.now, source: () => boardSource(), compose: composeBoard, log: (line) => console.log(line) };

/**
 * One bounded run: take the shots still missing until the budget is spent (each at most once per
 * run), recording each in `board.json` as it lands. The sheets are laid out only when every shot
 * has landed, so a board is never finished with a gap. Returns 0 when the board is finished, 1 when
 * a capture failed in this run (named, with its error; the board stays unfinished and the next run
 * tries it again), and {@link BOARD_MORE_EXIT} when the budget ran out with shots still to take.
 */
export function runBoard(args: BoardArgs, deps: BoardDeps = REAL_DEPS): number {
  const started = deps.now();
  const shots = boardShots(args);
  const { manifest, note } = startManifest(args, shots, deps.source());
  if (note !== undefined) deps.log(`board: ${note}`);
  writeManifest(args.out, manifest);
  const kept = Object.keys(manifest.done).length;
  if (kept > 0) deps.log(`board: keeping ${kept} shots already taken`);
  const todo = shotsToTake(manifest, shots);
  const failedNow: string[] = [];
  let slowest = 0;
  let taken = 0;
  for (const shot of todo) {
    if (!fitsBudget(deps.now() - started, slowest, taken, args.budget)) break;
    const position = Object.keys(manifest.done).length + 1;
    deps.log(`board: [${position}/${shots.length}] ${shot.file}`);
    markStep(`board shot ${position}/${shots.length} ${shot.file}`);
    const shotStarted = deps.now();
    const ok = deps.capture(args, shot);
    slowest = Math.max(slowest, deps.now() - shotStarted);
    taken += 1;
    if (ok) {
      manifest.done[shot.file] = shotKey(shot, args);
      delete manifest.failed[shot.file];
    } else {
      manifest.failed[shot.file] = (manifest.failed[shot.file] ?? 0) + 1;
      failedNow.push(shot.file);
    }
    writeManifest(args.out, manifest);
  }
  const left = shotsToTake(manifest, shots);
  const landed = Object.keys(manifest.done).length;
  if (left.length > 0) {
    const failing = left.filter((shot) => manifest.failed[shot.file] !== undefined).map((shot) => `${shot.file} (${manifest.failed[shot.file]} failed)`);
    if (failing.length > 0) deps.log(`board: not finished: ${failing.length} shot(s) failed and are still missing: ${failing.join(", ")}`);
    deps.log(`board: ${landed}/${shots.length} shots in ${relative(root, args.out)}, ${left.length} left: run the same command again to continue; no sheets until every shot lands`);
    return failedNow.length > 0 ? 1 : BOARD_MORE_EXIT;
  }
  markStep("board sheets");
  deps.compose(args, shots);
  deps.log(`board: ${landed}/${shots.length} captures in ${relative(root, args.out)}`);
  return 0;
}

/** Lay out every sheet from the shots in the board folder (and the comparison with `--diff`). */
function composeBoard(args: BoardArgs, _shots: readonly BoardShot[]): void {
  const levels: (number | undefined)[] = args.realism.length === 0 ? [undefined] : args.realism;
  const photos = GRASS_REFERENCE_PHOTOS.filter((photo) => args.only.length === 0 || args.only.includes(photo.id));
  if (photos.length > 0) {
    const rows = photos.map((photo) => [
      { path: join(PHOTOS, photo.file), label: `real ${photo.id}` },
      ...levels.map((level) => ({ path: join(args.out, "ref", `${photo.id}-${realismTag(level)}.png`), label: `ours ${photo.species} ${realismTag(level)}` })),
    ]);
    save(join(args.out, "realistic.png"), composeSheet(rows, 480, 270, "REAL PHOTOS AND OURS"));
  }
  const stylised = GRASS_STYLE_TARGETS.map((target) => {
    const level = levels.reduce((best, next) => (Math.abs((next ?? target.realism) - target.realism) < Math.abs((best ?? target.realism) - target.realism) ? next : best), levels[0]);
    return [
      ...target.views.map((view) => ({ path: join(args.out, "views", `${view}.png`), label: `${target.id} target ${view}` })),
      ...["hay-anglesey", "lawn-frog"].map((id) => ({ path: join(args.out, "ref", `${id}-${realismTag(level)}.png`), label: `ours ${id} ${realismTag(level)}` })),
    ];
  });
  save(join(args.out, "stylised.png"), composeSheet(stylised, 480, 270, "STYLISED TARGETS AND OURS"));
  writeFileSync(join(args.out, "targets.txt"), GRASS_STYLE_TARGETS.map((target) => `${target.id} (realism ${target.realism}, art from ${target.views.join(", ")}):\n${target.target}\n`).join("\n"));
  if (args.views) {
    const cells = GRASS_GAME_VIEWS.map((view) => ({ path: join(args.out, "views", `${view.id}.png`), label: view.id }));
    const rows: Cell[][] = [];
    for (let i = 0; i < cells.length; i += 3) rows.push(cells.slice(i, i + 3));
    save(join(args.out, "views.png"), composeSheet(rows, 640, 360, "GRASS GAME VIEWS"));
  }
  if (args.species) speciesSheets(args);
  if (args.diff !== undefined) diffBoards(args, args.diff);
}

const USAGE = {
  summary: `shoot the grass reference boards: real photos beside our matching views, our games' stylised art beside the realism ends, the 18 grass game views and every species. One run shoots for --budget seconds, records each shot in <out>/board.json and exits ${BOARD_MORE_EXIT} while shots remain: run the same command again to continue. The run that takes the last shot lays out the sheets and exits 0; a run whose capture failed names it and exits 1, the board unfinished until it lands. Shots taken with other code are retaken unless --resume`,
  usage: "bun run shoot --board [--realism 0,0.5,1] [--views] [--species] [--only ids] [--out dir] [--diff <earlier board>] [--quality tier] [--timeout s] [--budget s] [--resume]",
  flags: [
    { flag: "--realism <list>", detail: "realism levels to shoot the reference views at (0 cartoon .. 1 photoreal); default the demo as it is" },
    { flag: "--views", detail: "also shoot the 18 grass game views (views.png)" },
    { flag: "--species", detail: "also shoot every grass-looks species, look and close (species-*.png)" },
    { flag: "--only <ids>", detail: "keep only these reference photos, game views or species numbers" },
    { flag: "--out <dir>", detail: "board folder (default .scratch/boards/grass)" },
    { flag: "--diff <dir>", detail: "compare every shot with the same one in an earlier board: diff.tsv and compare-*.png" },
    { flag: "--quality <tier>", detail: "pin the graphics tier of every capture" },
    { flag: "--timeout <s>", detail: "readiness timeout for every capture, for heavy games on a busy machine (shoot default 60)" },
    { flag: "--budget <s>", detail: `seconds this run shoots for before it leaves the rest to the next run (default ${BOARD_BUDGET_SECONDS})` },
    { flag: "--resume", detail: "keep every shot file already in the board folder, even one taken with other code" },
  ],
  example: "bun run shoot --board --views --out .scratch/boards/phase0",
} as const;

if (import.meta.main) {
  const argv = process.argv.slice(2);
  if (printHelpIfAsked("shoot --board", USAGE, argv)) process.exit(0);
  process.exit(runBoard(parseBoardArgs(argv)));
}
