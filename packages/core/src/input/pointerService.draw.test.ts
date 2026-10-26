import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { createPointerService, rayGroundHit } from "./pointerService.draw";

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
    expect(service.state().present).toBe(false);
    const hit = service.worldHitCenter();
    expect(hit).not.toBeNull();
    expect(hit?.point[0]).toBeCloseTo(0, 5);
    expect(hit?.point[1]).toBeCloseTo(0, 5);
  });

  test("ignores the last cursor position recorded by pointer move", () => {
    const { service } = setup();
    service.setState({ x: 0.9, y: 0.9, present: true });
    expect(service.state()).toEqual({ x: 0.9, y: 0.9, present: true });
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

  test("filter skips meshes that fail the predicate", () => {
    const { service, mesh, camera, scene } = setup();
    const withoutFilter = service.worldHitCenter();
    expect(withoutFilter).not.toBeNull();
    service.bind({
      camera,
      scene,
      width: 800,
      height: 600,
      filter: (object) => object !== mesh,
    });
    const hit = service.worldHitCenter();
    expect(hit?.entity ?? null).toBeNull();
    expect(hit?.object ?? null).toBeNull();
    expect(hit?.material ?? null).toBeNull();
    expect(hit?.point).not.toEqual(withoutFilter?.point);
  });

  test("filter keeps meshes that pass the predicate", () => {
    const { service, mesh, camera, scene } = setup();
    service.bind({
      camera,
      scene,
      width: 800,
      height: 600,
      filter: (object) => object === mesh,
    });
    const hit = service.worldHitCenter();
    expect(hit).not.toBeNull();
    expect(hit?.point[2]).toBeCloseTo(0.5, 1);
  });
});

describe("pointerService ground", () => {
  function hillScene() {
    const service = createPointerService();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000);
    camera.position.set(0, 30, 40);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const scene = new THREE.Scene();
    // A sky dome around everything: the only mesh the cursor ray meets.
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 16, 8), new THREE.MeshBasicMaterial({ side: THREE.BackSide }));
    scene.add(sky);
    scene.updateMatrixWorld();
    return { service, camera, scene };
  }

  test("a cursor over open ground lands on the ground height field, not the sky dome", () => {
    const { service, camera, scene } = hillScene();
    const groundHeightAt = () => 3;
    service.bind({ camera, scene, width: 800, height: 600, groundHeightAt });
    const hit = service.worldHitCenter();
    expect(hit).not.toBeNull();
    expect(hit!.point[1]).toBeCloseTo(3, 2);
    expect(Math.hypot(hit!.point[0], hit!.point[2])).toBeLessThan(60);
  });

  test("without a ground sampler the sky dome still answers (old behaviour)", () => {
    const { service, camera, scene } = hillScene();
    service.bind({ camera, scene, width: 800, height: 600 });
    const hit = service.worldHitCenter();
    expect(Math.hypot(hit!.point[0], hit!.point[1], hit!.point[2])).toBeGreaterThan(1000);
  });

  test("a mesh in front of the ground still wins", () => {
    const { service, camera, scene } = hillScene();
    const box = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), new THREE.MeshBasicMaterial());
    box.position.set(0, 1, 0);
    box.userData["jgEntityId"] = "tower";
    scene.add(box);
    scene.updateMatrixWorld();
    service.bind({ camera, scene, width: 800, height: 600, groundHeightAt: () => 0 });
    expect(service.worldHitCenter()?.entity).toBe("tower");
  });

  test("rayGroundHit finds a hill crossing and misses when looking up", () => {
    const hill = (x: number) => Math.max(0, 10 - Math.abs(x - 50) * 0.5);
    const along = rayGroundHit(new THREE.Vector3(0, 5, 0), new THREE.Vector3(1, 0, 0), (x) => hill(x));
    expect(along).not.toBeNull();
    expect(along!.x).toBeCloseTo(40, 1);
    expect(rayGroundHit(new THREE.Vector3(0, 5, 0), new THREE.Vector3(0, 1, 0), () => 0)).toBeNull();
  });
});
