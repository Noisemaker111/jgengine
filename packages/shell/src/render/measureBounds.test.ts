import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { MEASURE_EXCLUDE_KEY, measureLocalBounds } from "./measureBounds";

function box(width: number, height: number, depth: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshStandardMaterial());
}

describe("measureLocalBounds", () => {
  test("measures a grounded mesh in the root's frame", () => {
    const root = new THREE.Group();
    const mesh = box(1, 2, 1);
    mesh.position.set(0, 1, 0);
    root.add(mesh);
    const bounds = measureLocalBounds(root);
    expect(bounds).not.toBeNull();
    expect(bounds!.meshCount).toBe(1);
    expect(bounds!.min[0]).toBeCloseTo(-0.5);
    expect(bounds!.min[1]).toBeCloseTo(0);
    expect(bounds!.max[1]).toBeCloseTo(2);
    expect(bounds!.max[2]).toBeCloseTo(0.5);
  });

  test("the root's own transform is the measuring frame, not part of the measurement", () => {
    const root = new THREE.Group();
    root.position.set(50, 10, -50);
    root.rotation.y = 1.2;
    const mesh = box(1, 1, 1);
    mesh.position.set(0, 0.5, 0);
    root.add(mesh);
    const bounds = measureLocalBounds(root)!;
    expect(bounds.min[0]).toBeCloseTo(-0.5);
    expect(bounds.min[1]).toBeCloseTo(0);
    expect(bounds.max[1]).toBeCloseTo(1);
  });

  test("composes nested group transforms (translate + scale)", () => {
    const root = new THREE.Group();
    const arm = new THREE.Group();
    arm.position.set(2, 0, 0);
    arm.scale.setScalar(2);
    const mesh = box(1, 1, 1);
    mesh.position.set(0, 0.5, 0);
    arm.add(mesh);
    root.add(arm);
    const bounds = measureLocalBounds(root)!;
    expect(bounds.min[0]).toBeCloseTo(1);
    expect(bounds.max[0]).toBeCloseTo(3);
    expect(bounds.min[1]).toBeCloseTo(0);
    expect(bounds.max[1]).toBeCloseTo(2);
    expect(bounds.min[2]).toBeCloseTo(-1);
    expect(bounds.max[2]).toBeCloseTo(1);
  });

  test("accounts for child rotation", () => {
    const root = new THREE.Group();
    const mesh = box(2, 1, 0.5);
    mesh.rotation.y = Math.PI / 2;
    root.add(mesh);
    const bounds = measureLocalBounds(root)!;
    expect(bounds.min[0]).toBeCloseTo(-0.25);
    expect(bounds.max[0]).toBeCloseTo(0.25);
    expect(bounds.min[2]).toBeCloseTo(-1);
    expect(bounds.max[2]).toBeCloseTo(1);
  });

  test("skips sprites, invisible subtrees, and flagged subtrees", () => {
    const root = new THREE.Group();
    const body = box(1, 1, 1);
    body.position.set(0, 0.5, 0);
    root.add(body);

    const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
    sprite.position.set(0, 30, 0);
    root.add(sprite);

    const hidden = box(50, 50, 50);
    hidden.visible = false;
    root.add(hidden);

    const gizmos = new THREE.Group();
    gizmos.userData[MEASURE_EXCLUDE_KEY] = true;
    const gizmoMesh = box(40, 40, 40);
    gizmos.add(gizmoMesh);
    root.add(gizmos);

    const bounds = measureLocalBounds(root)!;
    expect(bounds.meshCount).toBe(1);
    expect(bounds.max[1]).toBeCloseTo(1);
    expect(bounds.max[0]).toBeCloseTo(0.5);
  });

  test("returns null when nothing measurable is mounted", () => {
    const root = new THREE.Group();
    root.add(new THREE.Group());
    expect(measureLocalBounds(root)).toBeNull();
  });
});
