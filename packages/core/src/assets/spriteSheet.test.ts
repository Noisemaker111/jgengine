import { describe, expect, test } from "bun:test";
import {
  buildSpriteSheetGridBoxes,
  buildSpriteSheetManifest,
  normalizeSpriteSheetGridConfig,
  sanitizeAssetName,
} from "./spriteSheet";

describe("sprite sheet slicing", () => {
  test("sanitizes generated asset names", () => {
    expect(sanitizeAssetName("  Forest Wolf / Attack Icon! ")).toBe("forest-wolf-attack-icon");
    expect(sanitizeAssetName("")).toBe("asset");
  });

  test("computes grid cells from image dimensions, margins, and gaps", () => {
    const boxes = buildSpriteSheetGridBoxes({
      imageWidth: 410,
      imageHeight: 210,
      config: { columns: 4, rows: 2, marginX: 5, marginY: 10, gapX: 10, gapY: 20 },
      namePrefix: "terrain tile",
    });

    expect(boxes).toHaveLength(8);
    expect(boxes[0]).toMatchObject({ name: "terrain-tile-01", x: 5, y: 10, width: 92, height: 85 });
    expect(boxes[5]).toMatchObject({ row: 1, column: 1, x: 107, y: 115 });
  });

  test("allows explicit cell sizes for partially used sheets", () => {
    const grid = normalizeSpriteSheetGridConfig(1024, 1024, {
      columns: 4,
      rows: 3,
      marginX: 16,
      marginY: 24,
      gapX: 8,
      gapY: 12,
      cellWidth: 220,
      cellHeight: 180,
    });

    expect(grid.cellWidth).toBe(220);
    expect(grid.cellHeight).toBe(180);
  });

  test("rejects grids that exceed the source image", () => {
    expect(() =>
      normalizeSpriteSheetGridConfig(100, 100, {
        columns: 3,
        rows: 1,
        marginX: 10,
        marginY: 0,
        gapX: 10,
        gapY: 0,
        cellWidth: 30,
        cellHeight: 100,
      }),
    ).toThrow("grid width");
  });

  test("builds a stable manifest", () => {
    const config = { columns: 2, rows: 1, marginX: 0, marginY: 0, gapX: 0, gapY: 0 };
    const slices = buildSpriteSheetGridBoxes({
      imageWidth: 200,
      imageHeight: 100,
      config,
      namePrefix: "icon",
      names: ["Sword", "Fireball"],
    });

    expect(buildSpriteSheetManifest({ sourceName: "sheet.png", imageWidth: 200, imageHeight: 100, config, slices }))
      .toMatchObject({
        version: 1,
        source: { name: "sheet.png", width: 200, height: 100 },
        slices: [{ name: "sword" }, { name: "fireball" }],
      });
  });
});
