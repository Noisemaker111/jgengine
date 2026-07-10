import { describe, expect, test } from "bun:test";

import { RIVAL_PERSONALITIES, pickRivalPersonality, rivalWaypointsFor } from "./personalities";
import { buildRivalWaypoints } from "./route";
import { CITY, SOUTH_GATE } from "../world/sites";

describe("pickRivalPersonality", () => {
  test("is deterministic for a fixed seed", () => {
    expect(pickRivalPersonality("dune-test-seed").id).toBe(pickRivalPersonality("dune-test-seed").id);
  });

  test("always resolves to a known personality", () => {
    const ids = RIVAL_PERSONALITIES.map((personality) => personality.id);
    for (let seed = 0; seed < 20; seed += 1) {
      expect(ids).toContain(pickRivalPersonality(`seed-${seed}`).id);
    }
  });
});

describe("rivalWaypointsFor", () => {
  test("always starts at the south gate and ends at the city", () => {
    for (const personality of RIVAL_PERSONALITIES) {
      const waypoints = rivalWaypointsFor(personality);
      expect(waypoints[0]).toEqual({ x: SOUTH_GATE.x, z: SOUTH_GATE.z });
      expect(waypoints[waypoints.length - 1]).toEqual({ x: CITY.x, z: CITY.z });
    }
  });

  test("the cautious personality visits more oases than the direct one", () => {
    const direct = RIVAL_PERSONALITIES.find((personality) => personality.id === "direct")!;
    const cautious = RIVAL_PERSONALITIES.find((personality) => personality.id === "cautious")!;
    expect(rivalWaypointsFor(cautious).length).toBeGreaterThan(rivalWaypointsFor(direct).length);
  });
});

describe("buildRivalWaypoints", () => {
  const flatField = { sampleHeight: () => 4, sampleNormal: () => [0, 1, 0] as const };

  test("samples elevation from the terrain field", () => {
    const points = buildRivalWaypoints([{ x: 0, z: 0 }, { x: 10, z: 10 }], flatField);
    for (const point of points) expect(point[1]).toBeCloseTo(4.4, 5);
  });
});
