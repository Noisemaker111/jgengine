import type { LutCube } from "../render/postProcessing";

const MIN_SIZE = 2;
const MAX_SIZE = 64;

/**
 * Parses an Adobe/Resolve `.cube` 3D LUT (`LUT_3D_SIZE n`, then `n³` lines of `r g b` in 0..1, red
 * fastest) into a {@link LutCube}. Throws on a 1D table, a wrong entry count or an out-of-range size.
 *
 * @capability cube-lut-parse read a .cube colour-grade file into a LUT cube the grade stage applies
 */
export function parseCubeLut(text: string): LutCube {
  let size = 0;
  const values: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    const keyword = parts[0];
    if (keyword === "LUT_3D_SIZE") {
      size = Number(parts[1]);
      continue;
    }
    if (keyword === "LUT_1D_SIZE") throw new Error("cube LUT: 1D tables are not supported");
    if (keyword !== undefined && /^[A-Z_]+$/.test(keyword)) continue;
    if (parts.length !== 3) throw new Error(`cube LUT: unreadable line "${line}"`);
    for (const part of parts) {
      const value = Number(part);
      if (!Number.isFinite(value)) throw new Error(`cube LUT: unreadable value "${part}"`);
      values.push(value);
    }
  }
  if (!Number.isInteger(size) || size < MIN_SIZE || size > MAX_SIZE) throw new Error(`cube LUT: LUT_3D_SIZE must be ${MIN_SIZE}..${MAX_SIZE}, got ${size}`);
  if (values.length !== size * size * size * 3) throw new Error(`cube LUT: expected ${size ** 3} entries, found ${values.length / 3}`);
  const data = new Uint8Array(values.length);
  for (let index = 0; index < values.length; index += 1) data[index] = Math.round(Math.min(1, Math.max(0, values[index] ?? 0)) * 255);
  return { size, data };
}

/** Writes a {@link LutCube} as `.cube` text (the inverse of {@link parseCubeLut}). */
export function formatCubeLut(cube: LutCube, title = "JGengine grade"): string {
  const lines = [`TITLE "${title}"`, `LUT_3D_SIZE ${cube.size}`];
  for (let index = 0; index < cube.size ** 3; index += 1) {
    const at = index * 3;
    lines.push(`${((cube.data[at] ?? 0) / 255).toFixed(6)} ${((cube.data[at + 1] ?? 0) / 255).toFixed(6)} ${((cube.data[at + 2] ?? 0) / 255).toFixed(6)}`);
  }
  return `${lines.join("\n")}\n`;
}
