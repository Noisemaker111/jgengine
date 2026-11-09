import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { MIN_SHADOW_CASTER_RADIUS, cullSmallShadowCasters, isUnderShadowCasterSize, shadowCasterRadius } from "./shadowCasters.draw";

function box(size: number, castShadow = true): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshStandardMaterial());
  mesh.castShadow = castShadow;
  return mesh;
}

describe("shadowCasterRadius", () => {
  test("measures a mesh in world units, including its scale", () => {
    const mesh = box(1);
    const scene = new THREE.Scene();
    scene.add(mesh);
    scene.updateMatrixWorld(true);
    expect(shadowCasterRadius(mesh)).toBeCloseTo(Math.sqrt(3) / 2, 5);

    mesh.scale.setScalar(0.2);
    scene.updateMatrixWorld(true);
    expect(shadowCasterRadius(mesh)).toBeCloseTo((Math.sqrt(3) / 2) * 0.2, 5);
  });

  test("an instance batch counts as its whole spread, not one small source mesh", () => {
    const batch = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial(), 3);
    const matrix = new THREE.Matrix4();
    [0, 10, 20].forEach((x, index) => batch.setMatrixAt(index, matrix.makeTranslation(x, 0, 0)));
    batch.instanceMatrix.needsUpdate = true;
    const scene = new THREE.Scene();
    scene.add(batch);
    scene.updateMatrixWorld(true);

    expect(shadowCasterRadius(batch)).toBeGreaterThan(MIN_SHADOW_CASTER_RADIUS);
    expect(isUnderShadowCasterSize(batch)).toBe(false);
  });
});

describe("isUnderShadowCasterSize", () => {
  test("a 0.5 m radius is a caster; anything under it is not", () => {
    const edge = box(1);
    edge.scale.setScalar(0.5 / (Math.sqrt(3) / 2));
    const scene = new THREE.Scene();
    scene.add(edge);
    scene.updateMatrixWorld(true);
    expect(isUnderShadowCasterSize(edge)).toBe(false);

    const small = box(0.3);
    scene.add(small);
    scene.updateMatrixWorld(true);
    expect(isUnderShadowCasterSize(small)).toBe(true);
  });
});

describe("cullSmallShadowCasters", () => {
  test("clears small casters, leaves large and authored-receive-only meshes alone", () => {
    const scene = new THREE.Scene();
    const small = box(0.3);
    const large = box(6);
    const noCast = box(0.3, false);
    scene.add(small, large, noCast);
    scene.updateMatrixWorld(true);

    const cull = cullSmallShadowCasters(scene);
    expect(small.castShadow).toBe(false);
    expect(large.castShadow).toBe(true);
    expect(noCast.castShadow).toBe(false);

    cull.restore();
    expect(small.castShadow).toBe(true);
    expect(large.castShadow).toBe(true);
    expect(noCast.castShadow).toBe(false);
  });

  test("catches meshes that stream in after mount without a per-frame scan", () => {
    const scene = new THREE.Scene();
    const group = new THREE.Group();
    scene.add(group);
    const cull = cullSmallShadowCasters(scene);

    const streamed = box(0.25);
    group.add(streamed);
    expect(streamed.castShadow).toBe(false);

    const nested = box(0.25);
    const holder = new THREE.Group();
    holder.add(nested);
    group.add(holder);
    expect(nested.castShadow).toBe(false);

    group.remove(streamed);
    expect(streamed.castShadow).toBe(true);

    cull.restore();
    expect(nested.castShadow).toBe(true);
  });

  test("a batch that joins the scene empty and fills afterwards keeps its shadow", () => {
    // The static scenery pool adds each BatchedMesh before its first instance; judged empty it lost
    // its shadow for the session, so Odd Orbit's first load drew fewer shadows than a remount.
    const scene = new THREE.Scene();
    cullSmallShadowCasters(scene);
    const pooled = new THREE.BatchedMesh(16, 1024, 2048, new THREE.MeshStandardMaterial());
    pooled.castShadow = true;
    const instanced = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial(), 4);
    instanced.count = 0;
    instanced.castShadow = true;
    scene.add(pooled, instanced);
    expect(pooled.castShadow).toBe(true);
    expect(instanced.castShadow).toBe(true);
    expect(pooled.customDepthMaterial).toBeInstanceOf(THREE.MeshDepthMaterial);
  });

  test("stops watching a subtree once it leaves the tree, and watches it again when it returns", () => {
    const scene = new THREE.Scene();
    const holder = new THREE.Group();
    scene.add(holder);
    cullSmallShadowCasters(scene);

    scene.remove(holder);
    const whileAway = box(0.25);
    holder.add(whileAway);
    expect(whileAway.castShadow).toBe(true);

    scene.add(holder);
    expect(whileAway.castShadow).toBe(false);
    const afterReturn = box(0.25);
    holder.add(afterReturn);
    expect(afterReturn.castShadow).toBe(false);
  });
});


describe("giveStableShadowDepth", () => {
  test("a kept caster draws its shadow through one depth material per caster material and mesh kind", () => {
    const scene = new THREE.Scene();
    const textured = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
    const plain = new THREE.MeshStandardMaterial();
    const a = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), textured);
    const b = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), textured);
    const c = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), plain);
    const batch = new THREE.InstancedMesh(new THREE.BoxGeometry(4, 4, 4), textured, 2);
    for (const mesh of [a, b, c, batch]) mesh.castShadow = true;
    scene.add(a, b, c, batch);
    scene.updateMatrixWorld(true);
    cullSmallShadowCasters(scene);

    expect(a.customDepthMaterial).toBeInstanceOf(THREE.MeshDepthMaterial);
    expect(b.customDepthMaterial).toBe(a.customDepthMaterial);
    expect(c.customDepthMaterial).not.toBe(a.customDepthMaterial);
    expect(batch.customDepthMaterial).not.toBe(a.customDepthMaterial);
  });

  test("keeps a depth material the game set, and gives none to a culled caster", () => {
    const own = new THREE.MeshDepthMaterial();
    const authored = box(6);
    authored.customDepthMaterial = own;
    const small = box(0.3);
    const scene = new THREE.Scene();
    scene.add(authored, small);
    scene.updateMatrixWorld(true);
    cullSmallShadowCasters(scene);
    expect(authored.customDepthMaterial).toBe(own);
    expect(small.customDepthMaterial).toBeUndefined();
  });
});
