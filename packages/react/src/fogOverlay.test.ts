import { describe, expect, test } from "bun:test";
import type { FogCells } from "@jgengine/core/world/fog";

import { forEachUnrevealedFogCell, paintFogOverlay } from "./fogOverlay";

function cells(partial: Partial<FogCells> & Pick<FogCells, "cols" | "rows" | "revealed">): FogCells {
  return {
    minX: 0,
    minZ: 0,
    cellSize: 1,
    revealedCount: partial.revealed.filter(Boolean).length,
    ...partial,
  };
}

describe("fog overlay paint", () => {
  test("visits only unrevealed cells", () => {
    const fog = cells({
      cols: 2,
      rows: 2,
      revealed: [true, false, false, true],
    });
    const visited: string[] = [];
    const count = forEachUnrevealedFogCell(fog, (col, row) => visited.push(`${col},${row}`));
    expect(count).toBe(2);
    expect(visited).toEqual(["1,0", "0,1"]);
  });

  test("paints one rect per unrevealed cell without allocating React nodes", () => {
    const fog = cells({
      cols: 3,
      rows: 2,
      revealed: [false, true, false, true, false, true],
    });
    const rects: Array<{ x: number; y: number; w: number; h: number }> = [];
    const surface = {
      fillStyle: "",
      clearRect() {},
      fillRect(x: number, y: number, w: number, h: number) {
        rects.push({ x, y, w, h });
      },
    };
    const painted = paintFogOverlay(surface, { width: 30, height: 20 }, fog, (col, row) => ({
      x: col * 10,
      y: row * 10,
      width: 10,
      height: 10,
    }));
    expect(painted).toBe(3);
    expect(rects).toEqual([
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 20, y: 0, w: 10, h: 10 },
      { x: 10, y: 10, w: 10, h: 10 },
    ]);
  });

  test("large fog field stays O(unrevealed) paint ops not O(cells) React elements", () => {
    const cols = 64;
    const rows = 64;
    const revealed = Array.from({ length: cols * rows }, (_, index) => index % 7 === 0);
    const fog = cells({ cols, rows, revealed });
    let paints = 0;
    paintFogOverlay(
      {
        fillStyle: "",
        clearRect() {},
        fillRect() {
          paints += 1;
        },
      },
      { width: 256, height: 256 },
      fog,
      () => ({ x: 0, y: 0, width: 1, height: 1 }),
    );
    const unrevealed = revealed.filter((flag) => !flag).length;
    expect(paints).toBe(unrevealed);
    expect(paints).toBeLessThan(cols * rows);
  });
});
