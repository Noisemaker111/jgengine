import { describe, expect, it } from "bun:test";
import { createWorldStreamer, shardDistance, type StreamerShard } from "./streamer";

const shards: StreamerShard[] = [
  { id: "terrain", residency: "always" },
  { id: "cell_0_0", bounds: { min: [0, 0], max: [256, 256] } },
  { id: "cell_1_0", bounds: { min: [256, 0], max: [512, 256] } },
  { id: "cell_9_9", bounds: { min: [2304, 2304], max: [2560, 2560] } },
];

describe("shardDistance", () => {
  it("is 0 inside the footprint and inside always-resident shards", () => {
    expect(shardDistance(shards[1]!, { x: 100, z: 100 })).toBe(0);
    expect(shardDistance(shards[0]!, { x: 99999, z: 99999 })).toBe(0);
  });

  it("is the closest-point distance outside the footprint", () => {
    expect(shardDistance(shards[1]!, { x: 300, z: 100 })).toBeCloseTo(44, 0); // 300 - 256
  });
});

describe("createWorldStreamer", () => {
  it("makes always-resident shards resident from the first update", () => {
    const streamer = createWorldStreamer({ shards, loadRadius: 50, keepRadius: 100 });
    const first = streamer.update({ x: 100, z: 100 });
    expect(first.load).toContain("terrain");
    expect(first.load).toContain("cell_0_0");
    expect(first.resident).not.toContain("cell_9_9");
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
    expect(near.resident).toContain("cell_0_0");
    // 120m past the edge (x=376): beyond keepRadius, unloads.
    const far = streamer.update({ x: 376, z: 100 });
    expect(far.unload).toContain("cell_0_0");
    expect(far.resident).not.toContain("cell_0_0");
  });

  it("clamps keepRadius up to loadRadius when misconfigured", () => {
    const streamer = createWorldStreamer({ shards, loadRadius: 100, keepRadius: 10 });
    streamer.update({ x: 100, z: 100 });
    // 40m past the edge: within loadRadius(=keepRadius clamped to 100), stays.
    const near = streamer.update({ x: 296, z: 100 });
    expect(near.resident).toContain("cell_0_0");
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
    const update = streamer.update({ x: 5000, z: 5000 });
    // 1601 shards exist; only terrain + a handful near (5000,5000) are resident.
    expect(update.resident.length).toBeLessThan(20);
    expect(update.resident).toContain("terrain");
  });
});
