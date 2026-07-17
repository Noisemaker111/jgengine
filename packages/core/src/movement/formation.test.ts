import { describe, expect, test } from "bun:test";

import {
  assignFormationSlots,
  boxFormation,
  circleFormation,
  facingYaw,
  lineFormation,
  placeFormation,
  wedgeFormation,
  type Vec2,
} from "@jgengine/core/movement/formation";

describe("placeFormation", () => {
  test("facing north (+z) leaves local offsets axis-aligned", () => {
    const slots = placeFormation([0, 0], 0, 3, lineFormation({ spacing: 2 }));
    // yaw 0: forward = (0, 1), right = (-1, 0). Line runs along right axis, centered.
    expect(slots[0]![0]).toBeCloseTo(2, 6);
    expect(slots[1]![0]).toBeCloseTo(0, 6);
    expect(slots[2]![0]).toBeCloseTo(-2, 6);
    for (const slot of slots) expect(slot[1]).toBeCloseTo(0, 6);
  });

  test("translates to the destination and rotates by facing", () => {
    const slots = placeFormation([10, 5], Math.PI / 2, 1, lineFormation({ spacing: 2 }));
    // single slot sits exactly on the destination regardless of facing
    expect(slots[0]![0]).toBeCloseTo(10, 6);
    expect(slots[0]![1]).toBeCloseTo(5, 6);
  });

  test("wedge apex sits on the destination, arms trail backward", () => {
    const slots = placeFormation([0, 0], 0, 5, wedgeFormation({ spacing: 2 }));
    expect(slots[0]![0]).toBeCloseTo(0, 6);
    expect(slots[0]![1]).toBeCloseTo(0, 6);
    // every non-apex slot is behind the apex (local forward is +z at yaw 0)
    for (let i = 1; i < slots.length; i += 1) expect(slots[i]![1]).toBeLessThan(0);
    // symmetric right/left pair at the same rank
    expect(slots[1]![0]).toBeCloseTo(-slots[2]![0], 6);
  });

  test("box packs into a near-square grid centered on the destination", () => {
    const slots = placeFormation([0, 0], 0, 4, boxFormation({ spacing: 2 }));
    const xs = slots.map((s) => s[0]).sort((a, b) => a - b);
    const zs = slots.map((s) => s[1]).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(-1, 6);
    expect(xs[3]).toBeCloseTo(1, 6);
    expect(zs[0]).toBeCloseTo(-1, 6);
    expect(zs[3]).toBeCloseTo(1, 6);
  });

  test("circle spaces members evenly at the ring radius", () => {
    const slots = placeFormation([0, 0], 0, 6, circleFormation({ radius: 3 }));
    for (const slot of slots) {
      expect(Math.hypot(slot[0], slot[1])).toBeCloseTo(3, 6);
    }
    // slot 0 is straight forward at yaw 0 (local (0, radius))
    expect(slots[0]![0]).toBeCloseTo(0, 6);
    expect(slots[0]![1]).toBeCloseTo(3, 6);
  });

  test("deterministic: identical inputs yield identical world slots", () => {
    const gen = boxFormation({ spacing: 1.5, columns: 3 });
    const a = placeFormation([4, -2], 1.1, 7, gen);
    const b = placeFormation([4, -2], 1.1, 7, gen);
    expect(a).toEqual(b);
  });

  test("custom generator needs no engine change", () => {
    const custom = (count: number): Vec2[] =>
      Array.from({ length: count }, (_, i) => [i, i * 2] as Vec2);
    const slots = placeFormation([0, 0], 0, 3, custom);
    // right = (-1,0), forward = (0,1): local [i, 2i] -> world [-i, 2i]
    expect(slots[1]).toEqual([-1, 2]);
    expect(slots[2]).toEqual([-2, 4]);
  });
});

describe("facingYaw", () => {
  test("faces along +z as yaw 0 and returns 0 for coincident points", () => {
    expect(facingYaw([0, 0], [0, 5])).toBeCloseTo(0, 6);
    expect(facingYaw([0, 0], [5, 0])).toBeCloseTo(Math.PI / 2, 6);
    expect(facingYaw([2, 2], [2, 2])).toBe(0);
  });
});

describe("assignFormationSlots", () => {
  test("assigns each member to its nearest free slot", () => {
    const members: Vec2[] = [
      [0, 0],
      [10, 0],
    ];
    const slots: Vec2[] = [
      [9, 0],
      [1, 0],
    ];
    const assignment = assignFormationSlots(members, slots);
    expect(assignment).toEqual([1, 0]);
  });

  test("is a stable permutation independent of member ordering", () => {
    const members: Vec2[] = [
      [0, 0],
      [4, 0],
      [8, 0],
    ];
    const slots: Vec2[] = [
      [0, 1],
      [4, 1],
      [8, 1],
    ];
    const first = assignFormationSlots(members, slots);
    const second = assignFormationSlots(members, slots);
    expect(first).toEqual(second);
    expect(first).toEqual([0, 1, 2]);
    // a permutation: every slot used exactly once
    expect([...first].sort()).toEqual([0, 1, 2]);
  });

  test("leaves surplus members unmatched with -1", () => {
    const members: Vec2[] = [
      [0, 0],
      [1, 0],
      [2, 0],
    ];
    const slots: Vec2[] = [[0, 0]];
    const assignment = assignFormationSlots(members, slots);
    expect(assignment.filter((s) => s === -1).length).toBe(2);
    expect(assignment.filter((s) => s === 0).length).toBe(1);
  });

  test("stickiness keeps the previous slot when the gain is small", () => {
    const members: Vec2[] = [
      [0, 0],
      [1, 0],
    ];
    // slots slightly favor swapping, but previous assignment should stick
    const slots: Vec2[] = [
      [1.1, 0],
      [0.1, 0],
    ];
    const previous = [0, 1];
    const sticky = assignFormationSlots(members, slots, { previous, stickiness: 100 });
    expect(sticky).toEqual([0, 1]);
    const churny = assignFormationSlots(members, slots, { previous, stickiness: 0 });
    expect(churny).toEqual([1, 0]);
  });
});
