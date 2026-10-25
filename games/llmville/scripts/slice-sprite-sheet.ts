import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildSpriteSheetGridBoxes,
  buildSpriteSheetManifest,
  sanitizeAssetName,
  type SpriteSheetGridConfig,
} from "@jgengine/core/assets/spriteSheet";
import sharp from "sharp";

type BackgroundMode = "none" | "corner" | "edge" | "checker";

interface CliOptions {
  input: string;
  outDir: string;
  prefix: string;
  names: string[];
  grid: SpriteSheetGridConfig;
  backgroundMode: BackgroundMode;
  tolerance: number;
  trim: boolean;
  trimPadding: number;
}

interface Rgba {
  r: number;
  g: number;
  b: number;
}

interface Bounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

const HELP = `
Usage:
  bun run assets:slice -- --input ./sheet.png --out ./llmville/public/game-assets --cols 4 --rows 3 --prefix fantasy

Options:
  --input <path>           Source sprite sheet image.
  --out <dir>              Output directory for PNG slices and manifest.
  --cols, --columns <n>    Grid column count.
  --rows <n>               Grid row count.
  --margin-x <n>           Horizontal sheet margin. Default: 0.
  --margin-y <n>           Vertical sheet margin. Default: 0.
  --gap-x <n>              Horizontal gap between cells. Default: 0.
  --gap-y <n>              Vertical gap between cells. Default: 0.
  --cell-width <n>         Explicit cell width when the grid uses only part of the source.
  --cell-height <n>        Explicit cell height when the grid uses only part of the source.
  --prefix <name>          Generated asset name prefix. Default: source file name.
  --names <csv>            Comma-separated asset names, one per grid cell.
  --names-file <path>      Text file with one asset name per line.
  --bg <mode>              none, corner, edge, or checker. Default: edge.
  --tolerance <n>          Background color distance threshold. Default: 28.
  --no-trim                Keep the full cell rectangle.
  --trim-padding <n>       Transparent padding after trimming. Default: 0.
`;

function readArgValue(args: string[], index: number, label: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${label} requires a value.`);
  }
  return value;
}

function parseInteger(value: string | undefined, label: string, fallback?: number): number {
  if (value === undefined) {
    if (fallback === undefined) throw new Error(`${label} is required.`);
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${label} must be an integer.`);
  return parsed;
}

async function parseOptions(args: string[]): Promise<CliOptions> {
  const values = new Map<string, string>();
  let trim = true;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      console.log(HELP.trim());
      process.exit(0);
    }
    if (arg === "--no-trim") {
      trim = false;
      continue;
    }
    if (!arg.startsWith("--")) throw new Error(`Unknown argument: ${arg}`);
    const key = arg.slice(2);
    values.set(key, readArgValue(args, index, arg));
    index += 1;
  }

  const input = values.get("input");
  const outDir = values.get("out");
  if (!input) throw new Error("--input is required.");
  if (!outDir) throw new Error("--out is required.");

  const columns = parseInteger(values.get("cols") ?? values.get("columns"), "columns");
  const rows = parseInteger(values.get("rows"), "rows");
  const names = values.get("names")?.split(",").map((name) => name.trim()).filter(Boolean) ?? [];
  const namesFile = values.get("names-file");
  if (namesFile) {
    const fileNames = await readFile(path.resolve(namesFile), "utf8");
    names.push(...fileNames.split(/\r?\n/).map((name) => name.trim()).filter(Boolean));
  }

  const backgroundMode = (values.get("bg") ?? "edge") as BackgroundMode;
  if (!["none", "corner", "edge", "checker"].includes(backgroundMode)) {
    throw new Error("--bg must be one of: none, corner, edge, checker.");
  }

  return {
    input: path.resolve(input),
    outDir: path.resolve(outDir),
    prefix: values.get("prefix") ?? path.basename(input, path.extname(input)),
    names,
    grid: {
      columns,
      rows,
      marginX: parseInteger(values.get("margin-x"), "margin-x", 0),
      marginY: parseInteger(values.get("margin-y"), "margin-y", 0),
      gapX: parseInteger(values.get("gap-x"), "gap-x", 0),
      gapY: parseInteger(values.get("gap-y"), "gap-y", 0),
      cellWidth: values.has("cell-width") ? parseInteger(values.get("cell-width"), "cell-width") : undefined,
      cellHeight: values.has("cell-height") ? parseInteger(values.get("cell-height"), "cell-height") : undefined,
    },
    backgroundMode,
    tolerance: parseInteger(values.get("tolerance"), "tolerance", 28),
    trim,
    trimPadding: parseInteger(values.get("trim-padding"), "trim-padding", 0),
  };
}

function sample(data: Buffer, width: number, x: number, y: number): Rgba {
  const index = (y * width + x) * 4;
  return { r: data[index], g: data[index + 1], b: data[index + 2] };
}

function colorDistance(data: Buffer, index: number, color: Rgba): number {
  return Math.hypot(data[index] - color.r, data[index + 1] - color.g, data[index + 2] - color.b);
}

function matchesAnyBackground(data: Buffer, index: number, backgrounds: readonly Rgba[], tolerance: number): boolean {
  return data[index + 3] === 0 || backgrounds.some((background) => colorDistance(data, index, background) <= tolerance);
}

function backgroundSamples(data: Buffer, width: number, height: number, mode: BackgroundMode): Rgba[] {
  const maxX = width - 1;
  const maxY = height - 1;
  const samples = [sample(data, width, 0, 0), sample(data, width, maxX, 0), sample(data, width, 0, maxY), sample(data, width, maxX, maxY)];

  if (mode === "checker") {
    samples.push(
      sample(data, width, Math.floor(maxX / 2), 0),
      sample(data, width, Math.floor(maxX / 2), maxY),
      sample(data, width, 0, Math.floor(maxY / 2)),
      sample(data, width, maxX, Math.floor(maxY / 2)),
    );
  }

  return samples;
}

function removeBackground(data: Buffer, width: number, height: number, mode: BackgroundMode, tolerance: number): void {
  if (mode === "none") return;

  const backgrounds = backgroundSamples(data, width, height, mode);
  if (mode === "corner" || mode === "checker") {
    for (let index = 0; index < data.length; index += 4) {
      if (matchesAnyBackground(data, index, backgrounds, tolerance)) data[index + 3] = 0;
    }
    return;
  }

  const visited = new Uint8Array(width * height);
  const stack: number[] = [];
  const enqueue = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const pixel = y * width + x;
    if (visited[pixel]) return;
    visited[pixel] = 1;
    const index = pixel * 4;
    if (!matchesAnyBackground(data, index, backgrounds, tolerance)) return;
    data[index + 3] = 0;
    stack.push(pixel);
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  while (stack.length > 0) {
    const pixel = stack.pop()!;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }
}

function opaqueBounds(data: Buffer, width: number, height: number, padding: number): Bounds | null {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }

  if (right < left || bottom < top) return null;

  left = Math.max(0, left - padding);
  top = Math.max(0, top - padding);
  right = Math.min(width - 1, right + padding);
  bottom = Math.min(height - 1, bottom + padding);
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

const options = await parseOptions(process.argv.slice(2));
const sourceImage = sharp(options.input);
const metadata = await sourceImage.metadata();
if (!metadata.width || !metadata.height) throw new Error(`Could not read dimensions from ${options.input}.`);

await mkdir(options.outDir, { recursive: true });

const slices = buildSpriteSheetGridBoxes({
  imageWidth: metadata.width,
  imageHeight: metadata.height,
  config: options.grid,
  namePrefix: options.prefix,
  names: options.names,
});
const outputs: Array<{ name: string; file: string; width: number; height: number }> = [];

for (const box of slices) {
  const { data, info } = await sharp(options.input)
    .extract({ left: box.x, top: box.y, width: box.width, height: box.height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = Buffer.from(data);

  removeBackground(pixels, info.width, info.height, options.backgroundMode, options.tolerance);

  let image = sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } });
  if (options.trim) {
    const bounds = opaqueBounds(pixels, info.width, info.height, options.trimPadding);
    if (bounds) image = image.extract(bounds);
  }

  const file = `${sanitizeAssetName(box.name)}.png`;
  const outputPath = path.join(options.outDir, file);
  const result = await image.png().toFile(outputPath);
  outputs.push({ name: box.name, file, width: result.width, height: result.height });
  console.log(`${file} -> ${result.width}x${result.height}`);
}

const manifest = {
  ...buildSpriteSheetManifest({
    sourceName: path.basename(options.input),
    imageWidth: metadata.width,
    imageHeight: metadata.height,
    config: options.grid,
    slices,
  }),
  processing: {
    backgroundMode: options.backgroundMode,
    tolerance: options.tolerance,
    trim: options.trim,
    trimPadding: options.trimPadding,
  },
  output: {
    directory: options.outDir,
    files: outputs,
  },
};

await writeFile(path.join(options.outDir, "sprite-sheet.manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${outputs.length} slices to ${options.outDir}`);
