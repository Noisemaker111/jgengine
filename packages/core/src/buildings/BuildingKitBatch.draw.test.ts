import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { STATIC_POOL_MESH_KEY, staticDrawPoolFor } from "@jgengine/core/instancing/staticDrawPool.draw";
import { kitChunkPlacements } from "./BuildingKitBatch.draw";

describe("kit chunks in the shared static batches", () => {
  test("a chunk's instances land in world space, in the cell of its bounds", () => {
    const anchor = new THREE.Matrix4().makeTranslation(600, 0, -10);
    const chunk = {
      key: "compact",
      matrices: [new THREE.Matrix4().makeTranslation(1, 2, 3), new THREE.Matrix4().makeTranslation(-1, 0, 0)],
      bounds: new THREE.Box3(new THREE.Vector3(-2, 0, -1), new THREE.Vector3(2, 3, 4)),
    };
    const { members, cell, sphere } = kitChunkPlacements(anchor, chunk);
    expect(members.map((member) => member.index)).toEqual([0, 1]);
    expect(new THREE.Vector3().setFromMatrixPosition(members[0]!.matrix).toArray()).toEqual([601, 2, -7]);
    expect(cell).toBe("1,-1");
    expect(sphere.center.x).toBeCloseTo(600, 6);
  });

  test("two kit models sharing a material draw as one batch per cell", () => {
    const scene = new THREE.Scene();
    const material = new THREE.MeshStandardMaterial({ color: "#808080", roughness: 0.6 });
    const pool = staticDrawPoolFor(scene);
    const chunk = () => ({ key: "compact", matrices: [new THREE.Matrix4(), new THREE.Matrix4().makeTranslation(5, 0, 0)], bounds: new THREE.Box3(new THREE.Vector3(-3, 0, -1), new THREE.Vector3(8, 3, 1)) });
    // One draw group each, as a kit GLB primitive loads.
    for (const geometry of [new THREE.BoxGeometry(4, 3, 0.2), new THREE.BoxGeometry(1, 1, 1)]) {
      geometry.clearGroups();
      const { members, cell } = kitChunkPlacements(new THREE.Matrix4(), chunk());
      const slot = pool.acquire({ geometry, material: material.clone(), castShadow: true, receiveShadow: true }, cell, members.length);
      expect(slot).not.toBeNull();
    }
    const batches = scene.children.filter((child) => child.userData[STATIC_POOL_MESH_KEY] === true);
    expect(batches).toHaveLength(1);
    pool.dispose();
  });
});
