// Original HIGH TIDE PIZZA geometry: the family fleet, the shop, the drops and the flood.
// Rebuild with: node scripts/author-tide.mjs (writes GLBs into src/art/).
// Every vehicle faces +Z with its kerb side on -X, like every model the game drives. Wheeled bodies
// stand on y = 0; hulls sit a little under it so they ride in the water; the blimp's gondola stands
// on y = -1 like the other aircraft's gear.
import { THREE, RoundedBoxGeometry, exportModel, Batch } from './author-lib.mjs';

const named = (name, color, options = {}) => Object.assign(new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...options }), { name });
const glow = (name, color, intensity = 1.4, options = {}) => named(name, color, { emissive: color, emissiveIntensity: intensity, roughness: 0.3, ...options });
const rounded = (w, h, d, r = 0.08) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2));
const wheel = (batch, rubber, hub, x, y, z, radius, width) => {
  batch.add(rubber, new THREE.CylinderGeometry(radius, radius, width, 18), [x, y, z], [0, 0, Math.PI / 2]);
  batch.add(hub, new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, width + 0.02, 12), [x, y, z], [0, 0, Math.PI / 2]);
};

/** The shop's pizza box: red-and-cream with the Vell's stripe, the cargo every vehicle carries. */
function pizzaBox(batch, red, cream, x, y, z, size = 0.5, stack = 1) {
  for (let i = 0; i < stack; i++) {
    batch.add(cream, new THREE.BoxGeometry(size, 0.07, size), [x, y + i * 0.075, z]);
    batch.add(red, new THREE.BoxGeometry(size + 0.01, 0.025, size * 0.3), [x, y + i * 0.075 + 0.03, z]);
  }
}

/** Vespetta: a chunky round scooter with a top-box warmer on the rack. ~1.9 m long. */
function buildScooter() {
  const batch = new Batch();
  const paint = named('scooter paint', '#e8483c', { roughness: 0.28, metalness: 0.15 });
  const cream = named('scooter cream', '#fff1d6', { roughness: 0.4 });
  const dark = named('scooter dark', '#1c1f24', { roughness: 0.7 });
  const chrome = named('scooter chrome', '#d9dde2', { roughness: 0.2, metalness: 0.9 });
  const rubber = named('scooter tyre', '#151618', { roughness: 0.9 });
  const lamp = glow('scooter lamp', '#fff1c4', 1.6);
  const tail = glow('scooter tail', '#ff2a2a', 1.1);
  wheel(batch, rubber, chrome, 0, 0.27, 0.68, 0.27, 0.16);
  wheel(batch, rubber, chrome, 0, 0.27, -0.66, 0.27, 0.18);
  // Rear body: the fat rounded shell over the engine.
  batch.add(paint, new THREE.SphereGeometry(0.5, 20, 14), [0, 0.56, -0.42], [0, 0, 0], [0.82, 0.62, 1.15]);
  batch.add(cream, rounded(0.5, 0.1, 0.9, 0.04), [0, 0.92, -0.32]);
  batch.add(dark, rounded(0.44, 0.08, 0.72, 0.04), [0, 0.98, -0.32]);
  // Floorboard and the leg shield sweeping up to the headset.
  batch.add(dark, rounded(0.42, 0.06, 0.7, 0.03), [0, 0.3, 0.12]);
  batch.add(paint, rounded(0.56, 0.9, 0.12, 0.06), [0, 0.72, 0.5], [-0.18, 0, 0]);
  batch.add(paint, new THREE.SphereGeometry(0.28, 16, 10), [0, 0.42, 0.72], [0, 0, 0], [0.9, 0.9, 1.1]);
  batch.add(chrome, new THREE.CylinderGeometry(0.035, 0.035, 0.7, 8), [0, 1.04, 0.56], [0.25, 0, 0]);
  batch.add(paint, rounded(0.3, 0.2, 0.26, 0.08), [0, 1.36, 0.62]);
  batch.add(lamp, new THREE.CircleGeometry(0.085, 16), [0, 1.36, 0.755]);
  batch.add(chrome, new THREE.CylinderGeometry(0.025, 0.025, 0.82, 8), [0, 1.42, 0.6], [0, 0, Math.PI / 2]);
  for (const s of [-1, 1]) batch.add(dark, new THREE.CylinderGeometry(0.035, 0.035, 0.16, 8), [s * 0.45, 1.42, 0.6], [0, 0, Math.PI / 2]);
  for (const s of [-1, 1]) batch.add(chrome, new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10), [s * 0.2, 1.62, 0.58], [Math.PI / 2, 0, s * 0.3]);
  // Rack and the warmer top-box, a pizza stack peeking from the lid.
  batch.add(chrome, new THREE.BoxGeometry(0.42, 0.03, 0.5), [0, 1.06, -0.86]);
  batch.add(cream, rounded(0.56, 0.42, 0.56, 0.06), [0, 1.3, -0.86]);
  batch.add(paint, rounded(0.58, 0.08, 0.58, 0.04), [0, 1.53, -0.86]);
  batch.add(paint, new THREE.BoxGeometry(0.58, 0.12, 0.012), [0, 1.3, -0.575]);
  batch.add(tail, new THREE.BoxGeometry(0.16, 0.06, 0.02), [0, 0.74, -0.99]);
  return batch.group('vespetta scooter');
}
await exportModel('vespetta-scooter', buildScooter());

/** The cargo trike: two wheels and a pizza crate in front, one wheel behind. ~2.3 m. */
function buildCargoTrike() {
  const batch = new Batch();
  const paint = named('trike paint', '#2f9e8f', { roughness: 0.32, metalness: 0.1 });
  const crate = named('trike crate', '#f4e3c0', { roughness: 0.6 });
  const red = named('trike red', '#d93a2f', { roughness: 0.4 });
  const dark = named('trike dark', '#1c1f24', { roughness: 0.7 });
  const chrome = named('trike chrome', '#cfd4da', { roughness: 0.25, metalness: 0.85 });
  const rubber = named('trike tyre', '#151618', { roughness: 0.9 });
  const lamp = glow('trike lamp', '#fff1c4', 1.5);
  for (const s of [-1, 1]) wheel(batch, rubber, chrome, s * 0.48, 0.3, 0.72, 0.3, 0.12);
  wheel(batch, rubber, chrome, 0, 0.33, -0.95, 0.33, 0.1);
  // The crate: a wooden box with the shop stripe and a stack of boxes on its lid.
  batch.add(crate, rounded(1.08, 0.62, 0.86, 0.05), [0, 0.86, 0.66]);
  batch.add(red, new THREE.BoxGeometry(1.1, 0.12, 0.88), [0, 0.98, 0.66]);
  for (const s of [-1, 1]) batch.add(dark, new THREE.BoxGeometry(0.04, 0.62, 0.88), [s * 0.55, 0.86, 0.66]);
  pizzaBox(batch, red, crate, 0, 1.22, 0.66, 0.52, 3);
  batch.add(lamp, new THREE.CircleGeometry(0.07, 14), [0, 0.8, 1.095]);
  // Frame, seat and the bars.
  batch.add(paint, new THREE.CylinderGeometry(0.05, 0.05, 1.3, 8), [0, 0.62, -0.25], [Math.PI / 2 - 0.25, 0, 0]);
  batch.add(paint, new THREE.CylinderGeometry(0.05, 0.05, 0.85, 8), [0, 0.9, -0.42], [0.25, 0, 0]);
  batch.add(dark, rounded(0.26, 0.08, 0.34, 0.04), [0, 1.33, -0.5]);
  batch.add(paint, new THREE.CylinderGeometry(0.04, 0.04, 0.8, 8), [0, 1.08, 0.12], [-0.3, 0, 0]);
  batch.add(chrome, new THREE.CylinderGeometry(0.025, 0.025, 0.7, 8), [0, 1.46, 0.22], [0, 0, Math.PI / 2]);
  batch.add(paint, rounded(0.36, 0.3, 0.34, 0.08), [0, 0.55, -0.92]);
  return batch.group('cargo trike');
}
await exportModel('cargo-trike', buildCargoTrike());

/** The jet-ski: a stubby planing hull with a saddle and a rear warmer, riding a third of a metre deep. */
function buildJetSki() {
  const batch = new Batch();
  const paint = named('jetski paint', '#ffb020', { roughness: 0.25, metalness: 0.1 });
  const white = named('jetski white', '#f6f3ec', { roughness: 0.3 });
  const dark = named('jetski dark', '#1c2228', { roughness: 0.6 });
  const pink = glow('jetski neon', '#ff4f8b', 1.2);
  const lamp = glow('jetski lamp', '#fff1c4', 1.5);
  // Hull: a wide rounded tub with a pointed bow, its keel 0.35 m under the waterline.
  batch.add(white, new THREE.SphereGeometry(1, 22, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), [0, 0.05, -0.1], [0, 0, 0], [0.62, 0.4, 1.45]);
  batch.add(paint, rounded(1.22, 0.36, 2.4, 0.16), [0, 0.2, -0.1]);
  batch.add(paint, new THREE.ConeGeometry(0.6, 0.9, 16, 1, false, 0, Math.PI), [0, 0.2, 1.45], [Math.PI / 2, 0, Math.PI / 2], [1, 1, 0.6]);
  batch.add(pink, new THREE.BoxGeometry(1.24, 0.05, 2.2), [0, 0.06, -0.1]);
  // Deck, saddle, steering pod and bars.
  batch.add(dark, rounded(0.42, 0.26, 1.2, 0.1), [0, 0.5, -0.35]);
  batch.add(paint, rounded(0.6, 0.38, 0.5, 0.14), [0, 0.52, 0.55], [-0.35, 0, 0]);
  batch.add(dark, new THREE.CylinderGeometry(0.025, 0.025, 0.78, 8), [0, 0.82, 0.48], [0, 0, Math.PI / 2]);
  batch.add(lamp, new THREE.CircleGeometry(0.06, 12), [0, 0.5, 0.82], [-0.35, 0, 0]);
  // The rear warmer box strapped behind the saddle.
  batch.add(white, rounded(0.5, 0.36, 0.48, 0.05), [0, 0.6, -0.96]);
  batch.add(named('jetski box stripe', '#d93a2f', { roughness: 0.4 }), new THREE.BoxGeometry(0.52, 0.08, 0.5), [0, 0.7, -0.96]);
  return batch.group('jet ski');
}
await exportModel('jet-ski', buildJetSki());

/** The motor gondola: Venetian black lacquer, a steel ferro, string lights on two poles and an outboard. ~6.4 m. */
function buildGondola() {
  const batch = new Batch();
  const lacquer = named('gondola paint', '#15161c', { roughness: 0.18, metalness: 0.2 });
  const gold = named('gondola gold', '#d6a64a', { roughness: 0.3, metalness: 0.8 });
  const wood = named('gondola wood', '#8a5a36', { roughness: 0.7 });
  const cushion = named('gondola cushion', '#b0283a', { roughness: 0.8 });
  const steel = named('gondola steel', '#c9ced4', { roughness: 0.25, metalness: 0.9 });
  const bulbs = glow('gondola bulbs', '#ffcf7a', 2.2);
  const motor = named('gondola motor', '#2f3a44', { roughness: 0.4, metalness: 0.4 });
  const L = 6.4;
  // Hull: a long shallow banana whose ends rise, built from tapered slices.
  const slices = 14;
  for (let i = 0; i < slices; i++) {
    const t = (i + 0.5) / slices, z = (t - 0.5) * L;
    const w = 1.25 * Math.sin(Math.PI * Math.min(0.97, Math.max(0.03, t))) ** 0.6;
    const rise = 0.55 * Math.pow(Math.abs(t - 0.5) * 2, 3);
    batch.add(lacquer, rounded(w, 0.5, L / slices + 0.04, 0.08), [0, -0.05 + rise, z]);
  }
  batch.add(gold, new THREE.BoxGeometry(1.28, 0.05, 3.6), [0, 0.22, 0]);
  batch.add(wood, new THREE.BoxGeometry(1.0, 0.04, 3.4), [0, 0.2, 0]);
  // Ferro at the prow, a gold seahorse at the stern.
  batch.add(steel, new THREE.BoxGeometry(0.05, 0.75, 0.32), [0, 0.92, L / 2 - 0.05], [0.18, 0, 0]);
  for (let i = 0; i < 6; i++) batch.add(steel, new THREE.BoxGeometry(0.05, 0.05, 0.22), [0, 0.68 + i * 0.07, L / 2 + 0.12]);
  batch.add(gold, new THREE.TorusGeometry(0.14, 0.035, 6, 12, Math.PI * 1.4), [0, 0.95, -L / 2 + 0.1], [0, Math.PI / 2, 0]);
  // Cushioned love seat and a pizza warmer amidships.
  batch.add(cushion, rounded(0.9, 0.22, 0.6, 0.08), [0, 0.36, -0.5]);
  batch.add(cushion, rounded(0.9, 0.5, 0.14, 0.06), [0, 0.6, -0.82]);
  batch.add(named('gondola box', '#fff1d6', { roughness: 0.5 }), rounded(0.6, 0.36, 0.6, 0.05), [0, 0.42, 0.7]);
  batch.add(named('gondola box stripe', '#d93a2f', { roughness: 0.4 }), new THREE.BoxGeometry(0.62, 0.08, 0.62), [0, 0.52, 0.7]);
  // String lights between two gold poles.
  for (const z of [1.7, -1.9]) batch.add(gold, new THREE.CylinderGeometry(0.025, 0.025, 1.5, 6), [0, 0.95, z]);
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, z = 1.7 + (-1.9 - 1.7) * t, y = 1.66 - 0.3 * Math.sin(Math.PI * t);
    batch.add(bulbs, new THREE.SphereGeometry(0.05, 8, 6), [0, y, z]);
  }
  // The outboard that makes it a motor gondola.
  batch.add(motor, rounded(0.34, 0.46, 0.4, 0.08), [0, 0.5, -L / 2 + 0.15]);
  batch.add(motor, new THREE.CylinderGeometry(0.05, 0.05, 0.7, 8), [0, 0.05, -L / 2 + 0.12]);
  return batch.group('motor gondola');
}
await exportModel('motor-gondola', buildGondola());

/** The pizza blimp: a 13 m cream envelope with the shop's red bands and a slice on each flank, gondola car on y = -1. */
function buildBlimp() {
  const batch = new Batch();
  const skin = named('blimp paint', '#fff0d2', { roughness: 0.55 });
  const red = named('blimp red', '#d93a2f', { roughness: 0.5 });
  const crust = named('blimp crust', '#e0a24a', { roughness: 0.6 });
  const cheese = glow('blimp slice', '#ffcf4a', 0.6, { roughness: 0.5 });
  const pep = named('blimp pepperoni', '#b3261e', { roughness: 0.5 });
  const car = named('blimp car', '#2b3138', { roughness: 0.45, metalness: 0.3 });
  const glass = named('blimp glass', '#25465a', { roughness: 0.1, metalness: 0.6 });
  const lamp = glow('blimp lamp', '#fff1c4', 1.6);
  const blur = named('blimp prop blur', '#cfd8dc', { transparent: true, opacity: 0.18, roughness: 1, side: THREE.DoubleSide, depthWrite: false });
  const top = 3.2;
  batch.add(skin, new THREE.SphereGeometry(1, 28, 18), [0, top, 0], [0, 0, 0], [2.6, 2.6, 6.5]);
  for (const z of [-3.2, 3.2]) batch.add(red, new THREE.SphereGeometry(1, 28, 6, 0, Math.PI * 2, Math.PI * 0.47, Math.PI * 0.06), [0, top, z], [Math.PI / 2, 0, 0], [2.62, 1, 2.62]);
  // Tail fins in the shop red.
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    batch.add(red, new THREE.BoxGeometry(0.1, 1.6, 1.8), [Math.sin(a) * 1.7, top + Math.cos(a) * 1.7, -5.4], [0, 0, -a]);
  }
  // A slice on each flank: crust band, cheese triangle, three pepperoni.
  for (const s of [-1, 1]) {
    const x = s * 2.58;
    const tri = new THREE.CircleGeometry(1.5, 3, Math.PI / 2, Math.PI * 2);
    batch.add(cheese, tri, [x, top - 0.1, 0.2], [0, s * Math.PI / 2, 0]);
    batch.add(crust, new THREE.BoxGeometry(0.06, 0.32, 2.5), [x + s * 0.02, top + 1.3, 0.2]);
    for (const [dy, dz] of [[0.5, 0.5], [0.1, -0.3], [-0.5, 0.3]]) batch.add(pep, new THREE.CylinderGeometry(0.2, 0.2, 0.04, 14), [x + s * 0.03, top + dy, 0.2 + dz], [0, 0, Math.PI / 2]);
  }
  // Gondola car, its windows, the lamp and the two pusher props.
  batch.add(car, rounded(1.3, 1.0, 3.2, 0.3), [0, -0.5, 0.4]);
  batch.add(glass, new THREE.BoxGeometry(1.32, 0.42, 2.4), [0, -0.35, 0.5]);
  batch.add(car, new THREE.BoxGeometry(0.15, 1.0, 0.15), [0, 0.3, 0.4]);
  batch.add(lamp, new THREE.CircleGeometry(0.16, 14), [0, -0.6, 2.01]);
  for (const s of [-1, 1]) {
    batch.add(car, new THREE.CylinderGeometry(0.06, 0.06, 0.9, 8), [s * 0.95, -0.3, -0.8], [0, 0, Math.PI / 2]);
    batch.add(car, new THREE.CylinderGeometry(0.16, 0.2, 0.5, 10), [s * 1.45, -0.3, -0.8], [Math.PI / 2, 0, 0]);
    batch.add(blur, new THREE.CircleGeometry(0.75, 18), [s * 1.45, -0.3, -1.08], [0, Math.PI, 0]);
  }
  return batch.group('pizza blimp');
}
await exportModel('pizza-blimp', buildBlimp());

/** Vell's Pizzeria counter: a striped awning over a brick oven glowing through the window, with a slice sign. */
function buildPizzeria() {
  const batch = new Batch();
  const brick = named('pizzeria brick', '#a5513a', { roughness: 0.85 });
  const cream = named('pizzeria cream', '#fff1d6', { roughness: 0.6 });
  const red = named('pizzeria red', '#d93a2f', { roughness: 0.5 });
  const green = named('pizzeria green', '#2f8a4f', { roughness: 0.5 });
  const dark = named('pizzeria dark', '#1d2228', { roughness: 0.6 });
  const fire = glow('pizzeria fire', '#ff8a2a', 2.4);
  const neon = glow('pizzeria neon', '#ff4f8b', 1.8);
  const cheese = glow('pizzeria cheese', '#ffcf4a', 1.4);
  batch.add(dark, new THREE.BoxGeometry(3.6, 0.24, 2.8), [0, 0.12, 0]);
  batch.add(cream, new THREE.BoxGeometry(3.1, 1.95, 2.3), [0, 1.2, 0]);
  batch.add(brick, new THREE.BoxGeometry(3.12, 0.8, 2.32), [0, 0.6, 0]);
  // The oven: a brick dome behind the counter window, its mouth on fire.
  batch.add(brick, new THREE.SphereGeometry(0.8, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), [0, 1.0, -0.3], [0, 0, 0], [1, 0.8, 1]);
  batch.add(fire, new THREE.CircleGeometry(0.34, 14, 0, Math.PI), [0, 1.0, 0.46]);
  batch.add(brick, new THREE.CylinderGeometry(0.16, 0.18, 1.6, 8), [0.7, 2.8, -0.6]);
  // Counter window, sill and the striped awning in red, cream and green.
  batch.add(dark, new THREE.BoxGeometry(2.5, 0.9, 0.05), [0, 1.65, 1.16]);
  batch.add(cream, new THREE.BoxGeometry(2.8, 0.1, 0.6), [0, 1.18, 1.4]);
  for (let i = 0; i < 9; i++) {
    const m = [red, cream, green][i % 3];
    batch.add(m, new THREE.BoxGeometry(0.4, 0.06, 1.3), [-1.6 + i * 0.4, 2.42, 1.45], [0.38, 0, 0]);
  }
  batch.add(cream, new THREE.BoxGeometry(3.6, 0.2, 2.5), [0, 2.3, 0]);
  // The rooftop slice: a big neon wedge with three pepperoni.
  batch.add(cheese, new THREE.CircleGeometry(0.9, 3, -Math.PI / 2, Math.PI * 2), [0, 3.2, 0.6]);
  batch.add(red, new THREE.BoxGeometry(1.6, 0.22, 0.08), [0, 3.6, 0.58]);
  for (const [x, y] of [[-0.25, 3.3], [0.25, 3.25], [0, 2.85]]) batch.add(red, new THREE.CylinderGeometry(0.12, 0.12, 0.03, 12), [x, y, 0.62], [Math.PI / 2, 0, 0]);
  batch.add(neon, new THREE.TorusGeometry(1.05, 0.04, 6, 24), [0, 3.15, 0.56]);
  batch.add(dark, new THREE.BoxGeometry(0.1, 1.1, 0.1), [0, 2.6, 0.5]);
  return batch.group('vells pizzeria');
}
await exportModel('dispatch-booth', buildPizzeria());

/** Catering drops: a pole crowned by a spinning-sign slice, in coral, teal and gold. */
for (const [index, color] of ['#f37f63', '#38b6ac', '#f8b64b'].entries()) {
  const batch = new Batch();
  const dark = named('drop dark', '#173f49', { roughness: 0.6 });
  const tone = glow('drop tone', color, 0.9);
  const cheese = glow('drop cheese', '#ffcf4a', 1.2);
  const red = named('drop red', '#d93a2f', { roughness: 0.4 });
  batch.add(dark, new THREE.CylinderGeometry(0.72, 0.85, 0.24, 12), [0, 0.12, 0]);
  batch.add(dark, new THREE.CylinderGeometry(0.06, 0.08, 2.6, 8), [0, 1.5, 0]);
  batch.add(tone, new THREE.TorusGeometry(0.7, 0.08, 6, 20), [0, 3.3, 0]);
  batch.add(cheese, new THREE.CircleGeometry(0.55, 3, -Math.PI / 2, Math.PI * 2), [0, 3.3, 0.02]);
  batch.add(cheese, new THREE.CircleGeometry(0.55, 3, -Math.PI / 2, Math.PI * 2), [0, 3.3, -0.02], [0, Math.PI, 0]);
  for (const [x, y] of [[-0.15, 3.42], [0.15, 3.38], [0, 3.1]]) batch.add(red, new THREE.CylinderGeometry(0.07, 0.07, 0.06, 10), [x, y, 0], [Math.PI / 2, 0, 0]);
  await exportModel(`parcel-tower-${index + 1}`, batch.group('catering drop'));
}

/** The order beacon: a glowing box over a light pillar, lifted to the floor the customer leans out of. */
function buildOrderBeacon() {
  const batch = new Batch();
  const pillar = named('beacon pillar', '#ffcf4a', { emissive: '#ffb020', emissiveIntensity: 1.2, transparent: true, opacity: 0.35, depthWrite: false });
  const box = glow('beacon box', '#fff1d6', 0.9);
  const red = glow('beacon stripe', '#ff3b2f', 1.4);
  batch.add(pillar, new THREE.CylinderGeometry(0.35, 0.35, 12, 12, 1, true), [0, 6, 0]);
  batch.add(box, new THREE.BoxGeometry(0.9, 0.16, 0.9), [0, 2.2, 0]);
  batch.add(red, new THREE.BoxGeometry(0.92, 0.05, 0.3), [0, 2.29, 0]);
  batch.add(red, new THREE.TorusGeometry(0.8, 0.05, 6, 24), [0, 2.2, 0], [Math.PI / 2, 0, 0]);
  return batch.group('order beacon');
}
await exportModel('order-beacon', buildOrderBeacon());

/** Gull Point lighthouse: an 18 m tapering tower in white and red bands with a lit lamp room. */
function buildLighthouse() {
  const batch = new Batch();
  const white = named('lighthouse white', '#f4efe6', { roughness: 0.7 });
  const red = named('lighthouse red', '#c8322a', { roughness: 0.6 });
  const dark = named('lighthouse dark', '#1d2228', { roughness: 0.5, metalness: 0.4 });
  const lamp = glow('lighthouse lamp', '#fff3c0', 3.2);
  const stone = named('lighthouse stone', '#8c8476', { roughness: 0.9 });
  batch.add(stone, new THREE.CylinderGeometry(3.4, 3.8, 1.2, 16), [0, 0.6, 0]);
  const bands = 6, H = 15;
  for (let i = 0; i < bands; i++) {
    const t0 = i / bands, t1 = (i + 1) / bands;
    batch.add(i % 2 === 0 ? white : red, new THREE.CylinderGeometry(2.2 - 0.9 * t1, 2.2 - 0.9 * t0, H / bands, 16), [0, 1.2 + (t0 + t1) / 2 * H, 0]);
  }
  batch.add(dark, new THREE.CylinderGeometry(1.8, 1.8, 0.2, 16), [0, 16.3, 0]);
  batch.add(lamp, new THREE.CylinderGeometry(0.95, 0.95, 1.6, 12), [0, 17.2, 0]);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; batch.add(dark, new THREE.BoxGeometry(0.08, 1.6, 0.08), [Math.cos(a) * 1.0, 17.2, Math.sin(a) * 1.0]); }
  batch.add(red, new THREE.ConeGeometry(1.3, 1.2, 16), [0, 18.6, 0]);
  batch.add(dark, new THREE.TorusGeometry(1.75, 0.05, 6, 24), [0, 16.9, 0], [Math.PI / 2, 0, 0]);
  return batch.group('gull point lighthouse');
}
await exportModel('lighthouse', buildLighthouse());

/** Submarine Sardine, surfaced: a bulbous teal hull awash, a conning tower with lit portholes and a periscope. */
function buildSubmarine() {
  const batch = new Batch();
  const hull = named('sub hull', '#2c8c97', { roughness: 0.4, metalness: 0.5 });
  const rust = named('sub rust', '#b8642f', { roughness: 0.8 });
  const dark = named('sub dark', '#1a2127', { roughness: 0.5, metalness: 0.4 });
  const port = glow('sub portholes', '#ffd27a', 2.0);
  batch.add(hull, new THREE.SphereGeometry(1, 24, 14), [0, -0.6, 0], [0, 0, 0], [2.1, 1.7, 9]);
  batch.add(rust, new THREE.BoxGeometry(4.3, 0.12, 14), [0, 0.05, 0]);
  batch.add(hull, rounded(1.6, 2.6, 3.4, 0.5), [0, 1.6, 0.6]);
  batch.add(dark, new THREE.BoxGeometry(1.7, 0.12, 3.5), [0, 2.95, 0.6]);
  for (const z of [-0.4, 0.6, 1.6]) for (const s of [-1, 1]) batch.add(port, new THREE.CircleGeometry(0.2, 12), [s * 0.81, 1.8, z], [0, s * Math.PI / 2, 0]);
  batch.add(dark, new THREE.CylinderGeometry(0.08, 0.08, 2.2, 8), [0, 4.0, 1.4]);
  batch.add(dark, new THREE.BoxGeometry(0.16, 0.16, 0.5), [0, 5.1, 1.6]);
  for (const s of [-1, 1]) batch.add(hull, new THREE.BoxGeometry(2.6, 0.12, 0.8), [s * 0.6, 1.6, 1.4], [0, 0, 0]);
  batch.add(dark, new THREE.BoxGeometry(0.12, 2.2, 1.4), [0, -0.2, -8.6]);
  return batch.group('submarine sardine');
}
await exportModel('submarine', buildSubmarine());

/** Festoon lights: two poles 14 m apart with a sagging cable and fourteen warm bulbs. Spans local X. */
function buildStringLights() {
  const batch = new Batch();
  const pole = named('lights pole', '#24282e', { roughness: 0.6, metalness: 0.3 });
  const cable = named('lights cable', '#141618', { roughness: 0.8 });
  const warm = glow('lights warm', '#ffcf7a', 2.6);
  const pink = glow('lights pink', '#ff6fa2', 2.2);
  const teal = glow('lights teal', '#6ff2e0', 2.0);
  const half = 7, top = 4.4, sag = 1.0, n = 14;
  for (const s of [-1, 1]) batch.add(pole, new THREE.CylinderGeometry(0.06, 0.08, top, 8), [s * half, top / 2, 0]);
  const at = (t) => [-half + 2 * half * t, top - sag * Math.sin(Math.PI * t), 0];
  for (let i = 0; i < 24; i++) {
    const a = at(i / 24), b = at((i + 1) / 24), dx = b[0] - a[0], dy = b[1] - a[1];
    batch.add(cable, new THREE.CylinderGeometry(0.012, 0.012, Math.hypot(dx, dy), 4), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0], [0, 0, Math.atan2(dy, dx) - Math.PI / 2]);
  }
  for (let i = 1; i < n; i++) {
    const p = at(i / n);
    batch.add([warm, pink, warm, teal][i % 4], new THREE.SphereGeometry(0.09, 8, 6), [p[0], p[1] - 0.14, 0]);
  }
  return batch.group('string lights');
}
await exportModel('string-lights', buildStringLights());

/** A swap dock: a timber pontoon with mooring posts, a scooter ramp and pink neon chevrons. */
function buildSwapDock() {
  const batch = new Batch();
  const timber = named('dock timber', '#8a6a48', { roughness: 0.85 });
  const post = named('dock post', '#3d342c', { roughness: 0.8 });
  const neon = glow('dock neon', '#ff4f8b', 1.8);
  const cream = named('dock sign', '#fff1d6', { roughness: 0.5 });
  batch.add(timber, new THREE.BoxGeometry(5, 0.25, 3), [0, 0.12, 0]);
  for (let i = 0; i < 8; i++) batch.add(post, new THREE.BoxGeometry(5.02, 0.02, 0.05), [0, 0.255, -1.4 + i * 0.4]);
  for (const [x, z] of [[-2.4, -1.4], [2.4, -1.4], [-2.4, 1.4], [2.4, 1.4]]) batch.add(post, new THREE.CylinderGeometry(0.14, 0.14, 1.8, 8), [x, 0.6, z]);
  batch.add(post, new THREE.CylinderGeometry(0.07, 0.07, 3.2, 8), [-2.2, 1.6, 0]);
  batch.add(cream, new THREE.BoxGeometry(0.1, 0.9, 1.8), [-2.2, 3.0, 0]);
  for (const s of [-1, 1]) {
    batch.add(neon, new THREE.BoxGeometry(0.12, 0.08, 0.5), [-2.13, 3.0 + s * 0.12, -0.35], [s * 0.6, 0, 0]);
    batch.add(neon, new THREE.BoxGeometry(0.12, 0.08, 0.5), [-2.13, 3.0 + s * 0.12, 0.35], [-s * 0.6, 0, 0]);
  }
  return batch.group('swap dock');
}
await exportModel('swap-dock', buildSwapDock());

/** The shop's street sign: a tall pole with a neon slice and a cream board. */
function buildPizzaSign() {
  const batch = new Batch();
  const pole = named('sign pole', '#24282e', { roughness: 0.6, metalness: 0.3 });
  const cheese = glow('sign cheese', '#ffcf4a', 1.6);
  const crust = glow('sign crust', '#ff9a3a', 1.2);
  const red = glow('sign pepperoni', '#ff3b2f', 1.5);
  const board = named('sign board', '#fff1d6', { roughness: 0.5 });
  const neon = glow('sign neon', '#6ff2e0', 1.6);
  batch.add(pole, new THREE.CylinderGeometry(0.1, 0.12, 6, 8), [0, 3, 0]);
  batch.add(cheese, new THREE.CircleGeometry(1.4, 3, -Math.PI / 2, Math.PI * 2), [0, 6.6, 0.06]);
  batch.add(cheese, new THREE.CircleGeometry(1.4, 3, -Math.PI / 2, Math.PI * 2), [0, 6.6, -0.06], [0, Math.PI, 0]);
  batch.add(crust, new THREE.BoxGeometry(2.5, 0.35, 0.14), [0, 7.3, 0]);
  for (const [x, y] of [[-0.4, 6.8], [0.4, 6.7], [0, 6.1]]) batch.add(red, new THREE.CylinderGeometry(0.2, 0.2, 0.16, 14), [x, y, 0], [Math.PI / 2, 0, 0]);
  batch.add(board, new THREE.BoxGeometry(2.4, 0.8, 0.12), [0, 4.6, 0]);
  batch.add(neon, new THREE.BoxGeometry(2.6, 0.06, 0.14), [0, 5.05, 0]);
  batch.add(neon, new THREE.BoxGeometry(2.6, 0.06, 0.14), [0, 4.15, 0]);
  return batch.group('pizza sign');
}
await exportModel('pizza-sign', buildPizzaSign());

/**
 * The flood sheet: a unit disc of night water the tide runtime scales to a district and lifts with the
 * level. Dark, glossy and slightly see-through so the neon and the string lights reflect off it.
 */
function buildTideWater() {
  const batch = new Batch();
  // Canal teal with a faint glow of its own, so night water reads as water and not mud under the warm
  // street light; low metalness keeps the dusk sky from tinting the whole sheet brown.
  const water = named('tide water', '#10505f', { roughness: 0.1, metalness: 0.12, transparent: true, opacity: 0.9, emissive: '#0b3d4a', emissiveIntensity: 0.45 });
  const foam = named('tide foam', '#7fd1c4', { roughness: 0.4, transparent: true, opacity: 0.35, depthWrite: false });
  batch.add(water, new THREE.CircleGeometry(1, 64), [0, 0, 0], [-Math.PI / 2, 0, 0]);
  batch.add(foam, new THREE.RingGeometry(0.985, 1, 64), [0, 0.002, 0], [-Math.PI / 2, 0, 0]);
  return batch.group('tide water');
}
await exportModel('tide-water', buildTideWater());

/** The blimp line's mooring mast: a red-and-white lattice tower with a lit cap the blimp noses up to. */
function buildMast() {
  const batch = new Batch();
  const red = named('mast red', '#d93a2f', { roughness: 0.5, metalness: 0.3 });
  const white = named('mast white', '#f4efe6', { roughness: 0.6, metalness: 0.2 });
  const dark = named('mast dark', '#24282e', { roughness: 0.6 });
  const lamp = glow('mast lamp', '#ffcf4a', 2.4);
  batch.add(dark, new THREE.CylinderGeometry(1.6, 1.8, 0.4, 12), [0, 0.2, 0]);
  const H = 12, levels = 8;
  for (let i = 0; i < levels; i++) {
    const y0 = 0.4 + (i / levels) * H, y1 = 0.4 + ((i + 1) / levels) * H, r = 0.9 - 0.4 * (i / levels);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      batch.add(i % 2 === 0 ? red : white, new THREE.CylinderGeometry(0.06, 0.06, y1 - y0, 6), [Math.cos(a) * r, (y0 + y1) / 2, Math.sin(a) * r]);
    }
    batch.add(dark, new THREE.TorusGeometry(r, 0.04, 4, 12), [0, y1, 0], [Math.PI / 2, 0, 0]);
  }
  batch.add(red, new THREE.CylinderGeometry(0.5, 0.5, 0.5, 12), [0, H + 0.65, 0]);
  batch.add(lamp, new THREE.SphereGeometry(0.28, 12, 8), [0, H + 1.1, 0]);
  batch.add(dark, new THREE.BoxGeometry(0.1, 0.1, 2.4), [0, H + 0.6, 1.2]);
  return batch.group('blimp mast');
}
await exportModel('blimp-mast', buildMast());
