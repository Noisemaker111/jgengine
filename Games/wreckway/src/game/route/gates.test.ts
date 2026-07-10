import { describe, expect, test } from "bun:test";

import { tuningFrom } from "../parts/build";
import { partById } from "../parts/catalog";
import { blockedZ, gateSatisfied, ROUTE_GATES } from "./gates";
import { LEFT_LANE_X, MID_LANE_HALF_WIDTH, RIGHT_LANE_X } from "../run/constants";

const NO_PARTS = tuningFrom([]);
const PLOW_TUNING = tuningFrom([{ slotId: "front", part: partById("plow_blade")! }]);

describe("wreckway route gates", () => {
  test("ships 8+ gates split across plow and jump requirements", () => {
    expect(ROUTE_GATES.length).toBeGreaterThanOrEqual(8);
    const plowGates = ROUTE_GATES.filter((gate) => gate.requirement === "plow");
    const jumpGates = ROUTE_GATES.filter((gate) => gate.requirement === "jump");
    expect(plowGates.length).toBeGreaterThan(0);
    expect(jumpGates.length).toBeGreaterThan(0);
  });

  test("a bare chassis satisfies no gate", () => {
    for (const gate of ROUTE_GATES) expect(gateSatisfied(gate, NO_PARTS)).toBe(false);
  });

  test("the mid lane is always open regardless of parts", () => {
    for (const gate of ROUTE_GATES) {
      const beyond = gate.atZ + 50;
      expect(blockedZ(0, 0, beyond, NO_PARTS)).toBe(beyond);
    }
    expect(MID_LANE_HALF_WIDTH).toBeLessThan(RIGHT_LANE_X[0]);
    expect(-MID_LANE_HALF_WIDTH).toBeGreaterThan(LEFT_LANE_X[1]);
  });

  test("plow satisfies plow gates and clears them, but not jump gates", () => {
    const plowGate = ROUTE_GATES.find((gate) => gate.requirement === "plow")!;
    const jumpGate = ROUTE_GATES.find((gate) => gate.requirement === "jump")!;
    expect(gateSatisfied(plowGate, PLOW_TUNING)).toBe(true);
    expect(gateSatisfied(jumpGate, PLOW_TUNING)).toBe(false);
  });

  test("an unsatisfied gate clamps forward progress when approached from before it", () => {
    const gate = ROUTE_GATES[0]!;
    const laneX = (gate.laneX[0] + gate.laneX[1]) / 2;
    const candidate = gate.atZ + 20;
    expect(blockedZ(laneX, gate.atZ - 5, candidate, NO_PARTS)).toBe(gate.atZ);
  });

  test("a satisfied gate does not clamp progress", () => {
    const gate = ROUTE_GATES.find((g) => g.requirement === "plow")!;
    const laneX = (gate.laneX[0] + gate.laneX[1]) / 2;
    const candidate = gate.atZ + 20;
    expect(blockedZ(laneX, gate.atZ - 5, candidate, PLOW_TUNING)).toBe(candidate);
  });

  test("a gate never yanks a kart back once it has already progressed past that z, even re-entering the same lane band far downstream", () => {
    const gate = ROUTE_GATES[0]!;
    const laneX = (gate.laneX[0] + gate.laneX[1]) / 2;
    const farAhead = gate.atZ + 300;
    const candidate = farAhead + 10;
    expect(blockedZ(laneX, farAhead, candidate, NO_PARTS)).toBe(candidate);
  });
});
