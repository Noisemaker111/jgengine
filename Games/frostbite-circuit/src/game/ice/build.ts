import {
  CENTERLINE,
  CORRIDOR_HALF_WIDTH,
  CORRIDOR_LINES,
  legIndexAt,
} from "../race/track";
import { loopNormalAt, offsetPoint } from "../race/geometry";
import { createIceWorld, withIceCells, type CorridorId, type IceCell, type IceGridConfig, type IceWorld } from "./grid";
import { CORRIDOR_IDS } from "./grid";

export const ICE_CELL_SIZE = 2;
const MARGIN_CELLS = 4;
const LATERAL_STEPS = 5;

function boundsOf(): { minX: number; maxX: number; minZ: number; maxZ: number } {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const corridor of CORRIDOR_IDS) {
    for (const point of CORRIDOR_LINES[corridor]) {
      minX = Math.min(minX, point[0]);
      maxX = Math.max(maxX, point[0]);
      minZ = Math.min(minZ, point[1]);
      maxZ = Math.max(maxZ, point[1]);
    }
  }
  const pad = CORRIDOR_HALF_WIDTH + MARGIN_CELLS * ICE_CELL_SIZE;
  return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
}

function buildConfig(): IceGridConfig {
  const bounds = boundsOf();
  const width = Math.ceil((bounds.maxX - bounds.minX) / ICE_CELL_SIZE);
  const height = Math.ceil((bounds.maxZ - bounds.minZ) / ICE_CELL_SIZE);
  return { cellSize: ICE_CELL_SIZE, originX: bounds.minX, originZ: bounds.minZ, width, height };
}

export const ICE_GRID_CONFIG: IceGridConfig = buildConfig();

function rasterCoord(x: number, z: number): { cx: number; cz: number } {
  return {
    cx: Math.floor((x - ICE_GRID_CONFIG.originX) / ICE_GRID_CONFIG.cellSize),
    cz: Math.floor((z - ICE_GRID_CONFIG.originZ) / ICE_GRID_CONFIG.cellSize),
  };
}

export function buildIceWorld(): IceWorld {
  const base = createIceWorld(ICE_GRID_CONFIG);
  const draft = new Map<string, { x: number; y: number; value: IceCell }>();

  for (const corridor of CORRIDOR_IDS) {
    const line = CORRIDOR_LINES[corridor];
    for (let i = 0; i < line.length; i += 1) {
      const point = line[i]!;
      const normal = loopNormalAt(CENTERLINE, i);
      const corner = legIndexAt(i);
      for (let s = -LATERAL_STEPS; s <= LATERAL_STEPS; s += 1) {
        const lateral = (s / LATERAL_STEPS) * CORRIDOR_HALF_WIDTH;
        const sample = offsetPoint(point, normal, lateral);
        const { cx, cz } = rasterCoord(sample[0], sample[1]);
        const key = `${cx},${cz}`;
        if (!draft.has(key)) {
          draft.set(key, { x: cx, y: cz, value: { status: "solid", corridor, corner, crossedThisLap: false } });
        }
      }
    }
  }

  return withIceCells(base, [...draft.values()]);
}

export function corridorCellCount(world: IceWorld, corridor: CorridorId): number {
  let count = 0;
  for (const cell of world.grid.cells) if (cell !== null && cell.corridor === corridor) count += 1;
  return count;
}
