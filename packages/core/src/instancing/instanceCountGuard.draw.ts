import type { InstancedMesh, Object3D, WebGLRenderer } from "three";

/**
 * Instances an InstancedMesh can draw: its `count`, held to what its instance buffers hold. three
 * clamps an InstancedBufferGeometry's `instanceCount` to its attributes but draws an InstancedMesh's
 * `count` as asked, so a count past `instanceMatrix` reads past the buffer: WebGL draws those
 * instances from zero matrices (nothing shows), WebGPU and native backends reject or clamp the draw.
 */
export function instanceCapacity(mesh: Pick<InstancedMesh, "count" | "instanceMatrix" | "instanceColor">): number {
  const color = mesh.instanceColor === null ? Infinity : mesh.instanceColor.count;
  return Math.min(mesh.instanceMatrix.count, color);
}

const reported = new WeakSet<object>();

/**
 * Hold `mesh.count` to its instance buffers, and name the mesh once with an error so the code that
 * set the count can be fixed (Harbor Heat asked 17-28 instances of a 16-instance buffer).
 * Returns whether it clamped.
 */
export function clampInstanceCount(mesh: InstancedMesh, report: (message: string) => void = console.error): boolean {
  const capacity = instanceCapacity(mesh);
  if (mesh.count <= capacity) return false;
  if (!reported.has(mesh)) {
    reported.add(mesh);
    report(`[jgengine] instanced mesh "${mesh.name || mesh.parent?.name || mesh.uuid}" was asked to draw ${mesh.count} instances but its instance buffers hold ${capacity}; it draws ${capacity}. Keep count within the buffer or allocate a bigger one.`);
  }
  mesh.count = capacity;
  return true;
}

const guarded = new WeakSet<WebGLRenderer>();

/**
 * Clamp every InstancedMesh `renderer` draws, in the main and shadow passes alike: both go through
 * `renderBufferDirect`, whatever `onBeforeRender` a mesh installs. Idempotent per renderer.
 */
export function guardInstanceCounts(renderer: WebGLRenderer): void {
  if (guarded.has(renderer)) return;
  guarded.add(renderer);
  const draw = renderer.renderBufferDirect.bind(renderer);
  renderer.renderBufferDirect = (camera, scene, geometry, material, object: Object3D, group) => {
    if ((object as InstancedMesh).isInstancedMesh === true) clampInstanceCount(object as InstancedMesh);
    draw(camera, scene, geometry, material, object, group);
  };
}
