import { describe, expect, test } from "bun:test";

import {
  advanceCropDay,
  applyToolToTiles,
  createCropField,
  createDayTicker,
  diamondPattern,
  emptyTile,
  harvestCrop,
  maturityDays,
  plantCrop,
  squarePattern,
  tileKey,
  tillTile,
  waterTile,
  type CropDef,
  type CropTileState,
} from "./crop";

const parsnip: CropDef = { id: "parsnip", stages: [1, 2, 1], harvest: { itemId: "parsnip", count: 1 } };
const berry: CropDef = { id: "berry", stages: [2], regrowDays: 3, harvest: { itemId: "berry", count: 2 } };

describe("crop tile state machine", () => {
  test("till then plant then daily-water advances stages", () => {
    let tile = tillTile(emptyTile());
    expect(tile.soil).toBe("tilled");
    tile = plantCrop(tile, "parsnip");
    expect(tile.cropId).toBe("parsnip");
    expect(maturityDays(parsnip)).toBe(4);

    for (let day = 0; day < 4; day++) {
      tile = waterTile(tile);
      expect(tile.watered).toBe(true);
      tile = advanceCropDay(parsnip, tile);
      expect(tile.watered).toBe(false);
    }
    expect(tile.harvestable).toBe(true);
    expect(tile.stage).toBe(parsnip.stages.length);
  });

  test("unwatered crop does not grow that day", () => {
    let tile = plantCrop(tillTile(emptyTile()), "parsnip");
    tile = advanceCropDay(parsnip, tile);
    expect(tile.stage).toBe(0);
    expect(tile.stageProgress).toBe(0);
  });

  test("cannot plant on untilled soil", () => {
    const tile = plantCrop(emptyTile(), "parsnip");
    expect(tile.cropId).toBeNull();
  });

  test("harvest clears a non-regrow crop back to tilled soil", () => {
    let tile: CropTileState = { soil: "tilled", watered: false, cropId: "parsnip", stage: 3, stageProgress: 0, harvestable: true };
    const result = harvestCrop(parsnip, tile);
    expect(result.yield).toEqual({ itemId: "parsnip", count: 1 });
    tile = result.state;
    expect(tile.cropId).toBeNull();
    expect(tile.soil).toBe("tilled");
  });

  test("regrow crop stays planted and matures again after regrowDays", () => {
    let tile: CropTileState = { soil: "tilled", watered: false, cropId: "berry", stage: 1, stageProgress: 0, harvestable: true };
    const first = harvestCrop(berry, tile);
    expect(first.yield).toEqual({ itemId: "berry", count: 2 });
    tile = first.state;
    expect(tile.cropId).toBe("berry");
    expect(tile.harvestable).toBe(false);

    for (let day = 0; day < 3; day++) {
      tile = advanceCropDay(berry, waterTile(tile));
    }
    expect(tile.harvestable).toBe(true);
  });
});

describe("applyToolToTiles patterns", () => {
  test("square pattern waters a 3x3 area under the cursor", () => {
    const pattern = squarePattern(1);
    expect(pattern).toHaveLength(9);
    let tiles = new Map<string, CropTileState>();
    for (const [dx, dz] of pattern) tiles.set(tileKey([dx, dz]), tillTile(emptyTile()));
    const result = applyToolToTiles(tiles, [0, 0], pattern, waterTile);
    expect(result.changed).toHaveLength(9);
    for (const [, state] of result.tiles) expect(state.watered).toBe(true);
  });

  test("diamond pattern covers a plus-shaped radius", () => {
    expect(diamondPattern(1)).toHaveLength(5);
  });

  test("only tilled tiles change under a watering pass", () => {
    const tiles = new Map<string, CropTileState>();
    tiles.set(tileKey([0, 0]), tillTile(emptyTile()));
    const result = applyToolToTiles(tiles, [0, 0], squarePattern(1), waterTile);
    expect(result.changed).toEqual([[0, 0]]);
  });
});

describe("day ticker", () => {
  test("reports days crossed from the calendar day index", () => {
    const ticker = createDayTicker(0);
    expect(ticker.tick(0)).toBe(0);
    expect(ticker.tick(1.5)).toBe(1);
    expect(ticker.tick(4)).toBe(3);
  });
});

describe("crop field", () => {
  test("wires till/plant/water/advance/harvest over a tile grid", () => {
    const field = createCropField((id) => (id === "parsnip" ? parsnip : null));
    field.till([2, 3]);
    expect(field.plant([2, 3], "parsnip")).toBe(true);
    for (let day = 0; day < 4; day++) {
      field.water([2, 3]);
      field.advanceDay();
    }
    expect(field.get([2, 3]).harvestable).toBe(true);
    expect(field.harvest([2, 3])).toEqual({ itemId: "parsnip", count: 1 });
    expect(field.get([2, 3]).cropId).toBeNull();
  });

  test("advanceDay accepts a multi-day jump", () => {
    const field = createCropField(() => parsnip);
    field.till([0, 0]);
    field.plant([0, 0], "parsnip");
    field.water([0, 0]);
    field.advanceDay(1);
    expect(field.get([0, 0]).stage).toBe(1);
  });
});
