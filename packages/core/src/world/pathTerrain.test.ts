import { describe, expect, test } from "bun:test";

import { terrain } from "./features";
import { type TerrainPathProfile, withPathProfiles } from "./pathTerrain";
import { applyPathProfiles, resolveTerrainField } from "./terrain";

// A path running along the world z axis through x = 0.
const AXIS: readonly (readonly [number, number])[] = [
  [0, -50],
  [0, 50],
];

describe("withPathProfiles", () => {
  test("flatten (sample policy) drapes the corridor to the centerline height", () => {
    const base = (x: number, _z: number) => x; // ground rises with x
    const sample = withPathProfiles(base, [{ points: AXIS, width: 10, shoulder: 0 }]);
    // Inside the core the ground is pulled to the centerline height (0), not its own x.
    expect(sample(0, 0)).toBeCloseTo(0, 6);
    expect(sample(3, 0)).toBeCloseTo(0, 6);
    // Well outside the corridor the base terrain is untouched.
    expect(sample(40, 0)).toBeCloseTo(40, 6);
  });

  test("fixed policy holds one height across the whole corridor", () => {
    const profile: TerrainPathProfile = { points: AXIS, width: 8, height: { kind: "fixed", height: 7 } };
    const sample = withPathProfiles(() => 0, [profile]);
    expect(sample(0, -20)).toBeCloseTo(7, 6);
    expect(sample(0, 20)).toBeCloseTo(7, 6);
  });

  test("grade policy interpolates linearly along arc length", () => {
    const profile: TerrainPathProfile = {
      points: [
        [0, 0],
        [0, 100],
      ],
      width: 6,
      height: { kind: "grade", start: 0, end: 10 },
    };
    const sample = withPathProfiles(() => 0, [profile]);
    expect(sample(0, 0)).toBeCloseTo(0, 6);
    expect(sample(0, 50)).toBeCloseTo(5, 6);
    expect(sample(0, 100)).toBeCloseTo(10, 6);
  });

  test("depth carves a channel deepest at the centerline, level at the core edge", () => {
    const profile: TerrainPathProfile = { points: AXIS, width: 10, depth: 4, shoulder: 0 };
    const sample = withPathProfiles(() => 0, [profile]);
    expect(sample(0, 0)).toBeCloseTo(-4, 6); // centerline: full depth
    expect(sample(5, 0)).toBeCloseTo(0, 6); // core edge: no carve
    expect(sample(2.5, 0)).toBeGreaterThan(-4); // partway: shallower than the center
    expect(sample(2.5, 0)).toBeLessThan(0);
  });

  test("shoulder feathers monotonically from the corridor edge back to the surrounding ground", () => {
    const profile: TerrainPathProfile = { points: AXIS, width: 10, shoulder: 10, height: { kind: "fixed", height: 0 } };
    const sample = withPathProfiles(() => 10, [profile]);
    const edge = sample(5, 0); // core edge -> target 0
    const mid = sample(10, 0); // mid shoulder
    const outer = sample(15, 0); // reach -> surrounding 10
    expect(edge).toBeCloseTo(0, 6);
    expect(outer).toBeCloseTo(10, 6);
    expect(mid).toBeGreaterThan(edge);
    expect(mid).toBeLessThan(outer);
    expect(sample(30, 0)).toBeCloseTo(10, 6); // beyond reach: untouched
  });

  test("retaining raises a wall crest where cut/fill exceeds the threshold", () => {
    const profile: TerrainPathProfile = {
      points: AXIS,
      width: 10,
      shoulder: 10,
      height: { kind: "fixed", height: -10 },
      retaining: { wallHeight: 5, threshold: 2 },
    };
    const sample = withPathProfiles(() => 0, [profile]);
    const corridorEdge = sample(5, 0); // -10
    const crest = sample(10, 0); // wall crest = target + wallHeight = -5
    expect(corridorEdge).toBeCloseTo(-10, 6);
    expect(crest).toBeCloseTo(-5, 6);
    expect(crest).toBeGreaterThan(corridorEdge); // the shoulder rises into a wall
  });

  test("retaining leaves gentle stretches open when cut/fill is under the threshold", () => {
    const flatProfile: TerrainPathProfile = {
      points: AXIS,
      width: 10,
      shoulder: 10,
      height: { kind: "fixed", height: 0 },
      retaining: { wallHeight: 5, threshold: 2 },
    };
    const sample = withPathProfiles(() => 0, [flatProfile]);
    // target == surrounding == 0, so no wall is raised anywhere on the shoulder.
    expect(sample(10, 0)).toBeCloseTo(0, 6);
  });

  test("maxCut caps how far the ground drops below its base height", () => {
    const profile: TerrainPathProfile = { points: AXIS, width: 8, height: { kind: "fixed", height: -100 }, maxCut: 3 };
    const sample = withPathProfiles(() => 0, [profile]);
    expect(sample(0, 0)).toBeCloseTo(-3, 6);
  });

  test("is deterministic — identical samples across repeated evaluation", () => {
    const profile: TerrainPathProfile = { points: AXIS, width: 12, depth: 3, retaining: { wallHeight: 4 } };
    const a = withPathProfiles((x, z) => Math.sin(x * 0.1) + z * 0.05, [profile]);
    const b = withPathProfiles((x, z) => Math.sin(x * 0.1) + z * 0.05, [profile]);
    for (const [x, z] of [
      [0, 0],
      [4, -12],
      [7, 30],
      [15, 5],
    ] as const) {
      expect(a(x, z)).toBe(b(x, z));
    }
  });

  test("skips degenerate profiles and returns the base sampler untouched", () => {
    const base = (x: number, z: number) => x + z;
    expect(withPathProfiles(base, [])).toBe(base);
    expect(withPathProfiles(base, [{ points: [[0, 0]], width: 10 }])).toBe(base); // single point
    expect(withPathProfiles(base, [{ points: AXIS, width: 0 }])).toBe(base); // zero width
  });

  test("later profiles compose over earlier ones at intersections", () => {
    const first: TerrainPathProfile = { points: AXIS, width: 10, height: { kind: "fixed", height: 1 }, shoulder: 0 };
    const second: TerrainPathProfile = {
      points: [
        [-50, 0],
        [50, 0],
      ],
      width: 10,
      height: { kind: "fixed", height: 2 },
      shoulder: 0,
    };
    const sample = withPathProfiles(() => 0, [first, second]);
    // At the crossing the second (later) profile wins the core height.
    expect(sample(0, 0)).toBeCloseTo(2, 6);
  });
});

describe("applyPathProfiles / resolveTerrainField wiring", () => {
  test("applyPathProfiles reshapes a field and still yields a usable normal", () => {
    const flatZero = { sampleHeight: () => 0, sampleNormal: () => [0, 1, 0] as const };
    const field = applyPathProfiles(flatZero, [{ points: AXIS, width: 10, height: { kind: "fixed", height: 4 } }]);
    expect(field.sampleHeight(0, 0)).toBeCloseTo(4, 6);
    const normal = field.sampleNormal(0, 0);
    expect(normal.length).toBe(3);
    expect(Math.hypot(...normal)).toBeCloseTo(1, 6);
  });

  test("a serializable descriptor drives path profiles through resolveTerrainField", () => {
    const field = resolveTerrainField(
      terrain({
        height: 0,
        heightField: () => 5,
        pathProfiles: [{ points: AXIS, width: 10, shoulder: 4, height: { kind: "fixed", height: 0 } }],
      }),
    );
    expect(field.sampleHeight(0, 0)).toBeCloseTo(0, 6); // on the path: flattened to 0
    expect(field.sampleHeight(40, 0)).toBeCloseTo(5, 6); // off the path: base terrain
  });
});
