// Original Cleanup on Aisle 9 geometry. Regenerate with `bun --cwd=games/drift-foundry run author-models`.
// Chunky, toy-proportioned shopping carts, shoppers, store fixtures and products: bevelled boxes,
// rounded tubes and spheres, flat-shaded, in the store's bright packaging palette. No real brands.
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BoxGeometry, ConeGeometry, CylinderGeometry, SphereGeometry, TorusGeometry, Vector3, Quaternion, Matrix4, Color } from 'three';
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const output = fileURLToPath(new URL('../src/game/art/', import.meta.url));
mkdirSync(output, { recursive: true });
for (const file of readdirSync(output)) if (file.endsWith('.glb')) unlinkSync(`${output}${file}`);

// Colours are hex strings. A leading '*' makes the material emissive, '~' makes it chrome, and '^'
// makes it a house light: emissive, in the `house` light group a lighting zone can switch off.
const CHROME = '~#c9d1d9';
const RED = '#e8303a';
const YELLOW = '#ffd21e';
const SKIN = '#f1c7a1';
const SKIN_DARK = '#a8704a';
const INK = '#23262d';
const WHITE = '#f4f4f0';
const CARDBOARD = '#c9955a';
const WOOD = '#c89a62';

/** A tiny seeded generator so a regenerated shelf keeps the same product mix. */
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function author(name, build) {
  const groups = new Map();
  const group = (color) => {
    if (!groups.has(color)) groups.set(color, { positions: [], normals: [] });
    return groups.get(color);
  };
  const add = (geo, color, position = [0, 0, 0], rotation = [0, 0, 0], scale) => {
    if (scale) geo.scale(...scale);
    geo.rotateX(rotation[0]); geo.rotateY(rotation[1]); geo.rotateZ(rotation[2]); geo.translate(...position);
    const triangles = geo.index ? geo.toNonIndexed() : geo;
    triangles.computeVertexNormals();
    const g = group(color);
    g.positions.push(...triangles.attributes.position.array);
    g.normals.push(...triangles.attributes.normal.array);
    geo.dispose(); if (triangles !== geo) triangles.dispose();
  };
  const box = (size, pos, color, rot) => {
    // Bevel only what reads at a distance: small product boxes stay plain so a shelf run stays cheap.
    const radius = Math.min(.05, Math.min(...size) * .3);
    add(Math.min(...size) >= .5 ? new RoundedBoxGeometry(size[0], size[1], size[2], 1, radius) : new BoxGeometry(...size), color, pos, rot);
  };
  const cylinder = (r, h, pos, color, rot = [0, 0, 0], top = r, segments = 12) => add(new CylinderGeometry(top, r, h, segments, 1), color, pos, rot);
  const cone = (r, h, pos, color, rot = [0, 0, 0]) => add(new ConeGeometry(r, h, 10), color, pos, rot);
  const sphere = (r, pos, color, scale, rot = [0, 0, 0]) => add(new SphereGeometry(r, r < .3 ? 6 : 9, r < .3 ? 4 : 6), color, pos, rot, scale);
  const tube = (a, b, r, color) => {
    const from = new Vector3(...a), to = new Vector3(...b), delta = to.clone().sub(from);
    const geo = new CylinderGeometry(r, r, delta.length(), 6);
    geo.applyMatrix4(new Matrix4().compose(from.add(to).multiplyScalar(.5), new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), delta.normalize()), new Vector3(1, 1, 1)));
    add(geo, color);
  };
  const ring = (r, thickness, pos, color, rot) => add(new TorusGeometry(r, thickness, 6, 18), color, pos, rot);
  build({ box, cylinder, cone, sphere, tube, ring });

  const buffers = [], views = [], accessors = [], primitives = [], materials = [];
  let offset = 0;
  function attribute(values, bounds) {
    const bytes = Buffer.from(new Float32Array(values).buffer);
    const view = views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target: 34962 }) - 1;
    offset += bytes.length; buffers.push(bytes);
    const accessor = { bufferView: view, componentType: 5126, count: values.length / 3, type: 'VEC3' };
    if (bounds) {
      accessor.min = [Infinity, Infinity, Infinity]; accessor.max = [-Infinity, -Infinity, -Infinity];
      values.forEach((v, i) => { accessor.min[i % 3] = Math.min(accessor.min[i % 3], v); accessor.max[i % 3] = Math.max(accessor.max[i % 3], v); });
    }
    return accessors.push(accessor) - 1;
  }
  for (const [key, g] of groups) {
    const house = key.startsWith('^');
    const emissive = house || key.startsWith('*');
    const chrome = key.startsWith('~');
    const c = new Color(key.replace(/^[*~^]/, ''));
    const material = materials.push({
      name: key,
      pbrMetallicRoughness: { baseColorFactor: [c.r, c.g, c.b, 1], metallicFactor: chrome ? .85 : .05, roughnessFactor: chrome ? .28 : .62 },
      ...(emissive ? { emissiveFactor: [c.r, c.g, c.b] } : {}),
      ...(house ? { extras: { lightGroup: 'house' } } : {}),
    }) - 1;
    primitives.push({ attributes: { POSITION: attribute(g.positions, true), NORMAL: attribute(g.normals) }, material });
  }
  const json = Buffer.from(JSON.stringify({ asset: { version: '2.0', generator: 'Cleanup on Aisle 9 original geometry', copyright: 'JGengine Games contributors' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name }], meshes: [{ primitives }], materials, buffers: [{ byteLength: offset }], bufferViews: views, accessors }));
  const padded = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)]);
  const bin = Buffer.concat(buffers);
  const header = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + padded.length + bin.length, 8);
  jh.writeUInt32LE(padded.length); jh.writeUInt32LE(0x4e4f534a, 4); bh.writeUInt32LE(bin.length); bh.writeUInt32LE(0x004e4942, 4);
  writeFileSync(`${output}${name}.glb`, Buffer.concat([header, jh, padded, bh, bin]));
  console.log(`${name}: ${bin.length} geometry bytes, ${primitives.length} material groups`);
}

// ---------------------------------------------------------------- carts and shoppers

/**
 * Where the push bar sits on every cart, in the cart's own space: the player's one shopper model
 * stands behind whichever chassis is under them, so every chassis puts its bar here.
 */
const GRIP = { y: 1.27, z: -.99 };
/** Radius of the push bar the shopper's hands close around. */
const BAR = .055;

/**
 * The shopping cart, nose toward +z: four casters, a wire basket that flares toward the front, a
 * fold-down child seat at the back and the push handle. Every chassis is built from the same parts.
 */
function cart(b, { length = 2.0, width = 1.25, height = 1.15, handle = RED, wire = CHROME, seat = true, base = .32, bar = true } = {}) {
  const { box, cylinder, tube } = b;
  const half = length / 2, w = width / 2;
  // Casters and the lower frame.
  for (const x of [-w * .82, w * .82]) for (const z of [-half * .8, half * .85]) {
    cylinder(.13, .1, [x, .13, z], INK, [0, 0, Math.PI / 2]);
    cylinder(.06, .12, [x, .13, z], CHROME, [0, 0, Math.PI / 2]);
    tube([x, .13, z], [x, base, z], .03, wire);
  }
  for (const x of [-w * .82, w * .82]) tube([x, base, -half * .8], [x, base, half * .85], .035, wire);
  tube([-w * .82, base, half * .85], [w * .82, base, half * .85], .035, wire);
  tube([-w * .82, base, -half * .8], [w * .82, base, -half * .8], .035, wire);
  // The bottom tray rack.
  for (let i = 0; i <= 5; i++) { const z = -half * .7 + i * (half * 1.5 / 5); tube([-w * .8, base + .02, z], [w * .8, base + .02, z], .015, wire); }
  // The basket: a floor, four sides of wire flaring forward.
  const floor = base + .28, top = height;
  const back = -half * .65, front = half;
  const flare = .08;
  for (const x of [-1, 1]) {
    tube([x * w * .78, floor, back], [x * (w + flare), top, back - .05], .03, wire);
    tube([x * w * .78, floor, front - .1], [x * (w + flare), top, front], .03, wire);
    tube([x * (w + flare), top, back - .05], [x * (w + flare), top, front], .035, wire);
    tube([x * w * .78, floor, back], [x * w * .78, floor, front - .1], .03, wire);
    for (let i = 1; i < 7; i++) {
      const t = i / 7, z0 = back + (front - .1 - back) * t, z1 = back - .05 + (front + .05 - back) * t;
      tube([x * w * .78, floor, z0], [x * (w + flare), top, z1], .012, wire);
    }
    for (let k = 1; k < 4; k++) {
      const t = k / 4;
      tube([x * (w * .78 + (w + flare - w * .78) * t), floor + (top - floor) * t, back - .05 * t], [x * (w * .78 + (w + flare - w * .78) * t), floor + (top - floor) * t, front - .1 + .1 * t], .012, wire);
    }
  }
  tube([-(w + flare), top, front], [w + flare, top, front], .035, wire);
  tube([-w * .78, floor, front - .1], [w * .78, floor, front - .1], .03, wire);
  for (let i = 1; i < 8; i++) { const x = -w * .78 + i * (w * 1.56 / 8); tube([x, floor, front - .1], [x * (w + flare) / (w * .78), top, front], .012, wire); }
  for (let i = 0; i <= 6; i++) { const z = back + i * (front - .1 - back) / 6; tube([-w * .78, floor, z], [w * .78, floor, z], .012, wire); }
  // Back gate with the child seat and the handle.
  tube([-(w + flare), top, back - .05], [w + flare, top, back - .05], .035, wire);
  for (let i = 0; i <= 6; i++) { const x = -w * .78 + i * (w * 1.56 / 6); tube([x, floor, back], [x * (w + flare) / (w * .78), top, back - .05], .012, wire); }
  if (seat) {
    box([w * 1.4, .05, .38], [0, top - .25, back + .22], handle);
    box([w * 1.4, .32, .04], [0, top - .1, back + .02], handle);
  }
  if (!bar) return;
  for (const x of [-1, 1]) tube([x * (w + flare), top, back - .05], [x * (w + flare) * .95, GRIP.y, GRIP.z + .02], .035, wire);
  cylinder(BAR, (w + flare) * 2, [0, GRIP.y, GRIP.z], handle, [0, 0, Math.PI / 2]);
}

/**
 * A blocky shopper standing behind the handle, hands closed over the bar: each fist sits on the
 * bar's back and top, so the forearm stops short of the bar instead of running through it.
 */
function shopper(b, { z = -1.38, shirt = '#2fa8ff', pants = '#2b3a5c', skin = SKIN, hair = '#4a2a18', height = 1, bulk = 1, hat, cap, bun, glasses, headband, vest, handleY = GRIP.y, handleZ = GRIP.z, lean = .18 } = {}) {
  const { box, sphere, tube, cylinder } = b;
  const h = height;
  for (const x of [-.13, .13]) {
    box([.16 * bulk, .78 * h, .2], [x * bulk, .39 * h, z], pants);
    box([.18 * bulk, .1, .3], [x * bulk, .05, z + .05], INK);
  }
  const hip = .8 * h, chest = hip + .55 * h;
  box([.46 * bulk, .6 * h, .28 * Math.max(1, bulk * .8)], [0, hip + .3 * h, z + lean * .3], shirt, [lean, 0, 0]);
  if (vest) box([.48 * bulk, .4 * h, .3 * Math.max(1, bulk * .8)], [0, hip + .32 * h, z + lean * .3], vest, [lean, 0, 0]);
  const headZ = z + lean * .7;
  sphere(.15 * Math.max(1, bulk * .85), [0, chest + .17 * h, headZ], skin);
  sphere(.155 * Math.max(1, bulk * .85), [0, chest + .23 * h, headZ - .03], hair, [1, .6, 1]);
  if (bun) sphere(.08, [0, chest + .36 * h, headZ - .1], hair);
  if (glasses) { for (const x of [-.06, .06]) b.ring(.035, .01, [x, chest + .19 * h, headZ + .14], INK, [0, 0, 0]); }
  if (headband) cylinder(.16 * bulk * .85, .05, [0, chest + .25 * h, headZ], headband);
  if (cap) { cylinder(.16, .08, [0, chest + .3 * h, headZ], cap); box([.2, .02, .16], [0, chest + .27 * h, headZ + .15], cap); }
  if (hat) hat(b, [0, chest + .3 * h, headZ]);
  for (const x of [-1, 1]) {
    const shoulder = [x * .24 * bulk, chest - .02, z + lean * .55];
    const fist = [x * .3, handleY + BAR * .5, handleZ - BAR * 1.1];
    const wrist = [x * .3, handleY + BAR * .7, handleZ - BAR * 2.2];
    tube(shoulder, wrist, .055 * Math.min(bulk, 1.2), shirt);
    tube(wrist, fist, .045, skin);
    sphere(.07, fist, skin, [1.15, .9, 1]);
  }
}

author('cart-standard', (b) => cart(b));
author('cart-kiddie', (b) => {
  cart(b, { length: 1.7, width: 1.05, height: 1.05, handle: '#ff3b30', seat: false });
  // The race-car nose bolted on the front: red bodywork, a windscreen and a toy steering wheel.
  b.box([1.15, .42, .9], [0, .36, 1.1], '#ff3b30');
  b.box([.9, .2, .5], [0, .62, 1.0], '#ff3b30', [-.25, 0, 0]);
  b.box([.8, .3, .04], [0, .78, .75], '*#bfe8ff', [-.4, 0, 0]);
  b.ring(.14, .03, [0, .85, .6], INK, [-.9, 0, 0]);
  for (const x of [-.6, .6]) b.cylinder(.2, .14, [x, .2, 1.3], INK, [0, 0, Math.PI / 2]);
  b.box([1.2, .06, .25], [0, .5, 1.58], YELLOW);
  b.box([.3, .3, .3], [0, .6, 1.2], WHITE);
});
author('cart-flatbed', (b) => {
  const { box, cylinder, tube } = b;
  // The lumber-aisle flatbed: a long low deck, orange rails and a tall push frame.
  box([1.55, .1, 2.6], [0, .34, .15], '#ff7a1e');
  for (const x of [-.65, .65]) for (const z of [-.95, 1.25]) { cylinder(.16, .12, [x, .16, z], INK, [0, 0, Math.PI / 2]); tube([x, .16, z], [x, .3, z], .04, CHROME); }
  for (const x of [-.75, .75]) tube([x, .4, -1.1], [x, .4, 1.4], .04, '#ff7a1e');
  for (const x of [-.7, .7]) tube([x, .4, -1.1], [x, GRIP.y, GRIP.z], .045, '#ff7a1e');
  cylinder(BAR, 1.5, [0, GRIP.y, GRIP.z], RED, [0, 0, Math.PI / 2]);
  for (let i = 0; i < 5; i++) { const t = (i + .5) / 5.5; tube([-.7, .45 + t * (GRIP.y - .45), -1.1 + t * (GRIP.z + 1.1)], [.7, .45 + t * (GRIP.y - .45), -1.1 + t * (GRIP.z + 1.1)], .02, '#ff7a1e'); }
  box([1.4, .05, .25], [0, .4, 1.4], YELLOW);
});
author('cart-scooter', (b) => {
  const { box, cylinder, tube } = b;
  // A stand-up mobility scooter with a big wire basket on the front and a beacon flag.
  box([1.0, .2, 1.6], [0, .3, -.35], '#3a8f5a');
  box([.9, .15, .9], [0, .44, -.75], INK);
  for (const x of [-.45, .45]) { cylinder(.2, .14, [x, .2, -.9], INK, [0, 0, Math.PI / 2]); cylinder(.18, .14, [x, .2, .55], INK, [0, 0, Math.PI / 2]); }
  tube([0, .4, .35], [0, 1.15, .1], .06, '#3a8f5a');
  tube([-.35, 1.2, .05], [.35, 1.2, .05], .05, INK);
  box([.3, .14, .16], [0, 1.15, .12], '*#5de0ce');
  cart({ ...b }, { length: .9, width: 1.0, height: 1.1, seat: false, base: .5, bar: false });
  // The attendant's push bar off the back of the seat, where the shopper's hands land.
  for (const x of [-.42, .42]) tube([x, .5, -1.05], [x, GRIP.y, GRIP.z], .04, INK);
  cylinder(BAR, .95, [0, GRIP.y, GRIP.z], '#3a8f5a', [0, 0, Math.PI / 2]);
  tube([.4, .45, -1.1], [.4, 2.3, -1.1], .015, WHITE);
  box([.02, .3, .4], [.4, 2.15, -1.3], '#ff8a1e');
  box([1.0, .06, .2], [0, .32, .95], YELLOW);
});

author('shopper-player', (b) => shopper(b, { shirt: '#ff4f5a', pants: '#2b3a5c', hair: '#3a2416', cap: '#ffd21e' }));

/**
 * A cart-safety flag on a whippy pole: each rival flies their own colour high above the shelving, so
 * the field reads apart at a glance even from behind and far down the aisle.
 */
function pennant(b, color, x = .55, z = -.95) {
  b.tube([x, .4, z], [x, 3.1, z], .025, '#e8eaec');
  b.box([.03, .45, .7], [x, 2.85, z - .35], '*' + color);
  b.sphere(.06, [x, 3.12, z], '*' + color);
}

/** A rival: its own cart and its own shopper, so the field reads apart at speed. */
author('cart-rival-grandma', (b) => {
  cart(b, { handle: '#8a5cd6' });
  pennant(b, '#b07cff');
  shopper(b, { shirt: '#b89ad6', pants: '#6b5a8a', hair: '#e8e8ec', height: .82, bun: true, glasses: true, lean: .32 });
  // Coupon binder and a handbag in the child seat.
  b.box([.36, .3, .1], [0, 1.05, -.45], '#ffd21e', [.3, 0, 0]);
  b.box([.3, .22, .14], [.25, 1.0, -.35], '#7a2a4a');
});
author('cart-rival-twins', (b) => {
  cart(b, { handle: '#ff8a1e' });
  pennant(b, '#ff8a1e');
  shopper(b, { shirt: '#ff8a1e', pants: '#2fa8ff', hair: '#5a3a1a' });
  // The other twin rides in the basket, arms up.
  const { box, sphere, tube } = b;
  box([.4, .45, .26], [0, .95, .25], '#ff8a1e');
  for (let i = 0; i < 3; i++) box([.41, .05, .27], [0, .82 + i * .14, .25], '#2fa8ff');
  sphere(.14, [0, 1.32, .27], SKIN);
  sphere(.145, [0, 1.38, .24], '#5a3a1a', [1, .6, 1]);
  for (const x of [-1, 1]) { tube([x * .2, 1.12, .25], [x * .38, 1.6, .3], .05, '#ff8a1e'); sphere(.055, [x * .38, 1.62, .3], SKIN); }
});
author('cart-rival-brick', (b) => {
  cart(b, { handle: '#2b2f36' });
  pennant(b, '#ff3b30');
  shopper(b, { shirt: '#e8303a', pants: '#2b2f36', skin: SKIN_DARK, hair: '#1a1a1a', bulk: 1.55, height: 1.08, headband: WHITE, lean: .1 });
  // A protein tub and a kettlebell in the basket.
  b.cylinder(.2, .42, [0, .85, .35], '#2b2f36');
  b.cylinder(.205, .08, [0, 1.08, .35], '#ffd21e');
  b.sphere(.17, [.3, .72, .7], INK);
});
author('cart-rival-guard', (b) => {
  const { box, cylinder, tube } = b;
  // The security guard's segway: a deck between two wheels and a tall steering post.
  box([.9, .12, .5], [0, .26, 0], INK);
  for (const x of [-.55, .55]) { cylinder(.26, .16, [x, .26, 0], INK, [0, 0, Math.PI / 2]); cylinder(.14, .18, [x, .26, 0], '#8d99a6', [0, 0, Math.PI / 2]); }
  tube([0, .3, .15], [0, 1.1, .32], .04, '#8d99a6');
  tube([-.3, 1.12, .33], [.3, 1.12, .33], .04, INK);
  cylinder(.06, .02, [0, 1.16, .34], '*#ff2d2d');
  shopper(b, { z: 0, shirt: '#1f3a6b', pants: '#1a2440', hair: '#2a1a10', cap: '#1a2440', vest: '#ffd21e', handleY: 1.12, handleZ: .33, lean: .12 });
  pennant(b, '#3f8cff', .4, -.2);
  // The flashlight, beamed forward.
  cylinder(.05, .3, [.35, 1.15, .45], INK, [Math.PI / 2, 0, 0]);
  cylinder(.06, .02, [.35, 1.15, .61], '*#fff6c9', [Math.PI / 2, 0, 0]);
});

// ---------------------------------------------------------------- cart mods (installed on the standard cart)

author('upgrade-power_walker', ({ box }) => {
  for (const x of [-.13, .13]) { box([.22, .16, .38], [x, .08, -1.32], WHITE); box([.23, .05, .39], [x, .03, -1.32], '*#5de0ce'); box([.12, .06, .12], [x, .17, -1.2], RED); }
});
author('upgrade-leaf_blower', ({ box, cylinder, sphere }) => {
  box([.55, .38, .4], [0, .62, -.9], '#ff7a1e');
  cylinder(.16, .2, [0, .62, -1.15], INK, [Math.PI / 2, 0, 0]);
  cylinder(.07, .9, [.32, .5, -1.4], '#ff7a1e', [Math.PI / 2 - .2, 0, 0], .1);
  sphere(.06, [.32, .45, -1.85], '*#9fe7ff');
  for (const x of [-.2, .2]) box([.04, .45, .04], [x, .7, -.75], INK);
});
author('upgrade-e_assist', ({ box, cylinder }) => {
  for (const x of [-.52, .52]) { cylinder(.19, .14, [x, .13, -.8], '#2fa8ff', [0, 0, Math.PI / 2]); cylinder(.08, .16, [x, .13, -.8], '*#5dff9a', [0, 0, Math.PI / 2]); }
  box([.6, .18, .5], [0, .42, -.2], INK);
  for (const z of [-.35, -.2, -.05]) box([.5, .04, .06], [0, .53, z], '*#5dff9a');
});
author('upgrade-pallet_plow', ({ box }) => {
  for (const y of [.3, .55, .8]) box([1.7, .1, .12], [0, y, 1.28], WOOD, [-.3, 0, 0]);
  for (const x of [-.75, 0, .75]) box([.12, .7, .14], [x, .55, 1.22], '#a8784a', [-.3, 0, 0]);
  box([1.4, .04, .04], [0, .56, 1.12], '#3fb6ff');
});
author('upgrade-noodle_bumper', ({ cylinder }) => {
  const colors = ['#ff4fa0', '#5de0ce', '#ffd21e'];
  colors.forEach((color, i) => cylinder(.08, 1.6, [0, .45 + i * .17, 1.12], color, [0, 0, Math.PI / 2]));
  for (const x of [-.8, .8]) cylinder(.08, .7, [x, .62, .8], colors[1], [Math.PI / 2, 0, 0]);
});
author('upgrade-sign_spoiler', ({ box, tube }) => {
  box([1.3, .55, .04], [0, 1.25, 1.1], YELLOW, [-.5, 0, 0]);
  box([1.1, .18, .05], [0, 1.27, 1.12], RED, [-.5, 0, 0]);
  for (const x of [-.55, .55]) tube([x, 1.12, .95], [x, 1.0, 1.0], .02, INK);
});
author('upgrade-spring_casters', ({ ring, tube }) => {
  for (const x of [-.51, .51]) for (const z of [-.8, .85]) {
    for (let i = 0; i < 5; i++) ring(.09, .022, [x, .2 + i * .045, z], '*#ff4fa0', [Math.PI / 2, 0, 0]);
    tube([x, .2, z], [x, .4, z], .02, CHROME);
  }
});
author('upgrade-fixed_squeak', ({ cylinder, sphere, box }) => {
  cylinder(.15, .12, [-.51, .13, .85], '~#e8eef4', [0, 0, Math.PI / 2]);
  cylinder(.07, .14, [-.51, .13, .85], '*#5dff9a', [0, 0, Math.PI / 2]);
  cylinder(.07, .16, [-.38, .92, -.45], '#3a8f5a');
  box([.04, .04, .22], [-.38, 1.0, -.35], '#3a8f5a', [.5, 0, 0]);
  sphere(.03, [-.38, 1.07, -.22], '*#ffd21e');
});
author('upgrade-knobby_casters', ({ cylinder, box }) => {
  for (const x of [-.56, .56]) for (const z of [-.8, .85]) {
    cylinder(.22, .2, [x, .2, z], INK, [0, 0, Math.PI / 2]);
    cylinder(.1, .22, [x, .2, z], '#3a8f5a', [0, 0, Math.PI / 2]);
    for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; box([.22, .06, .07], [x, .2 + Math.cos(a) * .22, z + Math.sin(a) * .22], INK, [a, 0, 0]); }
  }
});
author('upgrade-wire_basket', ({ box }) => {
  for (const x of [-.7, .7]) for (const z of [-.4, .1, .6]) box([.05, .12, .05], [x, 1.0, z], YELLOW);
  for (const z of [-.5, .4]) box([1.45, .04, .04], [0, .72, z], YELLOW);
});
author('upgrade-cage_basket', ({ tube }) => {
  for (const z of [-.6, -.1, .4, .9]) {
    tube([-.72, 1.15, z], [-.5, 1.65, z], .03, '#3a3f48');
    tube([-.5, 1.65, z], [.5, 1.65, z], .03, '#3a3f48');
    tube([.5, 1.65, z], [.72, 1.15, z], .03, '#3a3f48');
  }
  for (const x of [-.5, 0, .5]) tube([x, 1.65, -.6], [x, 1.65, .9], .025, '#3a3f48');
});
author('upgrade-bin_lid_armor', ({ cylinder, box }) => {
  for (const x of [-.78, .78]) for (const z of [-.25, .5]) {
    cylinder(.36, .05, [x, .8, z], '~#aeb6bf', [0, 0, Math.PI / 2]);
    box([.08, .06, .2], [x * 1.04, .8, z], INK);
  }
  cylinder(.36, .05, [0, .8, 1.08], '~#aeb6bf', [Math.PI / 2, 0, 0]);
});

// ---------------------------------------------------------------- mod display stands

for (const [name, color] of [['push', '#ff4f5a'], ['bumper', '#ffd21e'], ['casters', '#5de0ce'], ['basket', '#7a5cff']]) author(`pickup-${name}`, ({ box, cylinder, tube, sphere, ring }) => {
  cylinder(1.0, .12, [0, .06, 0], '#e8e4da');
  ring(.92, .05, [0, .14, 0], '*' + color, [Math.PI / 2, 0, 0]);
  box([.12, 1.9, .12], [0, 1.0, -.4], '#8d99a6');
  box([1.3, .55, .08], [0, 2.0, -.4], color);
  box([1.1, .1, .09], [0, 2.0, -.35], WHITE);
  if (name === 'push') { box([.34, .22, .6], [-.25, .45, 0], WHITE); box([.34, .22, .6], [.25, .45, 0], WHITE); box([.35, .06, .61], [0, .34, 0], '*' + color); }
  else if (name === 'bumper') { for (let i = 0; i < 3; i++) cylinder(.12, 1.2, [0, .4 + i * .25, 0], ['#ff4fa0', '#5de0ce', '#ffd21e'][i], [0, 0, Math.PI / 2]); }
  else if (name === 'casters') { for (const x of [-.3, .3]) { cylinder(.25, .18, [x, .5, 0], INK, [0, 0, Math.PI / 2]); cylinder(.12, .2, [x, .5, 0], color, [0, 0, Math.PI / 2]); } }
  else { for (const z of [-.2, .2]) tube([-.4, .9, z], [.4, .9, z], .03, CHROME); for (const x of [-.4, .4]) tube([x, .3, 0], [x, .9, 0], .03, CHROME); sphere(.2, [0, .6, 0], color); }
});

// ---------------------------------------------------------------- barricades and cues

author('gate-box-wall', ({ box }) => {
  // A stockers' display wall of boxed product, four boxes high across an 8 m segment.
  const random = rng(9);
  const colors = ['#3fb6ff', '#ff4f5a', '#ffd21e', '#5de0ce', '#ff8a1e', CARDBOARD, CARDBOARD, CARDBOARD];
  for (let row = 0; row < 4; row++) for (let i = 0; i < 7; i++) {
    const x = -3.45 + i * 1.15 + (row % 2 ? .55 : 0);
    if (x > 3.8) continue;
    const color = colors[Math.floor(random() * colors.length)];
    box([1.08, .58, .9], [x, .3 + row * .6, (random() - .5) * .12], color, [0, (random() - .5) * .1, 0]);
    box([1.1, .07, .91], [x, .3 + row * .6, 0], '#e8d8b0');
  }
  box([7.9, .12, 1.1], [0, .06, 0], WOOD);
});
author('gate-pallet-ramp', ({ box, cylinder }) => {
  // Shrink-wrapped pallets laid low across the aisle: hop them or eat them.
  for (let x = -3.5; x <= 3.5; x += 1.25) {
    box([1.15, .14, 1.0], [x, .07, 0], WOOD);
    box([1.1, .34, .95], [x, .32, 0], '#d8e8f0');
    box([1.12, .05, .97], [x, .5, 0], '#5de0ce');
  }
  for (const x of [-3.9, 3.9]) { cylinder(.07, 1.6, [x, .8, 0], YELLOW); box([.4, .25, .05], [x, 1.55, 0], '*#ff4fa0'); }
});
author('jump-cue', ({ box }) => {
  for (const z of [-3, 0, 3]) for (const side of [-1, 1]) box([2.4, .03, .32], [side * .85, .02, z], side > 0 ? '*#ffd21e' : '*#ff4fa0', [0, side * -.55, 0]);
});
author('marble-spill', ({ sphere }) => {
  const random = rng(4);
  const colors = ['*#5de0ce', '#3fb6ff', '#ff4fa0', '#ffd21e', WHITE];
  for (let i = 0; i < 46; i++) { const a = random() * Math.PI * 2, r = Math.sqrt(random()) * 1.8; sphere(.07, [Math.cos(a) * r, .07, Math.sin(a) * r], colors[i % colors.length]); }
});

// ---------------------------------------------------------------- shelf products on their grab stands

function stand(b, power) {
  b.cylinder(.55, .08, [0, .04, 0], power ? '*#ff4fa0' : '#d6dbe0');
  b.cylinder(.08, .55, [0, .3, 0], '#8d99a6');
  b.cylinder(.45, .06, [0, .58, 0], WHITE);
  b.box([.3, .16, .02], [0, .45, .46], YELLOW);
}
const S = .62; // product sits on the stand top
const PRODUCTS = {
  watermelon: ({ sphere }) => { sphere(.42, [0, S + .3, 0], '#2f8f3a', [1, .8, 1.25]); for (let i = 0; i < 6; i++) sphere(.425, [0, S + .3, 0], '#5fc24f', [.15, .79, 1.24], [0, i * Math.PI / 6, 0]); },
  kettlebell: ({ sphere, ring }) => { sphere(.32, [0, S + .3, 0], INK); ring(.2, .06, [0, S + .66, 0], INK, [0, 0, 0]); },
  paint_can: ({ cylinder, box }) => { cylinder(.28, .55, [0, S + .28, 0], '#d9dde2'); box([.5, .3, .02], [0, S + .3, .28], RED); cylinder(.29, .04, [0, S + .57, 0], '#9aa3ad'); },
  dog_food: ({ box }) => { box([.7, .9, .3], [0, S + .45, 0], '#c98a2b'); box([.5, .3, .02], [0, S + .55, .16], RED); },
  skillet: ({ cylinder, box }) => { cylinder(.38, .1, [0, S + .1, 0], INK); box([.1, .06, .55], [0, S + .12, .55], INK); },
  big_tv: ({ box }) => { box([1.4, .9, .22], [0, S + .45, 0], CARDBOARD); box([1.2, .6, .02], [0, S + .5, .12], '*#3fb6ff'); },
  pumpkin: ({ sphere, cylinder }) => { sphere(.38, [0, S + .28, 0], '#ff8a1e', [1.15, .78, 1.15]); cylinder(.05, .18, [0, S + .62, 0], '#4a6a2a'); },
  garden_gnome: ({ cone, cylinder, sphere }) => { cylinder(.2, .4, [0, S + .2, 0], '#3fb6ff'); sphere(.16, [0, S + .52, 0], SKIN); cone(.13, .2, [0, S + .52, .1], WHITE, [Math.PI / 2 + .4, 0, 0]); cone(.18, .45, [0, S + .82, 0], RED); },
  potted_fern: ({ cylinder, sphere }) => { cylinder(.28, .4, [0, S + .2, 0], '#c9673a', [0, 0, 0], .34); for (let i = 0; i < 7; i++) { const a = i * 0.9; sphere(.2, [Math.cos(a) * .2, S + .6 + (i % 3) * .1, Math.sin(a) * .2], '#3fa84a'); } },
  soda_case: ({ box, cylinder }) => { box([.7, .4, .5], [0, S + .2, 0], RED); for (let i = 0; i < 6; i++) cylinder(.07, .04, [-.25 + (i % 3) * .25, S + .42, -.12 + Math.floor(i / 3) * .24], '#d9dde2'); },
  frozen_pizza: ({ box }) => { box([.75, .12, .75], [0, S + .06, 0], YELLOW); box([.55, .02, .55], [0, S + .13, 0], RED); },
  ice_cream: ({ cylinder }) => { cylinder(.3, .4, [0, S + .2, 0], '#f7b8d2', [0, 0, 0], .34); cylinder(.35, .06, [0, S + .42, 0], '#ff4fa0'); },
  game_console: ({ box }) => { box([.6, .14, .5], [0, S + .07, 0], WHITE); box([.6, .02, .04], [0, S + .1, .24], '*#3fb6ff'); box([.25, .08, .14], [.15, S + .2, .1], INK); },
  headphones: ({ ring, cylinder }) => { ring(.3, .05, [0, S + .38, 0], INK, [0, 0, 0]); for (const x of [-.3, .3]) cylinder(.13, .1, [x, S + .14, 0], '#4a6cff', [0, 0, Math.PI / 2]); },
  teddy_bear: ({ sphere }) => { sphere(.28, [0, S + .28, 0], '#b0703a'); sphere(.2, [0, S + .66, 0], '#b0703a'); for (const x of [-.14, .14]) sphere(.07, [x, S + .82, 0], '#b0703a'); sphere(.07, [0, S + .62, .17], '#5a3218'); },
  chips: ({ sphere }) => { sphere(.36, [0, S + .38, 0], YELLOW, [1, 1.1, .5]); sphere(.2, [0, S + .4, .14], RED, [1, .6, .3]); },
  paper_towels: ({ cylinder }) => { for (let i = 0; i < 4; i++) cylinder(.16, .5, [-.17 + (i % 2) * .34, S + .25 + Math.floor(i / 2) * .5, 0], WHITE); },
  cereal: ({ box }) => { box([.55, .8, .2], [0, S + .4, 0], '#3fb6ff'); box([.4, .25, .02], [0, S + .5, .11], YELLOW); },
  marshmallows: ({ sphere }) => { sphere(.34, [0, S + .32, 0], '#fff1f6', [1, .9, .7]); for (let i = 0; i < 5; i++) sphere(.08, [-.2 + i * .1, S + .4, .2], WHITE); },
  rubber_duck: ({ sphere, cone }) => { sphere(.28, [0, S + .25, 0], YELLOW, [1, .8, 1.2]); sphere(.17, [0, S + .58, .12], YELLOW); cone(.07, .14, [0, S + .56, .32], '#ff8a1e', [Math.PI / 2, 0, 0]); },
  extinguisher: ({ cylinder, box, tube }) => { cylinder(.18, .8, [0, S + .4, 0], RED); cylinder(.06, .14, [0, S + .86, 0], INK); tube([0, S + .9, 0], [0, S + .7, .3], .03, INK); box([.2, .04, .06], [0, S + .95, .06], INK); },
  marbles: ({ sphere }) => { sphere(.3, [0, S + .28, 0], '#5de0ce', [1, .9, 1]); for (let i = 0; i < 8; i++) { const a = i * .8; sphere(.08, [Math.cos(a) * .3, S + .1 + (i % 3) * .15, Math.sin(a) * .3], ['#ff4fa0', YELLOW, '#3fb6ff'][i % 3]); } },
  mop: ({ cylinder, tube, sphere }) => { cylinder(.28, .35, [0, S + .18, 0], YELLOW, [0, 0, 0], .32); tube([0, S + .1, 0], [.2, S + 1.5, 0], .03, '#7a5cff'); for (let i = 0; i < 8; i++) sphere(.07, [Math.cos(i) * .14, S + .38, Math.sin(i) * .14], WHITE); },
  bouncy_balls: ({ sphere }) => { const colors = ['#ff4fa0', YELLOW, '#5de0ce', '#7a5cff', '#ff8a1e']; colors.forEach((color, i) => sphere(.16, [Math.sin(i * 2.4) * .12, S + .16 + i * .26, Math.cos(i * 2.4) * .12], color)); },
  rotisserie_chicken: ({ box, sphere }) => { box([.7, .1, .5], [0, S + .05, 0], INK); sphere(.26, [0, S + .25, 0], '#d9902b', [1.2, .8, 1]); for (const x of [-.24, .24]) sphere(.1, [x, S + .3, .18], '#e0a040'); sphere(.36, [0, S + .2, 0], '*#fff6c9', [1.15, .8, .85]); },
};
const POWER_IDS = new Set(['extinguisher', 'marbles', 'mop', 'bouncy_balls', 'rotisserie_chicken']);
for (const [id, draw] of Object.entries(PRODUCTS)) author(`item-${id}`, (b) => { stand(b, POWER_IDS.has(id)); draw(b); });

// ---------------------------------------------------------------- store fixtures

/** A gondola shelving run, long axis on z: four shelves of boxed product in a seeded colour mix. */
function gondola(b, { length = 4.2, height = 2.6, depth = 1.1, seed = 1, colors, upright = '#e8e8ec', sign } = {}) {
  const { box } = b;
  const random = rng(seed);
  box([depth, .12, length], [0, .06, 0], '#c9ccd1');
  box([.08, height, length], [0, height / 2, 0], upright);
  for (const z of [-length / 2 + .04, length / 2 - .04]) box([depth, height, .06], [0, height / 2, z], upright);
  const shelves = 4;
  for (let s = 0; s < shelves; s++) {
    const y = .25 + s * (height - .45) / (shelves - 1);
    box([depth, .05, length - .1], [0, y, 0], upright);
    box([.03, .08, length - .1], [depth / 2, y + .02, 0], '#ffd21e');
    if (s === shelves - 1 && height < 3) continue;
    for (const side of [-1, 1]) {
      // Each shelf face is one product line, the way a store merchandises: boxes, cans or bottles,
      // in runs of one brand colour with a contrasting label band, so a shelf reads as packaging.
      const kind = Math.floor(random() * 3);
      let z = -length / 2 + .15;
      while (z < length / 2 - .25) {
        const color = colors[Math.floor(random() * colors.length)];
        const label = colors[Math.floor(random() * colors.length)];
        const run = 2 + Math.floor(random() * 3);
        if (kind === 0) {
          const w = .3 + random() * .25, h = .3 + random() * .25;
          for (let r = 0; r < run && z < length / 2 - .25; r++, z += w + .02) {
            box([.36, h, w], [side * .24, y + h / 2 + .03, z + w / 2], color);
            box([.37, h * .3, w * .9], [side * .24, y + h * .55, z + w / 2], label);
          }
        } else if (kind === 1) {
          for (let r = 0; r < run * 2 && z < length / 2 - .2; r++, z += .2) {
            b.cylinder(.08, .2, [side * .3, y + .13, z + .1], color, [0, 0, 0], .08, 8);
            b.cylinder(.08, .2, [side * .14, y + .13, z + .1], color, [0, 0, 0], .08, 8);
            b.cylinder(.082, .07, [side * .3, y + .13, z + .1], label, [0, 0, 0], .082, 8);
          }
        } else {
          for (let r = 0; r < run * 2 && z < length / 2 - .2; r++, z += .17) {
            b.cylinder(.07, .34, [side * .26, y + .2, z + .08], color, [0, 0, 0], .07, 6);
            b.cylinder(.03, .1, [side * .26, y + .42, z + .08], label, [0, 0, 0], .03, 6);
          }
        }
        z += .06;
      }
    }
  }
  if (sign) { box([.1, .45, 1.6], [0, height + .35, 0], sign); box([.12, .12, 1.3], [0, height + .35, 0], WHITE); }
}
const GROCERY = ['#ff4f5a', '#3fb6ff', '#ffd21e', '#5de0ce', '#ff8a1e', '#7a5cff', WHITE, '#3fae4a', '#ff4fa0'];
author('gondola', (b) => gondola(b, { colors: GROCERY, seed: 3 }));
author('gondola-b', (b) => gondola(b, { colors: ['#e8303a', '#ffd21e', '#ffffff', '#2f6fd6', '#ff8a1e', '#3fae4a'], seed: 17 }));
author('gondola-c', (b) => gondola(b, { colors: ['#7a5cff', '#5de0ce', '#ff4fa0', '#ffe9a8', '#3fb6ff', '#2b2f36'], seed: 29, sign: '#2f6fd6' }));
author('gondola-tall', (b) => gondola(b, { height: 4.2, colors: GROCERY, seed: 7, sign: '#ff4f5a' }));
author('toy-shelf', (b) => {
  gondola(b, { colors: ['#ff4fa0', '#ffd21e', '#5de0ce', '#7a5cff', '#ff8a1e', '#3fb6ff'], seed: 11, upright: '#fff1f6' });
  const random = rng(12);
  for (let i = 0; i < 7; i++) b.sphere(.2, [(random() - .5) * .5, 2.75, -1.8 + i * .6], ['#ff4fa0', '#ffd21e', '#5de0ce', '#7a5cff'][i % 4]);
});
author('tv-wall', ({ box }) => {
  box([1.0, .12, 4.2], [0, .06, 0], '#2b2f36');
  box([.1, 3.2, 4.2], [0, 1.6, 0], '#1b1d24');
  const screens = ['*#3fb6ff', '*#7a5cff', '*#ff4fa0', '*#5de0ce'];
  let n = 0;
  for (let row = 0; row < 3; row++) for (let i = 0; i < 3; i++) for (const side of [-1, 1]) {
    box([.08, .78, 1.25], [side * .1, .7 + row * .95, -1.4 + i * 1.4], INK);
    box([.02, .66, 1.12], [side * .15, .7 + row * .95, -1.4 + i * 1.4], screens[(n++ + row) % screens.length]);
  }
});
author('freezer', ({ box }) => {
  box([1.3, 2.4, 4.2], [0, 1.2, 0], WHITE);
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    box([.04, 1.9, 1.3], [side * .66, 1.2, -1.4 + i * 1.4], '*#bfe8ff');
    box([.06, 1.95, .05], [side * .67, 1.2, -.7 + i * 1.4 - .7], '#8d99a6');
  }
  box([1.32, .3, 4.22], [0, 2.4, 0], '#2fa8ff');
});
author('produce-bin', ({ box, sphere }) => {
  const random = rng(5);
  box([1.6, .8, 4.2], [0, .4, 0], '#6b4a2a');
  const fruit = ['#ff8a1e', '#ffd21e', '#e8303a', '#3fae4a', '#8a3fd6', '#ffcf3a'];
  for (let i = 0; i < 4; i++) {
    const color = fruit[i % fruit.length];
    box([1.5, .1, .95], [0, .85, -1.55 + i * 1.03], '#a8784a', [0, 0, .25]);
    for (let k = 0; k < 14; k++) sphere(.13, [(random() - .5) * 1.2, .98 + random() * .12 + ((random() - .5) * 1.2) * .25, -1.55 + i * 1.03 + (random() - .5) * .8], color);
  }
  box([.1, 1.2, .08], [0, 1.5, 0], '#6b4a2a');
  box([.12, .4, 1.6], [0, 2.1, 0], '#3fae4a');
});
author('racking', ({ box }) => {
  const random = rng(8);
  for (const z of [-2.4, 2.4]) for (const x of [-.55, .55]) box([.12, 6.2, .12], [x, 3.1, z], '#2f6fd6');
  for (const y of [.15, 2.1, 4.1, 6.05]) for (const x of [-.55, .55]) box([.1, .14, 4.9], [x, y, 0], '#ff7a1e');
  for (const y of [.25, 2.2, 4.2]) for (const z of [-1.6, 0, 1.6]) {
    box([1.0, .14, 1.2], [0, y + .07, z], WOOD);
    const h = .6 + random() * .9;
    box([.95, h, 1.1], [0, y + .14 + h / 2, z], random() < .5 ? CARDBOARD : '#d8e8f0');
  }
});
author('hedge', ({ box, sphere }) => {
  box([1.0, .5, 3.6], [0, .25, 0], '#8a5a3a');
  for (let i = 0; i < 6; i++) sphere(.55, [0, .85, -1.5 + i * .6], i % 2 ? '#3f8f3a' : '#4fa84a', [1, .9, 1]);
  for (let i = 0; i < 4; i++) sphere(.15, [.4, 1.25, -1.2 + i * .8], ['#ff4fa0', '#ffd21e', WHITE, '#ff8a1e'][i]);
});
author('ceiling-light', ({ box, tube }) => {
  // One fixture row across a department aisle, hung at 9.5 m: three tube lamps in a white tray.
  for (const x of [-6, 0, 6]) {
    box([4.6, .14, .7], [x, 9.5, 0], WHITE);
    box([4.4, .06, .5], [x, 9.42, 0], '^#fffbe8');
    tube([x - 2, 9.6, 0], [x - 2, 13, 0], .02, '#8d99a6');
    tube([x + 2, 9.6, 0], [x + 2, 13, 0], .02, '#8d99a6');
  }
});
author('ceiling-light-wide', ({ box, tube }) => {
  // Aisle 9's main-aisle fixture: five lamps spanning the full 40 m between the shelving.
  for (const x of [-16, -8, 0, 8, 16]) {
    box([5.4, .16, .8], [x, 11, 0], WHITE);
    box([5.2, .06, .6], [x, 10.9, 0], '^#fffbe8');
    tube([x, 11.1, 0], [x, 15, 0], .025, '#8d99a6');
  }
});
/**
 * One bay of the warehouse roof, 96 m across and 24 m deep, tiled down every indoor aisle: a ribbed
 * steel deck at 15.3 m, two Warren trusses, silver supply ducts, a red sprinkler main and a row of
 * fluorescent strip lights on the bottom chords.
 */
author('ceiling-bay', ({ box, cylinder, tube }) => {
  const W = 96, D = 24;
  box([W, .3, D], [0, 15.4, 0], '#4f555e');
  for (let x = -W / 2 + 3; x < W / 2; x += 6) box([.25, .35, D], [x, 15.1, 0], '#666d77');
  for (const z of [-6, 6]) {
    box([W, .22, .22], [0, 15.0, z], '#c3c8ce');
    box([W, .22, .22], [0, 13.7, z], '#c3c8ce');
    for (let x = -W / 2; x < W / 2; x += 4) tube([x, 13.7, z], [x + 2, 15.0, z], .07, '#c3c8ce'), tube([x + 2, 15.0, z], [x + 4, 13.7, z], .07, '#c3c8ce');
    for (let x = -W / 2 + 4; x < W / 2; x += 8) {
      box([.5, .1, 3.2], [x, 13.5, z], '#e8eaec');
      box([.3, .05, 3.0], [x, 13.43, z], '^#fffbe8');
    }
  }
  for (const x of [-18, 18]) cylinder(.7, D, [x, 14.2, 0], '~#b8c0c8', [Math.PI / 2, 0, 0]);
  cylinder(.45, D, [0, 14.4, 0], '~#b8c0c8', [Math.PI / 2, 0, 0]);
  tube([-W / 2, 14.8, 0], [W / 2, 14.8, 0], .06, '#d63a3a');
});
/**
 * A 12 m run of the store's back wall, up to the roof: painted block with a department-colour band,
 * a kick rail and a row of high clerestory lamps, so an aisle reads as a room and not a yard.
 */
author('store-wall', ({ box }) => {
  box([.6, 15.6, 12.2], [0, 7.8, 0], '#c9c4b8');
  box([.62, 1.2, 12.2], [0, 6.2, 0], '#2f6fd6');
  box([.64, .5, 12.2], [0, .25, 0], '#6b6f76');
  box([.64, .12, 12.2], [0, 6.9, 0], '#ffd21e');
  for (const z of [-4, 0, 4]) box([.66, .5, 1.8], [0, 11, z], '^#fffbe8');
});
author('aisle-sign', ({ box, cylinder }) => {
  // The giant hanging aisle marker, read from far down the aisle: a blue board with a fat "9" in blocks.
  for (const x of [-2.2, 2.2]) cylinder(.03, 4, [x, 13, 0], '#8d99a6');
  box([5.4, 2.6, .25], [0, 10, 0], '#2f6fd6');
  box([5.6, .2, .3], [0, 11.35, 0], YELLOW);
  box([5.6, .2, .3], [0, 8.65, 0], YELLOW);
  const px = (x, y) => box([.32, .32, .3], [-x * .34, 10 + y * .34, 0], "*#fff6c9");
  // A pixel "9", read from down the aisle (the -z side, where carts come from).
  for (const [x, y] of [[-1, 2], [0, 2], [1, 2], [-1, 1], [1, 1], [-1, 0], [0, 0], [1, 0], [1, -1], [-1, -2], [0, -2], [1, -2]]) px(x, y);
});
author('dept-sign', ({ box, cylinder }) => {
  for (const x of [-3, 3]) cylinder(.03, 5, [x, 12.5, 0], '#8d99a6');
  box([7.2, 1.8, .22], [0, 9.6, 0], '#ff4f5a');
  box([6.6, .9, .24], [0, 9.6, 0], WHITE);
  for (let i = 0; i < 9; i++) box([.45, .5, .26], [-2.8 + i * .7, 9.6, 0], i % 2 ? '#2f6fd6' : '#ff4f5a');
});
author('checkout-arch', ({ box, cylinder }) => {
  // The self-checkout finish: two lanes of kiosks either side and a lit gantry overhead.
  for (const x of [-7.5, 7.5]) {
    box([.6, 7.4, .6], [x, 3.7, 0], '#2f6fd6');
    for (const k of [-1, 1]) {
      box([1.4, 1.1, 1.1], [x + k * 2.2 * Math.sign(x), .55, 0], WHITE);
      box([.8, .5, .06], [x + k * 2.2 * Math.sign(x), 1.4, .3], '*#5dff9a', [-.4, 0, 0]);
      cylinder(.06, 1.6, [x + k * 2.2 * Math.sign(x) + .5, 1.9, -.3], '#8d99a6');
      box([.2, .2, .2], [x + k * 2.2 * Math.sign(x) + .5, 2.75, -.3], '*#5dff9a');
    }
  }
  box([16, 1.4, .5], [0, 7.4, 0], '#2f6fd6');
  box([15, .7, .55], [0, 7.4, 0], '*#5dff9a');
  for (let i = 0; i < 11; i++) box([.6, .6, .6], [-6 + i * 1.2, 7.4, .05], i % 2 ? '*#ffffff' : '*#5dff9a');
  // Chequered finish tape on the floor.
  for (let i = 0; i < 16; i++) box([1, .02, .5], [-7.5 + i, .02, 0], i % 2 ? INK : WHITE);
});
author('endcap', ({ box, cylinder }) => {
  // A sale end-cap: a pyramid of cans and a SALE board.
  box([1.4, .3, 1.4], [0, .15, 0], '#c9ccd1');
  for (let level = 0; level < 5; level++) {
    const n = 5 - level;
    for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) cylinder(.12, .28, [-(n - 1) * .13 + i * .26, .45 + level * .29, -(n - 1) * .13 + k * .26], level % 2 ? '#ff4f5a' : YELLOW);
  }
  box([.06, 1.6, .06], [.65, 1.1, .65], '#8d99a6');
  box([1.0, .55, .05], [.65, 2.1, .65], YELLOW);
  box([.8, .25, .06], [.65, 2.1, .66], RED);
});
author('box-pile', ({ box }) => {
  const random = rng(21);
  for (let i = 0; i < 9; i++) {
    const s = .5 + random() * .5;
    box([s * 1.2, s, s], [(random() - .5) * 2, s / 2 + (i > 5 ? .8 : 0), (random() - .5) * 2], i % 3 === 0 ? '#3fb6ff' : CARDBOARD, [0, random() * 3, 0]);
  }
});
author('pallet-stack', ({ box }) => {
  for (let i = 0; i < 4; i++) box([1.2, .14, 1.0], [0, .07 + i * .15, 0], WOOD, [0, i * .06, 0]);
  box([1.1, .9, .95], [0, 1.1, 0], '#d8e8f0');
  box([1.12, .1, .97], [0, 1.4, 0], '#ff4f5a');
});
author('wet-floor', ({ box }) => {
  box([.62, 1.0, .05], [0, .48, .18], YELLOW, [-.35, 0, 0]);
  box([.62, 1.0, .05], [0, .48, -.18], YELLOW, [.35, 0, 0]);
  box([.4, .12, .06], [0, .6, .22], INK, [-.35, 0, 0]);
  box([.2, .3, .06], [0, .35, .26], INK, [-.35, 0, 0]);
});
author('cart-corral', ({ box, tube }) => {
  for (const x of [-.8, .8]) { tube([x, 0, -2], [x, 1.1, -2], .05, '#2f6fd6'); tube([x, 0, 2], [x, 1.1, 2], .05, '#2f6fd6'); tube([x, 1.1, -2], [x, 1.1, 2], .05, '#2f6fd6'); }
  box([1.8, .5, .1], [0, 1.4, -2], '#2f6fd6');
  for (let i = 0; i < 4; i++) {
    const z = -1.4 + i * .65;
    for (const x of [-.5, .5]) tube([x, .3, z], [x, 1.0, z + .5], .02, CHROME);
    tube([-.5, 1.0, z + .5], [.5, 1.0, z + .5], .02, CHROME);
    tube([-.55, 1.05, z - .05], [.55, 1.05, z - .05], .04, RED);
  }
});
author('flower-cart', ({ box, sphere, cylinder }) => {
  box([2.2, .7, 1.1], [0, .55, 0], '#5a8f3a');
  for (const x of [-.9, .9]) for (const z of [-.45, .45]) cylinder(.12, .1, [x, .12, z], INK, [0, 0, Math.PI / 2]);
  const random = rng(31);
  for (let i = 0; i < 14; i++) { const x = -.9 + (i % 7) * .3, z = i < 7 ? -.25 : .25; cylinder(.12, .25, [x, 1.0, z], '#c9673a'); sphere(.16, [x, 1.25 + random() * .1, z], ['#ff4fa0', YELLOW, WHITE, '#ff8a1e', '#7a5cff'][i % 5]); }
});
author('gnome-pile', ({ cone, cylinder, sphere }) => {
  const random = rng(41);
  for (let i = 0; i < 7; i++) {
    const x = (random() - .5) * 2.2, z = (random() - .5) * 2.2;
    cylinder(.22, .45, [x, .22, z], ['#3fb6ff', '#3fae4a', '#7a5cff'][i % 3]);
    sphere(.17, [x, .58, z], SKIN);
    cone(.2, .5, [x, .9, z], RED);
  }
});
author('tv-boxes', ({ box }) => {
  for (let i = 0; i < 5; i++) { box([1.6, 1.0, .25], [0, .5 + (i > 2 ? 1.02 : 0), -.6 + (i % 3) * .3], CARDBOARD); box([1.3, .6, .02], [0, .5 + (i > 2 ? 1.02 : 0), -.47 + (i % 3) * .3], '#1b1d24'); }
});
author('plush-pile', ({ sphere }) => {
  const random = rng(51);
  for (let i = 0; i < 16; i++) sphere(.3 + random() * .25, [(random() - .5) * 2.4, .3 + random() * .9, (random() - .5) * 2.4], ['#ff4fa0', '#ffd21e', '#5de0ce', '#7a5cff', '#b0703a'][i % 5]);
});
author('forklift', ({ box, cylinder, tube }) => {
  box([1.3, .9, 2.0], [0, .7, 0], YELLOW);
  box([1.2, .9, .7], [0, 1.4, -.65], INK);
  for (const x of [-.6, .6]) { tube([x, 1.15, .1], [x, 2.3, .1], .04, INK); tube([x, 1.15, -.9], [x, 2.3, -.9], .04, INK); }
  box([1.3, .08, 1.1], [0, 2.32, -.4], YELLOW);
  for (const x of [-.55, .55]) box([.12, 2.6, .12], [x, 1.3, 1.05], INK);
  for (const x of [-.35, .35]) box([.15, .06, 1.2], [x, .2, 1.65], '#8d99a6');
  for (const x of [-.68, .68]) for (const z of [-.6, .6]) cylinder(.3, .25, [x, .3, z], INK, [0, 0, Math.PI / 2]);
  cylinder(.1, .1, [0, 2.42, -.4], '*#ff8a1e');
});
author('tumble-bin', ({ box, sphere }) => {
  // The citrus pyramid the avalanches come off: a tilted bin heaped with oranges and lemons.
  box([3.2, 1.2, 3.2], [0, .6, 0], '#6b4a2a');
  for (let level = 0; level < 5; level++) {
    const n = 6 - level;
    for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) sphere(.26, [-(n - 1) * .25 + i * .5, 1.45 + level * .42, -(n - 1) * .25 + k * .5], (i + k + level) % 4 === 0 ? YELLOW : '#ff8a1e');
  }
  box([.12, 1.4, .12], [1.5, 1.9, 1.5], '#8d99a6');
  box([1.6, .6, .06], [1.5, 2.8, 1.5], '#3fae4a');
});
author('ball-blaster', ({ box, cylinder, sphere }) => {
  box([2.2, 1.6, 2.2], [0, .8, 0], '#7a5cff');
  cylinder(.6, 2.6, [0, 2.4, .6], YELLOW, [-.7, 0, 0], .45);
  cylinder(.5, .2, [0, 3.2, 1.55], '*#ff4fa0', [-.7, 0, 0]);
  for (let i = 0; i < 9; i++) sphere(.22, [Math.cos(i) * 1.2, 1.8 + (i % 3) * .3, Math.sin(i) * 1.2], ['#ff4fa0', YELLOW, '#5de0ce'][i % 3]);
});
author('tug-crossing', ({ box, cylinder }) => {
  // Crossing signal: a post with a red beacon and a striped arm, the store's own level crossing.
  cylinder(.08, 3.2, [0, 1.6, 0], '#8d99a6');
  cylinder(.24, .3, [0, 3.35, 0], '*#ff2d2d');
  box([.6, .6, .06], [0, 2.5, .08], YELLOW);
  box([.5, .5, .07], [0, 2.5, .08], INK, [0, 0, Math.PI / 4]);
  for (let i = 0; i < 6; i++) box([.6, .14, .14], [.5 + i * .6, 1.1, 0], i % 2 ? INK : YELLOW);
});
author('sprinkler', ({ box, cylinder, tube, sphere }) => {
  box([1.6, .5, 1.0], [0, .25, 0], '#3fae4a');
  cylinder(.35, .3, [0, .65, 0], INK, [Math.PI / 2, 0, 0]);
  tube([0, .5, 0], [0, 3.2, 0], .06, '#3fae4a');
  tube([-1.6, 3.2, 0], [1.6, 3.2, 0], .05, '#3fae4a');
  for (const x of [-1.6, 0, 1.6]) sphere(.1, [x, 3.15, 0], '*#9fe7ff');
});
author('big-screen', ({ box, cylinder }) => {
  for (const x of [-2, 2]) cylinder(.12, 3.5, [x, 1.75, 0], '#2b2f36');
  box([6.2, 3.6, .3], [0, 4.6, 0], INK);
  box([5.8, 3.2, .05], [0, 4.6, .17], '*#3fb6ff');
  box([2.4, 1.4, .06], [-1.2, 5.0, .2], '*#ff4fa0');
  box([1.4, 2.0, .06], [1.6, 4.3, .2], '*#ffd21e');
});

// ---------------------------------------------------------------- the closing shutters and the floor scrubber

author('shutter-scrubber', ({ box, cylinder, sphere, tube }) => {
  // The security shutter coming down behind the field: 52 m of corrugated slats with a hazard edge.
  for (let i = 0; i < 26; i++) box([2.0, 12, .25], [-25 + i * 2 + 1, 6, -3], i % 2 ? '#aeb6bf' : '#c3cad1');
  for (let y = 1; y < 12; y += 1) box([52, .06, .3], [0, y, -2.85], '#8d99a6');
  for (let i = 0; i < 26; i++) box([2.0, .5, .3], [-25 + i * 2 + 1, .25, -2.82], i % 2 ? INK : YELLOW);
  box([52, 1.2, 1.4], [0, 12.4, -3], '#2b2f36');
  // The ride-on floor scrubber pushing a full-width squeegee bar of spinning brushes.
  box([4.4, 2.0, 3.6], [0, 1.5, 0], YELLOW);
  box([4.0, .5, 3.0], [0, 2.75, -.2], '#ffb21e');
  box([1.8, 1.3, .1], [0, 3.6, 1.0], '*#bfe8ff', [-.3, 0, 0]);
  for (const x of [-1.5, 1.5]) { cylinder(.18, .5, [x, 3.3, -1.2], '*#ff8a1e'); sphere(.2, [x, 3.6, -1.2], '*#ff8a1e'); }
  for (const x of [-2.0, 2.0]) for (const z of [-1.3, 1.3]) cylinder(.5, .4, [x, .5, z], INK, [0, 0, Math.PI / 2]);
  // The night cleaner riding it, unbothered.
  box([.6, .8, .5], [0, 3.4, -.6], '#2f6fd6');
  sphere(.25, [0, 4.0, -.55], SKIN);
  cylinder(.26, .12, [0, 4.18, -.55], '#2f6fd6');
  tube([-.3, 3.5, -.4], [-.4, 3.2, .3], .07, '#2f6fd6');
  tube([.3, 3.5, -.4], [.4, 3.2, .3], .07, '#2f6fd6');
  // Squeegee arms and the brush bar.
  for (const x of [-1.8, 1.8]) tube([x, 1.0, 1.6], [x * 1.2, .6, 3.0], .12, '#2b2f36');
  cylinder(.45, 46, [0, .48, 3.2], '#2f6fd6', [0, 0, Math.PI / 2]);
  for (let i = 0; i < 46; i++) box([.18, .95, .95], [-22.5 + i, .48, 3.2], i % 2 ? '#5de0ce' : '#2f6fd6', [i * .7, 0, 0]);
  box([46, .3, .4], [0, 1.05, 3.0], YELLOW);
  for (let i = 0; i < 9; i++) cylinder(.18, .25, [-20 + i * 5, 1.35, 3.0], '*#ff8a1e');
});

// ---------------------------------------------------------------- the tugger train on the loading bay crossings

author('tugger-cart', ({ box, cylinder }) => {
  // One 17 m section of a tugger train: four yellow pallet carts loaded with boxed stock.
  const random = rng(61);
  for (let i = 0; i < 4; i++) {
    const z = -6.3 + i * 4.2;
    box([1.9, .2, 3.8], [0, .5, z], YELLOW);
    for (const x of [-.8, .8]) for (const dz of [-1.5, 1.5]) cylinder(.22, .2, [x, .22, z + dz], INK, [0, 0, Math.PI / 2]);
    for (let k = 0; k < 3; k++) { const h = .6 + random() * .7; box([1.6, h, 1.1], [0, .6 + h / 2, z - 1.2 + k * 1.2], k % 2 ? CARDBOARD : '#d8e8f0'); }
    box([.2, .1, .5], [0, .5, z + 2.05], INK);
  }
  cylinder(.14, .2, [0, 2.2, 7.2], '*#ff8a1e');
});
