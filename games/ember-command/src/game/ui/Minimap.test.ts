import { describe, expect, test } from "bun:test";
import type { FogCells } from "@jgengine/core/map/fog";

import { fogRuns } from "./Minimap";

function cells(revealed: boolean[]): FogCells {
  return { cols: 4, rows: 2, minX: -48, minZ: -48, cellSize: 24, revealed, revealedCount: revealed.filter(Boolean).length };
}

describe("fogRuns", () => {
  test("each row's run of cells in one state is one rectangle", () => {
    // Row 0: unseen, unseen, explored, in sight. Row 1: never seen at all.
    const explored = cells([false, false, true, true, false, false, false, false]);
    const visible = cells([false, false, false, true, false, false, false, false]);
    // A 24 m cell is 42 px on the 168 px map of a 96 m field.
    expect(fogRuns({ explored, visible })).toEqual([
      { key: "0:0", x: 0, y: 0, w: 84, h: 42, kind: "unseen" },
      { key: "0:2", x: 84, y: 0, w: 42, h: 42, kind: "explored" },
      { key: "1:0", x: 0, y: 42, w: 168, h: 42, kind: "unseen" },
    ]);
  });
});
