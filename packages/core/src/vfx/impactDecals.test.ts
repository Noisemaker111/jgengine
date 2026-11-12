import { describe, expect, test } from "bun:test";

import { createImpactDecalPool, decalCorners, impactDecalKindFor, type ImpactDecalKind, type ImpactDecalSurfaces } from "./impactDecals";

const KINDS: Record<string, ImpactDecalKind> = {
  hole: { look: "hole", lifeSeconds: 10, fadeSeconds: 2 },
  scorch: { look: "scorch", size: 2, lifeSeconds: 4, fadeSeconds: 1 },
};

function pool(capacity = 3) {
  return createImpactDecalPool({ capacity, kinds: KINDS, surfaceOffset: 0.02, layerOffset: 0.002, layers: 4 });
}

const UP = [0, 1, 0] as const;

describe("impact decal pool", () => {
  test("a full pool evicts its oldest mark, keeping the newest in lay order", () => {
    const decals = pool(3);
    for (let i = 0; i < 5; i += 1) decals.add({ kind: "hole", point: [i, 0, 0], normal: UP, size: 0.1, at: i });
    expect(decals.list()).toHaveLength(3);
    expect(decals.list().map((decal) => decal.position[0])).toEqual([2, 3, 4]);
    const seqs = decals.list().map((decal) => decal.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
  });

  test("a mark holds full strength, fades over its kind's last seconds, then is pruned", () => {
    const decals = pool();
    const hole = decals.add({ kind: "hole", point: [0, 0, 0], normal: UP, size: 0.1, at: 100 })!;
    expect(decals.opacity(hole, 100)).toBe(1);
    expect(decals.opacity(hole, 107.9)).toBe(1);
    expect(decals.fading(107.9)).toBe(false);
    expect(decals.opacity(hole, 109)).toBeCloseTo(0.5);
    expect(decals.fading(109)).toBe(true);
    expect(decals.opacity(hole, 110)).toBe(0);
    const before = decals.version();
    expect(decals.prune(109.5)).toBe(0);
    expect(decals.prune(110)).toBe(1);
    expect(decals.list()).toHaveLength(0);
    expect(decals.version()).toBeGreaterThan(before);
  });

  test("kinds expire on their own lives, not in lay order", () => {
    const decals = pool();
    decals.add({ kind: "hole", point: [0, 0, 0], normal: UP, size: 0.1, at: 0 });
    decals.add({ kind: "scorch", point: [1, 0, 0], normal: UP, size: 0.1, at: 1 });
    decals.prune(6);
    expect(decals.list().map((decal) => decal.kind)).toEqual(["hole"]);
  });

  test("each mark sits off its surface along the unit normal, newer layers a hair further out", () => {
    const decals = pool(8);
    const first = decals.add({ kind: "hole", point: [0, 5, 0], normal: [0, 0, 7], size: 0.1, at: 0 })!;
    expect(first.normal).toEqual([0, 0, 1]);
    expect(first.position[2]).toBeCloseTo(0.02);
    const second = decals.add({ kind: "hole", point: [0, 5, 0], normal: [0, 0, 1], size: 0.1, at: 0 })!;
    expect(second.position[2]).toBeCloseTo(0.022);
    expect(second.position[2]).toBeGreaterThan(first.position[2]);
  });

  test("the kind scales the asked size", () => {
    const decals = pool();
    expect(decals.add({ kind: "scorch", point: [0, 0, 0], normal: UP, size: 0.5, at: 0 })?.size).toBe(1);
  });

  test("an unknown kind, a zero normal, no size or no capacity lays nothing", () => {
    expect(pool().add({ kind: "blood", point: [0, 0, 0], normal: UP, size: 1, at: 0 })).toBeNull();
    expect(pool().add({ kind: "hole", point: [0, 0, 0], normal: [0, 0, 0], size: 1, at: 0 })).toBeNull();
    expect(pool().add({ kind: "hole", point: [0, 0, 0], normal: UP, size: 0, at: 0 })).toBeNull();
    expect(pool(0).add({ kind: "hole", point: [0, 0, 0], normal: UP, size: 1, at: 0 })).toBeNull();
  });

  test("shrinking the pool keeps the newest marks", () => {
    const decals = pool(4);
    for (let i = 0; i < 4; i += 1) decals.add({ kind: "hole", point: [i, 0, 0], normal: UP, size: 0.1, at: 0 });
    decals.resize(2);
    expect(decals.capacity).toBe(2);
    expect(decals.list().map((decal) => decal.position[0])).toEqual([2, 3]);
  });
});

describe("decalCorners", () => {
  const normals = [
    [0, 1, 0],
    [0, -1, 0],
    [1, 0, 0],
    [0, 0, -1],
    [0.6, 0.48, 0.64],
  ] as const;

  for (const normal of normals) {
    test(`a ${normal.join(",")} mark lies flat on its surface, square, facing out`, () => {
      const out = new Float32Array(12);
      decalCorners({ position: [1, 2, 3], normal, size: 2, spin: 0.7 }, out);
      const corner = (i: number) => [out[i * 3]! - 1, out[i * 3 + 1]! - 2, out[i * 3 + 2]! - 3] as const;
      for (let i = 0; i < 4; i += 1) {
        const [x, y, z] = corner(i);
        // In the plane: no component along the normal.
        expect(x * normal[0] + y * normal[1] + z * normal[2]).toBeCloseTo(0, 5);
        // Half-diagonal of a 2 m square from the centre.
        expect(Math.hypot(x, y, z)).toBeCloseTo(Math.SQRT2, 5);
      }
      // Winding 0→1→2 is counter-clockwise seen from the normal's side, so the front face points out.
      const a = corner(0), b = corner(1), c = corner(2);
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const face = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
      expect(face[0]! * normal[0] + face[1]! * normal[1] + face[2]! * normal[2]).toBeGreaterThan(0);
    });
  }
});

describe("impactDecalKindFor", () => {
  const surfaces: ImpactDecalSurfaces = {
    terrain: "dirt",
    wall: "chip",
    object: "dent",
    entity: null,
    catalog: { vendor: null, robot: "oil" },
    impacts: { explosive: "scorch" },
  };

  test("the surface kind names the mark", () => {
    expect(impactDecalKindFor(surfaces, { targetKind: "terrain" })).toBe("dirt");
    expect(impactDecalKindFor(surfaces, { targetKind: "wall" })).toBe("chip");
    expect(impactDecalKindFor(surfaces, { targetKind: "object", catalogId: "crate" })).toBe("dent");
    expect(impactDecalKindFor(surfaces, { targetKind: "entity", catalogId: "ganger" })).toBeNull();
  });

  test("a catalog entry overrides its surface kind, including an explicit none", () => {
    expect(impactDecalKindFor(surfaces, { targetKind: "entity", catalogId: "robot" })).toBe("oil");
    expect(impactDecalKindFor(surfaces, { targetKind: "object", catalogId: "vendor" })).toBeNull();
  });

  test("an impact class overrides both", () => {
    expect(impactDecalKindFor(surfaces, { targetKind: "terrain", impact: "explosive" })).toBe("scorch");
    expect(impactDecalKindFor(surfaces, { targetKind: "entity", catalogId: "robot", impact: "explosive" })).toBe("scorch");
    expect(impactDecalKindFor(surfaces, { targetKind: "terrain", impact: "light" })).toBe("dirt");
  });

  test("a surface the book leaves out takes no mark", () => {
    expect(impactDecalKindFor({}, { targetKind: "terrain" })).toBeNull();
  });
});
