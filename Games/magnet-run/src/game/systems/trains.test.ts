import { describe, expect, test } from "bun:test";
import { isBoardable, isTrainOnTrack, secondsUntilHeadReaches, trainRideZ, trainWindowAt, type TrainLineDef } from "./trains";

const line: TrainLineDef = {
  id: "alpha",
  displayName: "TRAIN 7",
  lane: 0,
  roofPolarity: "blue",
  speed: 20,
  length: 30,
  headway: 10,
  offset: 0,
  trackStartZ: -1000,
  trackEndZ: 1000,
};

describe("train schedule determinism", () => {
  test("the same t always yields the same window", () => {
    const a = trainWindowAt(line, 12.34);
    const b = trainWindowAt(line, 12.34);
    expect(a).toEqual(b);
  });

  test("head position advances linearly with speed inside a cycle", () => {
    const w0 = trainWindowAt(line, 0);
    const w1 = trainWindowAt(line, 1);
    expect(w1.headZ - w0.headZ).toBeCloseTo(line.speed * 1, 5);
  });

  test("head resets to the track start at each headway boundary", () => {
    const justBefore = trainWindowAt(line, 9.999);
    const justAfter = trainWindowAt(line, 10.0);
    expect(justAfter.headZ).toBeCloseTo(line.trackStartZ, 5);
    expect(justBefore.headZ).toBeGreaterThan(justAfter.headZ);
  });

  test("tail trails the head by the car length", () => {
    const w = trainWindowAt(line, 3.7);
    expect(w.headZ - w.tailZ).toBeCloseTo(line.length, 6);
  });
});

describe("boardability window math", () => {
  test("boardable when the bot sits inside [tailZ, headZ]", () => {
    const w = trainWindowAt(line, 1);
    const midZ = (w.headZ + w.tailZ) / 2;
    expect(isBoardable(line, 1, midZ)).toBe(true);
  });

  test("not boardable well outside the window", () => {
    const w = trainWindowAt(line, 1);
    expect(isBoardable(line, 1, w.headZ + 50)).toBe(false);
    expect(isBoardable(line, 1, w.tailZ - 50)).toBe(false);
  });

  test("tolerance extends the edges by exactly its amount", () => {
    const w = trainWindowAt(line, 1);
    expect(isBoardable(line, 1, w.headZ + 0.59, 0.6)).toBe(true);
    expect(isBoardable(line, 1, w.headZ + 0.61, 0.6)).toBe(false);
  });

  test("off-track windows (outside trackStartZ/trackEndZ) are never boardable", () => {
    const shortLine: TrainLineDef = { ...line, trackStartZ: -5, trackEndZ: 5 };
    expect(isTrainOnTrack(shortLine, trainWindowAt(shortLine, 55))).toBe(false);
    expect(isBoardable(shortLine, 55, 0)).toBe(false);
  });
});

describe("train ride + inbound eta", () => {
  test("trainRideZ keeps a fixed offset from the head as it advances", () => {
    const t0 = 2;
    const w0 = trainWindowAt(line, t0);
    const offset = -4;
    const z0 = trainRideZ(line, t0, offset);
    expect(z0).toBeCloseTo(w0.headZ + offset, 6);
    const z1 = trainRideZ(line, t0 + 1, offset);
    expect(z1 - z0).toBeCloseTo(line.speed, 6);
  });

  test("inbound eta counts down to zero as the head approaches", () => {
    const atZ = 100;
    const w = trainWindowAt(line, 1);
    const remaining = atZ - w.headZ;
    const eta = secondsUntilHeadReaches(line, 1, atZ);
    expect(eta).toBeCloseTo(remaining / line.speed, 5);
  });

  test("inbound eta is null once the head has passed", () => {
    const w = trainWindowAt(line, 1);
    expect(secondsUntilHeadReaches(line, 1, w.headZ - 10)).toBeNull();
  });
});
