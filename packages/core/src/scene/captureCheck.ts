import { resolveRng } from "../random/resolveRng";
import { clamp01 } from "../math/scalar";
export interface CaptureCheckInput {
  hpFraction: number;
  catchPower: number;
  difficulty?: number;
}

export function captureChance(input: CaptureCheckInput): number {
  const difficulty = input.difficulty ?? 1;
  const hpFactor = 1 - clamp01(input.hpFraction) * 0.6;
  return clamp01((input.catchPower * hpFactor) / Math.max(difficulty, 0.0001));
}

export function rollCapture(input: CaptureCheckInput, rng?: () => number): boolean {
  return resolveRng(rng, "rollCapture")() < captureChance(input);
}
