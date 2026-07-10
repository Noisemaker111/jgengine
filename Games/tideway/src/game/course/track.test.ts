import { describe, expect, test } from "bun:test";
import { ZONE_IDS } from "./zones";
import {
  BUOYS,
  checkpointsFromGates,
  GATE_COUNT,
  GATES,
  ISLETS,
  LAPS,
  SHORE_PROPS,
  startingGrid,
} from "./track";

describe("tideway course content budget", () => {
  test("has exactly 8 gates across 2 laps", () => {
    expect(GATES.length).toBe(GATE_COUNT);
    expect(GATE_COUNT).toBe(8);
    expect(LAPS).toBe(2);
  });

  test("gates span all three named channel zones", () => {
    const zonesSeen = new Set(GATES.map((gate) => gate.zoneId));
    for (const zoneId of ZONE_IDS) expect(zonesSeen.has(zoneId)).toBe(true);
  });

  test("checkpoints mirror the gates one-to-one, in order", () => {
    const checkpoints = checkpointsFromGates(GATES);
    expect(checkpoints.length).toBe(GATES.length);
    checkpoints.forEach((checkpoint, index) => expect(checkpoint.id).toBe(GATES[index]!.id));
  });

  test("has 15 or more islets and headlands", () => {
    expect(ISLETS.length).toBeGreaterThanOrEqual(15);
  });

  test("has 30 or more buoys", () => {
    expect(BUOYS.length).toBeGreaterThanOrEqual(30);
  });

  test("has 20 or more shore props", () => {
    expect(SHORE_PROPS.length).toBeGreaterThanOrEqual(20);
  });

  test("every gate is flanked by a port and starboard buoy", () => {
    for (const gate of GATES) {
      expect(BUOYS.some((buoy) => buoy.id === `${gate.id}-port`)).toBe(true);
      expect(BUOYS.some((buoy) => buoy.id === `${gate.id}-starboard`)).toBe(true);
    }
  });

  test("starting grid places one slot per racer with no two racers overlapping", () => {
    const grid = startingGrid(["player", "rival-a", "rival-b"]);
    expect(grid.length).toBe(3);
    const positions = grid.map((slot) => `${slot.x.toFixed(2)},${slot.z.toFixed(2)}`);
    expect(new Set(positions).size).toBe(3);
  });
});
