import { seededRng } from "@jgengine/core/random/rng";

export type BodyShape = "blob" | "tall" | "round" | "insectoid";

export const BODY_SHAPES: readonly BodyShape[] = ["blob", "tall", "round", "insectoid"];

export interface AlienBodyPlan {
  shape: BodyShape;
  size: number;
  limbCount: number;
  limbLength: number;
  eyeCount: number;
  hue: number;
  metabolism: number;
}

function pick<T>(rng: () => number, list: readonly T[]): T {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))]!;
}

function range(rng: () => number, lo: number, hi: number): number {
  return lo + rng() * (hi - lo);
}

export function generateBodyPlan(seed: string): AlienBodyPlan {
  const rng = seededRng(seed);
  const shape = pick(rng, BODY_SHAPES);
  const size = Math.round(range(rng, 0.7, 1.55) * 100) / 100;
  const limbCount =
    shape === "insectoid"
      ? 6 + Math.floor(rng() * 3) * 2 - 2
      : shape === "tall"
        ? 2
        : 2 + Math.floor(rng() * 3) * 2;
  const limbLength = Math.round(range(rng, shape === "tall" ? 0.8 : 0.35, shape === "tall" ? 1.15 : 0.85) * 100) / 100;
  const eyeCount = 1 + Math.floor(rng() * 4);
  const hue = Math.floor(rng() * 360);
  const metabolism = Math.round(range(rng, 0.75, 1.35) * 100) / 100;
  return { shape, size, limbCount: Math.max(2, limbCount), limbLength, eyeCount, hue, metabolism };
}

export function walkSpeedOf(plan: AlienBodyPlan): number {
  const legFactor = 0.7 + plan.limbCount * 0.06;
  return (2.1 * legFactor) / plan.size;
}

export function bodyColor(plan: AlienBodyPlan, lightness = 60): string {
  return `hsl(${plan.hue}, 62%, ${lightness}%)`;
}

export function describePlan(plan: AlienBodyPlan): string {
  return `${plan.shape} · ${plan.limbCount} limbs · ${plan.eyeCount} eyes`;
}
