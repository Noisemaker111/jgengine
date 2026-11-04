import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { STATIC_POOL_MESH_KEY, staticDrawPoolFor } from "@jgengine/core/instancing/staticDrawPool.draw";
import { dropHero, placeHero, showHero } from "./ScatterHeroes.draw";

function grown(width: number) {
  const geometry = new THREE.BoxGeometry(width, 2, 1);
  geometry.clearGroups();
  return geometry;
}

describe("hero placements in the shared static batches", () => {
  test("heroes grown into different meshes share one draw per material, hidden until shown", () => {
    const scene = new THREE.Scene();
    const pool = staticDrawPoolFor(scene);
    const bark = new THREE.MeshStandardMaterial({ color: "#6b4a2f", roughness: 0.9 });
    const heroes = [1, 1.5, 2].map((width, index) =>
      placeHero(pool, [{ geometry: grown(width), material: bark }], new THREE.Matrix4().makeTranslation(index * 4, 0, 0)));
    const batches = scene.children.filter((child): child is THREE.BatchedMesh => child.userData[STATIC_POOL_MESH_KEY] === true);
    expect(batches).toHaveLength(1);
    expect(heroes.every((hero) => hero.group.children.length === 0)).toBe(true);
    const batch = batches[0]!;
    expect(pool.shownInstances()).toBe(0);
    showHero(heroes[1]!, true);
    expect(pool.shownInstances()).toBe(1);
    const at = new THREE.Matrix4();
    expect(new THREE.Vector3().setFromMatrixPosition(batch.getMatrixAt(1, at)).x).toBe(4);
    showHero(heroes[1]!, false);
    expect(pool.shownInstances()).toBe(0);
    for (const hero of heroes) dropHero(hero);
    expect(scene.children.filter((child) => child.userData[STATIC_POOL_MESH_KEY] === true)).toHaveLength(0);
  });

  test("a part the batches cannot share draws as its own mesh", () => {
    const scene = new THREE.Scene();
    const glass = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.5 });
    const hero = placeHero(staticDrawPoolFor(scene), [{ geometry: grown(1), material: glass }], new THREE.Matrix4());
    expect(hero.slots).toHaveLength(0);
    expect(hero.group.children).toHaveLength(1);
    expect(hero.group.visible).toBe(false);
    showHero(hero, true);
    expect(hero.group.visible).toBe(true);
    dropHero(hero);
  });
});
