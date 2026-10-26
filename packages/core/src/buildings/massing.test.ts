import { describe, expect, test } from "bun:test";

import {
  MASSING_COMPOSITIONS,
  composeMassing,
  isVillageMassing,
  massingBase,
  massingFloorCount,
  type MassingBody,
  type MassingSpec,
} from "./massing";

const makeSpec = (overrides: Partial<MassingSpec> = {}): MassingSpec => ({
  seed: "test",
  width: 28,
  height: 34,
  depth: 14,
  floorHeight: 3.15,
  baySpacing: 3.3,
  pilotis: 4.4,
  podiumHeight: 0,
  cores: 2,
  terraces: 1,
  cantilever: 0,
  voids: 28,
  taper: 12,
  articulation: 34,
  crown: 24,
  moduleDensity: 3,
  branches: 0,
  composition: "bar",
  profile: "straight",
  ...overrides,
});

const expectBodyInvariants = (bodies: MassingBody[]) => {
  for (const body of bodies) {
    for (const key of ["x", "y", "z", "w", "h", "d"] as const) expect(Number.isFinite(body[key])).toBe(true);
    if (body.ry !== undefined) expect(Number.isFinite(body.ry)).toBe(true);
    expect(body.w).toBeGreaterThan(0);
    expect(body.h).toBeGreaterThan(0);
    expect(body.d).toBeGreaterThan(0);
  }
};

describe("massing", () => {
  test("is deterministic for the same spec", () => {
    const spec = makeSpec();
    const first = composeMassing(spec);
    const second = composeMassing(spec);
    expect(first).toEqual(second);
    expect(composeMassing(spec)).toEqual(first);
  });

  test("every composition except ring yields a non-empty, well-formed body list", () => {
    for (const composition of MASSING_COMPOSITIONS) {
      const bodies = composeMassing(makeSpec({ composition }));
      if (composition === "ring") {
        expect(bodies).toEqual([]);
        continue;
      }
      expect(bodies.length).toBeGreaterThan(0);
      expectBodyInvariants(bodies);
    }
  });

  test("podiumHeight adds a facade base for stack but not bridge", () => {
    const stackBodies = composeMassing(makeSpec({ composition: "stack", podiumHeight: 7 }));
    const podium = stackBodies.find((body) => body.h === 7 && body.facade === true);
    expect(podium).toBeDefined();
    expect(podium!.y).toBeCloseTo(3.5, 5);

    const bridgeBodies = composeMassing(makeSpec({ composition: "bridge", podiumHeight: 7 }));
    expect(bridgeBodies.some((body) => body.h === 7 && Math.abs(body.y - 3.5) < 1e-9)).toBe(false);
  });

  test("massingBase caps pilotis at 28% of height", () => {
    expect(massingBase({ pilotis: 100, height: 50 })).toBeCloseTo(14, 9);
    expect(massingBase({ pilotis: 2, height: 50 })).toBe(2);
    expect(massingBase({ pilotis: -5, height: 50 })).toBe(0);
  });

  test("isVillageMassing gates on all four conditions", () => {
    const village = { composition: "cluster" as const, height: 30, articulation: 60, moduleDensity: 4 };
    expect(isVillageMassing(village)).toBe(true);
    expect(isVillageMassing({ ...village, composition: "bar" as const })).toBe(false);
    expect(isVillageMassing({ ...village, height: 40 })).toBe(false);
    expect(isVillageMassing({ ...village, articulation: 50 })).toBe(false);
    expect(isVillageMassing({ ...village, moduleDensity: 2 })).toBe(false);
  });

  test("village massing yields only mass facade boxes bounded by height", () => {
    const spec = makeSpec({ composition: "cluster", height: 30, articulation: 60, moduleDensity: 4 });
    expect(isVillageMassing(spec)).toBe(true);
    const bodies = composeMassing(spec);
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(body.facade).toBe(true);
      expect(body.role).toBe("mass");
      expect(body.h).toBeLessThanOrEqual(spec.height * 0.9 + 1e-9);
    }
  });

  test("capsule composition builds core spines and pods on both sides", () => {
    const bodies = composeMassing(makeSpec({ composition: "capsule" }));
    const cores = bodies.filter((body) => body.role === "core");
    expect(cores.length).toBeGreaterThanOrEqual(1);
    expect(cores.length).toBeLessThanOrEqual(3);

    const pods = bodies.filter((body) => body.kind === "capsule" && body.role === "mass");
    expect(pods.length).toBeGreaterThan(0);
    expect(pods.some((body) => body.x < 0)).toBe(true);
    expect(pods.some((body) => body.x > 0)).toBe(true);
  });

  test("capsule crown>76 adds extra crown-flagged pods", () => {
    const lowCrown = composeMassing(makeSpec({ composition: "capsule", crown: 24 }));
    const highCrown = composeMassing(makeSpec({ composition: "capsule", crown: 90 }));
    const lowCrownFlags = lowCrown.filter((body) => body.crown).length;
    const highCrownFlags = highCrown.filter((body) => body.crown).length;
    expect(highCrownFlags).toBeGreaterThan(lowCrownFlags);
    expect(highCrown.some((body) => body.crown && body.kind === "capsule")).toBe(true);
  });

  test("capsule void bands reduce pod count as voids increase", () => {
    const podCount = (bodies: MassingBody[]) =>
      bodies.filter((body) => body.kind === "capsule" && body.role === "mass").length;
    const noVoids = composeMassing(makeSpec({ composition: "capsule", voids: 0 }));
    const highVoids = composeMassing(makeSpec({ composition: "capsule", voids: 60 }));
    expect(podCount(highVoids)).toBeLessThan(podCount(noVoids));
  });

  test("megastructure has core posts, transfer beams, and voids density trims facade modules", () => {
    const spec = makeSpec({ composition: "megastructure" });
    const bodies = composeMassing(spec);
    const cores = bodies.filter((body) => body.role === "core");
    const transfers = bodies.filter((body) => body.role === "transfer");
    expect(cores.length).toBeGreaterThan(6);
    expect(cores.length % 2).toBe(0);
    expect(transfers.length).toBeGreaterThan(0);

    const massCount = (bodies: MassingBody[]) => bodies.filter((body) => body.role === "mass" && body.facade).length;
    const lowVoidMass = massCount(composeMassing(makeSpec({ composition: "megastructure", voids: 0 })));
    const highVoidMass = massCount(composeMassing(makeSpec({ composition: "megastructure", voids: 90 })));
    expect(highVoidMass).toBeLessThan(lowVoidMass);
  });

  test("court composition yields exactly four facade edge bodies per tier with no extras", () => {
    const spec = makeSpec({ composition: "court" });
    const bodies = composeMassing(spec);
    expect(bodies.length).toBe(8);
    expect(bodies.every((body) => body.facade === true && body.role === undefined)).toBe(true);
    const tierYs = new Set(bodies.map((body) => Math.round(body.y * 1e6) / 1e6));
    expect(tierYs.size).toBe(2);
    for (const y of tierYs) expect(bodies.filter((body) => body.y === y).length).toBe(4);
  });

  test("branches add 2 transfer arms + 2 mass terminals for bar composition", () => {
    const noBranches = composeMassing(makeSpec({ composition: "bar", branches: 0 }));
    const withBranches = composeMassing(makeSpec({ composition: "bar", branches: 2 }));
    expect(withBranches.length - noBranches.length).toBe(4);
    const added = withBranches.slice(noBranches.length);
    expect(added.filter((body) => body.role === "transfer").length).toBe(2);
    expect(added.filter((body) => body.role === "mass" && body.facade === true).length).toBe(2);
  });

  test("tapered profile narrows toward the top across tiers", () => {
    const spec = makeSpec({
      composition: "bar",
      profile: "tapered",
      taper: 60,
      terraces: 4,
      height: 60,
      articulation: 20,
    });
    const bodies = composeMassing(spec).filter((body) => body.role === "mass");
    expect(bodies.length).toBeGreaterThan(1);
    const sorted = [...bodies].sort((a, b) => a.y - b.y);
    const bottom = sorted[0];
    const top = sorted[sorted.length - 1];
    expect(top.w).toBeLessThan(bottom.w);
  });

  test("tier count is clamped to 9 regardless of extreme terraces", () => {
    const spec = makeSpec({
      composition: "bar",
      terraces: 20,
      height: 200,
      floorHeight: 3,
      articulation: 20,
    });
    const bodies = composeMassing(spec);
    const massYs = new Set(
      bodies.filter((body) => body.role === "mass").map((body) => Math.round(body.y * 1e6) / 1e6),
    );
    expect(massYs.size).toBeGreaterThan(0);
    expect(massYs.size).toBeLessThanOrEqual(9);
  });

  test("massingFloorCount basic sanity", () => {
    expect(massingFloorCount({ pilotis: 4.4, height: 34, floorHeight: 3.15 })).toBe(9);
    expect(massingFloorCount({ pilotis: 0, height: 3, floorHeight: 3 })).toBe(2);
    const tall = massingFloorCount({ pilotis: 4.4, height: 34, floorHeight: 3.15 });
    const short = massingFloorCount({ pilotis: 4.4, height: 34, floorHeight: 6.3 });
    expect(short).toBeLessThan(tall);
  });
});
