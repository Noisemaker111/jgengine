// `bun run shoot --board`: the grass reference boards. Shoots the `grass-reference` demo's photo
// views (at each requested realism), the 18 grass game views and, on request, every grass-looks
// species, then lays real photos beside our matching views and our games' stylised art beside the
// realism ends they set. `--diff <board>` compares this board with an earlier one, shot by shot.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import jpeg from "jpeg-js";

import { GRASS_GAME_VIEWS, GRASS_REFERENCE_PHOTOS, GRASS_STYLE_TARGETS } from "../../../apps/dev/src/demo/grassReference";
import { GRASS_PRESETS } from "../../../packages/core/src/grass/grassKind";
import { STENCIL_GLYPHS } from "../../../packages/core/src/scene/decalTexture";
import { decodePng, encodePng, type RgbaImage } from "../../../packages/assets/src/imageCodec";
import { printHelpIfAsked } from "../../script-help";

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
  /** Keep shots already in the board folder and shoot only the missing ones (finish a board a guard cut short). */
  resume: boolean;
  /** Extra arguments for every capture (`--quality high`, `--timeout 240`). */
  shoot: string[];
}

/** Parse `--board` flags. @internal */
export function parseBoardArgs(argv: readonly string[]): BoardArgs {
  const args: BoardArgs = { out: join(root, ".scratch", "boards", "grass"), realism: [], views: false, species: false, only: [], shoot: [], resume: false };
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
    else throw new Error(`unknown flag ${flag} (bun run shoot --board --help lists them)`);
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

/** A game view's file at a realism level: `views/<id>.png` as the game stands, `views/<id>-r<level>.png` at a level. */
function viewFile(id: string, level: number | undefined): string {
  return level === undefined ? `views/${id}.png` : `views/${id}-${realismTag(level)}.png`;
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
  // The stylised targets are our games' art as they stand, so those views are always shot without a
  // realism; with --views and --realism every view is shot again at each level.
  const styled = new Set(GRASS_STYLE_TARGETS.flatMap((target) => target.views));
  const viewLevels: (number | undefined)[] = args.views && args.realism.length > 0 ? args.realism : [];
  for (const view of GRASS_GAME_VIEWS) {
    if (!keep(view.id)) continue;
    const argv = [view.game, "--mode", "play", "--look", view.look, "--look-from", view.lookFrom];
    if ((args.views && args.realism.length === 0) || styled.has(view.id)) shots.push({ file: viewFile(view.id, undefined), argv });
    for (const level of viewLevels) shots.push({ file: viewFile(view.id, level), argv: [...argv, "--param", `realism=${level}`] });
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

function shoot(args: BoardArgs, shot: BoardShot): boolean {
  const out = join(args.out, shot.file);
  mkdirSync(dirname(out), { recursive: true });
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

/** The shots a run still has to take: all of them, or with `--resume` only those not already in the board folder. @internal */
export function shotsToTake(args: BoardArgs, shots: readonly BoardShot[]): BoardShot[] {
  return args.resume ? shots.filter((shot) => !existsSync(join(args.out, shot.file))) : [...shots];
}

/** Shoot what the flags ask for, then build the sheets. Returns the number of failed captures. */
export function runBoard(args: BoardArgs): number {
  const shots = boardShots(args);
  const todo = shotsToTake(args, shots);
  if (todo.length < shots.length) console.log(`board: keeping ${shots.length - todo.length} shots already taken`);
  let failed = 0;
  todo.forEach((shot, index) => {
    console.log(`board: [${index + 1}/${todo.length}] ${shot.file}`);
    if (!shoot(args, shot)) failed += 1;
  });
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
    for (const level of levels) {
      const cells = GRASS_GAME_VIEWS.map((view) => ({ path: join(args.out, viewFile(view.id, level)), label: view.id }));
      const rows: Cell[][] = [];
      for (let i = 0; i < cells.length; i += 3) rows.push(cells.slice(i, i + 3));
      const sheet = level === undefined ? "views.png" : `views-${realismTag(level)}.png`;
      save(join(args.out, sheet), composeSheet(rows, 640, 360, level === undefined ? "GRASS GAME VIEWS" : `GRASS GAME VIEWS AT REALISM ${level}`));
    }
  }
  if (args.species) speciesSheets(args);
  if (args.diff !== undefined) diffBoards(args, args.diff);
  console.log(`board: ${shots.length - failed}/${shots.length} captures in ${relative(root, args.out)}`);
  return failed;
}

const USAGE = {
  summary: "shoot the grass reference boards: real photos beside our matching views, our games' stylised art beside the realism ends, the 18 grass game views and every species",
  usage: "bun run shoot --board [--realism 0,0.5,1] [--views] [--species] [--only ids] [--out dir] [--diff <earlier board>] [--quality tier] [--timeout s] [--resume]",
  flags: [
    { flag: "--realism <list>", detail: "realism levels to shoot the reference views (and with --views the game views) at (0 cartoon .. 1 photoreal); default as they are" },
    { flag: "--views", detail: "also shoot the 18 grass game views (views.png; with --realism, views-r<level>.png per level)" },
    { flag: "--species", detail: "also shoot every grass-looks species, look and close (species-*.png)" },
    { flag: "--only <ids>", detail: "keep only these reference photos, game views or species numbers" },
    { flag: "--out <dir>", detail: "board folder (default .scratch/boards/grass)" },
    { flag: "--diff <dir>", detail: "compare every shot with the same one in an earlier board: diff.tsv and compare-*.png" },
    { flag: "--quality <tier>", detail: "pin the graphics tier of every capture" },
    { flag: "--timeout <s>", detail: "readiness timeout for every capture, for heavy games on a busy machine (shoot default 60)" },
    { flag: "--resume", detail: "keep shots already in the board folder and shoot only the missing ones" },
  ],
  example: "bun run shoot --board --views --out .scratch/boards/phase0",
} as const;

if (import.meta.main) {
  const argv = process.argv.slice(2);
  if (printHelpIfAsked("shoot --board", USAGE, argv)) process.exit(0);
  process.exit(runBoard(parseBoardArgs(argv)) === 0 ? 0 : 1);
}
