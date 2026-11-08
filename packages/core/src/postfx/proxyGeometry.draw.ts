import * as THREE from "three";

const lean = new WeakMap<THREE.BufferGeometry, Map<string, THREE.BufferGeometry>>();

/**
 * A copy of `source` that carries only `keep` of its attributes, sharing their buffers, for a pass
 * that redraws scene meshes with its own material (a reflection mask, a velocity buffer). three
 * builds a separate program for each mix of attributes a mesh brings (lightmap UVs, vertex
 * colours, morphs), so with the source geometry every new kind of mesh linked another copy of the
 * pass's program the first frame it was seen: 30 to 240 ms mid-play. With only what the shader
 * reads, every mesh draws with the one program the warmup linked.
 *
 * Released with the source, never on its own: disposing the copy would drop the shared buffers the
 * source still draws with. @internal
 */
export function proxyGeometry(source: THREE.BufferGeometry, keep: readonly string[]): THREE.BufferGeometry {
  const key = keep.join(",");
  let copies = lean.get(source);
  let copy = copies?.get(key);
  if (copy !== undefined && copy.index === source.index && keep.every((name) => copy!.getAttribute(name) === source.getAttribute(name))) {
    copy.drawRange.start = source.drawRange.start;
    copy.drawRange.count = source.drawRange.count;
    return copy;
  }
  copy = new THREE.BufferGeometry();
  copy.setIndex(source.index);
  for (const name of keep) {
    const attribute = source.getAttribute(name);
    if (attribute !== undefined) copy.setAttribute(name, attribute);
  }
  copy.drawRange.start = source.drawRange.start;
  copy.drawRange.count = source.drawRange.count;
  copy.boundingSphere = source.boundingSphere;
  copy.boundingBox = source.boundingBox;
  if (copies === undefined) {
    const made = new Map<string, THREE.BufferGeometry>();
    copies = made;
    lean.set(source, made);
    source.addEventListener("dispose", () => {
      lean.delete(source);
      for (const made of copies!.values()) made.dispose();
    });
  }
  copies.set(key, copy);
  return copy;
}
