import type { Tile } from "@jgengine/core/tactics/tacticalGrid";

import { PLAYER_ROSTER_ORDER } from "./entities/players/catalog";

export interface EnemySpawnDef {
  catalogId: string;
  tile: Tile;
}

export interface WaveDef {
  label: string;
  obstacles: readonly Tile[];
  enemies: readonly EnemySpawnDef[];
}

export const PLAYER_SPAWN_TILES: readonly Tile[] = [
  [0, 2],
  [0, 5],
  [1, 3],
];

export const WAVES: readonly WaveDef[] = [
  {
    label: "Outpost Breach",
    obstacles: [
      [3, 2],
      [3, 5],
      [4, 3],
      [4, 4],
    ],
    enemies: [
      { catalogId: "crawler", tile: [7, 2] },
      { catalogId: "crawler", tile: [7, 5] },
      { catalogId: "spitter", tile: [6, 3] },
    ],
  },
  {
    label: "Second Wave",
    obstacles: [
      [2, 6],
      [3, 2],
      [4, 4],
      [5, 1],
      [5, 6],
    ],
    enemies: [
      { catalogId: "crawler", tile: [7, 1] },
      { catalogId: "brute", tile: [7, 3] },
      { catalogId: "brute", tile: [7, 5] },
      { catalogId: "spitter", tile: [6, 6] },
    ],
  },
];

export function playerSpawnTile(index: number): Tile {
  return PLAYER_SPAWN_TILES[index % PLAYER_SPAWN_TILES.length]!;
}

export const PLAYER_UNIT_IDS = PLAYER_ROSTER_ORDER;
