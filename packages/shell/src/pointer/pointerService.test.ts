import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { createPointerService } from "./pointerService";

function setup() {
  const service = createPointerService();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  scene.add(mesh);
  service.bind({ camera, scene, width: 800, height: 600 });
  return { service, mesh, camera, scene };
}

describe("pointerService worldHitCenter", () => {
  test("hits scene geometry at the viewport center with no cursor bound", () => {
    const { service } = setup();
    expect(service.hasCursor()).toBe(false);
    const hit = service.worldHitCenter();
    expect(hit).not.toBeNull();
    expect(hit?.point[0]).toBeCloseTo(0, 5);
    expect(hit?.point[1]).toBeCloseTo(0, 5);
  });

  test("ignores the last cursor position recorded by pointer move", () => {
    const { service } = setup();
    service.setCursor(0.9, 0.9, true);
    const cursorHit = service.worldHit();
    const centerHit = service.worldHitCenter();
    expect(centerHit).not.toBeNull();
    expect(cursorHit).not.toEqual(centerHit);
  });

  test("worldHit is null while the cursor is absent but worldHitCenter still resolves", () => {
    const { service } = setup();
    expect(service.worldHit()).toBeNull();
    expect(service.worldHitCenter()).not.toBeNull();
  });

  test("both raycasts are null before bind()", () => {
    const service = createPointerService();
    expect(service.worldHit()).toBeNull();
    expect(service.worldHitCenter()).toBeNull();
  });

  test("samples the hit mesh's MeshStandardMaterial color and PBR params", () => {
    const { service, mesh } = setup();
    mesh.material = new THREE.MeshStandardMaterial({ color: "#ff0000", metalness: 0.4, roughness: 0.6 });
    const hit = service.worldHitCenter();
    expect(hit?.material?.color).toBe("#ff0000");
    expect(hit?.material?.metalness).toBeCloseTo(0.4, 5);
    expect(hit?.material?.roughness).toBeCloseTo(0.6, 5);
  });

  test("reports null material for a hit mesh without a MeshStandardMaterial", () => {
    const { service } = setup();
    const hit = service.worldHitCenter();
    expect(hit?.material).toBeNull();
  });

  test("surfaces instanceId when the hit mesh is an InstancedMesh", () => {
    const { service, scene, camera } = setup();
    const instanced = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 3);
    const matrix = new THREE.Matrix4();
    matrix.setPosition(0, 0, 2);
    instanced.setMatrixAt(1, matrix);
    matrix.setPosition(0, 0, -100);
    instanced.setMatrixAt(0, matrix);
    instanced.setMatrixAt(2, matrix);
    instanced.instanceMatrix.needsUpdate = true;
    scene.add(instanced);
    instanced.updateMatrixWorld();
    camera.updateMatrixWorld();
    const hit = service.worldHitCenter();
    expect(hit?.instanceId).toBe(1);
  });

  test("leaves instanceId unset for a plain (non-instanced) mesh hit", () => {
    const { service } = setup();
    const hit = service.worldHitCenter();
    expect(hit?.instanceId).toBeUndefined();
  });
});
