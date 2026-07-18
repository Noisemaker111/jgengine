import { describe, expect, test } from "bun:test";

import { COLLISION_MESH_ASSET_IDS } from "./collisionMeshAssets";
import { generatedIndex } from "./generated";

/** Guards the reindex output: every opted-in concave asset must ship both the raycast triangle mesh and
 * the movement-obstruction `boxes` decomposition, while unopted assets stay collision-mesh-free. */
describe("generated collision-mesh boxes", () => {
  const byId = new Map(generatedIndex.map((entry) => [entry.id, entry]));

  for (const id of COLLISION_MESH_ASSET_IDS) {
    test(`${id} carries a triangle mesh with a non-empty box decomposition`, () => {
      const entry = byId.get(id);
      expect(entry).toBeDefined();
      const mesh = entry!.collisionMesh;
      expect(mesh).toBeDefined();
      expect(mesh!.triangleCount).toBeGreaterThan(0);
      expect(mesh!.boxes).toBeDefined();
      expect(mesh!.boxes!.length).toBeGreaterThan(0);
      // Every box is a well-formed AABB (min ≤ max on each axis) inside the model bounds.
      for (const box of mesh!.boxes!) {
        for (let axis = 0; axis < 3; axis += 1) {
          expect(box.min[axis]).toBeLessThanOrEqual(box.max[axis]);
          expect(box.min[axis]).toBeGreaterThanOrEqual(mesh!.min[axis]! - 1e-6);
          expect(box.max[axis]).toBeLessThanOrEqual(mesh!.max[axis]! + 1e-6);
        }
      }
    });
  }

  test("the three opted-in archways are exactly the meshed assets", () => {
    const meshed = generatedIndex.filter((entry) => entry.collisionMesh !== undefined).map((entry) => entry.id).sort();
    expect(meshed).toEqual([...COLLISION_MESH_ASSET_IDS].sort());
  });
});
