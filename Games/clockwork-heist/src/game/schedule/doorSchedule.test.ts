import { describe, expect, test } from "bun:test";
import { doorStateAt, type DoorDef } from "./doorSchedule";

const door: DoorDef = {
  id: "test_door",
  name: "Test Door",
  roomAName: "A",
  roomBName: "B",
  gapCenter: [0, 0],
  axis: "x",
  initiallyLocked: false,
  events: [
    { at: 100, locked: true },
    { at: 200, locked: false },
  ],
};

describe("doorStateAt", () => {
  test("starts at the initial locked state", () => {
    expect(doorStateAt(door, 0).locked).toBe(false);
  });

  test("is a pure function of t", () => {
    expect(doorStateAt(door, 150)).toEqual(doorStateAt(door, 150));
  });

  test("applies events in order over time", () => {
    expect(doorStateAt(door, 50).locked).toBe(false);
    expect(doorStateAt(door, 100).locked).toBe(true);
    expect(doorStateAt(door, 150).locked).toBe(true);
    expect(doorStateAt(door, 200).locked).toBe(false);
    expect(doorStateAt(door, 999).locked).toBe(false);
  });

  test("reports the upcoming change time and progress", () => {
    const mid = doorStateAt(door, 150);
    expect(mid.changesAt).toBe(200);
    expect(mid.progress).toBeCloseTo(0.5, 5);
  });

  test("reports null changesAt with progress 1 once no events remain", () => {
    const after = doorStateAt(door, 500);
    expect(after.changesAt).toBeNull();
    expect(after.progress).toBe(1);
  });

  test("an always-locked door with no events stays locked", () => {
    const alwaysLocked: DoorDef = { ...door, initiallyLocked: true, events: [] };
    expect(doorStateAt(alwaysLocked, 0).locked).toBe(true);
    expect(doorStateAt(alwaysLocked, 300).locked).toBe(true);
  });
});
