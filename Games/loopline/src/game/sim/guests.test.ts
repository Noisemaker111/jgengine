import { describe, expect, test } from "bun:test";

import type { GuestState, PlacedObject } from "../session";
import { needPressure, targetScore } from "./guests";

function guest(overrides: Partial<GuestState>): GuestState {
  return {
    id: "g1",
    kind: "guest",
    happy: 60,
    money: 50,
    hunger: 20,
    thirst: 20,
    souvenir: 0,
    visits: 0,
    phase: "seeking",
    targetId: null,
    target: null,
    busy: 0,
    litterTimer: 5,
    ...overrides,
  };
}

function obj(catalogId: string, patch: Partial<PlacedObject> = {}): PlacedObject {
  return { id: `${catalogId}#1`, catalogId, x: 0, z: 0, stock: 40, soldTotal: 0, occupants: 0, ...patch };
}

describe("loopline guest logic", () => {
  test("need pressure rises past the comfort threshold", () => {
    expect(needPressure(30)).toBe(0);
    expect(needPressure(100)).toBeCloseTo(1);
    expect(needPressure(80)).toBeGreaterThan(needPressure(60));
  });

  test("a hungry guest with cash is drawn to a stocked food stall", () => {
    const hungry = guest({ hunger: 90 });
    expect(targetScore(hungry, obj("stall_food"), 0, 4)).toBeGreaterThan(0);
  });

  test("empty stall or broke guest is not a valid target", () => {
    expect(targetScore(guest({ hunger: 90 }), obj("stall_food", { stock: 0 }), 0, 4)).toBe(-1);
    expect(targetScore(guest({ hunger: 90, money: 2 }), obj("stall_food"), 0, 4)).toBe(-1);
  });

  test("a full ride is skipped", () => {
    const full = obj("ride_carousel", { occupants: 6 });
    expect(targetScore(guest({}), full, 0, 4)).toBe(-1);
    expect(targetScore(guest({}), obj("ride_carousel", { occupants: 0 }), 0, 4)).toBeGreaterThan(0);
  });
});
