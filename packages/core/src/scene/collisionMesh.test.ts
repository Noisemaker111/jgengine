import { describe, expect, test } from "bun:test";
import {
  encodeCollisionMesh,
  prepareCollisionMesh,
  raycastCollisionMesh,
  voxelizeToBoxes,
  type CollisionMeshData,
  type CollisionMeshSource,
  type PreparedCollisionMesh,
} from "@jgengine/core/scene/collisionMesh";

/** Append an axis-aligned box's 8 corners + 12 surface triangles (both windings) to a growing soup. */
function pushBox(
  soup: { positions: number[]; indices: number[] },
  min: readonly [number, number, number],
  max: readonly [number, number, number],
): void {
  const base = soup.positions.length / 3;
  for (let corner = 0; corner < 8; corner += 1) {
    soup.positions.push(
      (corner & 1) === 0 ? min[0] : max[0],
      (corner & 2) === 0 ? min[1] : max[1],
      (corner & 4) === 0 ? min[2] : max[2],
    );
  }
  // 6 faces, each a quad split into two triangles (corner bit order: x=1, y=2, z=4).
  const quads: readonly [number, number, number, number][] = [
    [0, 2, 3, 1], [4, 5, 7, 6], // z-min / z-max
    [0, 1, 5, 4], [2, 6, 7, 3], // y-min / y-max
    [0, 4, 6, 2], [1, 3, 7, 5], // x-min / x-max
  ];
  for (const [a, b, c, d] of quads) {
    soup.indices.push(base + a, base + b, base + c, base + a, base + c, base + d);
  }
}

/** Two pillars + a top lintel with an empty central gap — the canonical concave-arch decomposition case. */
function archSoup(): CollisionMeshSource {
  const soup = { positions: [] as number[], indices: [] as number[] };
  pushBox(soup, [0, 0, 0], [1, 4, 1]); // left pillar
  pushBox(soup, [3, 0, 0], [4, 4, 1]); // right pillar
  pushBox(soup, [0, 3, 0], [4, 4, 1]); // lintel spanning both, above the gap
  return soup;
}

function cubeSoup(): CollisionMeshSource {
  const soup = { positions: [] as number[], indices: [] as number[] };
  pushBox(soup, [0, 0, 0], [1, 1, 1]);
  return soup;
}

const MAJOR_SEGMENTS = 32;
const TUBE_SEGMENTS = 16;
const R = 1;
const TUBE_R = 0.3;

/**
 * Torus triangle soup (major radius 1, tube radius 0.3, hole axis along +Z, centered at origin). Rings
 * wrap by modulo so seam quads share their vertices — the reference torus its raycast numbers were
 * measured from.
 */
function torusSource(
  major = MAJOR_SEGMENTS,
  tube = TUBE_SEGMENTS,
  ringRadius = R,
  tubeRadius = TUBE_R,
): CollisionMeshSource {
  const positions: number[] = [];
  for (let i = 0; i < major; i += 1) {
    const a = (i / major) * Math.PI * 2;
    for (let j = 0; j < tube; j += 1) {
      const b = (j / tube) * Math.PI * 2;
      positions.push(
        Math.cos(a) * (ringRadius + Math.cos(b) * tubeRadius),
        Math.sin(a) * (ringRadius + Math.cos(b) * tubeRadius),
        Math.sin(b) * tubeRadius,
      );
    }
  }
  const vertexAt = (i: number, j: number): number => (i % major) * tube + (j % tube);
  const indices: number[] = [];
  for (let i = 0; i < major; i += 1) {
    for (let j = 0; j < tube; j += 1) {
      const a0b0 = vertexAt(i, j);
      const a1b0 = vertexAt(i + 1, j);
      const a0b1 = vertexAt(i, j + 1);
      const a1b1 = vertexAt(i + 1, j + 1);
      indices.push(a0b0, a1b0, a1b1, a0b0, a1b1, a0b1);
    }
  }
  return { positions, indices };
}

function encodeTorus(): CollisionMeshData {
  const data = encodeCollisionMesh(torusSource());
  if (data === null) throw new Error("torus failed to encode");
  return data;
}

function prepareTorus(): PreparedCollisionMesh {
  const prepared = prepareCollisionMesh(encodeTorus());
  if (prepared === null) throw new Error("torus failed to prepare");
  return prepared;
}

const IDENTITY_POS: readonly [number, number, number] = [0, 0, 0];
const NO_TRANSLATE: readonly [number, number, number] = [0, 0, 0];

describe("collisionMesh encode", () => {
  test("round-trips a torus with sane counts and bounds", () => {
    const data = encodeTorus();
    expect(data.vertexCount).toBe(MAJOR_SEGMENTS * TUBE_SEGMENTS);
    expect(data.triangleCount).toBe(MAJOR_SEGMENTS * TUBE_SEGMENTS * 2);
    expect(data.min[0]).toBeCloseTo(-(R + TUBE_R), 3);
    expect(data.max[0]).toBeCloseTo(R + TUBE_R, 3);
    expect(data.min[1]).toBeCloseTo(-(R + TUBE_R), 3);
    expect(data.max[1]).toBeCloseTo(R + TUBE_R, 3);
    expect(data.min[2]).toBeCloseTo(-TUBE_R, 3);
    expect(data.max[2]).toBeCloseTo(TUBE_R, 3);
  });

  test("welds coincident vertices", () => {
    // A quad whose two shared corners are supplied twice — welding folds 6 vertices onto 4.
    const source: CollisionMeshSource = {
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
      indices: [0, 1, 2, 3, 4, 5],
    };
    const data = encodeCollisionMesh(source);
    expect(data).not.toBeNull();
    expect(source.positions.length / 3).toBe(6);
    expect(data!.vertexCount).toBe(4);
    expect(data!.triangleCount).toBe(2);
  });

  test("attaches a voxelized box decomposition alongside the triangles", () => {
    const data = encodeCollisionMesh(cubeSoup());
    expect(data).not.toBeNull();
    expect(data!.boxes).toBeDefined();
    expect(data!.boxes!.length).toBe(1);
  });

  test("empty and all-degenerate soups encode to null", () => {
    expect(encodeCollisionMesh({ positions: [], indices: [] })).toBeNull();
    // Three coincident vertices collapse to one, dropping the only triangle.
    expect(
      encodeCollisionMesh({ positions: [0, 0, 0, 0, 0, 0, 0, 0, 0], indices: [0, 1, 2] }),
    ).toBeNull();
    // Two shared vertices leave a degenerate triangle that is dropped.
    expect(
      encodeCollisionMesh({ positions: [0, 0, 0, 1, 1, 1, 0, 0, 0], indices: [0, 1, 2] }),
    ).toBeNull();
  });
});

function contains(
  box: { min: readonly [number, number, number]; max: readonly [number, number, number] },
  p: readonly [number, number, number],
): boolean {
  return (
    p[0] >= box.min[0] && p[0] <= box.max[0] &&
    p[1] >= box.min[1] && p[1] <= box.max[1] &&
    p[2] >= box.min[2] && p[2] <= box.max[2]
  );
}

describe("voxelizeToBoxes", () => {
  test("a solid unit cube collapses to a single enclosing box", () => {
    const boxes = voxelizeToBoxes(cubeSoup());
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.min[0]).toBeCloseTo(0, 6);
    expect(boxes[0]!.min[1]).toBeCloseTo(0, 6);
    expect(boxes[0]!.min[2]).toBeCloseTo(0, 6);
    expect(boxes[0]!.max[0]).toBeCloseTo(1, 6);
    expect(boxes[0]!.max[1]).toBeCloseTo(1, 6);
    expect(boxes[0]!.max[2]).toBeCloseTo(1, 6);
  });

  test("an arch keeps its central gap empty while filling pillars + lintel", () => {
    const boxes = voxelizeToBoxes(archSoup());
    // Pillars, lintel, and the sill-less gap decompose into several boxes.
    expect(boxes.length).toBeGreaterThanOrEqual(3);
    expect(boxes.length).toBeLessThanOrEqual(32);
    // The middle of the opening (x=2, well below the lintel) is inside NO box — a capsule walks through it.
    const gapMidpoint: readonly [number, number, number] = [2, 1.5, 0.5];
    expect(boxes.some((box) => contains(box, gapMidpoint))).toBe(false);
    // A pillar interior and the lintel are solid.
    expect(boxes.some((box) => contains(box, [0.5, 2, 0.5]))).toBe(true);
    expect(boxes.some((box) => contains(box, [2, 3.5, 0.5]))).toBe(true);
  });

  test("is deterministic — re-running yields identical boxes", () => {
    expect(voxelizeToBoxes(archSoup())).toEqual(voxelizeToBoxes(archSoup()));
  });

  test("respects a small maxBoxes cap, folding the remainder into one enclosing AABB", () => {
    const boxes = voxelizeToBoxes(archSoup(), 0.25, 2);
    expect(boxes.length).toBeLessThanOrEqual(2);
    expect(boxes.length).toBeGreaterThan(0);
  });

  test("degenerate and empty input yield no boxes", () => {
    expect(voxelizeToBoxes({ positions: [], indices: [] })).toEqual([]);
    // A single collapsed point has zero span on every axis.
    expect(voxelizeToBoxes({ positions: [1, 1, 1, 1, 1, 1, 1, 1, 1], indices: [0, 1, 2] })).toEqual([]);
    // Non-positive cell size bails.
    expect(voxelizeToBoxes(cubeSoup(), 0)).toEqual([]);
  });
});

describe("collisionMesh prepare", () => {
  test("returns null for malformed payloads", () => {
    const good = encodeTorus();
    // Non-base64 characters in the position stream.
    expect(prepareCollisionMesh({ ...good, positions: "@@@@@@@@" })).toBeNull();
    // Declared vertex count no longer matches the decoded byte length.
    expect(prepareCollisionMesh({ ...good, vertexCount: good.vertexCount + 7 })).toBeNull();
    // Truncated position payload.
    expect(prepareCollisionMesh({ ...good, positions: good.positions.slice(0, 8) })).toBeNull();
    // Sub-triangle vertex count is rejected outright.
    expect(prepareCollisionMesh({ ...good, vertexCount: 2 })).toBeNull();
  });

  test("memoizes per data object", () => {
    const data = encodeTorus();
    const first = prepareCollisionMesh(data);
    const second = prepareCollisionMesh(data);
    expect(first).not.toBeNull();
    expect(second).toBe(first);
    // A distinct object with identical content is a separate build.
    const clone = prepareCollisionMesh({ ...data });
    expect(clone).not.toBe(first);
  });
});

describe("collisionMesh raycast", () => {
  test("passes through the hole and hits the ring at reference distances", () => {
    const mesh = prepareTorus();
    const through = raycastCollisionMesh(mesh, [0, 0, -5], [0, 0, 1], 100, IDENTITY_POS, 0, 1, NO_TRANSLATE);
    expect(through).toBeNull();
    const ring = raycastCollisionMesh(mesh, [1, 0, -5], [0, 0, 1], 100, IDENTITY_POS, 0, 1, NO_TRANSLATE);
    expect(ring?.distance).toBeCloseTo(4.7, 1);
    const side = raycastCollisionMesh(mesh, [-5, 0, 0], [1, 0, 0], 100, IDENTITY_POS, 0, 1, NO_TRANSLATE);
    expect(side?.distance).toBeCloseTo(3.7, 1);
  });

  test("rotationY of pi/2 swaps the through-hole and ring outcomes", () => {
    const mesh = prepareTorus();
    const yaw = Math.PI / 2;
    // The +Z hole axis rotates to +X: the Z-ray now strikes the ring, the X-ray clears the hole.
    const zRay = raycastCollisionMesh(mesh, [0, 0, -5], [0, 0, 1], 100, IDENTITY_POS, yaw, 1, NO_TRANSLATE);
    expect(zRay?.distance).toBeCloseTo(3.7, 1);
    const xRay = raycastCollisionMesh(mesh, [-5, 0, 0], [1, 0, 0], 100, IDENTITY_POS, yaw, 1, NO_TRANSLATE);
    expect(xRay).toBeNull();
  });

  test("respects scale + position placement", () => {
    const mesh = prepareTorus();
    const pos: readonly [number, number, number] = [10, 5, 0];
    const ring = raycastCollisionMesh(mesh, [12, 5, -9], [0, 0, 1], 100, pos, 0, 2, NO_TRANSLATE);
    expect(ring?.distance).toBeCloseTo(8.4, 1);
    const through = raycastCollisionMesh(mesh, [10, 5, -9], [0, 0, 1], 100, pos, 0, 2, NO_TRANSLATE);
    expect(through).toBeNull();
  });

  test("meshTranslate shifts the placed hole", () => {
    const mesh = prepareTorus();
    const translate: readonly [number, number, number] = [0.5, 0, 0];
    // The hole re-centers on world x = 0.5; the ring vertex sits at world x = 1.5.
    const through = raycastCollisionMesh(mesh, [0.5, 0, -5], [0, 0, 1], 100, IDENTITY_POS, 0, 1, translate);
    expect(through).toBeNull();
    const ring = raycastCollisionMesh(mesh, [1.5, 0, -5], [0, 0, 1], 100, IDENTITY_POS, 0, 1, translate);
    expect(ring?.distance).toBeCloseTo(4.7, 1);
  });

  test("front-hit normal faces back toward the ray origin", () => {
    const mesh = prepareTorus();
    const direction: readonly [number, number, number] = [0, 0, 1];
    const hit = raycastCollisionMesh(mesh, [1, 0, -5], direction, 100, IDENTITY_POS, 0, 1, NO_TRANSLATE);
    expect(hit).not.toBeNull();
    const dot = hit!.normal[0] * direction[0] + hit!.normal[1] * direction[1] + hit!.normal[2] * direction[2];
    expect(dot).toBeLessThan(0);
    // Front of the tube faces -Z toward the incoming ray.
    expect(hit!.normal[2]).toBeLessThan(0);
  });

  test("maxDistance cuts off hits beyond the ring", () => {
    const mesh = prepareTorus();
    const near = raycastCollisionMesh(mesh, [1, 0, -5], [0, 0, 1], 4, IDENTITY_POS, 0, 1, NO_TRANSLATE);
    expect(near).toBeNull();
    const far = raycastCollisionMesh(mesh, [1, 0, -5], [0, 0, 1], 5, IDENTITY_POS, 0, 1, NO_TRANSLATE);
    expect(far?.distance).toBeCloseTo(4.7, 1);
  });
});
