// Original Harbor Heat geometry. Rebuild with: node scripts/author-harbor.mjs
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mkdir, writeFile } from 'node:fs/promises';

// The exporter uses the browser FileReader contract for binary buffers only.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((value) => { this.result = value; this.onloadend?.(); }); }
};
const out = new URL('../src/art/', import.meta.url);
await mkdir(out, { recursive: true });
const mat = (color, metalness = 0, emissive) => new THREE.MeshStandardMaterial({ color, roughness: metalness ? 0.4 : 0.82, metalness, ...(emissive ? { emissive: color, emissiveIntensity: emissive } : {}) });
const ink = mat('#173f49'), cream = mat('#ffe4ae'), coral = mat('#f37f63'), teal = mat('#38b6ac'), gold = mat('#f8b64b');
function mesh(group, geometry, material, position, rotation = [0, 0, 0]) {
  const part = new THREE.Mesh(geometry, material);
  part.position.set(...position); part.rotation.set(...rotation); group.add(part); return part;
}
const box = (g, m, x, y, z, w, h, d, rotation) => mesh(g, new THREE.BoxGeometry(w, h, d), m, [x, y, z], rotation);
const cylinder = (g, m, x, y, z, rt, rb, h, rotation) => mesh(g, new THREE.CylinderGeometry(rt, rb, h, 10), m, [x, y, z], rotation);
async function exportModel(name, group) {
  const data = await new GLTFExporter().parseAsync(group, { binary: true, copyright: 'Original Harbor Heat game art, authored for jgengine-games. Repository license applies.' });
  await writeFile(new URL(name + '.glb', out), Buffer.from(data));
  console.log(`${name}: ${data.byteLength} bytes`);
}

// One mesh per material: every piece of a model is merged into its material's single primitive, so
// a palm is three draws and a bus about ten, however much detail they carry.
class Batch {
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
function paint(geometry, fn) {
  const p = geometry.getAttribute('position'), colors = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) colors.set(fn(p.getX(i), p.getY(i), p.getZ(i), i), i * 3);
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); return geometry;
}
const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function sheet(triangles) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(triangles.flatMap((t) => t.flatMap((v) => [v.x, v.y, v.z])), 3));
  g.computeVertexNormals(); return g;
}

/**
 * The Mainsail coconut palm, at two levels of detail from the same parameters so both share a
 * silhouette: a leaning, tapering trunk with growth rings and a flared boot, a crown of fronds
 * that rise young and droop old, each a rachis with paired leaflets folded into a V, woody frond
 * bases around the crown, and a cluster of coconuts. Bark, leaves and nuts are one primitive each.
 */
function buildPalm(near) {
  const batch = new Batch();
  const named = (name, options) => Object.assign(new THREE.MeshStandardMaterial({ vertexColors: true, ...options }), { name });
  const barkMat = named('palm bark', { roughness: 0.93 }), leafMat = named('palm leaf', { roughness: 0.62, side: THREE.DoubleSide }), nutMat = named('palm coconut', { roughness: 0.55 });
  const H = 6.3, lean = 1.05, rings = 22;
  const along = near ? rings * 3 : 12, around = near ? 11 : 7;
  const centre = (t) => new THREE.Vector3(lean * Math.pow(t, 1.7), H * t, 0);
  const radius = (t) => {
    const ring = near ? 1 + 0.06 * Math.pow(Math.abs(Math.sin(Math.PI * t * rings)), 8) : 1.02;
    return ((0.2 - 0.075 * t) + 0.17 * Math.exp(-t * 16)) * ring;
  };
  // Trunk: a swept tube around the curved centre line, ring ridges darker than the bark between.
  const positions = [], colors = [], index = [];
  for (let i = 0; i <= along; i++) {
    const t = i / along, c = centre(t), d = centre(Math.min(1, t + 0.01)).sub(centre(Math.max(0, t - 0.01))).normalize();
    const b = new THREE.Vector3(0, 0, 1), n = new THREE.Vector3().crossVectors(b, d).normalize(), r = radius(t);
    const ridge = near ? Math.pow(Math.abs(Math.sin(Math.PI * t * rings)), 8) : 0;
    for (let j = 0; j <= around; j++) {
      const a = (j / around) * Math.PI * 2, p = c.clone().addScaledVector(n, Math.cos(a) * r).addScaledVector(b, Math.sin(a) * r);
      positions.push(p.x, p.y, p.z);
      const base = mix(hex('#6d6253'), mix(hex('#8b7660'), hex('#a48a6a'), t), Math.min(1, t * 5));
      colors.push(...mix(base, hex('#4f4234'), ridge * 0.75).map((v) => v * (0.92 + hash(i * 31 + j) * 0.12)));
    }
  }
  for (let i = 0; i < along; i++) for (let j = 0; j < around; j++) {
    const a = i * (around + 1) + j, b = a + around + 1; index.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const trunk = new THREE.BufferGeometry();
  trunk.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  trunk.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  trunk.setIndex(index); trunk.computeVertexNormals();
  batch.add(barkMat, trunk);
  const crown = centre(1).add(new THREE.Vector3(0, 0.08, 0));
  // Crown shaft: the swollen green-brown knot the fronds grow out of.
  batch.add(barkMat, paint(new THREE.SphereGeometry(0.2, near ? 10 : 6, near ? 7 : 4), (x, y) => (y > 0 ? hex('#7c7444') : hex('#5b5a36'))), crown.toArray(), [0, 0, 0], [1, 1.15, 1]);

  const fronds = near ? 18 : 14, up = new THREE.Vector3(0, 1, 0);
  for (let k = 0; k < fronds; k++) {
    const tier = k / (fronds - 1), az = k * 2.39996 + 0.4;
    const elevation = 0.95 - 1.5 * tier + (hash(k) - 0.5) * 0.18, length = 2.5 + 1.0 * Math.sqrt(tier) + hash(k + 9) * 0.25, sag = 0.25 + 0.6 * tier;
    const dir = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const at = (s) => crown.clone().addScaledVector(dir, length * s * Math.cos(elevation)).addScaledVector(up, length * s * Math.sin(elevation) - sag * length * s * s);
    const tangent = (s) => at(Math.min(1, s + 0.01)).sub(at(Math.max(0, s - 0.01))).normalize();
    const dead = tier > 0.93, young = mix(hex('#6ea24f'), hex('#3d7536'), Math.min(1, tier * 1.4));
    const green = dead ? hex('#8a7448') : young, tipColor = dead ? hex('#6d5a3a') : mix(green, hex('#a8a24c'), 0.25 + tier * 0.35);
    // Frond base: a woody sheath hugging the crown, pointing along the frond.
    batch.add(barkMat, paint(new THREE.BoxGeometry(0.16, 0.05, 0.5), () => hex('#5a4a34')), at(0.07).toArray(), [0, Math.atan2(dir.x, dir.z), 0]);
    const tris = [], triColors = [];
    const push = (tri, c) => { tris.push(tri); triColors.push(c); };
    // Rachis: a tapering strip down the frond's spine.
    const spine = near ? 12 : 6;
    for (let m = 0; m < spine; m++) {
      const s0 = m / spine, s1 = (m + 1) / spine;
      const side0 = new THREE.Vector3().crossVectors(tangent(s0), up).normalize(), side1 = new THREE.Vector3().crossVectors(tangent(s1), up).normalize();
      const w0 = 0.05 * (1 - s0) + 0.01, w1 = 0.05 * (1 - s1) + 0.01, p0 = at(s0), p1 = at(s1);
      const a = p0.clone().addScaledVector(side0, w0), b = p0.clone().addScaledVector(side0, -w0), c = p1.clone().addScaledVector(side1, w1), d = p1.clone().addScaledVector(side1, -w1);
      const col = mix(hex('#b3a265'), green, s0);
      push([a, c, b], col); push([b, c, d], col);
    }
    // Leaflets: paired, folded down into a V, longest mid-frond, curling down at the tips.
    const stations = near ? 30 : 11;
    for (let m = 0; m < stations; m++) {
      const s = 0.1 + 0.9 * (m + 0.5) / stations, base = at(s), t = tangent(s);
      const side = new THREE.Vector3().crossVectors(t, up).normalize(), normal = new THREE.Vector3().crossVectors(side, t).normalize();
      const len = 0.95 * Math.pow(Math.sin(Math.PI * Math.min(0.97, s * 0.92 + 0.08)), 0.65) + 0.06;
      const fold = 0.5 + s * 0.5, width = 0.035 + 0.045 * len;
      for (const sign of [-1, 1]) {
        const out = side.clone().multiplyScalar(sign * Math.cos(fold)).addScaledVector(normal, -Math.sin(fold)).addScaledVector(t, 0.45).normalize();
        const tip = base.clone().addScaledVector(out, len).addScaledVector(up, -0.16 * len * len * (0.5 + tier));
        const shade = mix(green, tipColor, 0.5).map((v) => v * (0.88 + hash(k * 97 + m * 3 + sign) * 0.2));
        if (near) {
          const mid = base.clone().lerp(tip, 0.38), w = t.clone().multiplyScalar(width);
          push([base, mid.clone().add(w), tip], shade); push([base, tip, mid.clone().sub(w)], shade);
        } else {
          const w = t.clone().multiplyScalar(width * 1.2);
          push([base.clone().add(w), tip, base.clone().sub(w)], shade);
        }
      }
    }
    const g = sheet(tris);
    paint(g, (x, y, z, i) => triColors[Math.floor(i / 3)]);
    batch.add(leafMat, g);
  }
  const nuts = near ? 7 : 3;
  for (let i = 0; i < nuts; i++) {
    const a = i * 2.39996, r = 0.17 + hash(i + 40) * 0.06, p = crown.clone().add(new THREE.Vector3(Math.cos(a) * r, -0.22 - hash(i + 3) * 0.12, Math.sin(a) * r));
    const tone = i % 3 === 0 ? hex('#6a7a34') : i % 3 === 1 ? hex('#8a6a3a') : hex('#5e6e2e');
    batch.add(nutMat, paint(new THREE.SphereGeometry(0.12, near ? 9 : 5, near ? 7 : 4), () => tone), p.toArray(), [0, 0, 0], [1, 1.12, 1]);
  }
  return batch.group(near ? 'mainsail palm' : 'mainsail palm far');
}
await exportModel('mainsail-palm', buildPalm(true));
// The far level is authored from the same parameters, not decimated: fewer rings, leaflets and nuts.
await exportModel('mainsail-palm-far', buildPalm(false));


// Art deco dispatch booth: rounded canopy, ribbed trim, service window and parcel lockers.
const kiosk = new THREE.Group();
box(kiosk, ink, 0, 0.12, 0, 3.5, 0.24, 2.7);
box(kiosk, teal, 0, 1.1, 0, 3, 1.95, 2.2);
box(kiosk, cream, 0, 2.25, 0, 3.4, 0.26, 2.5);
box(kiosk, coral, 0, 2.46, 0, 3.6, 0.17, 2.7);
box(kiosk, ink, 0, 1.56, 1.12, 2.5, 0.86, 0.06);
box(kiosk, cream, 0, 1.08, 1.4, 2.8, 0.12, 0.62);
for (let i = -3; i <= 3; i++) box(kiosk, cream, i * 0.36, 0.58, 1.12, 0.045, 0.6, 0.055);
for (let i = -1; i <= 1; i++) {
  box(kiosk, gold, i * 0.75, 1.5, 1.16, 0.5, 0.45, 0.09);
  box(kiosk, cream, i * 0.75, 1.51, 1.22, 0.24, 0.09, 0.04);
}
box(kiosk, ink, 0, 2.89, 0.5, 2.7, 0.65, 0.22);
// Three slanted chevrons on the rooftop plaque form the dispatch identity.
for (let i = -1; i <= 1; i++) {
  box(kiosk, gold, i * 0.7, 2.98, 0.63, 0.5, 0.08, 0.05, [0, 0, -0.45]);
  box(kiosk, gold, i * 0.7, 2.8, 0.63, 0.5, 0.08, 0.05, [0, 0, 0.45]);
}
await exportModel('dispatch-booth', kiosk);

for (const [index, color] of [coral, teal, gold].entries()) {
  const beacon = new THREE.Group();
  cylinder(beacon, ink, 0, 0.12, 0, 0.72, 0.85, 0.24);
  box(beacon, color, 0, 0.75, 0, 1.0, 1.25, 0.9);
  box(beacon, cream, 0, 0.95, 0.46, 0.76, 0.18, 0.045);
  box(beacon, ink, 0, 0.55, 0.46, 0.56, 0.12, 0.045);
  cylinder(beacon, ink, 0, 2.2, 0, 0.06, 0.08, 2.3);
  mesh(beacon, new THREE.TorusGeometry(0.56, 0.1, 6, 16), mat(color.color, 0.1, 0.7), [0, 3.3, 0]);
  box(beacon, cream, 0, 3.3, 0, 0.48, 0.31, 0.15);
  box(beacon, color, 0, 3.3, 0.086, 0.06, 0.31, 0.01);
  await exportModel(`parcel-tower-${index + 1}`, beacon);
}

/**
 * The Islander city bus: a 10.4 m midi low-floor body with rounded corners, a full-length dark glass
 * band, two passenger doors on the kerb side, the island livery's teal skirt and coral pinstripe,
 * a lit destination sign, head and tail lights, mirrors, a roof air-con pod, and four wheels with
 * hubs under dark wheel arches. Front is +Z and the kerb (right) side is -X, as every vehicle
 * model the game drives. One primitive per material.
 */
function buildBus() {
  const batch = new Batch();
  const named = (name, color, options = {}) => Object.assign(new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...options }), { name });
  const paintMat = named('bus paint', '#f1eee6', { roughness: 0.32, metalness: 0.05 });
  const teal = named('bus livery teal', '#14797a', { roughness: 0.34 });
  const coralMat = named('bus livery coral', '#f0705a', { roughness: 0.34 });
  const glass = named('bus glass', '#16232b', { roughness: 0.08, metalness: 0.7 });
  const trim = named('bus trim', '#17191c', { roughness: 0.7 });
  const rubber = named('bus tyre', '#1d1d1f', { roughness: 0.9 });
  const chrome = named('bus hub', '#c3c7cc', { roughness: 0.28, metalness: 0.85 });
  const head = named('bus headlight', '#fff3d6', { emissive: '#fff3d6', emissiveIntensity: 1.4 });
  const tail = named('bus taillight', '#9c0f0c', { emissive: '#d0140e', emissiveIntensity: 0.9 });
  const amber = named('bus sign', '#ffb23a', { emissive: '#ffa11f', emissiveIntensity: 1.6 });
  const L = 10.4, W = 2.5, floor = 0.32, top = 3.05, hl = L / 2, hw = W / 2;
  const b = (m, x, y, z, w, h, d, rotation) => batch.add(m, new THREE.BoxGeometry(w, h, d), [x, y, z], rotation);
  batch.add(paintMat, new RoundedBoxGeometry(W, top - floor, L, 3, 0.17), [0, (top + floor) / 2, 0]);
  // Livery: teal skirt and a coral pinstripe along both sides, wrapping the nose and tail.
  for (const s of [-1, 1]) {
    b(teal, s * (hw + 0.004), 0.66, 0, 0.012, 0.42, L - 0.5);
    b(coralMat, s * (hw + 0.004), 0.94, 0, 0.012, 0.07, L - 0.5);
  }
  for (const s of [-1, 1]) {
    b(teal, 0, 1.0, s * (hl + 0.004), W - 0.5, 0.16, 0.012);
    b(coralMat, 0, 1.13, s * (hl + 0.004), W - 0.5, 0.04, 0.012);
  }
  // Glass band down both sides, broken by black pillars; the kerb side leaves room for two doors.
  const doors = [[3.95, 4.95], [-0.6, 0.6]];
  const inDoor = (z) => doors.some(([a, c]) => z > a - 0.1 && z < c + 0.1);
  for (const s of [-1, 1]) {
    b(trim, s * (hw + 0.003), 2.12, -0.35, 0.01, 1.18, L - 1.0);
    b(glass, s * (hw + 0.007), 2.12, -0.35, 0.01, 1.06, L - 1.1);
    for (let z = -4.5; z <= 3.9; z += 1.2) if (s > 0 || !inDoor(z)) b(trim, s * (hw + 0.012), 2.12, z, 0.01, 1.1, 0.1);
  }
  for (const [a, c] of doors) {
    const z = (a + c) / 2, len = c - a;
    b(trim, -(hw + 0.006), 1.55, z, 0.012, 2.4, len + 0.1);
    b(glass, -(hw + 0.011), 1.6, z, 0.01, 2.2, len - 0.08);
    b(trim, -(hw + 0.016), 1.55, z, 0.01, 2.4, 0.05);
    b(trim, -(hw + 0.016), 1.0, z, 0.01, 0.06, len - 0.1);
  }
  // Nose: windshield with its gasket, the lit destination sign, bumper, lamps and mirrors.
  b(trim, 0, 1.95, hl + 0.004, W - 0.14, 1.9, 0.012);
  b(glass, 0, 1.92, hl + 0.01, W - 0.26, 1.72, 0.012);
  b(trim, 0, 2.06, hl + 0.016, 0.05, 1.5, 0.01);
  b(trim, 0, 2.86, hl + 0.016, W - 0.4, 0.22, 0.012);
  for (let i = 0; i < 12; i++) b(amber, -0.92 + i * 0.165 + (i > 4 ? 0.06 : 0), 2.86, hl + 0.022, 0.12 - (i % 3) * 0.02, 0.12, 0.01);
  b(trim, 0, 0.47, hl + 0.06, W + 0.02, 0.3, 0.14);
  for (const s of [-1, 1]) {
    b(trim, s * 0.86, 0.79, hl + 0.006, 0.46, 0.22, 0.012);
    b(head, s * 0.92, 0.79, hl + 0.013, 0.28, 0.14, 0.01);
    b(amber, s * 0.68, 0.79, hl + 0.013, 0.09, 0.14, 0.01);
    b(trim, s * (hw + 0.18), 2.75, hl - 0.12, 0.36, 0.05, 0.05);
    b(trim, s * (hw + 0.34), 2.42, hl - 0.1, 0.1, 0.42, 0.18);
    b(glass, s * (hw + 0.34), 2.42, hl - 0.005, 0.07, 0.36, 0.01);
  }
  // Tail: rear window, engine grille, tail and indicator lamps, rear bumper.
  b(trim, 0, 2.32, -hl - 0.004, W - 0.4, 0.96, 0.012);
  b(glass, 0, 2.32, -hl - 0.01, W - 0.52, 0.84, 0.012);
  b(trim, 0, 2.86, -hl - 0.016, 1.1, 0.16, 0.01);
  for (let i = 0; i < 7; i++) b(trim, 0, 0.64 + i * 0.07, -hl - 0.008, 1.6, 0.03, 0.012);
  b(trim, 0, 0.42, -hl - 0.05, W + 0.02, 0.24, 0.12);
  for (const s of [-1, 1]) {
    b(tail, s * 1.02, 1.05, -hl - 0.008, 0.2, 0.5, 0.012);
    b(amber, s * 1.02, 0.72, -hl - 0.008, 0.2, 0.12, 0.012);
    for (const z of [-3.9, 0, 3.0]) b(amber, s * (hw + 0.008), 0.45, z, 0.01, 0.06, 0.14);
  }
  // Roof air-con pod and an escape hatch.
  batch.add(paintMat, new RoundedBoxGeometry(1.7, 0.26, 2.6, 2, 0.08), [0, top + 0.1, -1.5]);
  b(trim, 0, top + 0.24, -1.5, 1.1, 0.01, 1.5);
  b(trim, 0, top + 0.01, 1.9, 0.8, 0.03, 0.8);
  // Wheels under dark arches; 7.2 m wheelbase to match the bus's handling.
  for (const z of [3.6, -3.6]) {
    batch.add(trim, new THREE.CylinderGeometry(0.74, 0.74, W + 0.04, 24, 1, false, 0, Math.PI), [0, 0.5, z], [0, 0, Math.PI / 2]);
    for (const s of [-1, 1]) {
      batch.add(rubber, new THREE.CylinderGeometry(0.5, 0.5, 0.34, 22), [s * (hw - 0.14), 0.5, z], [0, 0, Math.PI / 2]);
      batch.add(chrome, new THREE.CylinderGeometry(0.31, 0.31, 0.02, 18), [s * (hw + 0.035), 0.5, z], [0, 0, Math.PI / 2]);
      batch.add(trim, new THREE.CylinderGeometry(0.09, 0.09, 0.02, 10), [s * (hw + 0.045), 0.5, z], [0, 0, Math.PI / 2]);
    }
  }
  return batch.group('islander bus');
}
await exportModel('islander-bus', buildBus());

/** HHPD roof light bar: a black base under red (driver side) and blue lenses with a white take-down lamp. */
function buildLightBar() {
  const batch = new Batch();
  const named = (name, color, options = {}) => Object.assign(new THREE.MeshStandardMaterial({ color, roughness: 0.4, ...options }), { name });
  const base = named('lightbar base', '#141618', { roughness: 0.6 });
  const red = named('lightbar red', '#c8101a', { emissive: '#e0101a', emissiveIntensity: 1.1, roughness: 0.15 });
  const blue = named('lightbar blue', '#1238c8', { emissive: '#1a40ff', emissiveIntensity: 1.2, roughness: 0.15 });
  const white = named('lightbar white', '#f4f6ff', { emissive: '#f4f6ff', emissiveIntensity: 0.8, roughness: 0.15 });
  batch.add(base, new RoundedBoxGeometry(1.16, 0.06, 0.26, 2, 0.02), [0, 0.03, 0]);
  for (const s of [-1, 1]) batch.add(base, new THREE.BoxGeometry(0.05, 0.05, 0.18), [s * 0.5, -0.02, 0]);
  batch.add(red, new RoundedBoxGeometry(0.5, 0.09, 0.22, 2, 0.03), [0.29, 0.1, 0]);
  batch.add(blue, new RoundedBoxGeometry(0.5, 0.09, 0.22, 2, 0.03), [-0.29, 0.1, 0]);
  batch.add(white, new THREE.BoxGeometry(0.07, 0.08, 0.2), [0, 0.1, 0]);
  return batch.group('hhpd light bar');
}
await exportModel('hhpd-lightbar', buildLightBar());
