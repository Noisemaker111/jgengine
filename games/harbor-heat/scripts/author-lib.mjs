// Shared geometry helpers for Harbor Heat's authored models (author-harbor.mjs, author-harbor-streets.mjs).
import * as THREE from 'three';
export { THREE };
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
export { RoundedBoxGeometry };
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mkdir, writeFile } from 'node:fs/promises';

// The exporter uses the browser FileReader contract for binary buffers only.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((value) => { this.result = value; this.onloadend?.(); }); }
};
const out = new URL('../src/art/', import.meta.url);
await mkdir(out, { recursive: true });
export const mat = (color, metalness = 0, emissive) => new THREE.MeshStandardMaterial({ color, roughness: metalness ? 0.4 : 0.82, metalness, ...(emissive ? { emissive: color, emissiveIntensity: emissive } : {}) });
export const ink = mat('#173f49'), cream = mat('#ffe4ae'), coral = mat('#f37f63'), teal = mat('#38b6ac'), gold = mat('#f8b64b');
export function mesh(group, geometry, material, position, rotation = [0, 0, 0]) {
  const part = new THREE.Mesh(geometry, material);
  part.position.set(...position); part.rotation.set(...rotation); group.add(part); return part;
}
export const box = (g, m, x, y, z, w, h, d, rotation) => mesh(g, new THREE.BoxGeometry(w, h, d), m, [x, y, z], rotation);
export const cylinder = (g, m, x, y, z, rt, rb, h, rotation) => mesh(g, new THREE.CylinderGeometry(rt, rb, h, 10), m, [x, y, z], rotation);
export async function exportModel(name, group) {
  const data = await new GLTFExporter().parseAsync(group, { binary: true, copyright: 'Original Harbor Heat game art, authored for jgengine-games. Repository license applies.' });
  await writeFile(new URL(name + '.glb', out), Buffer.from(data));
  console.log(`${name}: ${data.byteLength} bytes`);
}

// One mesh per material: every piece of a model is merged into its material's single primitive, so
// a palm is three draws and a bus about ten, however much detail they carry.
export class Batch {
  constructor() { this.parts = new Map(); }
  add(material, geometry, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (g.getAttribute('uv')) g.deleteAttribute('uv');
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale));
    g.applyMatrix4(m);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (material.vertexColors && !g.getAttribute('color')) paint(g, () => [1, 1, 1]);
    const list = this.parts.get(material) ?? []; list.push(g); this.parts.set(material, list);
  }
  group(name) {
    const group = new THREE.Group(); group.name = name;
    for (const [material, list] of this.parts) { const mesh = new THREE.Mesh(mergeVertices(mergeGeometries(list)), material); mesh.name = material.name; group.add(mesh); }
    return group;
  }
}
/** Writes a per-vertex colour from a position, so one material carries bark banding or a yellowing frond tip. */
export function paint(geometry, fn) {
  const p = geometry.getAttribute('position'), colors = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) colors.set(fn(p.getX(i), p.getY(i), p.getZ(i), i), i * 3);
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); return geometry;
}
export const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
export const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
export const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
export function sheet(triangles) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(triangles.flatMap((t) => t.flatMap((v) => [v.x, v.y, v.z])), 3));
  g.computeVertexNormals(); return g;
}
