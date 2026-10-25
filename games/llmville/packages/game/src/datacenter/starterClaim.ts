import type { DatacenterClaim } from "@llmville/game/datacenter/claims";
import {
  CLAIM_GAP_CELLS,
  cellToWorldCenter,
  chebyshevCellDistance,
  type CellCoord,
} from "@llmville/game/datacenter/grid";
import { isStructuralColumnCell } from "@llmville/game/datacenter/layout";
import { SPAWN_SEARCH_RADIUS_CELLS } from "@llmville/game/datacenter/spawn";
import { mulberry32 } from "@llmville/game/world/cityHash";

/** A 3×3 block: every new world starts owning the ground under its spawn point. */
export const STARTER_CLAIM_RADIUS_CELLS = 1;

const SAMPLES_PER_RING = 128;
const MAX_RINGS = 16;

export interface StarterClaimBlock {
  center: CellCoord;
  spawn: { x: number; z: number };
  cells: CellCoord[];
}

export function starterClaimCellsAround(center: CellCoord): CellCoord[] {
  const cells: CellCoord[] = [];
  for (let dx = -STARTER_CLAIM_RADIUS_CELLS; dx <= STARTER_CLAIM_RADIUS_CELLS; dx++) {
    for (let dz = -STARTER_CLAIM_RADIUS_CELLS; dz <= STARTER_CLAIM_RADIUS_CELLS; dz++) {
      cells.push({ cx: center.cx + dx, cz: center.cz + dz });
    }
  }
  return cells;
}

export function isStarterClaimBlockPlaceable(
  cells: readonly CellCoord[],
  claims: readonly DatacenterClaim[],
): boolean {
  return cells.every(
    (cell) =>
      !isStructuralColumnCell(cell)
      && claims.every((claim) => chebyshevCellDistance(cell, claim) > CLAIM_GAP_CELLS),
  );
}

function blockAt(center: CellCoord): StarterClaimBlock {
  return { center, spawn: cellToWorldCenter(center), cells: starterClaimCellsAround(center) };
}

/** Deterministic free 3×3 block for a new world, keeping the claim gap to every other lab. */
export function pickStarterClaimBlock(
  seed: number,
  claims: readonly DatacenterClaim[],
): StarterClaimBlock {
  const rng = mulberry32(seed);
  for (let ring = 1; ring <= MAX_RINGS; ring++) {
    const radius = SPAWN_SEARCH_RADIUS_CELLS * ring;
    for (let sample = 0; sample < SAMPLES_PER_RING; sample++) {
      const center = {
        cx: Math.floor((rng() * 2 - 1) * radius),
        cz: Math.floor((rng() * 2 - 1) * radius),
      };
      const block = blockAt(center);
      if (isStarterClaimBlockPlaceable(block.cells, claims)) return block;
    }
  }

  for (let cx = SPAWN_SEARCH_RADIUS_CELLS * MAX_RINGS; ; cx++) {
    const block = blockAt({ cx, cz: 1 });
    if (isStarterClaimBlockPlaceable(block.cells, claims)) return block;
  }
}
