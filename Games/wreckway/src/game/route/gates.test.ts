import { describe, expect, test } from "bun:test";

import type { InstalledPart } from "@jgengine/core/item/modularItem";

import { tuningFrom } from "../parts/build";
import { partById } from "../parts/catalog";
import { blockedZ, firstUnsatisfiedGate, gateSatisfied, ROUTE_GATES } from "./gates";
import { CORRIDOR_LANE_SPAN, EXIT_Z } from "../run/constants";

const NO_PARTS = tuningFrom([]);
const PLOW_ONLY = tuningFrom([{ slotId: "front", part: partById("plow_blade")! }]);
const JUMP_ONLY = tuningFrom([{ slotId: "wheels", part: partById("coil_springs")! }]);
const FULLY_KITTED: readonly InstalledPart[] = [
  { slotId: "front", part: partById("plow_blade")! },
  { slotId: "wheels", part: partById("coil_springs")! },
];
const PLOW_AND_JUMP = tuningFrom(FULLY_KITTED);

/** How far a straight run down the centerline gets before a barricade clamps it. */
function reachAt(x: number, tuning: ReturnType<typeof tuningFrom>): number {
  let z = 0;
  // Advance in small steps up to the exit; blockedZ pins z at the first unsatisfied barricade.
  for (let step = 0; step < 2000; step += 1) {
    const next = blockedZ(x, z, z + 1, tuning);
    if (next <= z) break;
    z = next;
    if (z >= EXIT_Z) break;
  }
  return z;
}

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

  test("every barricade spans the whole drivable corridor — the mid lane is no longer a free path", () => {
    for (const gate of ROUTE_GATES) {
      expect(gate.laneX[0]).toBe(CORRIDOR_LANE_SPAN[0]);
      expect(gate.laneX[1]).toBe(CORRIDOR_LANE_SPAN[1]);
      // Driving straight down the centerline (x = 0) still lands inside the barricade band.
      const beyond = gate.atZ + 50;
      expect(blockedZ(0, 0, beyond, NO_PARTS)).toBeLessThanOrEqual(gate.atZ);
    }
  });

  test("an un-upgraded run is walled in at the first barricade and cannot reach the exit", () => {
    const firstGate = ROUTE_GATES.reduce((lo, g) => (g.atZ < lo.atZ ? g : lo));
    expect(firstUnsatisfiedGate(NO_PARTS)?.id).toBe(firstGate.id);
    // Down the centerline, a partless kart is pinned at the first barricade — well short of the exit.
    expect(reachAt(0, NO_PARTS)).toBe(firstGate.atZ);
    expect(reachAt(0, NO_PARTS)).toBeLessThan(EXIT_Z);
  });

  test("a plow blade opens the plow walls but a jump ramp still stops a plow-only kart", () => {
    const firstJump = ROUTE_GATES.filter((g) => g.requirement === "jump").reduce((lo, g) => (g.atZ < lo.atZ ? g : lo));
    const firstPlow = ROUTE_GATES.filter((g) => g.requirement === "plow").reduce((lo, g) => (g.atZ < lo.atZ ? g : lo));
    // Plow-only clears every plow wall before the first ramp, then is stopped at that ramp.
    expect(firstPlow.atZ).toBeLessThan(firstJump.atZ);
    expect(firstUnsatisfiedGate(PLOW_ONLY)?.requirement).toBe("jump");
    expect(reachAt(0, PLOW_ONLY)).toBe(firstJump.atZ);
    // Symmetrically, jump-only is stopped at the first plow wall.
    expect(firstUnsatisfiedGate(JUMP_ONLY)?.requirement).toBe("plow");
    expect(reachAt(0, JUMP_ONLY)).toBe(firstPlow.atZ);
  });

  test("a plow + jump build clears every barricade to the exit", () => {
    expect(firstUnsatisfiedGate(PLOW_AND_JUMP)).toBeNull();
    for (const gate of ROUTE_GATES) expect(gateSatisfied(gate, PLOW_AND_JUMP)).toBe(true);
    expect(reachAt(0, PLOW_AND_JUMP)).toBeGreaterThanOrEqual(EXIT_Z);
  });

  test("a satisfied gate does not clamp progress", () => {
    const gate = ROUTE_GATES.find((g) => g.requirement === "plow")!;
    const candidate = gate.atZ + 20;
    expect(blockedZ(0, gate.atZ - 5, candidate, PLOW_AND_JUMP)).toBe(candidate);
  });

  test("a gate never yanks a kart back once it has already progressed past that z", () => {
    const gate = ROUTE_GATES[0]!;
    const farAhead = gate.atZ + 300;
    const candidate = farAhead + 10;
    expect(blockedZ(0, farAhead, candidate, NO_PARTS)).toBe(candidate);
  });
});
