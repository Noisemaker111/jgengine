import { describe, expect, test } from "bun:test";

import {
  buildablePolygon,
  cutParcel,
  extractGraphBlocks,
  isSliverBlock,
  RingWalker,
  sidewalkWidthFor,
  type GraphBlockEdge,
  type GraphBlockNode,
} from "./cityBlocks";
import { clipHalfPlane, fitRectInPolygon, insetRing, insetRingUniform, pointInPolygon, polygonArea, polygonSignedArea, rayDistanceToRing, rectInsidePolygon, ringSelfIntersects } from "../world/polygon";
import type { Vec2 } from "../world/geometry";

const PARAMS = { sidewalkBase: 1.9, curbMargin: 0.35 };

function straight(a: Vec2, b: Vec2, n = 8): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i += 1) pts.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
  return pts;
}

const LINES = [-90, -30, 30, 90];

/** A 4×4 lattice street graph (3×3 closed blocks); `bend` swaps in a curved centerline per edge. */
function lattice(bend?: (a: Vec2, b: Vec2) => [number, number][] | null): { nodes: GraphBlockNode[]; edges: GraphBlockEdge[] } {
  const nodes: GraphBlockNode[] = [];
  for (const z of LINES) for (const x of LINES) nodes.push({ x, z });
  const id = (ix: number, iz: number) => iz * LINES.length + ix;
  const edges: GraphBlockEdge[] = [];
  const add = (a: number, b: number) => {
    const pa: Vec2 = [nodes[a]!.x, nodes[a]!.z];
    const pb: Vec2 = [nodes[b]!.x, nodes[b]!.z];
    edges.push({ a, b, points: bend?.(pa, pb) ?? straight(pa, pb), width: 7, level: "street" });
  };
  for (let iz = 0; iz < LINES.length; iz += 1) {
    for (let ix = 0; ix < LINES.length; ix += 1) {
      if (ix + 1 < LINES.length) add(id(ix, iz), id(ix + 1, iz));
      if (iz + 1 < LINES.length) add(id(ix, iz), id(ix, iz + 1));
    }
  }
  return { nodes, edges };
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

describe("extractGraphBlocks", () => {
  test("a 4×4 street lattice yields nine blocks with closed curb and land rings", () => {
    const { nodes, edges } = lattice();
    const { blocks } = extractGraphBlocks(nodes, edges, PARAMS);
    expect(blocks.length).toBe(9);
    for (const block of blocks) {
      expect(block.curb.length).toBeGreaterThanOrEqual(3);
      expect(block.land.length).toBeGreaterThanOrEqual(3);
      expect(ringSelfIntersects(block.land)).toBe(false);
      // Face ⊃ curb ⊃ land: the sidewalk band lies between curb and land.
      expect(polygonArea(block.curb)).toBeLessThan(polygonArea(block.face));
      expect(polygonArea(block.land)).toBeLessThan(polygonArea(block.curb));
      for (const [x, z] of block.land) expect(pointInPolygon(block.curb, x, z)).toBe(true);
    }
    // The center block spans (-30,-30)..(30,30) on centerlines: curb at half width + margin, land
    // behind the sidewalk too.
    const center = blocks.find((b) => b.face.every(([x, z]) => Math.abs(x) <= 30 && Math.abs(z) <= 30))!;
    for (const [x, z] of center.curb) expect(Math.max(Math.abs(x), Math.abs(z))).toBeCloseTo(30 - 3.5 - PARAMS.curbMargin, 3);
    for (const [x, z] of center.land) expect(Math.max(Math.abs(x), Math.abs(z))).toBeLessThan(30 - 3.5 - PARAMS.curbMargin - 1.8);
  });

  test("an edge without a sidewalk leaves its land at the curb", () => {
    const { nodes, edges } = lattice();
    const walked = extractGraphBlocks(nodes, edges, PARAMS).blocks;
    const bare = extractGraphBlocks(nodes, edges.map((e) => ({ ...e, sidewalk: false })), PARAMS).blocks;
    for (let i = 0; i < bare.length; i += 1) {
      expect(polygonArea(bare[i]!.land)).toBeCloseTo(polygonArea(bare[i]!.curb), 6);
      expect(polygonArea(bare[i]!.land)).toBeGreaterThan(polygonArea(walked[i]!.land));
    }
  });

  test("curved, wandering centerlines still close every block and carry the curve", () => {
    // Centerlines that wander off the straight node-to-node line (the case proximity welding
    // used to collapse) still trace through the exact graph.
    const { nodes, edges } = lattice((a, b) => {
      const pts = straight(a, b, 12);
      return pts.map(([x, z], i) => {
        const bulge = 6 * Math.sin((i / 12) * Math.PI);
        return a[1] === b[1] ? [x, z + bulge] : [x + bulge, z];
      });
    });
    const { blocks } = extractGraphBlocks(nodes, edges, PARAMS);
    expect(blocks.length).toBe(9);
    const headings = new Set<number>();
    const ring = blocks[0]!.land;
    for (let i = 0; i < ring.length; i += 1) {
      const [ax, az] = ring[i]!;
      const [bx, bz] = ring[(i + 1) % ring.length]!;
      headings.add(Math.round((Math.atan2(bz - az, bx - ax) * 180) / Math.PI / 10));
    }
    expect(headings.size).toBeGreaterThan(4);
  });

  test("dead-end streets are pruned into corridors, not faces", () => {
    const { nodes, edges } = lattice();
    nodes.push({ x: 0, z: 0 });
    edges.push({ a: 5, b: nodes.length - 1, points: straight([-30, -30], [0, 0]), width: 6, level: "lane" });
    const { blocks, deadEnds } = extractGraphBlocks(nodes, edges, PARAMS);
    expect(deadEnds.length).toBe(1);
    expect(blocks.length).toBe(9);
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
