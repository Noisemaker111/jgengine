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

  test("matches a full centerline scan at every sample, including ring edges", () => {
    const curve: readonly (readonly [number, number])[] = [
      [-120, -80],
      [-40, -30],
      [10, 12],
      [70, 6],
      [150, -40],
    ];
    const profile: TerrainPathProfile = {
      points: curve,
      width: 18,
      shoulder: 26,
      depth: 2.5,
      height: { kind: "grade", start: 4, end: -6 },
      retaining: { wallHeight: 6, threshold: 1.5, taper: 3 },
      maxCut: 5,
    };
    const base = (x: number, z: number): number => Math.sin(x * 0.05) * 3 + Math.cos(z * 0.04) * 2;
    const sample = withPathProfiles(base, [profile]);
    const reach = 9 + 26;
    // Independent oracle: the same profile maths over a scan of every segment.
    const reference = (x: number, z: number): number => {
      let lateral = Number.POSITIVE_INFINITY;
      let along = 0;
      let travelled = 0;
      let point: readonly [number, number] = curve[0]!;
      let total = 0;
      for (let i = 0; i < curve.length - 1; i += 1) total += Math.hypot(curve[i + 1]![0] - curve[i]![0], curve[i + 1]![1] - curve[i]![1]);
      for (let i = 0; i < curve.length - 1; i += 1) {
        const a = curve[i]!;
        const b = curve[i + 1]!;
        const abx = b[0] - a[0];
        const abz = b[1] - a[1];
        const lengthSq = abx * abx + abz * abz;
        const segment = Math.sqrt(lengthSq);
        const t = lengthSq <= 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * abx + (z - a[1]) * abz) / lengthSq));
        const px = a[0] + abx * t;
        const pz = a[1] + abz * t;
        const distance = Math.hypot(x - px, z - pz);
        if (distance < lateral) {
          lateral = distance;
          along = travelled + t * segment;
          point = [px, pz];
        }
        travelled += Math.hypot(abx, abz);
      }
      const surrounding = base(x, z);
      if (lateral > reach) return surrounding;
      const clamp = (value: number): number => Math.max(surrounding - 5, value);
      const target = clamp(4 + (-6 - 4) * (total <= 0 ? 0 : Math.min(1, Math.max(0, along / total))));
      if (lateral <= 9) {
        const edge = lateral / 9;
        return clamp(target - 2.5 * (1 - edge * edge));
      }
      const shoulderT = Math.min(1, Math.max(0, (lateral - 9) / 26));
      const feathered = target + (surrounding - target) * (shoulderT * shoulderT * (3 - 2 * shoulderT));
      const cutFill = Math.abs(target - surrounding);
      if (cutFill < 1.5) return feathered;
      const smooth = (value: number): number => {
        const clamped = Math.min(1, Math.max(0, value));
        return clamped * clamped * (3 - 2 * clamped);
      };
      const strength = smooth((cutFill - 1.5) / 3);
      const crest = target + 6;
      const walled =
        shoulderT <= 0.5
          ? target + (crest - target) * smooth(shoulderT / 0.5)
          : crest + (surrounding - crest) * smooth((shoulderT - 0.5) / 0.5);
      return feathered + (walled - feathered) * strength;
    };
    for (let i = 0; i < 400; i += 1) {
      const x = ((i * 149) % 400) - 200;
      const z = ((i * 83) % 300) - 150;
      expect(sample(x, z)).toBe(reference(x, z));
    }
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
