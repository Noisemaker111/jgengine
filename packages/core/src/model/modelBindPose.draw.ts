import * as THREE from "three";

const positionsByMesh = new WeakMap<THREE.SkinnedMesh, Float32Array>();
const vertex = new THREE.Vector3();

/** Skin-applied vertices captured before animation, shared by a loaded model's clones. @internal */
export function modelBindPosePositions(mesh: THREE.SkinnedMesh): Float32Array {
  let positions = positionsByMesh.get(mesh);
  if (positions !== undefined) return positions;
  const attribute = mesh.geometry.getAttribute("position");
  const skinned = mesh.geometry.getAttribute("skinIndex") !== undefined && mesh.geometry.getAttribute("skinWeight") !== undefined;
  positions = new Float32Array(attribute.count * 3);
  for (let index = 0; index < attribute.count; index++) {
    if (skinned) mesh.getVertexPosition(index, vertex);
    else vertex.fromBufferAttribute(attribute, index);
    vertex.toArray(positions, index * 3);
  }
  positionsByMesh.set(mesh, positions);
  return positions;
}

/** Retain the imported pose for normalization and colliders without sampling a live animation. @internal */
export function copyModelBindPose(source: THREE.Object3D, clone: THREE.Object3D): void {
  source.updateMatrixWorld(true);
  const positions: Float32Array[] = [];
  source.traverse((node) => {
    if ((node as THREE.SkinnedMesh).isSkinnedMesh === true) positions.push(modelBindPosePositions(node as THREE.SkinnedMesh));
  });
  let index = 0;
  clone.traverse((node) => {
    if ((node as THREE.SkinnedMesh).isSkinnedMesh === true) positionsByMesh.set(node as THREE.SkinnedMesh, positions[index++]!);
  });
}
