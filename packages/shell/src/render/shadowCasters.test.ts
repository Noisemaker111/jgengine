import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { MIN_SHADOW_CASTER_RADIUS, cullSmallShadowCasters, isUnderShadowCasterSize, shadowCasterRadius } from "./shadowCasters";

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
});

