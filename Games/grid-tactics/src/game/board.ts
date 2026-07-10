import { createTacticalGrid, type Tile, type TacticalGrid } from "@jgengine/core/tactics/tacticalGrid";
import { terrain, type TerrainEnvironmentDescriptor } from "@jgengine/core/world/features";
import { resolveTerrainField } from "@jgengine/core/world/terrain";

export const GRID_SIZE = 8;
export const TILE_SIZE = 2.2;
export const BOARD_MARGIN = 5.4;
export const BOARD_EXTENT = GRID_SIZE * TILE_SIZE + BOARD_MARGIN;

const HALF_SPAN = (GRID_SIZE - 1) / 2;

export const TERRAIN: TerrainEnvironmentDescriptor = terrain({
  bounds: { w: BOARD_EXTENT, d: BOARD_EXTENT },
  height: 0.16,
  frequency: 0.05,
  seed: "grid-tactics-outpost",
  colors: { low: "#3d4a3a", high: "#7d8a68", waterline: "#35404a" },
});

const groundField = resolveTerrainField(TERRAIN);

export function groundHeightAt(x: number, z: number): number {
  return groundField.sampleHeight(x, z);
}

export function tileToWorld(tile: Tile): readonly [number, number, number] {
  const x = (tile[0] - HALF_SPAN) * TILE_SIZE;
  const z = (tile[1] - HALF_SPAN) * TILE_SIZE;
  return [x, groundHeightAt(x, z), z];
}

export function worldToTile(x: number, z: number): Tile | null {
  const c = Math.round(x / TILE_SIZE + HALF_SPAN);
  const r = Math.round(z / TILE_SIZE + HALF_SPAN);
  if (c < 0 || c >= GRID_SIZE || r < 0 || r >= GRID_SIZE) return null;
  return [c, r];
}

export function createBattleGrid(blocked: readonly Tile[]): TacticalGrid {
  return createTacticalGrid({ width: GRID_SIZE, height: GRID_SIZE, blocked, diagonal: false });
}

export function manhattan(a: Tile, b: Tile): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

export function tilesWithinRange(center: Tile, range: number): Tile[] {
  const tiles: Tile[] = [];
  for (let c = 0; c < GRID_SIZE; c += 1) {
    for (let r = 0; r < GRID_SIZE; r += 1) {
      const tile: Tile = [c, r];
      const dist = manhattan(center, tile);
      if (dist >= 1 && dist <= range) tiles.push(tile);
    }
  }
  return tiles;
}

export function tileKey(tile: Tile): string {
  return `${tile[0]},${tile[1]}`;
}

export function sameTile(a: Tile, b: Tile): boolean {
  return a[0] === b[0] && a[1] === b[1];
}
