import { describe, expect, it } from "bun:test";
import { createWorldStreamer, gridCellId, gridShards, shardDistance, type StreamerShard } from "./streamer";

const terrain: StreamerShard = { id: "terrain", residency: "always" };
const cell00: StreamerShard = { id: "cell_0_0", bounds: { min: [0, 0], max: [256, 256] } };
const shards: StreamerShard[] = [
  terrain,
  cell00,
  { id: "cell_1_0", bounds: { min: [256, 0], max: [512, 256] } },
  { id: "cell_9_9", bounds: { min: [2304, 2304], max: [2560, 2560] } },
];

describe("shardDistance", () => {
  it("is 0 inside the footprint and inside always-resident shards", () => {
    expect(shardDistance(cell00, { x: 100, z: 100 })).toBe(0);
    expect(shardDistance(terrain, { x: 99999, z: 99999 })).toBe(0);
  });

  it("is the closest-point distance outside the footprint", () => {
    expect(shardDistance(cell00, { x: 300, z: 100 })).toBeCloseTo(44, 0); // 300 - 256
  });
});

describe("createWorldStreamer", () => {
  it("makes always-resident shards resident from the first update", () => {
    const streamer = createWorldStreamer({ shards, loadRadius: 50, keepRadius: 100 });
    const first = streamer.update({ x: 100, z: 100 });
    expect(first.load).toContain("terrain");
    expect(first.load).toContain("cell_0_0");
    expect(streamer.resident()).not.toContain("cell_9_9");
  });

  it("loads a neighbor cell when the camera moves within loadRadius", () => {
    const streamer = createWorldStreamer({ shards, loadRadius: 50, keepRadius: 100 });
    streamer.update({ x: 100, z: 100 });
    // move toward the cell_1_0 boundary (x=256); at x=220, distance to cell_1_0 is 36 <= 50.
    const moved = streamer.update({ x: 220, z: 100 });
    expect(moved.load).toContain("cell_1_0");
  });

  it("applies hysteresis: does not unload within the keep band, unloads past it", () => {
    const streamer = createWorldStreamer({ shards, loadRadius: 50, keepRadius: 100 });
    streamer.update({ x: 100, z: 100 }); // cell_0_0 resident
    // 90m past the cell_0_0 max edge (x=256 -> x=346): inside keep band (<=100), stays resident.
    const near = streamer.update({ x: 346, z: 100 });
    expect(near.unload).not.toContain("cell_0_0");
    expect(streamer.resident()).toContain("cell_0_0");
    // 120m past the edge (x=376): beyond keepRadius, unloads.
    const far = streamer.update({ x: 376, z: 100 });
    expect(far.unload).toContain("cell_0_0");
    expect(streamer.resident()).not.toContain("cell_0_0");
  });

  it("clamps keepRadius up to loadRadius when misconfigured", () => {
    const streamer = createWorldStreamer({ shards, loadRadius: 100, keepRadius: 10 });
    streamer.update({ x: 100, z: 100 });
    // 40m past the edge: within loadRadius(=keepRadius clamped to 100), stays.
    const near = streamer.update({ x: 296, z: 100 });
    expect(streamer.resident()).toContain("cell_0_0");
  });

  it("reset clears residency", () => {
    const streamer = createWorldStreamer({ shards, loadRadius: 50, keepRadius: 100 });
    streamer.update({ x: 100, z: 100 });
    expect(streamer.resident().length).toBeGreaterThan(0);
    streamer.reset();
    expect(streamer.resident()).toEqual([]);
    const back = streamer.update({ x: 100, z: 100 });
    expect(back.load).toContain("terrain");
  });

  it("streams a large world to a bounded neighborhood, not the planet", () => {
    const big: StreamerShard[] = [{ id: "terrain", residency: "always" }];
    for (let gx = 0; gx < 40; gx += 1) {
      for (let gz = 0; gz < 40; gz += 1) {
        big.push({ id: `c_${gx}_${gz}`, bounds: { min: [gx * 256, gz * 256], max: [(gx + 1) * 256, (gz + 1) * 256] } });
      }
    }
    const streamer = createWorldStreamer({ shards: big, loadRadius: 300, keepRadius: 500 });
    streamer.update({ x: 5000, z: 5000 });
    // 1601 shards exist; only terrain + a handful near (5000,5000) are resident.
    expect(streamer.resident().length).toBeLessThan(20);
    expect(streamer.resident()).toContain("terrain");
  });

  it("loads for every focus point and unloads only when all are far", () => {
    const grid = gridShards({ min: [0, 0], max: [1000, 1000], cellSize: 100 });
    const streamer = createWorldStreamer({ shards: grid, loadRadius: 10, keepRadius: 60 });
    streamer.update([{ x: 50, z: 50 }, { x: 950, z: 950 }]);
    expect(streamer.state("0,0")).toBe("ready");
    expect(streamer.state("9,9")).toBe("ready");
    const one = streamer.update([{ x: 950, z: 950 }, { x: 50, z: 50 }]);
    expect(one.unload).toEqual([]);
    const left = streamer.update([{ x: 950, z: 950 }]);
    expect(left.unload).toContain("0,0");
    expect(streamer.state("9,9")).toBe("ready");
  });

  it("spreads loads over updates nearest first and unloads farthest first", () => {
    const grid = gridShards({ min: [0, 0], max: [500, 100], cellSize: 100 });
    const streamer = createWorldStreamer({ shards: grid, loadRadius: 500, keepRadius: 500, loadsPerUpdate: 2, unloadsPerUpdate: 1 });
    const first = streamer.update({ x: 0, z: 50 });
    expect(first.load).toEqual(["0,0", "1,0"]);
    expect(first.pending).toBe(3);
    expect(streamer.update({ x: 0, z: 50 }).load).toEqual(["2,0", "3,0"]);
    expect(streamer.update({ x: 0, z: 50 }).load).toEqual(["4,0"]);
    expect(streamer.update({ x: 0, z: 50 }).pending).toBe(0);
    streamer.retune({ loadRadius: 50, keepRadius: 50 });
    const shed = streamer.update({ x: 0, z: 50 });
    expect(shed.unload).toEqual(["4,0"]);
    expect(shed.pending).toBe(3);
  });

  it("holds a loaded shard at loading until its content is marked ready", () => {
    const grid = gridShards({ min: [0, 0], max: [200, 100], cellSize: 100 });
    const streamer = createWorldStreamer({ shards: grid, loadRadius: 10, keepRadius: 20, awaitReady: true });
    streamer.update({ x: 50, z: 50 });
    expect(streamer.state("0,0")).toBe("loading");
    expect(streamer.markReady("0,0")).toBe(true);
    expect(streamer.markReady("0,0")).toBe(false);
    expect(streamer.state("0,0")).toBe("ready");
    expect(streamer.state("1,0")).toBe("unloaded");
  });

  it("changes nothing with no focus point", () => {
    const grid = gridShards({ min: [0, 0], max: [200, 100], cellSize: 100 });
    const streamer = createWorldStreamer({ shards: grid, loadRadius: 10, keepRadius: 20 });
    streamer.update({ x: 50, z: 50 });
    expect(streamer.update([])).toEqual({ load: [], unload: [], pending: 0 });
    expect(streamer.resident()).toEqual(["0,0"]);
  });

  it("round-trips residency and tuning through a JSON snapshot", () => {
    const grid = gridShards({ min: [0, 0], max: [300, 100], cellSize: 100 });
    const streamer = createWorldStreamer({ shards: grid, loadRadius: 60, keepRadius: 80, awaitReady: true });
    streamer.update({ x: 150, z: 50 });
    streamer.markReady("1,0");
    const saved = JSON.parse(JSON.stringify(streamer.snapshot()));
    const copy = createWorldStreamer({ shards: grid, loadRadius: 1, keepRadius: 1, awaitReady: true });
    copy.restore(saved);
    expect(copy.snapshot()).toEqual(streamer.snapshot());
    expect(copy.state("1,0")).toBe("ready");
    expect(copy.state("0,0")).toBe("loading");
  });

  it("indexes grid cells by world point", () => {
    const grid = gridShards({ min: [-200, -200], max: [200, 200], cellSize: 128 });
    expect(grid.map((cell) => cell.id)).toContain("-2,-2");
    const streamer = createWorldStreamer({ shards: grid, loadRadius: 10, keepRadius: 20 });
    expect(streamer.shardAt(-1, 5)?.id).toBe(gridCellId(-1, 5, 128));
    expect(streamer.shardAt(5000, 0)).toBeNull();
  });
});
