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
  trimPathAtJunctions,
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
