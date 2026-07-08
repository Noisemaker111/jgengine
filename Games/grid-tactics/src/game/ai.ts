import type { TacticalGrid, Tile } from "@jgengine/core/tactics/tacticalGrid";

import { manhattan, sameTile } from "./board";

export type EnemyIntent =
  | { kind: "attack"; moveTo: Tile; targetTile: Tile }
  | { kind: "advance"; moveTo: Tile }
  | { kind: "hold" };

export function chooseEnemyIntent(
  grid: TacticalGrid,
  enemyTile: Tile,
  move: number,
  range: number,
  playerTiles: readonly Tile[],
): EnemyIntent {
  if (playerTiles.length === 0) return { kind: "hold" };

  const reachable = grid.reachable(enemyTile, move);
  const candidates: Tile[] = [enemyTile, ...reachable.map((entry) => entry.tile)];

  let bestAttack: { tile: Tile; target: Tile; cost: number } | null = null;
  for (const tile of candidates) {
    for (const target of playerTiles) {
      if (manhattan(tile, target) > range) continue;
      const cost = manhattan(enemyTile, tile);
      if (bestAttack === null || cost < bestAttack.cost) bestAttack = { tile, target, cost };
    }
  }
  if (bestAttack !== null) return { kind: "attack", moveTo: bestAttack.tile, targetTile: bestAttack.target };

  let bestAdvance: { tile: Tile; dist: number } | null = null;
  for (const tile of candidates) {
    let nearest = Number.POSITIVE_INFINITY;
    for (const target of playerTiles) nearest = Math.min(nearest, manhattan(tile, target));
    if (bestAdvance === null || nearest < bestAdvance.dist) bestAdvance = { tile, dist: nearest };
  }
  if (bestAdvance !== null && !sameTile(bestAdvance.tile, enemyTile)) {
    return { kind: "advance", moveTo: bestAdvance.tile };
  }
  return { kind: "hold" };
}
