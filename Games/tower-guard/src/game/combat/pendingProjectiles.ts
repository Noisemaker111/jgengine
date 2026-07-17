import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import { distance as vec3Distance } from "@jgengine/core/world/vec3";

export interface PendingProjectile {
  id: string;
  from: EntityPosition;
  to: EntityPosition;
  color: string;
  splashRadius: number;
  spawnedAt: number;
  travelSeconds: number;
}

const BOLT_SPEED = 26;
const MIN_TRAVEL_SECONDS = 0.08;
const MAX_TRAVEL_SECONDS = 0.4;

let queue: PendingProjectile[] = [];
let seq = 0;

export function pushProjectile(
  from: EntityPosition,
  to: EntityPosition,
  color: string,
  splashRadius: number,
  nowSeconds: number,
): void {
  const travelSeconds = Math.min(
    MAX_TRAVEL_SECONDS,
    Math.max(MIN_TRAVEL_SECONDS, vec3Distance(from, to) / BOLT_SPEED),
  );
  seq += 1;
  queue.push({ id: `bolt-${seq}`, from, to, color, splashRadius, spawnedAt: nowSeconds, travelSeconds });
}

export function activeProjectiles(nowSeconds: number): readonly PendingProjectile[] {
  queue = queue.filter((bolt) => nowSeconds - bolt.spawnedAt < bolt.travelSeconds);
  return queue;
}

export function resetProjectiles(): void {
  queue = [];
}
