import { describe, expect, test } from "bun:test";
import { environment, road } from "./features";
import { summarizeEnvironment } from "./environmentSummary";
import {
  GROUND_DECAL_LAYERS,
  buildIntersectionMarkings,
  buildJunctionConnector,
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
  test("cuts an approach back by the projected crossing half-width (not curb-return)", () => {
    // Orthogonal equal-width: apron = half-width (4) + default margin (0.25) = 4.25.
    // Curb returns are exterior arcs only — they must not inflate the mouth distance.
    const trimmed = trimPathAtJunctions([[0, 0], [30, 0]], 8, [crossJunction(8)]);
    expect(trimmed.length).toBe(1);
    const road = trimmed[0]!;
    expect(road.cuts.length).toBe(1);
    const cut = road.cuts[0]!;
    expect(cut.at).toBe("start");
    expect(cut.apron).toBeCloseTo(4.25, 9);
    expect(cut.center[0]).toBeCloseTo(4.25, 9);
    expect(cut.center[1]).toBeCloseTo(0, 9);
    expect(road.path[0]![0]).toBeCloseTo(4.25, 9);
    expect(cut.left[0]).toBeCloseTo(4.25, 9);
    expect(cut.left[1]).toBeCloseTo(4, 9);
    expect(cut.right[0]).toBeCloseTo(4.25, 9);
    expect(cut.right[1]).toBeCloseTo(-4, 9);
  });

  test("a through-street splits into two independently-trimmed sub-paths", () => {
    const trimmed = trimPathAtJunctions([[-30, 0], [0, 0], [30, 0]], 8, [crossJunction(8)]);
    expect(trimmed.length).toBe(2);
    const left = trimmed.find((t) => t.path[0]![0] < 0)!;
    const right = trimmed.find((t) => t.path[0]![0] >= 0)!;
    // Left run ends at −4.25, right run starts at +4.25 (carriageway-union mouths).
    expect(left.path[left.path.length - 1]![0]).toBeCloseTo(-4.25, 9);
    expect(left.cuts[0]!.at).toBe("end");
    expect(right.path[0]![0]).toBeCloseTo(4.25, 9);
    expect(right.cuts[0]!.at).toBe("start");
  });

  test("unequal-width junction pulls only the narrow approaches back farther", () => {
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
    // Narrow +x: crossing arms include the 20-wide boulevard (sin 90° = 1) → 10 + 0.25.
    // Opposite collinear −x is NOT a crosser, so it no longer inflates every arm to max half-width.
    const narrow = trimPathAtJunctions([[0, 0], [40, 0]], 8, [junction])[0]!;
    expect(narrow.cuts[0]!.apron).toBeCloseTo(10.25, 9);
    // Wide +z: clears the 8-wide streets only → 4 + 0.25.
    const wide = trimPathAtJunctions([[0, 0], [0, 40]], 20, [junction])[0]!;
    expect(wide.cuts[0]!.apron).toBeCloseTo(4.25, 9);
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

  test("curb-return fillets stay compact and bow outward of the mouth chord", () => {
    // Deliberately leave a gap between adjacent equal-width mouths so a return is emitted.
    const approaches = [
      { center: [6, 0] as const, left: [6, 0, 4] as const, right: [6, 0, -4] as const, width: 8, direction: [1, 0] as const },
      { center: [0, 6] as const, left: [4, 0, 6] as const, right: [-4, 0, 6] as const, width: 8, direction: [0, 1] as const },
      { center: [-6, 0] as const, left: [-6, 0, 4] as const, right: [-6, 0, -4] as const, width: 8, direction: [-1, 0] as const },
      { center: [0, -6] as const, left: [4, 0, -6] as const, right: [-4, 0, -6] as const, width: 8, direction: [0, -1] as const },
    ];
    const surf = buildJunctionSurface({ x: 0, z: 0 }, approaches, flatH, { curbReturnRadius: 2, filletSegments: 6 });
    const ring = surfaceRing(surf.positions);
    expect(polygonIsSimple(ring)).toBe(true);
    // Compact: no ring vertex farther than the farthest mouth corner + a small return budget.
    const cornerExtent = Math.max(...approaches.flatMap((a) => [Math.hypot(a.left[0], a.left[2]), Math.hypot(a.right[0], a.right[2])]));
    expect(Math.max(...ring.map(([x, z]) => Math.hypot(x!, z!)))).toBeLessThanOrEqual(cornerExtent + 2.5);
    // At least one sampled fillet point sits strictly outside the axis-aligned mouth box.
    expect(ring.some(([x, z]) => Math.abs(x!) > 6.05 || Math.abs(z!) > 6.05)).toBe(true);
  });

  test("empty approaches yield no geometry", () => {
    const surf = buildJunctionSurface({ x: 0, z: 0 }, [], flatH);
    expect(surf.positions.length).toBe(0);
    expect(surf.indices.length).toBe(0);
  });
});

describe("buildTrimmedIntersections", () => {
  test("exposes approaches and connects linear dressing smoothly through a two-arm turn", () => {
    const turn: RoadJunctionInput = {
      x: 0,
      z: 0,
      arms: [{ angle: Math.PI / 2, width: 8 }, { angle: 0, width: 8 }],
    };
    const result = buildTrimmedIntersections(
      [{ path: [[0, 0], [30, 0]], width: 8 }, { path: [[0, 0], [0, 30]], width: 8 }],
      [turn],
      flatH,
    );
    expect(result.junctionApproaches.length).toBe(1);
    const connector = buildJunctionConnector(turn, result.junctionApproaches[0]!, 10)!;
    expect(connector.length).toBe(11);
    expect(connector[0]).toEqual(result.junctionApproaches[0]![0]!.center);
    expect(connector[connector.length - 1]).toEqual(result.junctionApproaches[0]![1]!.center);
    expect(connector.some(([x, z]) => x > 0 && z > 0)).toBe(true);
    expect(buildJunctionConnector(turn, [...result.junctionApproaches[0]!, result.junctionApproaches[0]![0]!])).toBeNull();
  });

  test("a two-arm right-angle turn rounds both curbs without a diagonal cap", () => {
    const turn: RoadJunctionInput = {
      x: 0,
      z: 0,
      arms: [
        { angle: Math.PI / 2, width: 8 },
        { angle: 0, width: 8 },
      ],
    };
    const result = buildTrimmedIntersections(
      [
        { path: [[0, 0], [30, 0]], width: 8 },
        { path: [[0, 0], [0, 30]], width: 8 },
      ],
      [turn],
      flatH,
      { filletSegments: 8 },
    );
    expect(result.ribbons.length).toBe(2);
    expect(result.junctions.length).toBe(1);
    const ring = surfaceRing(result.junctions[0]!.positions);
    expect(polygonIsSimple(ring)).toBe(true);
    // Both the inside (+,+) and outside (-,-) returns contain sampled curvature.
    expect(ring.filter(([x, z]) => x! > 0 && z! > 0).length).toBeGreaterThan(3);
    expect(ring.some(([x, z]) => x! < 0 && z! < 0)).toBe(true);
    for (let t = 0; t < result.junctions[0]!.indices.length; t += 3) {
      const surface = result.junctions[0]!;
      expect(triNormalY(surface.positions, surface.indices[t]!, surface.indices[t + 1]!, surface.indices[t + 2]!)).toBeGreaterThan(1e-6);
    }
  });

  test("a near-parallel two-arm seam stays compact instead of following a remote tangent intersection", () => {
    const separation = (5 * Math.PI) / 180;
    const junction: RoadJunctionInput = {
      x: 0,
      z: 0,
      arms: [
        { angle: Math.PI / 2, width: 8 },
        { angle: Math.PI / 2 - separation, width: 8 },
      ],
    };
    const result = buildTrimmedIntersections(
      [
        { path: [[0, 0], [40, 0]], width: 8 },
        { path: [[0, 0], [40 * Math.cos(separation), 40 * Math.sin(separation)]], width: 8 },
      ],
      [junction],
      flatH,
      { filletSegments: 8 },
    );
    const ring = surfaceRing(result.junctions[0]!.positions);
    expect(polygonIsSimple(ring)).toBe(true);
    expect(Math.max(...ring.map(([x, z]) => Math.hypot(x, z)))).toBeLessThan(14);
  });

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

function meshAreaXZ(mesh: { positions: Float32Array; indices: Uint32Array }): number {
  let area = 0;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    area += Math.abs(triNormalY(mesh.positions, mesh.indices[i]!, mesh.indices[i + 1]!, mesh.indices[i + 2]!)) / 2;
  }
  return area;
}

function ribbonCenters(pos: Float32Array): number[][] {
  const centers: number[][] = [];
  for (let i = 0; i < pos.length / 6; i += 1) {
    centers.push([(pos[i * 6]! + pos[i * 6 + 3]!) / 2, (pos[i * 6 + 2]! + pos[i * 6 + 5]!) / 2]);
  }
  return centers;
}

function meshComponents(mesh: { positions: Float32Array; indices: Uint32Array }): number {
  const adjacency = Array.from({ length: mesh.positions.length / 3 }, () => new Set<number>());
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const tri = [mesh.indices[i]!, mesh.indices[i + 1]!, mesh.indices[i + 2]!];
    for (let a = 0; a < 3; a += 1) for (let b = a + 1; b < 3; b += 1) {
      adjacency[tri[a]!]!.add(tri[b]!);
      adjacency[tri[b]!]!.add(tri[a]!);
    }
  }
  const seen = new Set<number>();
  let components = 0;
  for (let start = 0; start < adjacency.length; start += 1) {
    if (seen.has(start) || adjacency[start]!.size === 0) continue;
    components += 1;
    const queue = [start];
    seen.add(start);
    while (queue.length > 0) {
      for (const next of adjacency[queue.pop()!]!) if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return components;
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
        const left = ring.findIndex((p) => Math.hypot(p[0]! - ap.left[0], p[1]! - ap.left[2]) < 1e-3);
        const right = ring.findIndex((p) => Math.hypot(p[0]! - ap.right[0], p[1]! - ap.right[2]) < 1e-3);
        expect(Math.abs(left - right) === 1 || Math.abs(left - right) === ring.length - 1).toBe(true);
      }

      // Curb returns may bow toward the crossing, never beyond the furthest trimmed approach corner.
      const cornerExtent = Math.max(...approaches.flatMap((ap) => [Math.hypot(ap.left[0], ap.left[2]), Math.hypot(ap.right[0], ap.right[2])]));
      expect(Math.max(...ring.map((p) => Math.hypot(p[0]!, p[1]!)))).toBeLessThanOrEqual(cornerExtent + 1e-3);
    });
  }
});

describe("trimBandAtJunctions (defect 3: sidewalk/parallel-band trimming)", () => {
  test("a band parallel to a through-road is cut into two sub-paths around a 4-way junction", () => {
    // radius = maxHalf(4) + margin(0.25) + bandHalf(1.5) + curbAllow(min(2, 0.35*8)=2) = 7.75.
    const band: [number, number][] = [
      [-40, 6],
      [40, 6],
    ];
    const subs = trimBandAtJunctions(band, 3, [crossJunction(8)]);
    expect(subs.length).toBe(2);
    const r = 4 + 0.25 + 1.5 + 2;
    const boundaryX = Math.sqrt(r * r - 36);
    const near = subs.find((s) => s[0]![0] < 0)!;
    const far = subs.find((s) => s[0]![0] >= 0)!;
    expect(near[near.length - 1]![0]).toBeCloseTo(-boundaryX, 6);
    expect(far[0]![0]).toBeCloseTo(boundaryX, 6);
    for (const sub of subs) {
      for (const p of sub) expect(Math.hypot(p[0], p[1])).toBeGreaterThan(r - 1e-6);
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

describe("shared intersection dressing geometry", () => {
  const armPath = (angle: number, length = 40): readonly [readonly [number, number], readonly [number, number]] => [
    [0, 0],
    [Math.sin(angle) * length, Math.cos(angle) * length],
  ];

  test("omitted declarations preserve pavement-only behavior and emit no dressing", () => {
    const result = buildTrimmedIntersections(
      [{ path: armPath(0), width: 8 }, { path: armPath(Math.PI / 2), width: 8 }],
      [{ x: 0, z: 0, arms: [{ angle: 0, width: 8 }, { angle: Math.PI / 2, width: 8 }] }],
      flatH,
    );
    expect(result.ribbons.length).toBe(2);
    expect(result.junctions.length).toBe(1);
    expect(result.sidewalks).toEqual([]);
    expect(result.sidewalkAprons).toEqual([]);
    expect(buildIntersectionMarkings(result, flatH)).toEqual([]);
  });

  for (const degrees of [45, 90]) {
    test(`${degrees}-degree marking turn is tangent-continuous and preserves positive/negative offsets`, () => {
      const angle = (degrees * Math.PI) / 180;
      const marking = { lines: [{ offset: 1.5, width: 0.2 }, { offset: -1.5, width: 0.2 }] };
      const junction: RoadJunctionInput = {
        x: 0,
        z: 0,
        arms: [{ angle: 0, width: 10 }, { angle, width: 10 }],
      };
      const result = buildTrimmedIntersections(
        [{ path: armPath(0), width: 10, markings: marking }, { path: armPath(angle), width: 10, markings: marking }],
        [junction],
        flatH,
      );
      const paint = buildIntersectionMarkings(result, flatH, { connectorSegments: 64, maxSegmentLength: 100 });
      expect(paint.length).toBe(6); // four approach ribbons + two junction connectors
      const approaches = result.junctionApproaches[0]!;
      expect(approaches.every((a) => a.direction !== undefined && a.sourceTangent !== undefined && a.streetIndex !== undefined)).toBe(true);
      const usedStart = new Set<number>();
      const usedEnd = new Set<number>();
      for (let line = 0; line < 2; line += 1) {
        const connector = ribbonCenters(paint[4 + line]!.positions);
        const start = connector[0]!;
        const end = connector[connector.length - 1]!;
        const startLines = [ribbonCenters(paint[0]!.positions)[0]!, ribbonCenters(paint[1]!.positions)[0]!];
        const endLines = [ribbonCenters(paint[2]!.positions)[0]!, ribbonCenters(paint[3]!.positions)[0]!];
        const startIndex = Math.hypot(start[0]! - startLines[0]![0]!, start[1]! - startLines[0]![1]!) < 1e-5 ? 0 : 1;
        const endIndex = Math.hypot(end[0]! - endLines[0]![0]!, end[1]! - endLines[0]![1]!) < 1e-5 ? 0 : 1;
        expect(Math.hypot(start[0]! - startLines[startIndex]![0]!, start[1]! - startLines[startIndex]![1]!)).toBeLessThan(1e-5);
        expect(Math.hypot(end[0]! - endLines[endIndex]![0]!, end[1]! - endLines[endIndex]![1]!)).toBeLessThan(1e-5);
        expect(usedStart.has(startIndex)).toBe(false);
        expect(usedEnd.has(endIndex)).toBe(false);
        usedStart.add(startIndex);
        usedEnd.add(endIndex);
        const first = connector[1]!;
        const last = connector[connector.length - 2]!;
        const startTangent = [first[0]! - start[0]!, first[1]! - start[1]!];
        const endTangent = [end[0]! - last[0]!, end[1]! - last[1]!];
        const aDirection = approaches[0]!.direction!;
        const bDirection = approaches[1]!.direction!;
        expect((startTangent[0]! * -aDirection[0] + startTangent[1]! * -aDirection[1]) / Math.hypot(...startTangent as [number, number])).toBeGreaterThan(0.995);
        expect((endTangent[0]! * bDirection[0] + endTangent[1]! * bDirection[1]) / Math.hypot(...endTangent as [number, number])).toBeGreaterThan(0.995);
      }
      const positiveStart = ribbonCenters(paint[4]!.positions)[0]!;
      const negativeStart = ribbonCenters(paint[5]!.positions)[0]!;
      expect(Math.hypot(positiveStart[0]! - negativeStart[0]!, positiveStart[1]! - negativeStart[1]!)).toBeCloseTo(3, 4);
    });
  }

  test("a curved approach uses its sampled cut tangent instead of the node-to-mouth chord", () => {
    const marking = { lines: [{ offset: 1, width: 0.2 }] };
    const junction: RoadJunctionInput = {
      x: 0,
      z: 0,
      arms: [{ angle: 0, width: 8 }, { angle: Math.PI / 2, width: 8 }],
    };
    // Bend finishes before the compact mouth (~4.25) so the cut lands on the vertical run.
    const result = buildTrimmedIntersections(
      [
        { path: [[0, 0], [2, 2], [2, 40]], width: 8, markings: marking },
        { path: armPath(Math.PI / 2), width: 8, markings: marking },
      ],
      [junction],
      flatH,
    );
    const curved = result.junctionApproaches[0]![0]!;
    expect(curved.direction?.[0]).toBeCloseTo(0, 8);
    expect(curved.direction?.[1]).toBeCloseTo(1, 8);
    expect(curved.center[0]).toBeCloseTo(2, 8); // radial inference would incorrectly point diagonally
    const connector = ribbonCenters(buildIntersectionMarkings(result, flatH, { connectorSegments: 64, maxSegmentLength: 100 })[2]!.positions);
    const tangent = [connector[1]![0]! - connector[0]![0]!, connector[1]![1]! - connector[0]![1]!];
    expect(Math.abs(tangent[0]! / Math.hypot(...tangent as [number, number]))).toBeLessThan(0.02);
    expect(tangent[1]).toBeLessThan(0);
  });

  test("straight two-arm joins pair signed offsets by physical side without crossing", () => {
    const marking = { lines: [{ offset: 1.5, width: 0.2 }, { offset: -1.5, width: 0.2 }] };
    const result = buildTrimmedIntersections(
      [
        { path: armPath(Math.PI / 2), width: 10, markings: marking },
        { path: armPath(-Math.PI / 2), width: 10, markings: marking },
      ],
      [{ x: 0, z: 0, arms: [{ angle: Math.PI / 2, width: 10 }, { angle: -Math.PI / 2, width: 10 }] }],
      flatH,
    );
    const paint = buildIntersectionMarkings(result, flatH, { connectorSegments: 32, maxSegmentLength: 100 });
    expect(paint.length).toBe(6);
    const connectorA = ribbonCenters(paint[4]!.positions);
    const connectorB = ribbonCenters(paint[5]!.positions);
    expect(connectorA.every((point) => Math.abs(point[1]! - connectorA[0]![1]!) < 1e-5)).toBe(true);
    expect(connectorB.every((point) => Math.abs(point[1]! - connectorB[0]![1]!) < 1e-5)).toBe(true);
    expect(connectorA[0]![1]! * connectorB[0]![1]!).toBeLessThan(0);
  });

  test("public tessellation controls are finite and bounded", () => {
    const marking = { lines: [{ offset: 0, width: 0.2 }] };
    const result = buildTrimmedIntersections(
      [{ path: armPath(0), width: 8, markings: marking }, { path: armPath(Math.PI / 2), width: 8, markings: marking }],
      [{ x: 0, z: 0, arms: [{ angle: 0, width: 8 }, { angle: Math.PI / 2, width: 8 }] }],
      flatH,
    );
    expect(buildJunctionConnector({ x: 0, z: 0 }, result.junctionApproaches[0]!, Infinity)!.length).toBe(9);
    const paint = buildIntersectionMarkings(result, flatH, { connectorSegments: Infinity, maxSegmentLength: 0 });
    expect(paint.length).toBe(3);
    expect(paint.reduce((sum, mesh) => sum + mesh.positions.length, 0)).toBeLessThan(10_000);
    expect(paint.every((mesh) => [...mesh.positions].every(Number.isFinite))).toBe(true);
  });

  for (const degree of [3, 4]) {
    test(`unequal-width ${degree === 3 ? "T" : "cross"} has non-overlapping sidewalk mouths and intentional paint termination`, () => {
      const angles = degree === 3 ? [0, Math.PI / 2, -Math.PI / 2] : [0, Math.PI / 2, Math.PI, -Math.PI / 2];
      const widths = degree === 3 ? [16, 8, 8] : [16, 8, 12, 6];
      const streets = angles.map((angle, i) => ({
        path: armPath(angle),
        width: widths[i]!,
        sidewalks: { left: 2 + i * 0.25, right: 3 + i * 0.25 },
        markings: { lines: [{ offset: 0, width: 0.2 }], stopLine: true },
      }));
      const junction = { x: 0, z: 0, arms: angles.map((angle, i) => ({ angle, width: widths[i]! })) };
      const slope = (x: number, z: number) => x * 0.07 - z * 0.04;
      const result = buildTrimmedIntersections(streets, [junction], slope, { filletSegments: 6 });
      expect(result.sidewalks.length).toBe(degree * 2);
      expect(result.sidewalkAprons.length).toBe(1);
      const apron = result.sidewalkAprons[0]!;
      expect(apron.indices.length).toBeGreaterThan(0);
      // One indexed curb-return component per corner; road-mouth openings connect to the side bands.
      expect(meshComponents(apron)).toBe(degree);
      for (let t = 0; t < apron.indices.length; t += 3) {
        expect(triNormalY(apron.positions, apron.indices[t]!, apron.indices[t + 1]!, apron.indices[t + 2]!)).toBeGreaterThan(1e-6);
      }
      // Every pavement mouth corner is the inner apron edge and a road-side sidewalk edge: no overlap or gap.
      for (const ap of result.junctionApproaches[0]!) {
        for (const corner of [ap.left, ap.right]) {
          const inApron = Array.from({ length: apron.positions.length / 3 }, (_, v) => v).some(
            (v) => Math.hypot(apron.positions[v * 3]! - corner[0], apron.positions[v * 3 + 2]! - corner[2]) < 1e-5,
          );
          expect(inApron).toBe(true);
        }
      }
      const apronHas = (x: number, z: number) =>
        Array.from({ length: apron.positions.length / 3 }, (_, v) => v).some(
          (v) => Math.hypot(apron.positions[v * 3]! - x, apron.positions[v * 3 + 2]! - z) < 1e-5,
        );
      for (const sidewalk of result.sidewalks) {
        // Every arm starts at the junction in this fixture. Both the pavement-edge and outer-edge
        // vertices of each side band must be reused by the annular apron: no gap or overlap cap.
        expect(apronHas(sidewalk.positions[0]!, sidewalk.positions[2]!)).toBe(true);
        expect(apronHas(sidewalk.positions[3]!, sidewalk.positions[5]!)).toBe(true);
        for (let t = 0; t < sidewalk.indices.length; t += 3) {
          expect(triNormalY(sidewalk.positions, sidewalk.indices[t]!, sidewalk.indices[t + 1]!, sidewalk.indices[t + 2]!)).toBeGreaterThan(1e-6);
        }
      }
      const paint = buildIntersectionMarkings(result, slope, { mouthClearance: 2 });
      expect(paint.length).toBe(degree * 2); // one shortened longitudinal line + one stop line per arm
      for (const mesh of [...result.sidewalks, apron, ...paint]) {
        for (let v = 0; v * 3 + 2 < mesh.positions.length; v += 1) {
          const x = mesh.positions[v * 3]!;
          const z = mesh.positions[v * 3 + 2]!;
          const layer = paint.includes(mesh) ? GROUND_DECAL_LAYERS.marking : GROUND_DECAL_LAYERS.road;
          expect(mesh.positions[v * 3 + 1]).toBeCloseTo(slope(x, z) + layer, 5);
        }
      }
    });
  }

  test("five-way pavement and sidewalk apron stay compact with bounded area and extent", () => {
    const angles = [0, 0.9, 2.1, 3.4, 5.0];
    const widths = [8, 18, 6, 14, 10];
    const streets = angles.map((angle, i) => ({
      path: armPath(angle, 60),
      width: widths[i]!,
      sidewalks: { left: 2, right: 3 },
    }));
    const result = buildTrimmedIntersections(
      streets,
      [{ x: 0, z: 0, arms: angles.map((angle, i) => ({ angle, width: widths[i]! })) }],
      flatH,
      { curbReturnRadius: 2, apronMargin: 0.25, filletSegments: 6 },
    );
    const pavement = result.junctions[0]!;
    const apron = result.sidewalkAprons[0]!;
    const extent = (mesh: { positions: Float32Array }) => {
      let max = 0;
      for (let v = 0; v * 3 + 2 < mesh.positions.length; v += 1) max = Math.max(max, Math.hypot(mesh.positions[v * 3]!, mesh.positions[v * 3 + 2]!));
      return max;
    };
    // Compact relative to the old R-inflated apron (~20–23 extent / 900 area).
    expect(extent(pavement)).toBeLessThan(18);
    expect(extent(apron)).toBeLessThan(22);
    expect(meshAreaXZ(pavement)).toBeLessThan(600);
    expect(meshAreaXZ(apron)).toBeLessThan(320);
    for (let v = 0; v * 3 + 2 < apron.positions.length; v += 1) {
      expect(Math.hypot(apron.positions[v * 3]!, apron.positions[v * 3 + 2]!)).toBeGreaterThan(2);
    }
  });

  test("equal cross is a compact W×W conflict area, not a plaza disc", () => {
    const width = 8;
    const result = buildTrimmedIntersections(
      [
        { path: [[-40, 0], [0, 0], [40, 0]], width, sidewalks: { left: 2, right: 2 }, markings: { lines: [{ offset: 0, width: 0.2 }], stopLine: true } },
        { path: [[0, -40], [0, 0], [0, 40]], width, sidewalks: { left: 2, right: 2 }, markings: { lines: [{ offset: 0, width: 0.2 }], stopLine: true } },
      ],
      [crossJunction(width)],
      flatH,
      { curbReturnRadius: 2, apronMargin: 0.25, filletSegments: 6 },
    );
    const pavement = result.junctions[0]!;
    const ring = surfaceRing(pavement.positions);
    expect(polygonIsSimple(ring)).toBe(true);
    // Mouths sit near half-width; area stays near W² (≤ 1.6× for returns/margin).
    for (const ap of result.junctionApproaches[0]!) {
      expect(Math.hypot(ap.center[0], ap.center[1])).toBeLessThan(width * 0.6);
    }
    expect(meshAreaXZ(pavement)).toBeLessThan(width * width * 1.6);
    expect(Math.max(...ring.map(([x, z]) => Math.hypot(x!, z!)))).toBeLessThan(width * 0.85);
  });

  test("T-junction reads as a through-road with one stub (straight far curb, compact stem)", () => {
    const result = buildTrimmedIntersections(
      [
        { path: [[-40, 0], [0, 0], [40, 0]], width: 8, sidewalks: { left: 2, right: 2 }, markings: { lines: [{ offset: 0, width: 0.2 }], stopLine: true } },
        { path: [[0, 0], [0, 40]], width: 8, sidewalks: { left: 2, right: 2 }, markings: { lines: [{ offset: 0, width: 0.2 }], stopLine: true } },
      ],
      [{ x: 0, z: 0, arms: [{ angle: Math.PI / 2, width: 8 }, { angle: -Math.PI / 2, width: 8 }, { angle: 0, width: 8 }] }],
      flatH,
      { curbReturnRadius: 2, apronMargin: 0.25, filletSegments: 6 },
    );
    expect(result.junctionApproaches[0]!.length).toBe(3);
    const ring = surfaceRing(result.junctions[0]!.positions);
    expect(polygonIsSimple(ring)).toBe(true);
    // South far curb of the through-road stays near z = −half-width (no semicircle plaza).
    const south = ring.filter(([_, z]) => z! < -2);
    expect(south.length).toBeGreaterThan(0);
    expect(Math.max(...south.map(([_, z]) => Math.abs(z! + 4)))).toBeLessThan(1.5);
    // No ring vertex deep into the empty southern half-plane.
    expect(Math.min(...ring.map(([_, z]) => z!))).toBeGreaterThan(-7);
    expect(meshAreaXZ(result.junctions[0]!)).toBeLessThan(120);
  });

  test("unequal cross does not inflate the wide boulevard mouth to its own half-width", () => {
    const result = buildTrimmedIntersections(
      [
        { path: [[-50, 0], [0, 0], [50, 0]], width: 18, sidewalks: { left: 2.2, right: 2.2 }, markings: { lines: [{ offset: 0, width: 0.2 }], stopLine: true } },
        { path: [[0, -50], [0, 0], [0, 50]], width: 8, sidewalks: { left: 2.2, right: 2.2 }, markings: { lines: [{ offset: 0, width: 0.2 }], stopLine: true } },
      ],
      [{
        x: 0,
        z: 0,
        arms: [
          { angle: Math.PI / 2, width: 18 },
          { angle: -Math.PI / 2, width: 18 },
          { angle: 0, width: 8 },
          { angle: Math.PI, width: 8 },
        ],
      }],
      flatH,
      { curbReturnRadius: 2, apronMargin: 0.25, filletSegments: 6 },
    );
    const approaches = result.junctionApproaches[0]!;
    const wide = approaches.filter((a) => a.width === 18);
    const narrow = approaches.filter((a) => a.width === 8);
    expect(wide.length).toBe(2);
    expect(narrow.length).toBe(2);
    // Wide mouths clear only the narrow half-width (~4.25), not the boulevard's own 9.
    for (const ap of wide) expect(Math.hypot(ap.center[0], ap.center[1])).toBeLessThan(5.5);
    // Narrow mouths clear the boulevard half-width (~9.25).
    for (const ap of narrow) {
      const d = Math.hypot(ap.center[0], ap.center[1]);
      expect(d).toBeGreaterThan(8.5);
      expect(d).toBeLessThan(10.5);
    }
    expect(meshAreaXZ(result.junctions[0]!)).toBeLessThan(220);
  });

  test("45° and 90° turns stay compact with continuous sidewalks and no diagonal-only cap", () => {
    for (const degrees of [45, 90] as const) {
      // Arm angles use atan2(dx, dz): +x = π/2, +z = 0, 45° between them = π/4.
      const secondAngle = degrees === 90 ? 0 : Math.PI / 4;
      const result = buildTrimmedIntersections(
        [
          { path: [[0, 0], [40, 0]], width: 8, sidewalks: { left: 2, right: 2 }, markings: { lines: [{ offset: 0, width: 0.2 }] } },
          {
            path: [[0, 0], [Math.sin(secondAngle) * 40, Math.cos(secondAngle) * 40]],
            width: 8,
            sidewalks: { left: 2, right: 2 },
            markings: { lines: [{ offset: 0, width: 0.2 }] },
          },
        ],
        [{ x: 0, z: 0, arms: [{ angle: Math.PI / 2, width: 8 }, { angle: secondAngle, width: 8 }] }],
        flatH,
        { curbReturnRadius: 2, apronMargin: 0.25, filletSegments: 8 },
      );
      expect(result.junctions.length).toBe(1);
      const ring = surfaceRing(result.junctions[0]!.positions);
      expect(polygonIsSimple(ring)).toBe(true);
      expect(Math.max(...ring.map(([x, z]) => Math.hypot(x!, z!)))).toBeLessThan(12);
      expect(result.sidewalks.length).toBe(4);
      expect(result.sidewalkAprons.length).toBe(1);
      expect(meshComponents(result.sidewalkAprons[0]!)).toBeGreaterThanOrEqual(1);
    }
  });
});
