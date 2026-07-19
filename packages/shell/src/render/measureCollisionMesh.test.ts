import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { prepareCollisionMeshSource } from "@jgengine/core/scene/collisionMesh";

import { MEASURE_EXCLUDE_KEY } from "./measureBounds";
import { measureLocalCollisionTriangles } from "./measureCollisionMesh";

function box(width: number, height: number, depth: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshStandardMaterial());
}

function boundsOf(positions: Float32Array): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < positions.length; v += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[v + axis]!;
      if (value < min[axis]!) min[axis] = value;
      if (value > max[axis]!) max[axis] = value;
    }
  }
  return { min, max };
}

describe("measureLocalCollisionTriangles", () => {
  test("collects transformed triangles in the root's frame", () => {
    const root = new THREE.Group();
    const mesh = box(1, 2, 1);
    mesh.position.set(0, 1, 0);
    root.add(mesh);
    const triangles = measureLocalCollisionTriangles(root);
    expect(triangles).not.toBeNull();
    expect(triangles!.meshCount).toBe(1);
    expect(triangles!.triangleCount).toBe(12);
    const bounds = boundsOf(triangles!.positions);
    expect(bounds.min[1]).toBeCloseTo(0);
    expect(bounds.max[1]).toBeCloseTo(2);
    expect(bounds.max[0]).toBeCloseTo(0.5);
  });

  test("applies the uniform entity-local transform (model primitive scale + offset)", () => {
    const root = new THREE.Group();
    root.add(box(1, 1, 1));
    const triangles = measureLocalCollisionTriangles(root, { scale: 2, offset: [0, 3, 0] })!;
    const bounds = boundsOf(triangles.positions);
    expect(bounds.min[1]).toBeCloseTo(2);
    expect(bounds.max[1]).toBeCloseTo(4);
    expect(bounds.min[0]).toBeCloseTo(-1);
    expect(bounds.max[0]).toBeCloseTo(1);
  });

  test("skips sprites, invisible subtrees, and flagged subtrees", () => {
    const root = new THREE.Group();
    root.add(box(1, 1, 1));

    const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
    root.add(sprite);

    const hidden = box(50, 50, 50);
    hidden.visible = false;
    root.add(hidden);

    const gizmos = new THREE.Group();
    gizmos.userData[MEASURE_EXCLUDE_KEY] = true;
    gizmos.add(box(40, 40, 40));
    root.add(gizmos);

    const triangles = measureLocalCollisionTriangles(root)!;
    expect(triangles.meshCount).toBe(1);
    expect(triangles.triangleCount).toBe(12);
  });

  test("the collected soup prepares into a raycastable mesh", () => {
    const root = new THREE.Group();
    const mesh = box(1, 1, 1);
    mesh.position.set(0, 0.5, 0);
    root.add(mesh);
    const triangles = measureLocalCollisionTriangles(root)!;
    const prepared = prepareCollisionMeshSource(triangles);
    expect(prepared).not.toBeNull();
    expect(prepared!.indices.length).toBe(triangles.triangleCount * 3);
  });

  test("returns null when nothing measurable is mounted", () => {
    const root = new THREE.Group();
    root.add(new THREE.Group());
    expect(measureLocalCollisionTriangles(root)).toBeNull();
  });
});
