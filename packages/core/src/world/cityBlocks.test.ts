import { describe, expect, spyOn, test } from "bun:test";

import {
  buildablePolygon,
  cutParcel,
  extractBlocks,
  isSliverBlock,
  RingWalker,
  sidewalkWidthFor,
  type FabricStreet,
} from "./cityBlocks";
import {
  clipHalfPlane,
  fitRectInPolygon,
  insetRing,
  insetRingUniform,
  pointInPolygon,
  polygonArea,
  polygonSignedArea,
  rayDistanceToRing,
  rectInsidePolygon,
  ringSelfIntersects,
  type Vec2,
} from "./cityGeometry";

const PARAMS = { streetWidthBase: 7, sidewalkBase: 1.9, curbMargin: 0.35 };

function straight(a: Vec2, b: Vec2, n = 8): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i += 1) pts.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
  return pts;
}

function street(points: [number, number][], width = 7): FabricStreet {
  return { points, width, level: "street", sidewalk: true };
}

describe("cityGeometry primitives", () => {
  const square: Vec2[] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];

  test("signed area and winding", () => {
    expect(polygonSignedArea(square)).toBe(100);
    expect(polygonArea([...square].reverse())).toBe(100);
  });

  test("uniform inset shrinks a square symmetrically", () => {
    const inner = insetRingUniform(square, 2);
    expect(inner.length).toBe(4);
    expect(polygonArea(inner)).toBeCloseTo(36, 0);
    for (const [x, z] of inner) {
      expect(x).toBeGreaterThan(1.9);
      expect(x).toBeLessThan(8.1);
      expect(z).toBeGreaterThan(1.9);
      expect(z).toBeLessThan(8.1);
    }
  });

  test("per-edge inset honors different distances (curb widths)", () => {
    const inner = insetRing(square, [1, 2, 3, 4]);
    expect(inner.length).toBe(4);
    // Edge 0 runs (0,0)→(10,0): its offset line is z = 1; edge 2 gives z = 7; edges 1/3 give x.
    const zs = inner.map(([, z]) => z).sort((a, b) => a - b);
    expect(zs[0]).toBeCloseTo(1, 5);
    expect(zs[3]).toBeCloseTo(7, 5);
  });

  test("over-inset collapses to empty instead of inverting", () => {
    expect(insetRingUniform(square, 6)).toEqual([]);
  });

  test("ray distance finds the opposite wall", () => {
    expect(rayDistanceToRing(square, [5, 1], [0, 1])).toBeCloseTo(9, 5);
    expect(rayDistanceToRing(square, [5, 1], [1, 0])).toBeCloseTo(5, 5);
  });

  test("half-plane clip keeps the requested side", () => {
    const clipped = clipHalfPlane(square, [1, 0], 4);
    expect(polygonArea(clipped)).toBeCloseTo(40, 5);
    for (const [x] of clipped) expect(x).toBeLessThanOrEqual(4 + 1e-9);
  });

  test("rect fitting respects polygon bounds and orientation", () => {
    expect(rectInsidePolygon(square, 5, 5, 4, 4, 0)).toBe(true);
    expect(rectInsidePolygon(square, 5, 5, 6, 6, 0)).toBe(false);
    const fit = fitRectInPolygon(square, 5, 5, 8, 8, 0);
    expect(fit).not.toBeNull();
    expect(fit!.w).toBeLessThanOrEqual(8);
    expect(polygonArea(square)).toBeGreaterThanOrEqual(fit!.w * fit!.d);
  });

  test("sidewalk width scales with hierarchy", () => {
    expect(sidewalkWidthFor("boulevard", 1.9)).toBeGreaterThan(sidewalkWidthFor("street", 1.9));
    expect(sidewalkWidthFor("lane", 1.9)).toBeLessThan(sidewalkWidthFor("street", 1.9));
  });
});

describe("extractBlocks", () => {
  test("a 2×2 street grid yields nine blocks with closed curb and land rings", () => {
    const streets: FabricStreet[] = [
      street(straight([-100, -30], [100, -30])),
      street(straight([-100, 30], [100, 30])),
      street(straight([-30, -100], [-30, 100])),
      street(straight([30, -100], [30, 100])),
    ];
    const { blocks } = extractBlocks(streets, 100, 100, PARAMS);
    expect(blocks.length).toBe(9);
    for (const block of blocks) {
      expect(block.face.length).toBeGreaterThanOrEqual(3);
      expect(block.curb.length).toBeGreaterThanOrEqual(3);
      expect(block.land.length).toBeGreaterThanOrEqual(3);
      expect(ringSelfIntersects(block.land)).toBe(false);
      // Land sits strictly inside the face, behind curb + sidewalk.
      expect(polygonArea(block.land)).toBeLessThan(polygonArea(block.face));
      for (const [x, z] of block.land) expect(pointInPolygon(block.face, x, z)).toBe(true);
    }
    // The center block spans (-30,-30)..(30,30) on centerlines; its land ring must be inset by
    // half street width (3.5) + curb margin + sidewalk from every side.
    const center = blocks.find((b) => b.land.every(([x, z]) => Math.abs(x) < 30 && Math.abs(z) < 30) && polygonArea(b.land) > 1500);
    expect(center).toBeDefined();
    for (const [x, z] of center!.land) {
      expect(Math.abs(x)).toBeLessThan(30 - 3.5 - PARAMS.curbMargin - 1.8);
      expect(Math.abs(z)).toBeLessThan(30 - 3.5 - PARAMS.curbMargin - 1.8);
    }
  });

  test("a curved street produces a curved (non-axis-aligned) block edge", () => {
    const curve: [number, number][] = [];
    for (let x = -100; x <= 100; x += 8) curve.push([x, 20 * Math.sin((x / 200) * Math.PI)]);
    const streets: FabricStreet[] = [
      street(curve),
      street(straight([-100, 60], [100, 60])),
      street(straight([-60, -100], [-60, 100])),
      street(straight([60, -100], [60, 100])),
    ];
    const { blocks } = extractBlocks(streets, 100, 100, PARAMS);
    // The block between the curve and the straight north street must carry the curve: many
    // distinct edge headings, not just the four axis directions.
    const between = blocks.find((b) => b.land.length > 6 && b.land.some(([x, z]) => Math.abs(x) < 30 && z > 5 && z < 55));
    expect(between).toBeDefined();
    const headings = new Set<number>();
    const ring = between!.land;
    for (let i = 0; i < ring.length; i += 1) {
      const [ax, az] = ring[i]!;
      const [bx, bz] = ring[(i + 1) % ring.length]!;
      headings.add(Math.round((Math.atan2(bz - az, bx - ax) * 180) / Math.PI / 10));
    }
    expect(headings.size).toBeGreaterThan(4);
  });

  test("dead-end streets are pruned into corridors, not faces", () => {
    const streets: FabricStreet[] = [
      street(straight([-100, 0], [100, 0])),
      street(straight([0, -100], [0, 100])),
      // Dangling stub that connects on one end only.
      street(straight([20, 0], [20, 40])),
    ];
    const { blocks, deadEnds } = extractBlocks(streets, 100, 100, PARAMS);
    expect(deadEnds.length).toBeGreaterThan(0);
    expect(blocks.length).toBe(4);
  });
});

describe("extractBlocks collapse detection", () => {
  // A ring of streets that meet end-to-end at shared junctions, but each end is pulled `off` toward
  // its segment midpoint (an arc-fillet). Past the weld radius the endpoints never merge, the ring
  // never closes, and every chain prunes as a dead-end — the interior face silently vanishes.
  function filletRing(off: number, n = 16, r = 80): FabricStreet[] {
    const corners: Vec2[] = [];
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2;
      corners.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    const out: FabricStreet[] = [];
    for (let i = 0; i < n; i += 1) {
      const a = corners[i]!;
      const b = corners[(i + 1) % n]!;
      const mx = (a[0] + b[0]) / 2;
      const mz = (a[1] + b[1]) / 2;
      const pull = (p: Vec2): [number, number] => {
        const dx = mx - p[0];
        const dz = mz - p[1];
        const l = Math.hypot(dx, dz) || 1;
        return [p[0] + (dx / l) * off, p[1] + (dz / l) * off];
      };
      out.push(street([pull(a), pull(b)]));
    }
    return out;
  }

  // A dense straight grid: every crossing welds, so a substantial street set yields many faces.
  function grid(lines: number, span = 120): FabricStreet[] {
    const out: FabricStreet[] = [];
    for (let i = 0; i < lines; i += 1) {
      const c = -span + (2 * span * i) / (lines - 1);
      out.push(street(straight([-span - 20, c], [span + 20, c])));
      out.push(street(straight([c, -span - 20], [c, span + 20])));
    }
    return out;
  }

  test("welding defeat warns and flags collapsed diagnostics", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { blocks, diagnostics } = extractBlocks(filletRing(3), 120, 120, PARAMS);
      // 16 streets that should close a ring instead yield ~1 face.
      expect(diagnostics.streetCount).toBe(16);
      expect(blocks.length).toBeLessThanOrEqual(2);
      expect(diagnostics.faceCount).toBe(blocks.length);
      expect(diagnostics.collapsed).toBe(true);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]![0]).toContain("extractGraphBlocks");
    } finally {
      warn.mockRestore();
    }
  });

  test("a healthy dense grid stays quiet even above the street-count gate", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const streets = grid(7); // 14 streets forming a 6×6 interior
      const { blocks, diagnostics } = extractBlocks(streets, 120, 120, PARAMS);
      expect(streets.length).toBeGreaterThanOrEqual(12);
      expect(diagnostics.streetCount).toBe(streets.length);
      expect(blocks.length).toBeGreaterThan(diagnostics.streetCount);
      expect(diagnostics.collapsed).toBe(false);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  test("a small sparse fabric below the gate never warns", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      // 4 streets → a legitimately small block count must not trip the guard.
      const streets: FabricStreet[] = [
        street(straight([-100, -30], [100, -30])),
        street(straight([-100, 30], [100, 30])),
        street(straight([-30, -100], [-30, 100])),
        street(straight([30, -100], [30, 100])),
      ];
      const { diagnostics } = extractBlocks(streets, 100, 100, PARAMS);
      expect(diagnostics.collapsed).toBe(false);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe("parcel cutting", () => {
  const block: Vec2[] = [
    [0, 0],
    [60, 0],
    [60, 40],
    [0, 40],
  ];

  test("cutParcel extrudes the frontage arc inward and stays inside the block", () => {
    const walker = new RingWalker(block);
    const poly = cutParcel(walker, block, { s0: 5, s1: 25, depth: 15 });
    expect(poly).not.toBeNull();
    expect(polygonArea(poly!)).toBeGreaterThan(200);
    for (const [x, z] of poly!) {
      expect(x).toBeGreaterThanOrEqual(-0.5);
      expect(x).toBeLessThanOrEqual(60.5);
      expect(z).toBeGreaterThanOrEqual(-0.5);
      expect(z).toBeLessThanOrEqual(40.5);
    }
  });

  test("buildablePolygon applies front, side, and rear setbacks", () => {
    const parcel: Vec2[] = [
      [10, 0],
      [30, 0],
      [30, 16],
      [10, 16],
    ];
    const buildable = buildablePolygon(parcel, [10, 0], [30, 0], 4, 1.5, 1, 16);
    expect(buildable.length).toBeGreaterThanOrEqual(3);
    for (const [x, z] of buildable) {
      expect(z).toBeGreaterThanOrEqual(4 - 1e-6);
      expect(z).toBeLessThanOrEqual(15 + 1e-6);
      expect(x).toBeGreaterThanOrEqual(11.5 - 1e-6);
      expect(x).toBeLessThanOrEqual(28.5 + 1e-6);
    }
  });

  test("sliver verdicts are deterministic and monotone in area", () => {
    const thin: Vec2[] = [
      [0, 0],
      [40, 0],
      [40, 2],
      [0, 2],
    ];
    expect(isSliverBlock(thin, 90, 5.5)).toBe(true);
    expect(isSliverBlock(block, 90, 5.5)).toBe(false);
  });
});
