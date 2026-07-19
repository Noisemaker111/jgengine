import { describe, expect, test } from "bun:test";
import { environment, road } from "./features";
import { summarizeEnvironment } from "./environmentSummary";
import {
  GROUND_DECAL_LAYERS,
  buildJunctionPatch,
  buildJunctionSurface,
  buildRoadRibbon,
  buildTrimmedIntersections,
  dashSegments,
  isOnRoad,
  nearestOnPath,
  pathLength,
  roundPathCorners,
  trimBandAtJunctions,
  trimPathAtJunctions,
  type JunctionApproach,
  type RoadJunctionInput,
} from "./roads";

const flat = () => 0;

describe("world/roads", () => {
  test("road() resolves defaults and validates the path", () => {
    const descriptor = road({ path: [[0, 0], [100, 0]] });
    expect(descriptor.kind).toBe("road");
    expect(descriptor.width).toBe(8);
    expect(descriptor.markings).toBe(true);
    expect(() => road({ path: [[0, 0]] })).toThrow();
  });

  test("buildRoadRibbon drapes a subdivided two-sided strip", () => {
    const ribbon = buildRoadRibbon([[0, 0], [40, 0]], 8, (x) => x * 0.1, { maxSegmentLength: 10 });
    expect(ribbon.positions.length).toBe(5 * 6);
    expect(ribbon.indices.length).toBe(4 * 6);
    expect(ribbon.positions[1]).toBeCloseTo(0.06, 3);
    const lastY = ribbon.positions[ribbon.positions.length - 2]!;
    expect(lastY).toBeCloseTo(4.06, 3);
    expect(ribbon.positions[2]).toBeCloseTo(4, 3);
    expect(ribbon.positions[5]).toBeCloseTo(-4, 3);
  });

  test("dashSegments alternates paint and gap along arc length", () => {
    const dashes = dashSegments([[0, 0], [30, 0]], 3, 3);
    expect(dashes.length).toBe(5);
    const first = dashes[0]!;
    expect(first[0]![0]).toBeCloseTo(0);
    expect(first[first.length - 1]![0]).toBeCloseTo(3);
  });

  test("dashSegments drops dashes whose midpoint falls inside a junction exclusion", () => {
    const full = dashSegments([[0, 0], [60, 0]], 3, 3);
    const clipped = dashSegments([[0, 0], [60, 0]], 3, 3, [{ center: [30, 0], radius: 8 }]);
    expect(clipped.length).toBeLessThan(full.length);
    // No surviving dash has its midpoint within the excluded circle.
    for (const dash of clipped) {
      const a = dash[0]!;
      const b = dash[dash.length - 1]!;
      const mid: readonly [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      expect(Math.hypot(mid[0] - 30, mid[1] - 0)).toBeGreaterThan(8);
    }
  });

  test("center-line dash ribbon stays centered on the path regardless of width", () => {
    for (const width of [0.3, 1, 4]) {
      const ribbon = buildRoadRibbon([[0, 0], [20, 0]], width, () => 0, { maxSegmentLength: 20 });
      // Two draped vertices per centerline point (left then right); their XZ midpoint is the centerline.
      const midX = (ribbon.positions[0]! + ribbon.positions[3]!) / 2;
      const midZ = (ribbon.positions[2]! + ribbon.positions[5]!) / 2;
      expect(midX).toBeCloseTo(0, 6);
      expect(midZ).toBeCloseTo(0, 6);
      // Left/right offsets are symmetric (equal magnitude, opposite sign).
      expect(ribbon.positions[2]! + ribbon.positions[5]!).toBeCloseTo(0, 6);
    }
  });

  test("buildJunctionPatch drapes a bounded disc fan centered on the crossing", () => {
    const patch = buildJunctionPatch([10, 20], 5, (x, z) => x * 0.1 + z * 0.05, {
      elevation: 0.2,
      segments: 12,
    });
    // Center vertex + one ring vertex per segment.
    expect(patch.positions.length).toBe((12 + 1) * 3);
    expect(patch.indices.length).toBe(12 * 3);
    // Center vertex sits at the junction center, draped + elevation.
    expect(patch.positions[0]).toBeCloseTo(10, 6);
    expect(patch.positions[2]).toBeCloseTo(20, 6);
    expect(patch.positions[1]).toBeCloseTo(10 * 0.1 + 20 * 0.05 + 0.2, 6);
    // Every ring vertex lies within `radius` of the center in XZ.
    for (let i = 1; i <= 12; i += 1) {
      const dx = patch.positions[i * 3]! - 10;
      const dz = patch.positions[i * 3 + 2]! - 20;
      expect(Math.hypot(dx, dz)).toBeLessThanOrEqual(5 + 1e-6);
    }
    // Degenerate radius yields no geometry.
    expect(buildJunctionPatch([0, 0], 0, () => 0).positions.length).toBe(0);
  });

  test("nearestOnPath and isOnRoad answer proximity queries", () => {
    const path = [[0, 0], [100, 0]] as const;
    const sample = nearestOnPath(path, 50, 3);
    expect(sample?.distance).toBeCloseTo(3);
    expect(sample?.point[0]).toBeCloseTo(50);
    expect(sample?.tangent[0]).toBeCloseTo(1);
    expect(isOnRoad(path, 8, 50, 3)).toBe(true);
    expect(isOnRoad(path, 8, 50, 5)).toBe(false);
    expect(pathLength(path)).toBe(100);
  });

  test("environment() carries roads and summarizeEnvironment counts them", () => {
    const world = environment({
      roads: [road({ path: [[0, 0], [60, 0], [60, 60]] }), road({ path: [[0, 0], [0, 80]], width: 6 })],
    });
    expect(world.roads?.length).toBe(2);
    const summary = summarizeEnvironment(world);
    expect(summary.counts.roads).toBe(2);
    expect(summary.roads[0]?.length).toBe(120);
    expect(summary.roads[1]?.width).toBe(6);
    expect(summary.isEmpty).toBe(false);
  });
});

const flatH = () => 0;

/** A symmetric 4-way junction at the origin: arms +x, −x, +z, −z, all `width`. */
function crossJunction(width: number): RoadJunctionInput {
  return {
    x: 0,
    z: 0,
    arms: [
      { angle: Math.PI / 2, width }, // +x
      { angle: -Math.PI / 2, width }, // −x
      { angle: 0, width }, // +z
      { angle: Math.PI, width }, // −z
    ],
  };
}

/** Up-facing (+Y) normal Y-component of a triangle, from interleaved xyz positions and vertex indices. */
function triNormalY(pos: Float32Array, i0: number, i1: number, i2: number): number {
  const ax = pos[i1 * 3]! - pos[i0 * 3]!;
  const az = pos[i1 * 3 + 2]! - pos[i0 * 3 + 2]!;
  const bx = pos[i2 * 3]! - pos[i0 * 3]!;
  const bz = pos[i2 * 3 + 2]! - pos[i0 * 3 + 2]!;
  return az * bx - ax * bz;
}

describe("GROUND_DECAL_LAYERS", () => {
  test("owns a strictly increasing decal order with road == junction (seam-shared)", () => {
    expect(GROUND_DECAL_LAYERS.road).toBe(GROUND_DECAL_LAYERS.junction);
    expect(GROUND_DECAL_LAYERS.road).toBeLessThan(GROUND_DECAL_LAYERS.marking);
    expect(GROUND_DECAL_LAYERS.marking).toBeLessThan(GROUND_DECAL_LAYERS.glow);
    // Meaningful separation so a small terrain slope can't invert the order.
    expect(GROUND_DECAL_LAYERS.marking - GROUND_DECAL_LAYERS.road).toBeGreaterThan(0.04);
  });

  test("buildRoadRibbon defaults its elevation from the table", () => {
    const ribbon = buildRoadRibbon([[0, 0], [10, 0]], 8, flatH, { maxSegmentLength: 20 });
    expect(ribbon.positions[1]).toBeCloseTo(GROUND_DECAL_LAYERS.road, 6); // Float32 storage precision
  });
});

describe("trimPathAtJunctions", () => {
  test("cuts an approach back by the apron arc-length derived from the arms", () => {
    // apron = max crossing half-width (4) + curbReturn (4) + margin (1) = 9.
    const trimmed = trimPathAtJunctions([[0, 0], [30, 0]], 8, [crossJunction(8)]);
    expect(trimmed.length).toBe(1);
    const road = trimmed[0]!;
    expect(road.cuts.length).toBe(1);
    const cut = road.cuts[0]!;
    expect(cut.at).toBe("start");
    expect(cut.apron).toBeCloseTo(9, 9);
    // Cut point sits 9 units along +x from the node.
    expect(cut.center[0]).toBeCloseTo(9, 9);
    expect(cut.center[1]).toBeCloseTo(0, 9);
    expect(road.path[0]![0]).toBeCloseTo(9, 9);
    // Left/right corners are ± half-width along the perpendicular.
    expect(cut.left).toEqual([9, 4]);
    expect(cut.right).toEqual([9, -4]);
  });

  test("a through-street splits into two independently-trimmed sub-paths", () => {
    const trimmed = trimPathAtJunctions([[-30, 0], [0, 0], [30, 0]], 8, [crossJunction(8)]);
    expect(trimmed.length).toBe(2);
    const left = trimmed.find((t) => t.path[0]![0] < 0)!;
    const right = trimmed.find((t) => t.path[0]![0] >= 0)!;
    // Left run ends at −9 (cut from its end), right run starts at +9.
    expect(left.path[left.path.length - 1]![0]).toBeCloseTo(-9, 9);
    expect(left.cuts[0]!.at).toBe("end");
    expect(right.path[0]![0]).toBeCloseTo(9, 9);
    expect(right.cuts[0]!.at).toBe("start");
  });

  test("unequal-width junction pulls narrow approaches back farther to clear a wide crossing", () => {
    const junction: RoadJunctionInput = {
      x: 0,
      z: 0,
      arms: [
        { angle: Math.PI / 2, width: 8 }, // +x (narrow)
        { angle: -Math.PI / 2, width: 8 }, // −x
        { angle: 0, width: 20 }, // +z (wide boulevard)
        { angle: Math.PI, width: 8 }, // −z
      ],
    };
    // Narrow +x approach: crossMax = max(8/2, 8/2, 20/2) = 10 → apron 10+4+1 = 15.
    const narrow = trimPathAtJunctions([[0, 0], [40, 0]], 8, [junction])[0]!;
    expect(narrow.cuts[0]!.apron).toBeCloseTo(15, 9);
    // Wide +z approach: crossMax = max(8/2, 8/2, 8/2) = 4 → apron 4+4+1 = 9.
    const wide = trimPathAtJunctions([[0, 0], [0, 40]], 20, [junction])[0]!;
    expect(wide.cuts[0]!.apron).toBeCloseTo(9, 9);
  });

  test("trimmed corners agree with the ribbon's terminal vertices to 1e-9", () => {
    const road = trimPathAtJunctions([[0, 0], [30, 0]], 8, [crossJunction(8)])[0]!;
    const ribbon = buildRoadRibbon(road.path, 8, flatH, { elevation: GROUND_DECAL_LAYERS.road });
    const cut = road.cuts[0]!; // at "start" → ribbon verts 0 (left) and 1 (right)
    expect(Math.abs(ribbon.positions[0]! - cut.left[0])).toBeLessThan(1e-9);
    expect(Math.abs(ribbon.positions[2]! - cut.left[1])).toBeLessThan(1e-9);
    expect(Math.abs(ribbon.positions[3]! - cut.right[0])).toBeLessThan(1e-9);
    expect(Math.abs(ribbon.positions[5]! - cut.right[1])).toBeLessThan(1e-9);
  });
});

describe("buildJunctionSurface", () => {
  test("fan triangulation is non-degenerate with consistent +Y winding (3-way)", () => {
    const approaches = [
      { center: [10, 0] as const, left: [10, 0, 4] as const, right: [10, 0, -4] as const },
      { center: [0, 10] as const, left: [4, 0, 10] as const, right: [-4, 0, 10] as const },
      { center: [-10, 0] as const, left: [-10, 0, 4] as const, right: [-10, 0, -4] as const },
    ];
    const surf = buildJunctionSurface({ x: 0, z: 0 }, approaches, flatH, { curbReturnRadius: 6, filletSegments: 4 });
    expect(surf.indices.length % 3).toBe(0);
    expect(surf.indices.length).toBeGreaterThan(0);
    for (let t = 0; t < surf.indices.length; t += 3) {
      const ny = triNormalY(surf.positions, surf.indices[t]!, surf.indices[t + 1]!, surf.indices[t + 2]!);
      expect(ny).toBeGreaterThan(1e-6); // +Y up-facing AND non-zero area
    }
  });

  test("curb-return fillet arcs respect the requested radius", () => {
    const radius = 6;
    // A symmetric 4-way so every gap chord (~8.49) is below 2·radius and no clamp kicks in.
    const approaches = [
      { center: [10, 0] as const, left: [10, 0, 4] as const, right: [10, 0, -4] as const },
      { center: [0, 10] as const, left: [4, 0, 10] as const, right: [-4, 0, 10] as const },
      { center: [-10, 0] as const, left: [-10, 0, 4] as const, right: [-10, 0, -4] as const },
      { center: [0, -10] as const, left: [4, 0, -10] as const, right: [-4, 0, -10] as const },
    ];
    const surf = buildJunctionSurface({ x: 0, z: 0 }, approaches, flatH, { curbReturnRadius: radius, filletSegments: 6 });
    // Ring vertices (skip the center at index 0). Corners are the 8 approach edge points.
    const corners = approaches.flatMap((a) => [
      [a.left[0], a.left[2]],
      [a.right[0], a.right[2]],
    ]);
    const isCorner = (x: number, z: number) => corners.some((c) => Math.hypot(c[0]! - x, c[1]! - z) < 1e-3);
    // Walk the ring; find a fillet run (consecutive non-corner points bounded by two corners).
    const ring: number[][] = [];
    for (let v = 1; v * 3 + 2 < surf.positions.length; v += 1) ring.push([surf.positions[v * 3]!, surf.positions[v * 3 + 2]!]);
    let checked = 0;
    for (let i = 0; i < ring.length; i += 1) {
      const prev = ring[(i - 1 + ring.length) % ring.length]!;
      const cur = ring[i]!;
      const next = ring[(i + 1) % ring.length]!;
      // A fillet arc point whose neighbours bound a circle: circumradius of (prev, cur, next) ≈ radius.
      if (!isCorner(cur[0]!, cur[1]!)) {
        const A = Math.hypot(cur[0]! - prev[0]!, cur[1]! - prev[1]!);
        const B = Math.hypot(next[0]! - cur[0]!, next[1]! - cur[1]!);
        const C = Math.hypot(next[0]! - prev[0]!, next[1]! - prev[1]!);
        const area = Math.abs((cur[0]! - prev[0]!) * (next[1]! - prev[1]!) - (next[0]! - prev[0]!) * (cur[1]! - prev[1]!)) / 2;
        if (area > 1e-6) {
          const circum = (A * B * C) / (4 * area);
          expect(circum).toBeCloseTo(radius, 3);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  test("empty approaches yield no geometry", () => {
    const surf = buildJunctionSurface({ x: 0, z: 0 }, [], flatH);
    expect(surf.positions.length).toBe(0);
    expect(surf.indices.length).toBe(0);
  });
});

describe("buildTrimmedIntersections", () => {
  test("welds a 4-way node with boundary vertices bitwise-equal to the trimmed ribbon corners", () => {
    const streets = [
      { path: [[-30, 0], [0, 0], [30, 0]] as const, width: 8 }, // through E-W (vertex at node)
      { path: [[0, -30], [0, 0], [0, 30]] as const, width: 8 }, // through N-S (vertex at node)
    ];
    const result = buildTrimmedIntersections(streets, [crossJunction(8)], flatH);
    // Each through-street splits in two → 4 ribbons; one welded junction surface.
    expect(result.ribbons.length).toBe(4);
    expect(result.junctions.length).toBe(1);

    const surf = result.junctions[0]!;
    // Every trimmed ribbon's terminal corner (facing the node) must appear verbatim in the surface.
    const surfaceVerts = new Set<string>();
    for (let v = 0; v * 3 + 2 < surf.positions.length; v += 1) {
      surfaceVerts.add(`${surf.positions[v * 3]!},${surf.positions[v * 3 + 1]!},${surf.positions[v * 3 + 2]!}`);
    }
    let matched = 0;
    for (let r = 0; r < result.ribbons.length; r += 1) {
      const ribbon = result.ribbons[r]!;
      const tr = result.trimmed[r]!;
      const numPoints = ribbon.positions.length / 6;
      for (const cut of tr.cuts) {
        const lv = cut.at === "start" ? 0 : (numPoints - 1) * 2;
        const rv = lv + 1;
        const leftKey = `${ribbon.positions[lv * 3]!},${ribbon.positions[lv * 3 + 1]!},${ribbon.positions[lv * 3 + 2]!}`;
        const rightKey = `${ribbon.positions[rv * 3]!},${ribbon.positions[rv * 3 + 1]!},${ribbon.positions[rv * 3 + 2]!}`;
        expect(surfaceVerts.has(leftKey)).toBe(true);
        expect(surfaceVerts.has(rightKey)).toBe(true);
        matched += 2;
      }
    }
    expect(matched).toBe(8); // 4 ribbons × one node-facing cut × 2 corners
  });

  test("3-way (T) node welds a surface and every triangle faces +Y", () => {
    const tJunction: RoadJunctionInput = {
      x: 0,
      z: 0,
      arms: [
        { angle: Math.PI / 2, width: 8 }, // +x
        { angle: -Math.PI / 2, width: 8 }, // −x
        { angle: 0, width: 8 }, // +z
      ],
    };
    const streets = [
      { path: [[-30, 0], [0, 0], [30, 0]] as const, width: 8 }, // through E-W (vertex at node)
      { path: [[0, 0], [0, 30]] as const, width: 8 }, // stub heading +z
    ];
    const result = buildTrimmedIntersections(streets, [tJunction], flatH);
    expect(result.junctions.length).toBe(1);
    const surf = result.junctions[0]!;
    expect(surf.indices.length).toBeGreaterThan(0);
    for (let t = 0; t < surf.indices.length; t += 3) {
      const ny = triNormalY(surf.positions, surf.indices[t]!, surf.indices[t + 1]!, surf.indices[t + 2]!);
      expect(ny).toBeGreaterThan(1e-6);
    }
  });
});

describe("roundPathCorners", () => {
  test("fillets a right-angle corner into an arc that no longer passes through the sharp vertex", () => {
    const rounded = roundPathCorners([[0, 0], [10, 0], [10, 10]], 3, 5);
    // Endpoints preserved.
    expect(rounded[0]).toEqual([0, 0]);
    expect(rounded[rounded.length - 1]).toEqual([10, 10]);
    // The sharp corner (10,0) is replaced by arc points — none sit exactly on it.
    expect(rounded.some((p) => p[0] === 10 && p[1] === 0)).toBe(false);
    // Arc stays inside the corner (x < 10 near the bend).
    expect(rounded.every((p) => p[0] <= 10 + 1e-9)).toBe(true);
    expect(rounded.length).toBeGreaterThan(3);
  });

  test("radius clamps to half the shorter adjacent segment and short paths pass through", () => {
    expect(roundPathCorners([[0, 0], [1, 0]], 5)).toEqual([[0, 0], [1, 0]]);
    // A tiny middle segment clamps the fillet so arcs never cross past the neighbours.
    const rounded = roundPathCorners([[0, 0], [4, 0], [4, 1], [8, 1]], 10, 4);
    expect(rounded.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// Geometry test helpers (2-D, XZ plane)
// ---------------------------------------------------------------------------------------------

const orient = (
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
): number => (bx - ax) * (cz - az) - (bz - az) * (cx - ax);

/** True only when segments (p1,p2) and (p3,p4) PROPERLY cross (interiors intersect; touching is ignored). */
function segmentsProperlyCross(
  p1: readonly number[],
  p2: readonly number[],
  p3: readonly number[],
  p4: readonly number[],
): boolean {
  const e = 1e-9;
  const d1 = orient(p3[0]!, p3[1]!, p4[0]!, p4[1]!, p1[0]!, p1[1]!);
  const d2 = orient(p3[0]!, p3[1]!, p4[0]!, p4[1]!, p2[0]!, p2[1]!);
  const d3 = orient(p1[0]!, p1[1]!, p2[0]!, p2[1]!, p3[0]!, p3[1]!);
  const d4 = orient(p1[0]!, p1[1]!, p2[0]!, p2[1]!, p4[0]!, p4[1]!);
  const opposite = (a: number, b: number) => (a > e && b < -e) || (a < -e && b > e);
  return opposite(d1, d2) && opposite(d3, d4);
}

/** Count self-crossings in a polyline (skips adjacent and zero-length segments). */
function selfCrossings(poly: readonly (readonly number[])[]): number {
  let count = 0;
  for (let i = 0; i < poly.length - 1; i += 1) {
    const a = poly[i]!;
    const b = poly[i + 1]!;
    if (Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!) < 1e-9) continue;
    for (let j = i + 2; j < poly.length - 1; j += 1) {
      if (j === i) continue;
      const c = poly[j]!;
      const d = poly[j + 1]!;
      if (Math.hypot(d[0]! - c[0]!, d[1]! - c[1]!) < 1e-9) continue;
      if (segmentsProperlyCross(a, b, c, d)) count += 1;
    }
  }
  return count;
}

/** Left (side 0) or right (side 1) offset edge of a ribbon as an XZ polyline. */
function ribbonEdge(pos: Float32Array, side: 0 | 1): number[][] {
  const out: number[][] = [];
  const count = pos.length / 6;
  for (let i = 0; i < count; i += 1) {
    const base = i * 6 + side * 3;
    out.push([pos[base]!, pos[base + 2]!]);
  }
  return out;
}

/** Ring vertices of a junction surface (skips the fan apex at index 0) as an XZ polygon. */
function surfaceRing(pos: Float32Array): number[][] {
  const out: number[][] = [];
  for (let v = 1; v * 3 + 2 < pos.length; v += 1) out.push([pos[v * 3]!, pos[v * 3 + 2]!]);
  return out;
}

/** True if a closed polygon (implicit last→first edge) has no properly-crossing edge pair. */
function polygonIsSimple(ring: readonly (readonly number[])[]): boolean {
  const closed = [...ring, ring[0]!];
  const m = ring.length;
  for (let i = 0; i < m; i += 1) {
    const a = closed[i]!;
    const b = closed[i + 1]!;
    if (Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!) < 1e-9) continue;
    for (let j = i + 1; j < m; j += 1) {
      if (j === i || (i === 0 && j === m - 1) || Math.abs(i - j) === 1) continue;
      const c = closed[j]!;
      const d = closed[j + 1]!;
      if (Math.hypot(d[0]! - c[0]!, d[1]! - c[1]!) < 1e-9) continue;
      if (segmentsProperlyCross(a, b, c, d)) return false;
    }
  }
  return true;
}

/** Signed shoelace area (XZ) of a polygon. */
function shoelaceArea(ring: readonly (readonly number[])[]): number {
  let area = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    area += a[0]! * b[1]! - b[0]! * a[1]!;
  }
  return area / 2;
}

/** Build one draped junction approach from an arm spec (mirrors buildRoadRibbon's corner convention). */
function makeApproach(
  angle: number,
  width: number,
  apron: number,
  sample: (x: number, z: number) => number,
): JunctionApproach {
  const ux = Math.sin(angle);
  const uz = Math.cos(angle);
  const cx = ux * apron;
  const cz = uz * apron;
  const half = width / 2;
  const nx = -uz; // left normal of the outward tangent
  const nz = ux;
  const lx = cx + nx * half;
  const lz = cz + nz * half;
  const rx = cx - nx * half;
  const rz = cz - nz * half;
  return {
    center: [cx, cz],
    left: [lx, sample(lx, lz), lz],
    right: [rx, sample(rx, rz), rz],
  };
}

describe("buildRoadRibbon join handling (defect 1: bend self-intersection)", () => {
  test("straight ribbons are byte-identical to the naive per-vertex offset (regression guard)", () => {
    // Replicate the pre-join algorithm exactly for a subdivided diagonal straight line.
    const path: readonly [number, number][] = [
      [0, 0],
      [30, 30],
    ];
    const sample = (x: number, z: number) => x * 0.03 - z * 0.017;
    const maxSegmentLength = 4;
    // Naive reference: subdivide, offset each vertex by the segment-chord normal, drape.
    const pts: number[][] = [];
    const segLen = Math.hypot(30, 30);
    const steps = Math.max(1, Math.ceil(segLen / maxSegmentLength));
    for (let s = 0; s < steps; s += 1) pts.push([30 * (s / steps), 30 * (s / steps)]);
    pts.push([30, 30]);
    const half = 4;
    const naive = new Float32Array(pts.length * 6);
    for (let i = 0; i < pts.length; i += 1) {
      const prev = pts[Math.max(0, i - 1)]!;
      const next = pts[Math.min(pts.length - 1, i + 1)]!;
      const dx = next[0]! - prev[0]!;
      const dz = next[1]! - prev[1]!;
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len;
      const nz = dx / len;
      const lx = pts[i]![0]! + nx * half;
      const lz = pts[i]![1]! + nz * half;
      const rx = pts[i]![0]! - nx * half;
      const rz = pts[i]![1]! - nz * half;
      naive[i * 6] = lx;
      naive[i * 6 + 1] = sample(lx, lz) + GROUND_DECAL_LAYERS.road;
      naive[i * 6 + 2] = lz;
      naive[i * 6 + 3] = rx;
      naive[i * 6 + 4] = sample(rx, rz) + GROUND_DECAL_LAYERS.road;
      naive[i * 6 + 5] = rz;
    }
    const ribbon = buildRoadRibbon(path, 8, sample, { maxSegmentLength });
    expect(ribbon.positions.length).toBe(naive.length);
    for (let k = 0; k < naive.length; k += 1) expect(ribbon.positions[k]).toBe(naive[k]);
  });

  test("terminal cross-sections of a BENT ribbon match the naive endpoint formula bit-for-bit", () => {
    const path: readonly [number, number][] = [
      [-40, 0],
      [0, 0],
      [0, 40],
    ];
    const ribbon = buildRoadRibbon(path, 16, flatH, { maxSegmentLength: 4 });
    const count = ribbon.positions.length / 6;
    // First cross-section: perpendicular of the first segment (+x) → left = (-40, +8), right = (-40, -8).
    expect(ribbon.positions[0]).toBe(-40);
    expect(ribbon.positions[2]).toBe(8);
    expect(ribbon.positions[3]).toBe(-40);
    expect(ribbon.positions[5]).toBe(-8);
    // Last cross-section: perpendicular of the last segment (+z) → left = (-8, 40), right = (+8, 40).
    const lb = (count - 1) * 6;
    expect(ribbon.positions[lb]).toBe(-8);
    expect(ribbon.positions[lb + 2]).toBe(40);
    expect(ribbon.positions[lb + 3]).toBe(8);
    expect(ribbon.positions[lb + 5]).toBe(40);
  });

  test("a densely-sampled 90° bend produces no self-intersecting edge and no flipped triangles", () => {
    // A 90° turn sampled densely as an arc (spacing ~1.6 << half-width 8): the classic bowtie regime
    // the naive per-vertex offset failed on. (A single sharp vertex is a quad-strip limitation the
    // pipeline avoids by rounding corners first — see roundPathCorners.)
    const path: [number, number][] = [[-40, 0]];
    const radius = 10;
    for (let s = 0; s <= 16; s += 1) {
      const a = (s / 16) * (Math.PI / 2);
      path.push([-radius + Math.sin(a) * radius, radius - Math.cos(a) * radius]);
    }
    path.push([0, 40]);
    const ribbon = buildRoadRibbon(path, 16, flatH, { maxSegmentLength: 100 });
    expect(selfCrossings(ribbonEdge(ribbon.positions, 0))).toBe(0);
    expect(selfCrossings(ribbonEdge(ribbon.positions, 1))).toBe(0);
    for (let t = 0; t < ribbon.indices.length; t += 3) {
      const ny = triNormalY(ribbon.positions, ribbon.indices[t]!, ribbon.indices[t + 1]!, ribbon.indices[t + 2]!);
      expect(ny).toBeLessThan(1e-6); // ribbon tris wind −Y; a positive value would be a flip
    }
  });

  test("a densely-sampled tight bend (spacing < half-width) does not self-intersect or flip", () => {
    // Straight tails with a rounded corner whose radius (6) is below the half-width (8): the inner
    // offset folds hard through the bend, but the straight ends keep the terminals clean. This is the
    // real regime — trimmed sub-paths run straight into junctions and bend only in between.
    const path = roundPathCorners([[-40, 0], [0, 0], [0, 40]], 6, 10);
    const ribbon = buildRoadRibbon(path, 16, flatH, { maxSegmentLength: 100 });
    expect(selfCrossings(ribbonEdge(ribbon.positions, 0))).toBe(0);
    expect(selfCrossings(ribbonEdge(ribbon.positions, 1))).toBe(0);
    // Consistent winding: every triangle keeps the ribbon's native −Y sign (a positive value = flip).
    for (let t = 0; t < ribbon.indices.length; t += 3) {
      const ny = triNormalY(ribbon.positions, ribbon.indices[t]!, ribbon.indices[t + 1]!, ribbon.indices[t + 2]!);
      expect(ny).toBeLessThan(1e-6);
    }
  });

  test("a gentle dense bend (radius > half-width) also stays clean", () => {
    const path = roundPathCorners([[-40, 0], [0, 0], [0, 40]], 14, 12);
    const ribbon = buildRoadRibbon(path, 16, flatH, { maxSegmentLength: 2 });
    expect(selfCrossings(ribbonEdge(ribbon.positions, 0))).toBe(0);
    expect(selfCrossings(ribbonEdge(ribbon.positions, 1))).toBe(0);
    for (let t = 0; t < ribbon.indices.length; t += 3) {
      const ny = triNormalY(ribbon.positions, ribbon.indices[t]!, ribbon.indices[t + 1]!, ribbon.indices[t + 2]!);
      expect(ny).toBeLessThan(1e-6);
    }
  });
});

describe("buildJunctionSurface simple-boundary triangulation (defect 2: shards)", () => {
  const slope = (x: number, z: number) => x * 0.05 - z * 0.03;

  interface Arm {
    angle: number;
    width: number;
    apron: number;
  }
  const repros: { name: string; arms: Arm[] }[] = [
    {
      name: "3-way unequal",
      arms: [
        { angle: 0, width: 8, apron: 9 },
        { angle: 2.2, width: 20, apron: 15 },
        { angle: 4.3, width: 6, apron: 8 },
      ],
    },
    {
      name: "4-way unequal (wide boulevard + narrow streets)",
      arms: [
        { angle: 0, width: 20, apron: 15 },
        { angle: 1.3, width: 8, apron: 9 },
        { angle: 3.0, width: 14, apron: 12 },
        { angle: 4.6, width: 6, apron: 8 },
      ],
    },
    {
      name: "5-way unequal",
      arms: [
        { angle: 0, width: 8, apron: 9 },
        { angle: 1.1, width: 20, apron: 16 },
        { angle: 2.4, width: 6, apron: 8 },
        { angle: 3.6, width: 16, apron: 13 },
        { angle: 5.0, width: 10, apron: 10 },
      ],
    },
  ];

  for (const repro of repros) {
    test(`${repro.name}: simple boundary, all +Y triangles, area matches shoelace`, () => {
      const approaches = repro.arms.map((a) => makeApproach(a.angle, a.width, a.apron, slope));
      const surf = buildJunctionSurface({ x: 0, z: 0 }, approaches, slope, {
        curbReturnRadius: 4,
        filletSegments: 4,
      });
      expect(surf.indices.length).toBeGreaterThan(0);

      // (a) The boundary polygon is strictly simple.
      const ring = surfaceRing(surf.positions);
      expect(polygonIsSimple(ring)).toBe(true);

      // (b) Every emitted triangle winds +Y with real area.
      let triArea = 0;
      for (let t = 0; t < surf.indices.length; t += 3) {
        const ny = triNormalY(surf.positions, surf.indices[t]!, surf.indices[t + 1]!, surf.indices[t + 2]!);
        expect(ny).toBeGreaterThan(1e-6);
        triArea += ny / 2;
      }

      // (c) Total covered area equals the boundary's shoelace area (no double-covered slivers/gaps).
      const boundaryArea = Math.abs(shoelaceArea(ring));
      expect(triArea).toBeGreaterThan(0);
      expect(Math.abs(triArea - boundaryArea) / boundaryArea).toBeLessThan(1e-4);

      // Every approach corner appears on the ring (seam weld intact; ring is float32-stored).
      const onRing = (x: number, z: number) =>
        ring.some((p) => Math.hypot(p[0]! - x, p[1]! - z) < 1e-3);
      for (const ap of approaches) {
        expect(onRing(ap.left[0], ap.left[2])).toBe(true);
        expect(onRing(ap.right[0], ap.right[2])).toBe(true);
      }
    });
  }
});

describe("trimBandAtJunctions (defect 3: sidewalk/parallel-band trimming)", () => {
  test("a band parallel to a through-road is cut into two sub-paths around a 4-way junction", () => {
    // apron radius = maxHalf(4) + curbReturn(4) + margin(1) + bandHalf(1.5) = 10.5.
    const band: [number, number][] = [
      [-40, 6],
      [40, 6],
    ];
    const subs = trimBandAtJunctions(band, 3, [crossJunction(8)]);
    expect(subs.length).toBe(2);
    // Cut where x² + 6² = 10.5² → |x| = sqrt(110.25 − 36) ≈ 8.617.
    const boundaryX = Math.sqrt(10.5 * 10.5 - 36);
    const near = subs.find((s) => s[0]![0] < 0)!;
    const far = subs.find((s) => s[0]![0] >= 0)!;
    expect(near[near.length - 1]![0]).toBeCloseTo(-boundaryX, 6);
    expect(far[0]![0]).toBeCloseTo(boundaryX, 6);
    // No surviving point sits inside the apron circle.
    for (const sub of subs) {
      for (const p of sub) expect(Math.hypot(p[0], p[1])).toBeGreaterThan(10.5 - 1e-6);
    }
  });

  test("a band far from every junction passes through untouched", () => {
    const band: [number, number][] = [
      [-40, 100],
      [40, 100],
    ];
    const subs = trimBandAtJunctions(band, 3, [crossJunction(8)]);
    expect(subs.length).toBe(1);
    expect(subs[0]).toEqual([
      [-40, 100],
      [40, 100],
    ]);
  });

  test("clearance widens the apron, moving the cut farther out", () => {
    const band: [number, number][] = [
      [-40, 6],
      [40, 6],
    ];
    const tight = trimBandAtJunctions(band, 3, [crossJunction(8)]);
    const wide = trimBandAtJunctions(band, 3, [crossJunction(8)], { clearance: 5 });
    const tightGap = tight.find((s) => s[0]![0] >= 0)![0]![0];
    const wideGap = wide.find((s) => s[0]![0] >= 0)![0]![0];
    expect(wideGap).toBeGreaterThan(tightGap);
  });

  test("no junctions leaves the band intact", () => {
    const band: [number, number][] = [
      [0, 0],
      [10, 0],
      [20, 5],
    ];
    const subs = trimBandAtJunctions(band, 3, []);
    expect(subs.length).toBe(1);
    expect(subs[0]!.length).toBe(3);
  });
});
