import type { DatacenterClaim } from "@llmville/game/datacenter/claims";
import { cellKey, cellToWorldCenter, type CellCoord } from "@llmville/game/datacenter/grid";
import { isStructuralColumnCell } from "@llmville/game/datacenter/layout";
import { mulberry32 } from "@llmville/game/world/cityHash";

export const SPAWN_SEARCH_RADIUS_CELLS = 60;

const SAMPLES_PER_RING = 128;
const MAX_RINGS = 16;

export function pickSpawnPoint(seed: number, claims: readonly DatacenterClaim[]): { x: number; z: number } {
  const claimed = new Set(claims.map((claim) => cellKey({ cx: claim.cx, cz: claim.cz })));
  const isFree = (cell: CellCoord) => !claimed.has(cellKey(cell)) && !isStructuralColumnCell(cell);
  const rng = mulberry32(seed);

  for (let ring = 1; ring <= MAX_RINGS; ring++) {
    const radius = SPAWN_SEARCH_RADIUS_CELLS * ring;
    for (let sample = 0; sample < SAMPLES_PER_RING; sample++) {
      const cell = {
        cx: Math.floor((rng() * 2 - 1) * radius),
        cz: Math.floor((rng() * 2 - 1) * radius),
      };
      if (isFree(cell)) return cellToWorldCenter(cell);
    }
  }

  for (let cx = SPAWN_SEARCH_RADIUS_CELLS * MAX_RINGS; ; cx++) {
    const cell = { cx, cz: 1 };
    if (isFree(cell)) return cellToWorldCenter(cell);
  }
}
