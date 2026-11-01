// Harbor Heat's street dressing, signs, aircraft and harbour life. Rebuild with: node scripts/author-harbor-streets.mjs
// Real-world scale, front at +Z, base (or wheels) at y = 0 unless noted. One mesh per material.
import { THREE, RoundedBoxGeometry, Batch, exportModel, paint, hex } from './author-lib.mjs';

const named = (name, color, options = {}) => Object.assign(new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...options }), { name });
const glow = (name, color, intensity = 1.6) => named(name, color, { emissive: color, emissiveIntensity: intensity, roughness: 0.3 });
const vertex = (name, options = {}) => named(name, '#ffffff', { vertexColors: true, ...options });
const colored = (geometry, color) => paint(geometry, () => hex(color));

/** A shop awning: a sloped canopy of alternating mint and cream bands, four metres wide, fixed at the wall (z = 0). */
function buildAwning() {
  const batch = new Batch();
  const cloth = vertex('awning cloth', { roughness: 0.85, side: THREE.DoubleSide });
  const metal = named('awning frame', '#2b3a40', { roughness: 0.5, metalness: 0.4 });
  const stripes = 16, width = 4, drop = 0.75, reach = 1.5;
  for (let i = 0; i < stripes; i++) {
    const x0 = -width / 2 + (i * width) / stripes, x1 = x0 + width / stripes;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([x0, 0, 0, x1, 0, 0, x1, -drop, reach, x0, 0, 0, x1, -drop, reach, x0, -drop, reach], 3));
    geometry.computeVertexNormals();
    batch.add(cloth, paint(geometry, () => hex(i % 2 === 0 ? '#7fd1c4' : '#fff0d2')));
    const front = new THREE.BufferGeometry();
    front.setAttribute('position', new THREE.Float32BufferAttribute([x0, -drop, reach, x1, -drop, reach, x1, -drop - 0.22, reach, x0, -drop, reach, x1, -drop - 0.22, reach, x0, -drop - 0.22, reach], 3));
    front.computeVertexNormals();
    batch.add(cloth, paint(front, () => hex(i % 2 === 0 ? '#7fd1c4' : '#fff0d2')));
  }
  for (const x of [-width / 2, 0, width / 2]) batch.add(metal, new THREE.BoxGeometry(0.04, 0.04, reach + 0.05), [x, -drop / 2, reach / 2], [Math.atan2(drop, reach), 0, 0]);
  return batch.group('awning');
}
await exportModel('awning', buildAwning());

/** Rooftop clutter: air-handlers and a vent stack, a water tank on legs, an antenna mast with a dish. Each fits a 3 m square. */
function buildRoofClutter(kind) {
  const batch = new Batch();
  const steel = named('roof steel', '#9aa3a8', { roughness: 0.55, metalness: 0.5 });
  const paintMat = named('roof paint', '#d9d2c4', { roughness: 0.85 });
  const dark = named('roof dark', '#2b3036', { roughness: 0.8 });
  const rust = named('roof tank', '#8a5a3c', { roughness: 0.9 });
  if (kind === 'a') {
    for (const [x, z] of [[-0.9, -0.7], [0.9, -0.7], [-0.9, 0.8], [0.9, 0.8]]) {
      batch.add(paintMat, new RoundedBoxGeometry(1.4, 0.9, 1.1, 2, 0.05), [x, 0.45, z]);
      batch.add(dark, new THREE.CylinderGeometry(0.4, 0.4, 0.05, 16), [x, 0.93, z]);
    }
    batch.add(steel, new THREE.CylinderGeometry(0.16, 0.16, 1.5, 10), [0, 0.75, 0]);
  } else if (kind === 'b') {
    for (const [x, z] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) batch.add(steel, new THREE.BoxGeometry(0.1, 2.2, 0.1), [x, 1.1, z]);
    batch.add(steel, new THREE.BoxGeometry(2, 0.08, 0.08), [0, 1.2, 0.9]);
    batch.add(steel, new THREE.BoxGeometry(2, 0.08, 0.08), [0, 1.2, -0.9]);
    batch.add(rust, new THREE.CylinderGeometry(1.15, 1.15, 2.1, 20), [0, 3.25, 0]);
    batch.add(rust, new THREE.ConeGeometry(1.2, 0.7, 20), [0, 4.65, 0]);
  } else {
    batch.add(paintMat, new THREE.BoxGeometry(2.2, 2.4, 2), [-0.4, 1.2, 0.2]);
    batch.add(dark, new THREE.BoxGeometry(0.9, 1.9, 0.08), [-0.4, 0.95, 1.22]);
    batch.add(steel, new THREE.CylinderGeometry(0.05, 0.07, 7, 8), [0.95, 3.5, -0.7]);
    for (const y of [4.6, 5.6, 6.5]) batch.add(steel, new THREE.BoxGeometry(1.1 - (y - 4.6) * 0.12, 0.04, 0.04), [0.95, y, -0.7]);
    batch.add(steel, new THREE.SphereGeometry(0.55, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), [0.6, 2.7, 0.8], [-1.1, 0, 0]);
  }
  return batch.group(`roof clutter ${kind}`);
}
for (const kind of ['a', 'b', 'c']) await exportModel(`roof-clutter-${kind}`, buildRoofClutter(kind));

/** A pole-mounted blade sign: three neon tubes (pink, mint, amber) around a dark board. */
function buildNeonPole() {
  const batch = new Batch();
  const dark = named('sign board', '#14242b', { roughness: 0.6, metalness: 0.3 });
  const pink = glow('neon pink', '#ff4f8b'), mint = glow('neon mint', '#7fd1c4', 1.3), amber = glow('neon amber', '#ffb020', 1.3);
  batch.add(dark, new THREE.CylinderGeometry(0.06, 0.07, 3.6, 8), [0, 1.8, 0]);
  batch.add(dark, new RoundedBoxGeometry(0.16, 1.5, 1.0, 2, 0.04), [0, 3.2, 0.4]);
  batch.add(dark, new THREE.BoxGeometry(0.1, 0.1, 0.5), [0, 2.6, 0.2]);
  // Frame, a rising arrow and two bars of "text".
  for (const [y, h] of [[3.92, 0.05], [2.48, 0.05]]) batch.add(pink, new THREE.BoxGeometry(0.22, h, 0.92), [0, y, 0.4]);
  for (const z of [-0.02, 0.82]) batch.add(pink, new THREE.BoxGeometry(0.22, 1.45, 0.05), [0, 3.2, z]);
  batch.add(mint, new THREE.BoxGeometry(0.22, 0.16, 0.7), [0, 3.55, 0.4]);
  batch.add(mint, new THREE.BoxGeometry(0.22, 0.16, 0.5), [0, 3.25, 0.3]);
  batch.add(amber, new THREE.BoxGeometry(0.22, 0.4, 0.14), [0, 2.85, 0.4]);
  batch.add(amber, new THREE.BoxGeometry(0.22, 0.14, 0.4), [0, 2.85, 0.4]);
  return batch.group('neon pole sign');
}
await exportModel('neon-pole', buildNeonPole());

/** A shop-front sign on a pole: a painted board (named `board`, tinted per shop) with a lit trim and a cream tab. */
function buildShopSign() {
  const batch = new Batch();
  const pole = named('sign pole', '#2b3a40', { roughness: 0.5, metalness: 0.5 });
  const board = named('board', '#7fd1c4', { roughness: 0.5 });
  const trim = glow('sign trim', '#fff0d2', 0.9);
  batch.add(pole, new THREE.CylinderGeometry(0.06, 0.07, 2.4, 8), [0, 1.2, 0]);
  batch.add(board, new RoundedBoxGeometry(0.12, 0.9, 1.6, 2, 0.04), [0, 2.0, 0.55]);
  batch.add(trim, new THREE.BoxGeometry(0.15, 0.06, 1.5), [0, 2.4, 0.55]);
  batch.add(trim, new THREE.BoxGeometry(0.15, 0.06, 1.5), [0, 1.6, 0.55]);
  batch.add(trim, new THREE.BoxGeometry(0.15, 0.3, 0.8), [0, 2.0, 0.55]);
  return batch.group('shop sign');
}
await exportModel('shop-sign', buildShopSign());

/** A 20 ft shipping container: corrugated sides, locking rods on the doors, painted by `container paint`. */
function buildContainer() {
  const batch = new Batch();
  const body = vertex('container paint', { roughness: 0.6, metalness: 0.3 });
  const steel = named('container steel', '#4a4f55', { roughness: 0.5, metalness: 0.6 });
  const L = 6.06, W = 2.44, H = 2.59;
  batch.add(body, colored(new THREE.BoxGeometry(L, H - 0.1, W - 0.12), '#ffffff'), [0, H / 2, 0]);
  for (let i = 0; i < 27; i++) {
    const z = -L / 2 + 0.3 + i * ((L - 0.6) / 26);
    for (const x of [-1, 1]) batch.add(body, colored(new THREE.BoxGeometry(0.06, H - 0.35, 0.09), '#d6d6d6'), [x * (W / 2 - 0.05), H / 2, z]);
  }
  batch.add(steel, new THREE.BoxGeometry(W, 0.12, L), [0, 0.06, 0]);
  batch.add(steel, new THREE.BoxGeometry(W, 0.12, L), [0, H - 0.06, 0]);
  for (const x of [-1, 1]) for (const z of [-1, 1]) batch.add(steel, new THREE.BoxGeometry(0.14, H, 0.14), [x * (W / 2 - 0.07), H / 2, z * (L / 2 - 0.07)]);
  for (const x of [-0.5, -0.17, 0.17, 0.5]) batch.add(steel, new THREE.CylinderGeometry(0.018, 0.018, H - 0.4, 6), [x, H / 2, L / 2 + 0.02]);
  return batch.group('shipping container');
}
await exportModel('shipping-container', buildContainer());

/** A traffic signal: a 5 m pole with a mast arm over the lane and a three-lamp head at each end. */
function buildTrafficSignal() {
  const batch = new Batch();
  const pole = named('signal pole', '#38424a', { roughness: 0.55, metalness: 0.5 });
  const head = named('signal head', '#151a1e', { roughness: 0.6 });
  const red = glow('signal red', '#ff3b30', 1.2), amber = glow('signal amber', '#ffb020', 0.35), green = glow('signal green', '#2fd8b0', 0.35);
  batch.add(pole, new THREE.CylinderGeometry(0.08, 0.11, 5, 10), [0, 2.5, 0]);
  batch.add(pole, new THREE.BoxGeometry(0.08, 0.08, 3.4), [0, 5.0, 1.7]);
  for (const z of [1.2, 3.1]) {
    batch.add(head, new RoundedBoxGeometry(0.4, 1.1, 0.34, 2, 0.05), [0, 4.55, z]);
    batch.add(red, new THREE.SphereGeometry(0.12, 12, 8), [0, 4.85, z + 0.18]);
    batch.add(amber, new THREE.SphereGeometry(0.12, 12, 8), [0, 4.55, z + 0.18]);
    batch.add(green, new THREE.SphereGeometry(0.12, 12, 8), [0, 4.25, z + 0.18]);
  }
  return batch.group('traffic signal');
}
await exportModel('traffic-signal', buildTrafficSignal());

const spinner = (batch, mat, radius, blades, position, rotation = [0, 0, 0]) => {
  for (let i = 0; i < blades; i++) batch.add(mat, new THREE.BoxGeometry(radius * 2, 0.025, 0.2), position, [rotation[0], rotation[1] + (i * Math.PI) / blades, rotation[2]]);
};

/** A light helicopter, 10 m nose to tail boom, skids at y = -1 and a rotor blur over the mast. */
function buildHelicopter() {
  const batch = new Batch();
  const hull = named('heli paint', '#e7e9ee', { roughness: 0.35, metalness: 0.3 });
  const stripe = named('heli stripe', '#ff4f8b', { roughness: 0.4 });
  const glass = named('heli glass', '#25465a', { roughness: 0.1, metalness: 0.6 });
  const dark = named('heli dark', '#1b2126', { roughness: 0.6 });
  const blur = named('rotor blur', '#cfd8dc', { transparent: true, opacity: 0.18, roughness: 1, side: THREE.DoubleSide, depthWrite: false });
  batch.add(hull, new THREE.SphereGeometry(1, 20, 14), [0, 0, 0.6], [0, 0, 0], [0.95, 0.95, 1.7]);
  batch.add(glass, new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.2), [0, 0.1, 1.55], [0.35, 0, 0], [0.85, 0.85, 1.0]);
  batch.add(stripe, new THREE.BoxGeometry(1.92, 0.12, 2.6), [0, -0.08, 0.5]);
  batch.add(hull, new THREE.CylinderGeometry(0.34, 0.12, 5.5, 10), [0, 0.35, -3.2], [Math.PI / 2, 0, 0]);
  batch.add(hull, new THREE.BoxGeometry(0.06, 1.1, 0.9), [0, 0.95, -5.9], [0.15, 0, 0]);
  batch.add(dark, new THREE.CylinderGeometry(0.12, 0.12, 0.7, 8), [0, 1.15, 0.2]);
  spinner(batch, dark, 4.6, 2, [0, 1.5, 0.2]);
  batch.add(blur, new THREE.CircleGeometry(4.6, 32), [0, 1.5, 0.2], [-Math.PI / 2, 0, 0]);
  batch.add(dark, new THREE.CylinderGeometry(0.4, 0.4, 0.03, 12), [0.12, 1.0, -5.95], [0, 0, Math.PI / 2]);
  for (const s of [-1, 1]) {
    batch.add(dark, new THREE.BoxGeometry(0.1, 0.1, 3.4), [s * 0.95, -1, 0.6]);
    for (const z of [-0.4, 1.5]) batch.add(dark, new THREE.BoxGeometry(0.08, 0.75, 0.08), [s * 0.92, -0.62, z], [0, 0, s * 0.18]);
  }
  return batch.group('helicopter');
}
await exportModel('helicopter', buildHelicopter());

/** A four-seat high-wing floatplane, 8.4 m long on 11 m wings; pontoons stand on y = -1. */
function buildFloatplane() {
  const batch = new Batch();
  const hull = named('plane paint', '#fff0d2', { roughness: 0.4, metalness: 0.25 });
  const stripe = named('plane stripe', '#ff4f8b', { roughness: 0.4 });
  const mint = named('plane trim', '#7fd1c4', { roughness: 0.45 });
  const glass = named('plane glass', '#25465a', { roughness: 0.1, metalness: 0.6 });
  const dark = named('plane dark', '#1b2126', { roughness: 0.6 });
  const blur = named('prop blur', '#cfd8dc', { transparent: true, opacity: 0.2, roughness: 1, side: THREE.DoubleSide, depthWrite: false });
  batch.add(hull, new THREE.SphereGeometry(1, 20, 12), [0, 0.2, 0.4], [0, 0, 0], [0.7, 0.75, 2.5]);
  batch.add(hull, new THREE.CylinderGeometry(0.22, 0.5, 3.4, 10), [0, 0.35, -3.3], [Math.PI / 2, 0, 0]);
  batch.add(glass, new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), [0, 0.65, 0.6], [0, 0, 0], [0.62, 0.45, 1.1]);
  batch.add(stripe, new THREE.BoxGeometry(1.42, 0.1, 4.2), [0, 0.2, 0.2]);
  batch.add(hull, new THREE.BoxGeometry(11, 0.1, 1.5), [0, 1.18, 0.7]);
  batch.add(mint, new THREE.BoxGeometry(0.3, 0.11, 1.52), [5.4, 1.18, 0.7]);
  batch.add(mint, new THREE.BoxGeometry(0.3, 0.11, 1.52), [-5.4, 1.18, 0.7]);
  for (const s of [-1, 1]) batch.add(dark, new THREE.BoxGeometry(0.06, 1.35, 0.08), [s * 1.6, 0.55, 0.7], [0, 0, s * -0.55]);
  batch.add(hull, new THREE.BoxGeometry(3.6, 0.07, 0.9), [0, 0.5, -4.9]);
  batch.add(stripe, new THREE.BoxGeometry(0.07, 1.1, 1.0), [0, 1.0, -4.9], [0.2, 0, 0]);
  batch.add(dark, new THREE.CylinderGeometry(0.16, 0.16, 0.3, 10), [0, 0.2, 2.55], [Math.PI / 2, 0, 0]);
  spinner(batch, dark, 1.0, 2, [0, 0.2, 2.75], [Math.PI / 2, 0, 0]);
  batch.add(blur, new THREE.CircleGeometry(1.0, 20), [0, 0.2, 2.78]);
  for (const s of [-1, 1]) {
    batch.add(hull, new THREE.CapsuleGeometry(0.28, 4.6, 6, 12), [s * 1.5, -0.7, 0.6], [Math.PI / 2, 0, 0]);
    for (const z of [-0.5, 1.7]) batch.add(dark, new THREE.BoxGeometry(0.07, 0.7, 0.07), [s * 1.2, -0.25, z], [0, 0, s * -0.4]);
  }
  return batch.group('floatplane');
}
await exportModel('floatplane', buildFloatplane());

/** A light fighter-trainer jet: 13 m long, swept wings, twin fins, wheels on y = -1.1. */
function buildJet() {
  const batch = new Batch();
  const hull = named('jet paint', '#c9d1d6', { roughness: 0.35, metalness: 0.6 });
  const stripe = named('jet stripe', '#ff4f8b', { roughness: 0.4 });
  const glass = named('jet glass', '#25465a', { roughness: 0.1, metalness: 0.7 });
  const dark = named('jet dark', '#1b2126', { roughness: 0.55 });
  const burn = glow('jet exhaust', '#ffb020', 1.1);
  batch.add(hull, new THREE.CylinderGeometry(0.55, 0.65, 8.5, 12), [0, 0, -0.5], [Math.PI / 2, 0, 0]);
  batch.add(hull, new THREE.ConeGeometry(0.55, 3.4, 12), [0, 0, 5.4], [Math.PI / 2, 0, 0]);
  batch.add(glass, new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), [0, 0.5, 2.3], [0, 0, 0], [0.5, 0.5, 1.5]);
  for (const s of [-1, 1]) {
    const wing = new THREE.BufferGeometry();
    const x = s * 5.2;
    wing.setAttribute('position', new THREE.Float32BufferAttribute(s > 0 ? [0.5, 0, 1.6, x, 0, -1.8, 0.5, 0, -2.2, 0.5, 0, 1.6, 0.5, 0, -2.2, x, 0, -1.8] : [-0.5, 0, 1.6, -0.5, 0, -2.2, x, 0, -1.8, -0.5, 0, 1.6, x, 0, -1.8, -0.5, 0, -2.2], 3));
    wing.computeVertexNormals();
    batch.add(hull, wing, [0, 0, 0]);
    batch.add(hull, new THREE.BoxGeometry(2.2, 0.07, 1.0), [s * 1.3, 0.05, -5.0], [0, s * 0.35, 0]);
    batch.add(hull, new THREE.BoxGeometry(0.07, 1.4, 1.5), [s * 0.8, 1.0, -4.4], [0.25, 0, s * 0.18]);
    batch.add(stripe, new THREE.BoxGeometry(0.075, 0.25, 1.5), [s * 0.85, 1.3, -4.4], [0.25, 0, s * 0.18]);
    batch.add(dark, new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), [s * 0.7, -0.5, 0.8]);
    batch.add(dark, new THREE.CylinderGeometry(0.2, 0.2, 0.14, 12), [s * 0.7, -1.0, 0.8], [0, 0, Math.PI / 2]);
  }
  batch.add(dark, new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6), [0, -0.5, 3.4]);
  batch.add(dark, new THREE.CylinderGeometry(0.15, 0.15, 0.1, 12), [0, -1.0, 3.4], [0, 0, Math.PI / 2]);
  batch.add(dark, new THREE.CylinderGeometry(0.62, 0.52, 0.8, 12), [0, 0, -5.0], [Math.PI / 2, 0, 0]);
  batch.add(burn, new THREE.CircleGeometry(0.46, 12), [0, 0, -5.42], [Math.PI, 0, 0]);
  return batch.group('jet');
}
await exportModel('jet', buildJet());

/** A gull in a glide, 1.1 m across the wings, black tips and a yellow bill. */
function buildGull() {
  const batch = new Batch();
  const gull = vertex('gull feathers', { roughness: 0.8, side: THREE.DoubleSide });
  const bill = named('gull bill', '#ffb020', { roughness: 0.6 });
  batch.add(gull, paint(new THREE.SphereGeometry(1, 10, 8), () => hex('#f4f6f7')), [0, 0, 0], [0, 0, 0], [0.09, 0.08, 0.22]);
  batch.add(gull, paint(new THREE.SphereGeometry(1, 8, 6), () => hex('#f4f6f7')), [0, 0.03, 0.22], [0, 0, 0], [0.05, 0.05, 0.06]);
  batch.add(bill, new THREE.ConeGeometry(0.018, 0.09, 6), [0, 0.02, 0.31], [Math.PI / 2, 0, 0]);
  for (const s of [-1, 1]) {
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute(s > 0 ? [0.06, 0, 0.1, 0.34, 0.08, -0.02, 0.06, 0, -0.12, 0.34, 0.08, -0.02, 0.58, 0.02, -0.16, 0.06, 0, -0.12] : [-0.06, 0, 0.1, -0.06, 0, -0.12, -0.34, 0.08, -0.02, -0.34, 0.08, -0.02, -0.06, 0, -0.12, -0.58, 0.02, -0.16], 3));
    wing.computeVertexNormals();
    paint(wing, (x) => (Math.abs(x) > 0.45 ? hex('#1d2226') : hex('#e9eef0')));
    batch.add(gull, wing);
  }
  batch.add(gull, paint(new THREE.BoxGeometry(0.1, 0.012, 0.16), () => hex('#f4f6f7')), [0, 0, -0.26]);
  return batch.group('gull');
}
await exportModel('gull', buildGull());

/** A harbour sloop: a 9 m hull with a cabin, a mast and two white sails; the waterline is y = 0. */
function buildSailboat() {
  const batch = new Batch();
  const hull = named('boat hull', '#fff0d2', { roughness: 0.4 });
  const band = named('boat band', '#155462', { roughness: 0.45 });
  const deck = named('boat deck', '#c9a46a', { roughness: 0.8 });
  const sail = named('boat sail', '#fffaf0', { roughness: 0.9, side: THREE.DoubleSide });
  const spar = named('boat spar', '#9aa3a8', { roughness: 0.4, metalness: 0.6 });
  const hullShape = (w, len, h) => {
    const g = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    g.scale(w, h, len);
    return g;
  };
  batch.add(hull, hullShape(1.5, 4.5, 0.9), [0, 0.5, 0], [Math.PI, 0, 0]);
  batch.add(band, new THREE.BoxGeometry(2.4, 0.12, 6.4), [0, 0.46, 0]);
  batch.add(deck, new THREE.BoxGeometry(2.3, 0.06, 6), [0, 0.95, -0.2]);
  batch.add(hull, new RoundedBoxGeometry(1.5, 0.55, 2.4, 2, 0.1), [0, 1.25, -0.4]);
  batch.add(spar, new THREE.CylinderGeometry(0.05, 0.07, 11, 8), [0, 6.4, 0.4]);
  batch.add(spar, new THREE.CylinderGeometry(0.04, 0.04, 3.6, 6), [0, 2.4, -1.4], [Math.PI / 2, 0, 0]);
  const main = new THREE.BufferGeometry();
  main.setAttribute('position', new THREE.Float32BufferAttribute([0, 2.5, 0.35, 0, 11.5, 0.35, 0, 2.5, -3.1], 3));
  main.computeVertexNormals();
  batch.add(sail, main);
  const jib = new THREE.BufferGeometry();
  jib.setAttribute('position', new THREE.Float32BufferAttribute([0, 2.0, 0.5, 0, 10.4, 0.45, 0, 2.0, 3.6], 3));
  jib.computeVertexNormals();
  batch.add(sail, jib);
  return batch.group('sailboat');
}
await exportModel('sailboat', buildSailboat());

/** A runabout, 6.5 m: a deep-V hull, a windscreen and a cream bench; waterline at y = 0. */
function buildMotorboat() {
  const batch = new Batch();
  const hull = named('runabout hull', '#ff4f8b', { roughness: 0.35 });
  const top = named('runabout deck', '#fff0d2', { roughness: 0.5 });
  const glass = named('runabout glass', '#25465a', { roughness: 0.1, metalness: 0.5 });
  const dark = named('runabout dark', '#1b2126', { roughness: 0.6 });
  const shape = new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  shape.scale(1.05, 0.7, 3.25);
  batch.add(hull, shape, [0, 0.55, 0], [Math.PI, 0, 0]);
  batch.add(top, new THREE.BoxGeometry(2.0, 0.06, 5.2), [0, 0.57, -0.3]);
  batch.add(top, new RoundedBoxGeometry(1.7, 0.4, 1.0, 2, 0.1), [0, 0.8, -1.3]);
  batch.add(glass, new THREE.BoxGeometry(1.7, 0.5, 0.06), [0, 1.2, 0.4], [-0.45, 0, 0]);
  batch.add(dark, new THREE.BoxGeometry(0.4, 0.5, 0.5), [0, 0.8, -3.3]);
  return batch.group('runabout');
}
await exportModel('runabout', buildMotorboat());

/** The pool of sodium light a streetlamp throws on the road, 5 m across: an amber disc fading to nothing at its edge. */
function buildLampPool() {
  const batch = new Batch();
  const pool = vertex('lamp pool', { side: THREE.DoubleSide, transparent: true, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const rings = 6, around = 24, radius = 5;
  const positions = [], colors = [], index = [];
  const amber = hex('#ffb020');
  positions.push(0, 0, 0);
  colors.push(...amber, 0.34);
  for (let r = 1; r <= rings; r++) {
    const t = r / rings;
    for (let a = 0; a < around; a++) {
      const angle = (a / around) * Math.PI * 2;
      positions.push(Math.cos(angle) * radius * t, 0, Math.sin(angle) * radius * t);
      colors.push(...amber, 0.34 * Math.pow(1 - t, 1.6));
    }
  }
  for (let a = 0; a < around; a++) index.push(0, 1 + ((a + 1) % around), 1 + a);
  for (let r = 1; r < rings; r++) for (let a = 0; a < around; a++) {
    const i0 = 1 + (r - 1) * around + a, i1 = 1 + (r - 1) * around + ((a + 1) % around), o0 = 1 + r * around + a, o1 = 1 + r * around + ((a + 1) % around);
    index.push(i0, i1, o0, i1, o1, o0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  batch.add(pool, geometry);
  return batch.group('lamp pool');
}
await exportModel('lamp-pool', buildLampPool());
