import { Box3, Matrix4, Mesh, Object3D, Vector3 } from "three";

import type { MeasuredMeshBounds } from "@llmville/game/world/assetFrame";

const _box = new Box3();
const _union = new Box3();
const _size = new Vector3();
const _center = new Vector3();
const _corner = new Vector3();
const _rootInverse = new Matrix4();

/** Axis-aligned local bounds of a loaded GLB root (meters in file space). */
export function measureObjectBounds(object: Object3D): MeasuredMeshBounds {
  object.updateMatrixWorld(true);
  _rootInverse.copy(object.matrixWorld).invert();

  _union.makeEmpty();
  let hasMesh = false;

  object.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    const geometry = child.geometry;
    if (!geometry) return;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (!geometry.boundingBox) return;

    const meshBox = geometry.boundingBox;
    const corners: [number, number, number][] = [
      [meshBox.min.x, meshBox.min.y, meshBox.min.z],
      [meshBox.min.x, meshBox.min.y, meshBox.max.z],
      [meshBox.min.x, meshBox.max.y, meshBox.min.z],
      [meshBox.min.x, meshBox.max.y, meshBox.max.z],
      [meshBox.max.x, meshBox.min.y, meshBox.min.z],
      [meshBox.max.x, meshBox.min.y, meshBox.max.z],
      [meshBox.max.x, meshBox.max.y, meshBox.min.z],
      [meshBox.max.x, meshBox.max.y, meshBox.max.z],
    ];

    child.updateMatrixWorld(true);
    const relativeMatrix = _rootInverse.clone().multiply(child.matrixWorld);

    for (const [x, y, z] of corners) {
      _corner.set(x, y, z).applyMatrix4(relativeMatrix);
      _union.expandByPoint(_corner);
      hasMesh = true;
    }
  });

  if (!hasMesh) {
    _box.setFromObject(object);
  } else {
    _box.copy(_union);
  }

  _box.getSize(_size);
  _box.getCenter(_center);
  return {
    width: Math.max(_size.x, 0.001),
    height: Math.max(_size.y, 0.001),
    depth: Math.max(_size.z, 0.001),
    center: [_center.x, _center.y, _center.z],
    minY: _box.min.y,
  };
}