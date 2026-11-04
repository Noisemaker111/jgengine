import { describe, expect, test } from "bun:test";
import type { FogCells } from "@jgengine/core/map/fog";

import { fogPaths } from "./Minimap";

function cells(revealed: boolean[]): FogCells {
  return { cols: 4, rows: 2, minX: -48, minZ: -48, cellSize: 24, revealed, revealedCount: revealed.filter(Boolean).length };
}

describe("fogPaths", () => {
  test("each row's run of cells in one state is one rectangle", () => {
    // Row 0: unseen, unseen, explored, in sight. Row 1: never seen at all.
    const explored = cells([false, false, true, true, false, false, false, false]);
    const visible = cells([false, false, false, true, false, false, false, false]);
    const paint = fogPaths({ explored, visible });
    // A 24 m cell is 42 px on the 168 px map of a 96 m field.
    expect(paint.unseen).toBe("M0.0 0.0h84.0v42.0h-84.0zM0.0 42.0h168.0v42.0h-168.0z");
    expect(paint.explored).toBe("M84.0 0.0h42.0v42.0h-42.0z");
  });
});
