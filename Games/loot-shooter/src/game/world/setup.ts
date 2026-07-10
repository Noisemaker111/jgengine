import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";

export const PLAYER_SPAWN: EntityPosition = [0, 0, 0];
export const ARENA_HALF = 38;

export interface CoverPlacement {
  id: string;
  x: number;
  y?: number;
  z: number;
}

const QUADRANT_TEMPLATE: readonly CoverPlacement[] = [
  { id: "crate_metal", x: 7, z: 9 },
  { id: "crate_metal", x: 8, z: 9 },
  { id: "crate_metal", x: 7, y: 1, z: 9 },
  { id: "barrier_slab", x: 13, z: 6 },
  { id: "barrier_slab", x: 14, z: 6 },
  { id: "barrier_slab", x: 15, z: 6 },
  { id: "crate_amber", x: 18, z: 14 },
  { id: "crate_amber", x: 18, z: 15 },
  { id: "wreck_hull", x: 11, z: 19 },
  { id: "wreck_hull", x: 12, z: 19 },
  { id: "pylon_beacon", x: 22, z: 22 },
  { id: "crate_metal", x: 24, z: 10 },
  { id: "crate_metal", x: 24, z: 11 },
  { id: "crate_metal", x: 24, y: 1, z: 10 },
  { id: "barrier_slab", x: 5, z: 26 },
  { id: "barrier_slab", x: 6, z: 26 },
  { id: "crate_amber", x: 28, z: 4 },
  { id: "wreck_hull", x: 30, z: 28 },
];

const CENTER_RING: readonly CoverPlacement[] = [
  { id: "barrier_slab", x: 3, z: 0 },
  { id: "barrier_slab", x: -3, z: 0 },
  { id: "barrier_slab", x: 0, z: 3 },
  { id: "barrier_slab", x: 0, z: -3 },
];

export const COVER_LAYOUT: readonly CoverPlacement[] = [
  ...CENTER_RING,
  ...QUADRANT_TEMPLATE.flatMap((placement) => [
    placement,
    { ...placement, x: -placement.x, z: placement.z },
    { ...placement, x: placement.x, z: -placement.z },
    { ...placement, x: -placement.x, z: -placement.z },
  ]),
];

export function setupWorld(ctx: GameContext): void {
  for (const placement of COVER_LAYOUT) {
    ctx.scene.object.place(placement.id, placement.x, (placement.y ?? 0) + 0.5, placement.z);
  }
}

export function clampToArena(x: number, z: number): readonly [number, number] {
  const limit = ARENA_HALF - 1.2;
  return [Math.max(-limit, Math.min(limit, x)), Math.max(-limit, Math.min(limit, z))];
}
