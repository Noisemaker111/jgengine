import { createFogField, type FogCells, type FogField } from "@jgengine/core/world/fog";

import { SIGHT_RADIUS, SIGHT_RADIUS_BUILDING, SIGHT_RADIUS_HERO } from "./tuning";

/**
 * Fog of war, three states deep.
 *
 * The grid is the shared `@jgengine/core/world/fog` field — reveal-on-event cells over the
 * battlefield — used twice: one field that only ever grows (what the Vanguard has *explored*) and
 * one that is cleared and refilled every fog tick (what it can *see right now*). A cell is
 *   visible   - inside some friendly sight radius this tick,
 *   explored  - seen before, not seen now: terrain stays drawn, dimmed,
 *   unseen    - never seen: the map hides it and no enemy unit there is drawn.
 *
 * Pure data and engine primitives only; the scene glue lives in `systems.ts`.
 */
export type FogLevel = "visible" | "explored" | "unseen";

export interface FogBounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/** The battlefield the minimap frames: 96×96 centred on the origin. */
export const FOG_BOUNDS: FogBounds = { minX: -48, minZ: -48, maxX: 48, maxZ: 48 };

export interface FogState {
  /** Sticky: every cell the army has ever seen. */
  explored: FogField;
  /** Recleared each fog tick: the cells a friendly eye covers now. */
  visible: FogField;
}

export function createFogState(cellSize: number): FogState {
  return {
    explored: createFogField({ bounds: FOG_BOUNDS, cellSize }),
    visible: createFogField({ bounds: FOG_BOUNDS, cellSize }),
  };
}

/** One friendly eye: a world spot and the world-unit radius it clears. */
export interface SightSource {
  x: number;
  z: number;
  radius: number;
}

/** Recompute current vision from the eyes that exist now, and grow the explored field with them. */
export function refreshSight(fog: FogState, sources: readonly SightSource[]): void {
  fog.visible.reset();
  for (const source of sources) {
    if (source.radius <= 0) continue;
    fog.visible.reveal(source.x, source.z, source.radius);
    fog.explored.reveal(source.x, source.z, source.radius);
  }
}

/** Which of the three states a world XZ is in. Off-grid points clamp to the nearest cell. */
export function fogLevel(fog: FogState, x: number, z: number): FogLevel {
  if (fog.visible.isRevealed(x, z)) return "visible";
  return fog.explored.isRevealed(x, z) ? "explored" : "unseen";
}

/** Fog draw opacity per state: unseen is solid, explored dims terrain but keeps it readable. */
export const FOG_ALPHA: Record<FogLevel, number> = { visible: 0, explored: 0.55, unseen: 0.94 };

/** An enemy unit is drawn only while it stands in sight — the rule both the world and the minimap read. */
export function enemyDrawn(fog: FogState, x: number, z: number): boolean {
  return fogLevel(fog, x, z) === "visible";
}

/** How far one catalog entry sees. Buildings light their own ground; the hero scouts furthest. */
export function sightRadiusFor(catalogId: string, kind: "unit" | "building"): number {
  if (catalogId === "hero") return SIGHT_RADIUS_HERO;
  return kind === "building" ? SIGHT_RADIUS_BUILDING : SIGHT_RADIUS;
}

/** The fog snapshot the minimap paints: both grids, read together. */
export interface FogCellsSnapshot {
  explored: FogCells;
  visible: FogCells;
}

export function fogSnapshot(fog: FogState): FogCellsSnapshot {
  return { explored: fog.explored.cells(), visible: fog.visible.cells() };
}
