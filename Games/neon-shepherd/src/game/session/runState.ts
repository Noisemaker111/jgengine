import { BRONZE_THRESHOLD, GOLD_THRESHOLD, LOSE_THRESHOLD, SILVER_THRESHOLD } from "../constants";

export type Phase = "start" | "playing" | "won" | "lost";
export type Medal = "gold" | "silver" | "bronze" | null;

export function resolveMedal(aliveCount: number): Medal {
  if (aliveCount >= GOLD_THRESHOLD) return "gold";
  if (aliveCount >= SILVER_THRESHOLD) return "silver";
  if (aliveCount >= BRONZE_THRESHOLD) return "bronze";
  return null;
}

export function hasLost(aliveCount: number): boolean {
  return aliveCount < LOSE_THRESHOLD;
}

export function hasWon(shepherdZ: number, sanctuaryZ: number, aliveCount: number): boolean {
  return shepherdZ >= sanctuaryZ && aliveCount >= LOSE_THRESHOLD;
}

export function nearestRoadIndex(z: number, roadZs: readonly number[]): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  roadZs.forEach((roadZ, index) => {
    const distance = Math.abs(z - roadZ);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}

export function nextRoadAhead(z: number, roadZs: readonly number[]): number | null {
  let best: number | null = null;
  let bestZ = Number.POSITIVE_INFINITY;
  roadZs.forEach((roadZ, index) => {
    if (roadZ >= z - 1 && roadZ < bestZ) {
      bestZ = roadZ;
      best = index;
    }
  });
  return best;
}
