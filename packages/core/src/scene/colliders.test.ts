import { describe, expect, test } from "bun:test";
import {
  colliderBounds,
  defaultEntityColliders,
  defaultObjectColliders,
  fittedEntityColliders,
  fittedObjectColliders,
  resolveColliders,
  scaledEntityColliders,
  scaledObjectColliders,
  worldOffset,
} from "@jgengine/core/scene/colliders";
import { encodeCollisionMesh, type CollisionMeshData } from "@jgengine/core/scene/collisionMesh";

/** A valid decodable collision mesh (a real unit tetrahedron) with a known `boxes` array grafted on, so
 * the fitting math has something to scale/translate without depending on the voxelizer's exact output. */
function meshWithBoxes(boxes: CollisionMeshData["boxes"]): CollisionMeshData {
  const data = encodeCollisionMesh({
    positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
    indices: [0, 1, 2, 0, 1, 3, 0, 2, 3, 1, 2, 3],
  });
  if (data === null) throw new Error("tetra failed to encode");
  return { ...data, boxes };
}

describe("colliders", () => {
  test("default entity set is a non-blocking body-covering damage box", () => {
    const resolved = resolveColliders(defaultEntityColliders());
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.purpose).toBe("damage");
    expect(resolved[0]!.damageEligible).toBe(true);
    expect(resolved[0]!.blocks).toBe(false);
    const bounds = colliderBounds(resolved[0]!, [0, 0, 0], 0);
    expect(bounds.min[1]).toBeCloseTo(0);
    expect(bounds.max[1]).toBeCloseTo(1.8);
  });

  test("default object set is a blocking physical AABB", () => {
    const resolved = resolveColliders(defaultObjectColliders());
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.purpose).toBe("physical");
    expect(resolved[0]!.damageEligible).toBe(false);
    expect(resolved[0]!.blocks).toBe(true);
  });

  test("resolveColliders merges body and named hitboxes with purpose defaults", () => {
    const resolved = resolveColliders({
      body: { name: "hull", purpose: "physical", shape: { kind: "aabb", halfExtents: [1, 1, 1] } },
      hitboxes: [
        { name: "head", purpose: "damage", shape: { kind: "sphere", radius: 0.3, offset: [0, 1.6, 0] } },
        { name: "torso", purpose: "damage", shape: { kind: "aabb", halfExtents: [0.4, 0.6, 0.25] }, blocks: true },
      ],
    });
    expect(resolved.map((c) => c.name)).toEqual(["hull", "head", "torso"]);
    expect(resolved[0]!.blocks).toBe(true);
    expect(resolved[0]!.damageEligible).toBe(false);
    expect(resolved[1]!.blocks).toBe(false);
    expect(resolved[1]!.damageEligible).toBe(true);
    expect(resolved[2]!.blocks).toBe(true);
  });

  test("scaledObjectColliders wraps the rendered box, grounded at y=0", () => {
    const resolved = resolveColliders(scaledObjectColliders([2, 4, 2]));
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.blocks).toBe(true);
    const bounds = colliderBounds(resolved[0]!, [10, 0, 10], 0);
    expect(bounds.min).toEqual([9, 0, 9]);
    expect(bounds.max).toEqual([11, 4, 11]);
  });

  test("scaledEntityColliders(1) equals the humanoid default", () => {
    expect(scaledEntityColliders(1)).toEqual(defaultEntityColliders());
  });

  test("scaledEntityColliders scales the body box uniformly and stays grounded", () => {
    const set = scaledEntityColliders(1.35);
    const box = set.hitboxes![0]!.shape;
    if (box.kind !== "aabb") throw new Error("expected aabb");
    expect(box.halfExtents).toEqual([0.35 * 1.35, 0.9 * 1.35, 0.35 * 1.35]);
    expect(box.offset).toEqual([0, 0.9 * 1.35, 0]);
    expect(box.offset![1]).toBeCloseTo(box.halfExtents[1]);
    const resolved = resolveColliders(set)[0]!;
    const bounds = colliderBounds(resolved, [0, 0, 0], 0);
    expect(bounds.min[1]).toBeCloseTo(0);
  });

  test("worldOffset rotates local offsets by yaw", () => {
    const world = worldOffset([1, 0, 0], [0, 0, 0], Math.PI / 2);
    expect(world[0]).toBeCloseTo(0);
    expect(world[1]).toBe(0);
    expect(world[2]).toBeCloseTo(-1);
  });

  test("colliderBounds expands spheres and aabbs around the world center", () => {
    const sphere = resolveColliders({
      hitboxes: [{ name: "body", purpose: "damage", shape: { kind: "sphere", radius: 2, offset: [0, 1, 0] } }],
    })[0]!;
    const bounds = colliderBounds(sphere, [10, 0, 0], 0);
    expect(bounds.min).toEqual([8, -1, -2]);
    expect(bounds.max).toEqual([12, 3, 2]);
  });

  const ratDims = { footprint: { w: 0.6, d: 0.9 }, center: { x: 0.1, z: -0.2 }, minY: -0.05, maxY: 0.25 };

  test("fittedEntityColliders wraps the rendered model bounds, centered and grounded", () => {
    const set = fittedEntityColliders({ dims: ratDims });
    expect(set).not.toBeNull();
    const resolved = resolveColliders(set!);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.purpose).toBe("damage");
    expect(resolved[0]!.blocks).toBe(false);
    const bounds = colliderBounds(resolved[0]!, [0, 0, 0], 0);
    expect(bounds.min[0]).toBeCloseTo(-0.3);
    expect(bounds.max[0]).toBeCloseTo(0.3);
    expect(bounds.min[1]).toBeCloseTo(0);
    expect(bounds.max[1]).toBeCloseTo(0.3);
    expect(bounds.min[2]).toBeCloseTo(-0.45);
    expect(bounds.max[2]).toBeCloseTo(0.45);
  });

  test("fitted colliders compose scale and targetHeight exactly like the renderer", () => {
    // targetHeight 3 over a 0.3-tall model normalizes by 10; scale 0.5 halves it → world height 1.5.
    const set = fittedEntityColliders({ dims: ratDims, targetHeight: 3, scale: 0.5 });
    const bounds = colliderBounds(resolveColliders(set!)[0]!, [0, 0, 0], 0);
    expect(bounds.min[1]).toBeCloseTo(0);
    expect(bounds.max[1]).toBeCloseTo(1.5);
    expect(bounds.max[0] - bounds.min[0]).toBeCloseTo(0.6 * 5);
    expect(bounds.max[2] - bounds.min[2]).toBeCloseTo(0.9 * 5);
  });

  test("origin-anchored models keep their authored pivot offset", () => {
    const set = fittedEntityColliders({ dims: ratDims, anchor: "origin", scale: 2 });
    const box = set!.hitboxes![0]!.shape;
    if (box.kind !== "aabb") throw new Error("expected aabb");
    expect(box.offset).toEqual([0.2, (-0.05 + 0.15) * 2, -0.4]);
    // targetHeight forces the renderer down its measured centering path even for origin anchors.
    const normalized = fittedEntityColliders({ dims: ratDims, anchor: "origin", targetHeight: 0.3 });
    const normalizedBox = normalized!.hitboxes![0]!.shape;
    if (normalizedBox.kind !== "aabb") throw new Error("expected aabb");
    expect(normalizedBox.offset).toEqual([0, 0.15, 0]);
  });

  test("fittedObjectColliders is a blocking physical body over the same box", () => {
    const set = fittedObjectColliders({ dims: ratDims, y: 0.1 });
    const resolved = resolveColliders(set!);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.purpose).toBe("physical");
    expect(resolved[0]!.blocks).toBe(true);
    expect(resolved[0]!.damageEligible).toBe(false);
    const bounds = colliderBounds(resolved[0]!, [0, 0, 0], 0);
    expect(bounds.min[1]).toBeCloseTo(0.1);
    expect(bounds.max[1]).toBeCloseTo(0.4);
  });

  test("fitted mesh collider carries boxes scaled + translated exactly like the mesh", () => {
    // Height-2 model (minY 1, maxY 3), centered → scale 1, meshTranslate [0, -1, 0]; a model box at
    // y[1,3] grounds to entity-local y[0,2].
    const dims = { footprint: { w: 2, d: 2 }, center: { x: 0, z: 0 }, minY: 1, maxY: 3 };
    const collisionMesh = meshWithBoxes([{ min: [0, 1, 0], max: [1, 3, 1] }]);
    const set = fittedObjectColliders({ dims, collisionMesh });
    expect(set).not.toBeNull();
    const shape = set!.body!.shape;
    if (shape.kind !== "mesh") throw new Error("expected mesh shape");
    expect(shape.meshScale).toBeCloseTo(1, 6);
    expect(shape.meshTranslate[0]).toBeCloseTo(0, 6);
    expect(shape.meshTranslate[1]).toBeCloseTo(-1, 6);
    expect(shape.meshTranslate[2]).toBeCloseTo(0, 6);
    expect(shape.boxes).toBeDefined();
    expect(shape.boxes![0]!.min).toEqual([0, 0, 0]);
    expect(shape.boxes![0]!.max).toEqual([1, 2, 1]);
  });

  test("fitted mesh boxes compose scale and targetHeight like the renderer", () => {
    // targetHeight 4 over a height-2 model normalizes by 2; scale 1.5 → composed scale 3.
    const dims = { footprint: { w: 2, d: 2 }, center: { x: 0, z: 0 }, minY: 0, maxY: 2 };
    const collisionMesh = meshWithBoxes([{ min: [0, 0, 0], max: [1, 1, 1] }]);
    const set = fittedObjectColliders({ dims, collisionMesh, targetHeight: 4, scale: 1.5 });
    const shape = set!.body!.shape;
    if (shape.kind !== "mesh") throw new Error("expected mesh shape");
    expect(shape.meshScale).toBeCloseTo(3, 6);
    expect(shape.boxes![0]!.min).toEqual([0, 0, 0]);
    expect(shape.boxes![0]!.max).toEqual([3, 3, 3]);
  });

  test("a box-less mesh model fits a mesh shape without boxes", () => {
    const dims = { footprint: { w: 2, d: 2 }, center: { x: 0, z: 0 }, minY: 0, maxY: 2 };
    const collisionMesh = meshWithBoxes(undefined);
    const shape = fittedObjectColliders({ dims, collisionMesh })!.body!.shape;
    if (shape.kind !== "mesh") throw new Error("expected mesh shape");
    expect(shape.boxes).toBeUndefined();
  });

  test("fitting declines unmeasured or degenerate models", () => {
    expect(fittedEntityColliders({})).toBeNull();
    expect(fittedEntityColliders({ dims: { footprint: { w: 1, d: 1 }, center: { x: 0, z: 0 }, minY: 0 } })).toBeNull();
    expect(
      fittedEntityColliders({ dims: { footprint: { w: 1, d: 1 }, center: { x: 0, z: 0 }, minY: 1, maxY: 1 } }),
    ).toBeNull();
    expect(fittedObjectColliders({ dims: ratDims, scale: 0 })).toBeNull();
  });
});
