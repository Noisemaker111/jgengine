import { readFileSync, writeFileSync } from "node:fs";

import { decodePng, encodePng, type RgbaImage } from "../packages/assets/src/imageCodec";

/**
 * Compare two screenshots of the same view, pixel by pixel (the same statistics as native/'s
 * jg-render diff), and write a heat map of where they differ.
 *
 *   bun scripts/shot-diff.ts <a.png> <b.png> [--out diff.png] [--ignore x,y,w,h ...]
 *
 * `--ignore` leaves a rectangle out of the numbers (a clock or counter in the HUD). Prints one JSON
 * line; exits 1 when the images differ in size.
 */

export interface ShotDiff {
  /** Mean absolute difference per RGB channel, 0..255. */
  meanAbs: number;
  /** Largest channel difference anywhere. */
  maxAbs: number;
  /** Share of compared pixels whose largest RGB difference is over 2 and over 8 levels. */
  over2: number;
  over8: number;
  /** PSNR over RGB, dB; Infinity when identical. */
  psnr: number;
  /** Pixels compared (the image less the ignored rectangles). */
  pixels: number;
}

export type Rect = [x: number, y: number, w: number, h: number];

/** Compare two equal-size RGBA images, leaving `ignore` out; `heat` (optional) receives the per-pixel map. */
export function diffImages(a: RgbaImage, b: RgbaImage, ignore: readonly Rect[] = [], heat?: Uint8Array): ShotDiff {
  if (a.width !== b.width || a.height !== b.height) throw new Error(`the images differ in size: ${a.width}x${a.height} and ${b.width}x${b.height}`);
  let sum = 0, sq = 0, max = 0, o2 = 0, o8 = 0, n = 0;
  const skip = (x: number, y: number) => ignore.some(([rx, ry, rw, rh]) => x >= rx && x < rx + rw && y >= ry && y < ry + rh);
  for (let y = 0; y < a.height; y += 1) {
    for (let x = 0; x < a.width; x += 1) {
      const i = (y * a.width + x) * 4;
      if (skip(x, y)) continue;
      let px = 0;
      for (let c = 0; c < 3; c += 1) {
        const d = Math.abs(a.data[i + c]! - b.data[i + c]!);
        sum += d;
        sq += d * d;
        if (d > px) px = d;
      }
      if (px > max) max = px;
      if (px > 2) o2 += 1;
      if (px > 8) o8 += 1;
      n += 1;
      if (heat !== undefined) {
        // Grey copy of `a` where they match; red, brightening with the difference, where they do not.
        const grey = Math.round((a.data[i]! + a.data[i + 1]! + a.data[i + 2]!) / 6);
        heat[i] = px > 8 ? Math.min(255, 96 + px * 2) : grey;
        heat[i + 1] = px > 8 ? 0 : grey;
        heat[i + 2] = px > 8 ? 0 : grey;
        heat[i + 3] = 255;
      }
    }
  }
  const mse = n === 0 ? 0 : sq / (n * 3);
  const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
  return {
    meanAbs: n === 0 ? 0 : round(sum / (n * 3), 3),
    maxAbs: max,
    over2: n === 0 ? 0 : round(o2 / n, 5),
    over8: n === 0 ? 0 : round(o8 / n, 5),
    psnr: mse === 0 ? Infinity : round(10 * Math.log10((255 * 255) / mse), 2),
    pixels: n,
  };
}

function parseRect(value: string): Rect {
  const parts = value.split(",").map(Number);
  if (parts.length !== 4 || parts.some((v) => !Number.isInteger(v) || v < 0)) throw new Error(`--ignore needs x,y,w,h in whole pixels (got ${value})`);
  return parts as Rect;
}

function main(argv: string[]): void {
  const files: string[] = [];
  const ignore: Rect[] = [];
  let out: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--out" || arg === "--ignore") {
      const value = argv[index + 1];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      index += 1;
      if (arg === "--out") out = value;
      else ignore.push(parseRect(value));
      continue;
    }
    if (arg.startsWith("--")) throw new Error(`unknown argument ${arg}`);
    files.push(arg);
  }
  if (files.length !== 2) throw new Error("usage: bun scripts/shot-diff.ts <a.png> <b.png> [--out diff.png] [--ignore x,y,w,h ...]");
  const a = decodePng(readFileSync(files[0]!));
  const b = decodePng(readFileSync(files[1]!));
  const heat = out === null ? undefined : new Uint8Array(a.width * a.height * 4);
  const stats = diffImages(a, b, ignore, heat);
  if (out !== null && heat !== undefined) writeFileSync(out, encodePng({ width: a.width, height: a.height, data: heat }));
  console.log(JSON.stringify({ a: files[0], b: files[1], ...stats, psnr: Number.isFinite(stats.psnr) ? stats.psnr : "identical", ...(out === null ? {} : { heatMap: out }) }));
}

if (import.meta.main) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`shot-diff: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
