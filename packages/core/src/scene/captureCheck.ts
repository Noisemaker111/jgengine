export interface CaptureCheckInput {
  hpFraction: number;
  catchPower: number;
  difficulty?: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function captureChance(input: CaptureCheckInput): number {
  const difficulty = input.difficulty ?? 1;
  const hpFactor = 1 - clamp01(input.hpFraction) * 0.6;
  return clamp01((input.catchPower * hpFactor) / Math.max(difficulty, 0.0001));
}

export function rollCapture(input: CaptureCheckInput, rng: () => number = Math.random): boolean {
  return rng() < captureChance(input);
}
