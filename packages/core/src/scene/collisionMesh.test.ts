import { describe, expect, test } from "bun:test";
import {
  encodeCollisionMesh,
  prepareCollisionMesh,
  raycastCollisionMesh,
  type CollisionMeshData,
  type CollisionMeshSource,
  type PreparedCollisionMesh,
} from "@jgengine/core/scene/collisionMesh";

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
