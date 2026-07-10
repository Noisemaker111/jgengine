import { cellAt, createCellGrid, withCell, withCells, type CellGrid } from "@jgengine/core/puzzle/cellGrid";

export type IceStatus = "solid" | "cracked" | "open";
export type CorridorId = "inner" | "mid" | "outer";

export const CORRIDOR_IDS: readonly CorridorId[] = ["inner", "mid", "outer"];

export interface IceCell {
  readonly status: IceStatus;
  readonly corridor: CorridorId;
  readonly corner: number;
  readonly crossedThisLap: boolean;
}

export interface IceGridConfig {
  readonly cellSize: number;
  readonly originX: number;
  readonly originZ: number;
  readonly width: number;
  readonly height: number;
}

export interface IceWorld {
  readonly config: IceGridConfig;
  readonly grid: CellGrid<IceCell>;
}

export interface IceCellCoord {
  readonly cx: number;
  readonly cz: number;
}

export function createIceWorld(config: IceGridConfig): IceWorld {
  return { config, grid: createCellGrid<IceCell>(config.width, config.height) };
}

export function worldToCell(config: IceGridConfig, x: number, z: number): IceCellCoord {
  return {
    cx: Math.floor((x - config.originX) / config.cellSize),
    cz: Math.floor((z - config.originZ) / config.cellSize),
  };
}

export function cellCenter(config: IceGridConfig, cx: number, cz: number): readonly [number, number] {
  return [config.originX + (cx + 0.5) * config.cellSize, config.originZ + (cz + 0.5) * config.cellSize];
}

export function iceCellAt(world: IceWorld, x: number, z: number): IceCell | null {
  const { cx, cz } = worldToCell(world.config, x, z);
  return cellAt(world.grid, cx, cz);
}

export function withIceCell(world: IceWorld, cx: number, cz: number, value: IceCell | null): IceWorld {
  return { config: world.config, grid: withCell(world.grid, cx, cz, value) };
}

export function withIceCells(
  world: IceWorld,
  entries: readonly { readonly x: number; readonly y: number; readonly value: IceCell | null }[],
): IceWorld {
  return { config: world.config, grid: withCells(world.grid, entries) };
}

export function nextIceStatus(status: IceStatus): IceStatus {
  if (status === "solid") return "cracked";
  return "open";
}

export function isOpenAt(world: IceWorld, x: number, z: number): boolean {
  const cell = iceCellAt(world, x, z);
  return cell !== null && cell.status === "open";
}

export function markCrossed(world: IceWorld, x: number, z: number): IceWorld {
  const { cx, cz } = worldToCell(world.config, x, z);
  const cell = cellAt(world.grid, cx, cz);
  if (cell === null || cell.crossedThisLap) return world;
  return withIceCell(world, cx, cz, { ...cell, crossedThisLap: true });
}

export interface IceStressChange {
  readonly cx: number;
  readonly cz: number;
  readonly corridor: CorridorId;
  readonly corner: number;
  readonly from: IceStatus;
  readonly to: IceStatus;
}

export function advanceLapBoundary(world: IceWorld): { world: IceWorld; changed: readonly IceStressChange[] } {
  const changed: IceStressChange[] = [];
  const entries: { x: number; y: number; value: IceCell | null }[] = [];
  const { width, height, cells } = world.grid;
  for (let cz = 0; cz < height; cz += 1) {
    for (let cx = 0; cx < width; cx += 1) {
      const cell = cells[cz * width + cx] ?? null;
      if (cell === null) continue;
      if (cell.crossedThisLap) {
        const to = nextIceStatus(cell.status);
        if (to !== cell.status) {
          changed.push({ cx, cz, corridor: cell.corridor, corner: cell.corner, from: cell.status, to });
        }
        entries.push({ x: cx, y: cz, value: { ...cell, status: to, crossedThisLap: false } });
      } else {
        entries.push({ x: cx, y: cz, value: cell });
      }
    }
  }
  return { world: withIceCells(world, entries), changed };
}

export function activeCellCount(world: IceWorld): number {
  let count = 0;
  for (const cell of world.grid.cells) if (cell !== null) count += 1;
  return count;
}

export function statusCounts(world: IceWorld): Record<IceStatus, number> {
  const counts: Record<IceStatus, number> = { solid: 0, cracked: 0, open: 0 };
  for (const cell of world.grid.cells) if (cell !== null) counts[cell.status] += 1;
  return counts;
}
