import { formatCubeLut } from "@jgengine/core/postfx/cubeLut";
import type { GradeLut, LutCube } from "@jgengine/core/render/postProcessing";

import { LUT_GRADES } from "./grades/index";
type Rgb = readonly [number, number, number];

export interface LutGradeRecipe {
  contrast?: number;
  saturation?: number;
  gain?: Rgb;
  gamma?: Rgb;
  shadowTint?: Rgb;
  highlightTint?: Rgb;
  fade?: number;
  /** Blend toward the bleach-bypass overlay of luma onto colour, 0..1. */
  bleach?: number;
  /** Blend toward a sepia monochrome, 0..1. */
  sepia?: number;
}

export interface LutGrade {
  id: string;
  title: string;
  look: string;
  recipe: LutGradeRecipe;
}

const clamp = (value: number): number => Math.min(1, Math.max(0, value));
const luma = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

export { LUT_GRADES };

export type LutGradeId = (typeof LUT_GRADES)[number]["id"];

export const LUT_GRADE_SIZE = 32;

export const LUT_GRADE_DIR = "lut";

export const LUT_GRADE_LICENSE = "CC0-1.0";

const byId: ReadonlyMap<string, LutGrade> = new Map(LUT_GRADES.map((grade) => [grade.id, grade]));

/** @internal */
export function lutGradeOf(id: string): LutGrade {
  const grade = byId.get(id);
  if (grade === undefined) throw new Error(`unknown LUT grade "${id}"; known: ${LUT_GRADES.map((entry) => entry.id).join(", ")}`);
  return grade;
}

/** Applies a recipe to one display-space colour (each channel 0..1). */
/** @internal */
export function applyLutRecipe(recipe: LutGradeRecipe, r: number, g: number, b: number): [number, number, number] {
  const gain = recipe.gain ?? [1, 1, 1];
  const gamma = recipe.gamma ?? [1, 1, 1];
  const channels = [r, g, b].map((value, index) => Math.pow(clamp(value * (gain[index] ?? 1)), gamma[index] ?? 1));
  let [red = 0, green = 0, blue = 0] = channels;
  const saturation = recipe.saturation ?? 1;
  const y = luma(red, green, blue);
  red = y + (red - y) * saturation;
  green = y + (green - y) * saturation;
  blue = y + (blue - y) * saturation;
  if (recipe.bleach !== undefined) {
    const overlay = (base: number): number => (y < 0.5 ? 2 * base * y : 1 - 2 * (1 - base) * (1 - y));
    red += (overlay(clamp(red)) - red) * recipe.bleach;
    green += (overlay(clamp(green)) - green) * recipe.bleach;
    blue += (overlay(clamp(blue)) - blue) * recipe.bleach;
  }
  if (recipe.sepia !== undefined) {
    const l = luma(red, green, blue);
    red += (clamp(l * 1.1) - red) * recipe.sepia;
    green += (clamp(l * 0.88) - green) * recipe.sepia;
    blue += (clamp(l * 0.66) - blue) * recipe.sepia;
  }
  const contrast = recipe.contrast ?? 1;
  red = (red - 0.5) * contrast + 0.5;
  green = (green - 0.5) * contrast + 0.5;
  blue = (blue - 0.5) * contrast + 0.5;
  const l = clamp(luma(red, green, blue));
  const shadow = recipe.shadowTint ?? [0, 0, 0];
  const highlight = recipe.highlightTint ?? [0, 0, 0];
  red += shadow[0] * (1 - l) + highlight[0] * l;
  green += shadow[1] * (1 - l) + highlight[1] * l;
  blue += shadow[2] * (1 - l) + highlight[2] * l;
  const fade = recipe.fade ?? 0;
  return [clamp(fade + red * (1 - fade)), clamp(fade + green * (1 - fade)), clamp(fade + blue * (1 - fade))];
}

/** @internal */
export function bakeLutGrade(id: string, size = LUT_GRADE_SIZE): LutCube {
  const { recipe } = lutGradeOf(id);
  const data = new Uint8Array(size ** 3 * 3);
  let at = 0;
  for (let blue = 0; blue < size; blue += 1) {
    for (let green = 0; green < size; green += 1) {
      for (let red = 0; red < size; red += 1) {
        const [r, g, b] = applyLutRecipe(recipe, red / (size - 1), green / (size - 1), blue / (size - 1));
        data[at++] = Math.round(r * 255);
        data[at++] = Math.round(g * 255);
        data[at++] = Math.round(b * 255);
      }
    }
  }
  return { size, data };
}

/** @internal */
export function lutGradeFile(id: string): string {
  return formatCubeLut(bakeLutGrade(id), lutGradeOf(id).title);
}

/** @internal */
export function lutGradeFileName(id: string): string {
  const { id: known } = lutGradeOf(id);
  return `${known}/${known}.cube`;
}

/**
 * A shipped colour grade by id, ready for the postfx grade stage: `grade: { lut: lutGrade("cold-teal") }`.
 * Throws on an id that is not in {@link LUT_GRADES}. The file is served from `/lut/<id>/<id>.cube`,
 * which `bun run games:provision` serves to a game that names the id.
 *
 * @capability lut-grade-library pick a shipped colour grade by id for a game's post-processing
 */
export function lutGrade(id: LutGradeId, baseUrl = `/${LUT_GRADE_DIR}`): GradeLut {
  return { url: `${baseUrl}/${lutGradeFileName(id)}`, size: LUT_GRADE_SIZE };
}
