import type { EntityPosition } from "../scene/entityStore";
import type { NavGrid, NavPoint } from "./navGrid";

export interface NavConstrainProposed {
  position: EntityPosition;
  rotationY: number;
  grounded: boolean;
}

export interface NavConstrainEntity {
  position: EntityPosition;
}

export interface NavConstrainOptions {
  y?: (point: NavPoint) => number;
}

function withYRemap(proposed: NavConstrainProposed, options: NavConstrainOptions | undefined): NavConstrainProposed {
  if (options?.y === undefined) return proposed;
  const y = options.y([proposed.position[0], proposed.position[2]]);
  return { ...proposed, position: [proposed.position[0], y, proposed.position[2]] };
}

function walkable(grid: NavGrid, point: NavPoint): boolean {
  const cell = grid.cellAt(point);
  return grid.isWalkable(cell.col, cell.row);
}

export function constrainToNavGrid(
  grid: NavGrid,
  options?: NavConstrainOptions,
): (proposed: NavConstrainProposed, entity: NavConstrainEntity) => NavConstrainProposed | null {
  return (proposed, entity) => {
    const target: NavPoint = [proposed.position[0], proposed.position[2]];
    if (walkable(grid, target)) return withYRemap(proposed, options);

    const slideX: NavPoint = [entity.position[0], proposed.position[2]];
    if (walkable(grid, slideX)) {
      return withYRemap(
        { ...proposed, position: [entity.position[0], proposed.position[1], proposed.position[2]] },
        options,
      );
    }

    const slideZ: NavPoint = [proposed.position[0], entity.position[2]];
    if (walkable(grid, slideZ)) {
      return withYRemap(
        { ...proposed, position: [proposed.position[0], proposed.position[1], entity.position[2]] },
        options,
      );
    }

    return null;
  };
}
