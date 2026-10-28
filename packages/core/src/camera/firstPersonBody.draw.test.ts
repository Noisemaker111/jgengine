import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { keepHeadUnderEye } from "@jgengine/core/camera/firstPersonBody.draw";

describe("keepHeadUnderEye", () => {
  test("slides a forward-leaning body back so the head sits under the eye, keeping height", () => {
    const entity = new THREE.Group();
    entity.position.set(10, 0, 5);
    entity.scale.setScalar(2);
    const body = new THREE.Group();
    entity.add(body);
    const head = new THREE.Object3D();
    head.position.set(0, 0.8, 0.15);
    body.add(head);
    const eye = new THREE.PerspectiveCamera();
    eye.position.set(10, 1.8, 5);
    const rest = body.position.clone();

    keepHeadUnderEye(body, head, eye, rest);
    entity.updateMatrixWorld(true);
    const world = head.getWorldPosition(new THREE.Vector3());
    expect(world.x).toBeCloseTo(10, 6);
    expect(world.z).toBeCloseTo(5, 6);
    expect(world.y).toBeCloseTo(1.6, 6);

    head.position.set(0, 0.8, 0);
    keepHeadUnderEye(body, head, eye, rest);
    expect(body.position.z).toBeCloseTo(0, 6);
  });
});
