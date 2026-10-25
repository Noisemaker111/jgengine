// The original Brightway models (names, origins and footprints kept), lightly enriched.
import { T, P, V, box, cyl, ball, ring, beam, group, deckRound, bulbs, pennant, ringRail, stairs, signBoard, railing, humanoid, mesh } from './core.mjs';

function horse(g, a, i) {
  const h = group(g, [Math.cos(a) * 2.35, .65, Math.sin(a) * 2.35], -a);
  cyl(h, .04, 3.2, P.gold, [0, 1.25, 0], .04, 8);
  const coat = [P.cream, P.white, P.pink, P.cream, P.mint, P.white][i];
  const body = ball(h, .55, coat, [0, .8, 0]); body.scale.set(1, .65, .48);
  beam(h, [.28, .9, 0], [.5, 1.55, 0], .18, coat); ball(h, .24, coat, [.6, 1.55, 0]);
  box(h, [.22, .08, .36], P.coral, [0, 1.08, 0]); box(h, [.3, .04, .5], P.gold, [0, 1.13, 0]);
  for (const x of [-.3, .3]) for (const z of [-.18, .18]) beam(h, [x, .75, z], [x + .12, .15, z], .065, coat);
  beam(h, [-.45, .8, 0], [-.75, .5, 0], .09, P.gold); ball(h, .035, P.ink, [.72, 1.6, .19], 0);
  beam(h, [.45, 1.75, 0], [.15, 1.45, 0], .05, P.coral);
}
export function carousel(motion) {
  const g = new T.Group(); deckRound(g); cyl(g, .32, 4.8, P.teal, [0, 2.7, 0]);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; box(g, [.5, 1.6, .06], P.gold, [Math.cos(a) * .36, 2.2, Math.sin(a) * .36], [0, -a + Math.PI / 2, 0]); }
  cyl(g, 3.5, .4, P.coral, [0, 3.9, 0], 3.5, 28); cyl(g, 3.5, 1.4, P.cream, [0, 4.75, 0], .1, 28);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; beam(g, [Math.cos(a) * 3.5, 4.06, Math.sin(a) * 3.5], [0, 5.43, 0], .055, P.coral); }
  for (let i = 0; i < 12; i++) { const a = (i + .5) / 12 * Math.PI * 2; box(g, [.8, .3, .05], i % 2 ? P.teal : P.gold, [Math.cos(a) * 3.52, 3.9, Math.sin(a) * 3.52], [0, -a + Math.PI / 2, 0]); }
  bulbs(g, 3.45, 3.62, 24); bulbs(g, 3.45, 4.12, 24); ball(g, .23, P.gold, [0, 5.65, 0]); pennant(g, 0, 6.1, 0, P.teal);
  ringRail(g, 3.5, .3, .6, 28, Math.PI / 2, .35);
  stairs(g, 0, 3.6, 1.1, .3);
  const rotor = new T.Group(); rotor.name = 'CarouselRotor';
  for (let i = 0; i < 6; i++) horse(rotor, i / 6 * Math.PI * 2, i);
  motion('carousel_rotor', rotor, { ride: 'ride_carousel', kind: 'spin', pivot: [0, 0, 0], speed: .25 });
  return g;
}
// The wheel turns about X (its plane is Y-Z) so it matches the motion.json "wheel" kind.
export function ferris(motion) {
  const g = new T.Group(); deckRound(g, 4.4);
  for (const x of [-1.25, 1.25]) for (const z of [-2.8, 2.8]) beam(g, [x, .3, z], [x * .8, 6, 0], .18, P.teal);
  for (const x of [-1.25, 1.25]) { beam(g, [x, 2.4, -1.9], [x, 2.4, 1.9], .08, P.teal); beam(g, [x, 2.4, -1.9], [x * .9, 4.6, 0], .06, P.cream); beam(g, [x, 2.4, 1.9], [x * .9, 4.6, 0], .06, P.cream); }
  beam(g, [-1.5, 6, 0], [1.5, 6, 0], .2, P.gold); ball(g, .42, P.gold, [0, 6, 0]);
  box(g, [1.4, 1.9, 1.3], P.coral, [2.5, 1.25, 2.6]); box(g, [1.6, .14, 1.5], P.cream, [2.5, 2.25, 2.6]); box(g, [.9, .5, .06], P.glass, [2.5, 1.5, 3.26]);
  stairs(g, 0, 4.25, 1.4, .3); signBoard(g, [-2.4, 1.7, 3.2], 1.8, .5, P.teal, { posts: true });
  const rotor = new T.Group(); rotor.name = 'FerrisRotor';
  for (const x of [-.4, .4]) { ring(rotor, 4.4, .12, P.coral, [x, 0, 0], [0, Math.PI / 2, 0], 40); ring(rotor, 2.2, .07, P.cream, [x, 0, 0], [0, Math.PI / 2, 0], 24); }
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2, y = Math.sin(a) * 4.4, z = Math.cos(a) * 4.4;
    for (const x of [-.4, .4]) beam(rotor, [x, 0, 0], [x, y, z], .055, P.cream);
    ball(rotor, .1, P.gold, [.5, y * .75, z * .75], 0); ball(rotor, .1, P.gold, [-.5, y * .75, z * .75], 0);
    const cabin = new T.Group(); cabin.name = `Cabin_${i}`; cabin.userData.keep = true; cabin.position.set(0, y, z); rotor.add(cabin);
    beam(cabin, [0, 0, 0], [0, -.65, 0], .045, P.gold);
    box(cabin, [.85, .65, 1], i % 2 ? P.teal : P.coral, [0, -.98, 0]); box(cabin, [1, .12, 1.15], P.cream, [0, -.57, 0]);
    box(cabin, [.87, .22, .7], P.glass, [0, -.85, 0]);
    ball(rotor, .12, P.gold, [.52, y, z], 0); ball(rotor, .12, P.gold, [-.52, y, z], 0);
  }
  motion('ferris_rotor', rotor, { ride: 'ride_ferris', kind: 'wheel', pivot: [0, 6, 0], speed: .09, level: 'Cabin_' });
  return g;
}
export function drop(motion) {
  const g = new T.Group(); deckRound(g, 3.7);
  for (const x of [-.75, .75]) for (const z of [-.75, .75]) beam(g, [x, .3, z], [x, 11.5, z], .12, P.teal);
  for (let y = 1; y < 11; y += 1.5) { box(g, [1.8, .1, 1.8], P.gold, [0, y, 0]); for (const z of [-.75, .75]) beam(g, [-.75, y, z], [.75, y + 1.5, z], .055, P.cream); }
  cyl(g, 1.6, .3, P.coral, [0, 11.6, 0]); cyl(g, 1.6, 1, P.cream, [0, 12.2, 0], .1);
  ringRail(g, 3.4, .3, .9, 24, Math.PI / 2, .3); stairs(g, 0, 3.7, 1.1, .3);
  const carriage = new T.Group(); carriage.name = 'DropCarriage';
  box(carriage, [3.2, .35, 3.2], P.coral, [0, 0, 0]);
  for (const [x, z, r] of [[-1, 1.15, 0], [0, 1.15, 0], [1, 1.15, 0], [-1, -1.15, Math.PI], [0, -1.15, Math.PI], [1, -1.15, Math.PI]]) {
    const s = group(carriage, [x, 0, z], r); box(s, [.65, .8, .5], P.ink, [0, .55, 0]); box(s, [.5, .3, .25], P.gold, [0, .95, -.15]);
  }
  bulbs(carriage, 1.75, .1, 16, 0, 0, .06);
  motion('drop_carriage', carriage, { ride: 'ride_dropzone', kind: 'drop', pivot: [0, 1, 0], speed: 1 / 12, amplitude: 8.5 });
  bulbs(g, 1.5, 11.65, 12); pennant(g, 0, 13.2, 0, P.coral); return g;
}
export function station() {
  const g = new T.Group(); box(g, [7.3, .35, 6.3], P.wood, [0, .18, 0]);
  for (const x of [-3, 3]) for (const z of [-2.6, 2.6]) beam(g, [x, .3, z], [x, 3.1, z], .12, P.teal);
  box(g, [7.4, .22, 6.6], P.coral, [0, 3.1, 0]);
  for (let i = 0; i < 8; i++) box(g, [.4, .1, 6.8], P.cream, [-3.5 + i, 3.24, 0]);
  box(g, [2.8, 1.9, 2], P.teal, [-1.8, 1.35, -1.5]); box(g, [1.6, .7, .1], P.blue, [-1.8, 1.8, -.44]);
  for (const x of [-.8, .8]) box(g, [.09, .13, 6.6], P.ink, [x, 1.1, 0]);
  for (let i = 0; i < 3; i++) { const z = -1.8 + i * 1.6; box(g, [1.5, .6, 1.3], P.coral, [0, 1.6, z]); box(g, [1.1, .4, .8], P.gold, [0, 2.05, z]); for (const x of [-.8, .8]) ball(g, .17, P.ink, [x, 1.35, z]); }
  railing(g, [[1.4, 2.9], [3.4, 2.9]], .35, P.cream, .8); railing(g, [[1.4, -2.9], [3.4, -2.9]], .35, P.cream, .8);
  signBoard(g, [0, 3.75, 3.2], 3.2, .7, P.teal, { stripe: P.gold });
  pennant(g, -3.5, 3.8, -2.8, P.gold); pennant(g, 3.5, 3.8, -2.8, P.gold, 2.1, -1); return g;
}
export function fountain() {
  const g = new T.Group(); cyl(g, 1.85, .45, P.cream, [0, .23, 0], 1.85, 24); cyl(g, 1.6, .12, P.blue, [0, .46, 0], 1.6, 24);
  cyl(g, .25, 1.5, P.teal, [0, 1.1, 0]); cyl(g, .9, .2, P.cream, [0, 1.7, 0]); cyl(g, .78, .06, P.blue, [0, 1.83, 0]);
  ball(g, .32, P.gold, [0, 2.2, 0]); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; beam(g, [0, 2.1, 0], [Math.cos(a) * 1.3, .6, Math.sin(a) * 1.3], .026, P.blue); }
  return g;
}
export function treeModel() {
  const g = new T.Group(); cyl(g, .23, 2.4, P.wood, [0, 1.2, 0], .17, 8);
  for (const [x, y, z, r] of [[0, 3.2, 0, 1.3], [-.8, 2.6, .1, 1], [.8, 2.75, -.3, .95], [0, 4.1, 0, .8]]) ball(g, r, y > 3.5 ? P.mint : P.leaf, [x, y, z]); return g;
}
export function flowers() {
  const g = new T.Group(); box(g, [3.5, .35, 2.8], P.wood, [0, .18, 0]); box(g, [3.2, .08, 2.5], P.ink, [0, .4, 0]);
  for (let x = -1.1; x <= 1.2; x += .55) for (let z = -.8; z <= .9; z += .55) { beam(g, [x, .4, z], [x, .9, z], .025, P.leaf, 4); ball(g, .16, (Math.round(x * 10 + z * 20) % 2) ? P.coral : P.gold, [x, .95, z], 0); }
  return g;
}
export function lamp() {
  const g = new T.Group(); cyl(g, .35, .18, P.wood, [0, .09, 0]); beam(g, [0, .1, 0], [0, 3.9, 0], .09, P.teal);
  box(g, [.65, .85, .65], P.gold, [0, 3.8, 0]); cyl(g, .55, .4, P.teal, [0, 4.35, 0], .04, 4); ball(g, .12, P.gold, [0, 4.6, 0]); return g;
}
export function janitor() {
  const g = new T.Group(); box(g, [2.9, 2.8, 2.7], P.teal, [0, 1.4, 0]); cyl(g, 1.95, .75, P.cream, [0, 3.1, 0], .05, 4); box(g, [1.1, 2, .08], P.wood, [0, 1, 1.4]); box(g, [.7, .7, .1], P.blue, [0, 1.5, 1.47]);
  for (const x of [-1.4, 1.4]) { cyl(g, .4, .85, P.coral, [x, .5, 1.1]); cyl(g, .45, .08, P.gold, [x, .95, 1.1]); } beam(g, [1.4, .1, -1.3], [1.7, 2.3, -1.3], .045, P.wood); box(g, [.75, .25, .25], P.gold, [1.4, .2, -1.3]); return g;
}
export function path() {
  const g = new T.Group(); box(g, [3.96, .12, 3.96], P.wood, [0, .06, 0]); for (let i = 0; i < 6; i++) box(g, [3.8, .05, .58], i % 2 ? P.cream : '#e5ccaa', [0, .15, -1.65 + i * .66]); return g;
}
export function topiary() {
  const g = new T.Group(); cyl(g, .6, .6, P.coral, [0, .3, 0], .8); box(g, [1.7, .08, 1.7], P.gold, [0, .64, 0], [0, Math.PI / 4, 0]); cyl(g, .15, 1.3, P.wood, [0, 1, 0]); ball(g, 1.1, P.leaf, [0, 2, 0]); ball(g, .7, P.mint, [0, 3, 0]); ball(g, .3, P.leaf, [0, 3.75, 0]); return g;
}
export function coasterTrain() {
  const g = new T.Group();
  for (let i = 0; i < 3; i++) {
    const z = (i - 1) * 2.35;
    box(g, [1.65, .2, 2.2], P.ink, [0, .22, z]); box(g, [1.5, .58, 2.05], i === 0 ? P.gold : P.coral, [0, .62, z]);
    box(g, [1.05, .3, 1.25], P.ink, [0, .98, z]);
    for (const x of [-.84, .84]) beam(g, [x, .34, z - 1], [x, .34, z + 1], .05, P.cream);
    for (const dz of [-.72, .72]) box(g, [1.7, .1, .16], P.wood, [0, .3, z + dz]);
  }
  box(g, [1.15, .34, .6], P.cream, [0, .58, -3.5]); return g;
}
export function guest(color, i) {
  const g = new T.Group(); const skin = ['#edc1a2', '#b37b5c', '#d39f7d', '#865640', '#f1cfb2'][i];
  for (const x of [-.14, .14]) { box(g, [.19, .65, .23], P.ink, [x, .38, 0]); box(g, [.23, .14, .4], P.cream, [x, .08, .07]); }
  cyl(g, .28, .7, color, [0, 1, 0], .34, 8); ball(g, .28, skin, [0, 1.63, 0]);
  for (const x of [-.39, .39]) beam(g, [x, 1.3, 0], [x, .85, .05], .085, skin);
  cyl(g, .3, .12, P.ink, [0, 1.84, 0], .27, 12); if (i % 2 === 0) cyl(g, .39, .05, P.gold, [0, 1.85, 0]);
  box(g, [.3, .35, .18], P.wood, [0, 1, -.29]); return g;
}
export { humanoid, mesh, V };
