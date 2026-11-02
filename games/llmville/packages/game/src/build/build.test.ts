import { describe, expect, test } from "bun:test";

import { getPlacementBounds, isPlacementValidAt, rotationYToDirection, type PlacementPreviewContext } from "@llmville/game/build/build";
import type { BuildDirection, BuildItemId } from "@llmville/game/build/catalog";
import { cellsForBounds } from "@llmville/game/datacenter/grid";
import { isStructuralColumnCell } from "@llmville/game/datacenter/layout";
import type { PlacementCellPolicy } from "@llmville/game/datacenter/claims";
import type { RoomBounds, WorldPoint } from "@llmville/game/world/grid";

function overlaps(left: RoomBounds, right: RoomBounds): boolean {
  return left.minX < right.maxX && left.maxX > right.minX && left.minZ < right.maxZ && left.maxZ > right.minZ;
}

// The rule as it stood before build mode moved onto @jgengine/core/placement validatePlacementBounds.
function previousRule(point: WorldPoint, context: PlacementPreviewContext): boolean {
  const bounds = getPlacementBounds(context.itemId, point, context.direction);
  const cells = cellsForBounds(bounds);
  if (cells.some((cell) => !context.cellPolicy.canUse(cell))) return false;
  if (cells.some((cell) => isStructuralColumnCell(cell))) return false;
  if (context.racks.some((rack) => overlaps(bounds, getPlacementBounds(rack.rackType, rack, rotationYToDirection(rack.rotationY))))) return false;
  return !context.placedBuildItems.some((item) => overlaps(bounds, getPlacementBounds(item.itemId, item, item.direction)));
}

const westOfTwelve: PlacementCellPolicy = {
  canUse: (cell) => cell.cx < 12 && cell.cz > -12,
  quote: () => ({ newCells: [], totalCost: 0 }),
};

describe("isPlacementValidAt", () => {
  test("keeps the verdict it gave before the move onto core placement", () => {
    const items: readonly BuildItemId[] = ["starter_rack", "beanbag_corner"];
    const directions: readonly BuildDirection[] = [0, 1, 2, 3];
    let refused = 0;
    let accepted = 0;
    for (const itemId of items) {
      for (const direction of directions) {
        const context: PlacementPreviewContext = {
          itemId,
          direction,
          racks: [{ rackType: "starter_rack", x: 4.5, z: 4.5, rotationY: Math.PI / 2 }],
          placedBuildItems: [{ itemId: "beanbag_corner", x: 8, z: 2, direction: 0 }],
          cellPolicy: westOfTwelve,
        };
        for (let x = -3; x <= 14; x += 0.5) {
          for (let z = -3; z <= 8; z += 0.5) {
            const point = { x, z };
            const verdict = isPlacementValidAt(point, context);
            expect(verdict).toBe(previousRule(point, context));
            if (verdict) accepted++;
            else refused++;
          }
        }
      }
    }
    expect(accepted).toBeGreaterThan(0);
    expect(refused).toBeGreaterThan(0);
  });

  test("refuses a structural column cell and a cell the policy denies", () => {
    const context: PlacementPreviewContext = {
      itemId: "starter_rack",
      direction: 0,
      racks: [],
      placedBuildItems: [],
      cellPolicy: westOfTwelve,
    };
    expect(isPlacementValidAt({ x: 0.5, z: 0.5 }, context)).toBe(false);
    expect(isPlacementValidAt({ x: 20.5, z: 4.5 }, context)).toBe(false);
    expect(isPlacementValidAt({ x: 4.5, z: 4.5 }, context)).toBe(true);
  });
});
