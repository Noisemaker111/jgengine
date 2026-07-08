import type { WorldGridConfig } from "./features";

export interface GridInstanceTransform {
  position: readonly [number, number, number];
  scale: readonly [number, number, number];
  color: string;
}

const DEFAULT_CELL_SIZE = 1;
const DEFAULT_BASE_HEIGHT = 1;
const DEFAULT_GRID_COLOR = "#8a8f98";

/**
 * Pure cell→instance math for `biomes()`/`voxel()`/`plots()`/`tilemap()` world features: one
 * extruded box per declared cell, grounded at y=0 and centered on its cell in x/z. Consumed by
 * the shell's grid-world renderer so it can drive a single `THREE.InstancedMesh` without
 * duplicating this math per game.
 */
export function resolveGridInstances(config: WorldGridConfig): readonly GridInstanceTransform[] {
  const cells = config.cells ?? [];
  const cellSize = config.cellSize ?? DEFAULT_CELL_SIZE;
  const defaultColor = config.defaultColor ?? DEFAULT_GRID_COLOR;
  return cells.map((cell) => {
    const height = cell.height ?? config.baseHeight ?? DEFAULT_BASE_HEIGHT;
    return {
      position: [cell.x * cellSize, height / 2, cell.z * cellSize],
      scale: [cellSize, height, cellSize],
      color: cell.color ?? defaultColor,
    };
  });
}
