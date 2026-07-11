import { describe, expect, test } from "bun:test";

import { COLS, DIVE_BLINK, DIVE_CYCLE, LANE_SPAN } from "./constants";
import { isOffField } from "./grid";
import {
  advanceLane,
  buildLanes,
  carrierSupportAt,
  diveDownDuration,
  laneBodies,
  speedMultiplier,
  turtleDiveState,
  vehicleHitsCol,
  type Lane,
  type Variant,
} from "./lanes";

function mkLane(over: Partial<Lane> & { variant: Variant; count: number; len: number; dir: 1 | -1 }): Lane {
  return {
    row: over.row ?? 3,
    kind: over.kind ?? "road",
    variant: over.variant,
    dir: over.dir,
    speed: over.speed ?? 2,
    len: over.len,
    count: over.count,
    gap: LANE_SPAN / over.count,
    offset: over.offset ?? 0,
    dive: over.dive ?? false,
    diveClock: over.diveClock ?? 0,
    submerged: over.submerged ?? false,
    blinking: over.blinking ?? false,
  };
}

describe("vehicle collision", () => {
  test("a road vehicle strikes the hopper under it and misses in a gap", () => {
    const lane = mkLane({ variant: "car", count: 1, len: 1, dir: 1, offset: 8 });
    const body = laneBodies(lane)[0]!;
    expect(body.x).toBeCloseTo(8);
    expect(vehicleHitsCol(lane, Math.round(body.x))).toBe(true);
    expect(vehicleHitsCol(lane, (Math.round(body.x) + 6) % COLS)).toBe(false);
  });

  test("bodies stay evenly spaced and advance with the lane offset", () => {
    const lane = mkLane({ variant: "truck", count: 3, len: 2, dir: 1, offset: 0 });
    const before = laneBodies(lane).map((b) => b.x);
    expect(before.length).toBe(3);
    advanceLane(lane, 0.5, 1);
    const after = laneBodies(lane).map((b) => b.x);
    for (let i = 0; i < after.length; i += 1) {
      expect(after[i]! - before[i]!).toBeCloseTo(lane.speed * 0.5);
    }
  });
});

describe("log-ride drift + off-screen death", () => {
  test("a log under the hopper supports it and lends its velocity", () => {
    const lane = mkLane({ variant: "log", count: 1, len: 3, dir: 1, offset: 4 });
    expect(laneBodies(lane)[0]!.x).toBeCloseTo(4);
    const support = carrierSupportAt(lane, 5);
    expect(support.supported).toBe(true);
    expect(support.dir).toBe(1);
    expect(carrierSupportAt(lane, 11).supported).toBe(false);
  });

  test("open water offers no support", () => {
    const lane = mkLane({ variant: "log", count: 1, len: 3, dir: 1, offset: 4 });
    expect(carrierSupportAt(lane, 11).supported).toBe(false);
  });

  test("riding a rightward log eventually carries the hopper off the field", () => {
    const lane = mkLane({ variant: "log", count: 1, len: 3, dir: 1, offset: 4, speed: 2 });
    let col = 5;
    let steps = 0;
    while (!isOffField(col) && steps < 500) {
      col += lane.dir * lane.speed * 0.1;
      steps += 1;
    }
    expect(isOffField(col)).toBe(true);
  });
});

describe("turtle dive windows", () => {
  test("cycle passes through up, blink, then submerged", () => {
    const down = diveDownDuration(1);
    const up = DIVE_CYCLE - down - DIVE_BLINK;
    expect(turtleDiveState(0, 1)).toBe("up");
    expect(turtleDiveState(up - 0.05, 1)).toBe("up");
    expect(turtleDiveState(up + 0.05, 1)).toBe("blink");
    expect(turtleDiveState(DIVE_CYCLE - 0.05, 1)).toBe("down");
  });

  test("higher levels stay submerged longer", () => {
    expect(diveDownDuration(5)).toBeGreaterThan(diveDownDuration(1));
  });

  test("a submerged turtle drops its rider, a surfaced one holds", () => {
    const lane = mkLane({ variant: "turtle", count: 1, len: 3, dir: 1, offset: 4, dive: true });
    lane.submerged = true;
    expect(carrierSupportAt(lane, 5).supported).toBe(false);
    lane.submerged = false;
    expect(carrierSupportAt(lane, 5).supported).toBe(true);
  });

  test("advanceLane flips a turtle lane to submerged inside the down window", () => {
    const lane = mkLane({ variant: "turtle", count: 3, len: 3, dir: -1, dive: true });
    lane.diveClock = DIVE_CYCLE - 0.1;
    advanceLane(lane, 0.05, 1);
    expect(lane.submerged).toBe(true);
  });
});

describe("level scaling", () => {
  test("speed multiplier grows with level and traffic densifies", () => {
    expect(speedMultiplier(1)).toBe(1);
    expect(speedMultiplier(3)).toBeGreaterThan(1);
    const l1 = buildLanes(1);
    const l5 = buildLanes(5);
    const roadCount1 = l1.filter((l) => l.kind === "road").reduce((n, l) => n + l.count, 0);
    const roadCount5 = l5.filter((l) => l.kind === "road").reduce((n, l) => n + l.count, 0);
    expect(roadCount5).toBeGreaterThan(roadCount1);
    expect(l1.length).toBe(10);
  });
});
