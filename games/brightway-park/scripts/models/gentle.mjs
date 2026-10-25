// Gentle rides.
import { T, P, V, box, cyl, ball, ring, beam, group, mesh, deckRound, deckRect, bulbs, bulbLine, pennant, bunting, railing, ringRail, signBoard, stripedCone, stairs, strip, tube, ribbon, flat, slab, ellipse, lampPost, shrub, tree, wheel, smooth } from './core.mjs';

function teacup(g, x, z, color, rot) {
  const c = group(g, [x, 0, z], rot);
  cyl(c, .95, .12, P.cream, [0, .45, 0], 1.05, 16); ring(c, 1.0, .04, P.gold, [0, .52, 0], [Math.PI / 2, 0, 0], 20, 4);
  const cup = mesh(c, new T.CylinderGeometry(.9, .55, .85, 16, 1, true), color, [0, .95, 0], [0, 0, 0], { double: true });
  cyl(c, .55, .06, P.cream, [0, .55, 0], .55, 16); ring(c, .9, .06, P.gold, [0, 1.38, 0], [Math.PI / 2, 0, 0], 20, 4);
  ring(c, .62, .045, P.cream, [0, 1.0, 0], [Math.PI / 2, 0, 0], 16, 4);
  ring(c, .26, .07, color, [.95, 1.0, 0], [0, 0, 0], 10, 4);
  cyl(c, .55, .35, P.cream, [0, .78, 0], .6, 12); cyl(c, .08, .4, P.ink, [0, 1.05, 0], .08, 6); cyl(c, .26, .05, P.gold, [0, 1.27, 0], .26, 10);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; ball(c, .1, i % 2 ? P.gold : P.cream, [Math.cos(a) * .78, 1.18, Math.sin(a) * .78], 0); }
}
export function teacups(motion) {
  const g = new T.Group(); deckRound(g, 3.75, .3, 32);
  ringRail(g, 3.55, .3, .75, 32, Math.PI / 2, .3); stairs(g, 0, 3.75, 1.1, .3);
  for (const s of [-1, 1]) { lampPost(g, s * 2.2, 3.0, 2.4); }
  signBoard(g, [0, 2.4, 3.55], 1.8, .45, P.pink, { posts: true, postColor: P.gold });
  const r = new T.Group(); r.name = 'TeacupRotor';
  cyl(r, 3.25, .12, P.teal, [0, .36, 0], 3.25, 32); ring(r, 3.25, .06, P.gold, [0, .42, 0], [Math.PI / 2, 0, 0], 40, 4);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; box(r, [3.0, .02, .25], i % 2 ? P.cream : P.mint, [Math.cos(a) * 1.6, .43, Math.sin(a) * 1.6], [0, -a, 0]); }
  const cols = [P.pink, P.teal, P.gold, P.coral, P.blue, P.mint];
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; teacup(r, Math.cos(a) * 2.15, Math.sin(a) * 2.15, cols[i], -a * 2); }
  // giant teapot centrepiece
  const pot = ball(r, .85, P.cream, [0, 1.25, 0], 2); pot.scale.set(1, .85, 1);
  cyl(r, .5, .25, P.pink, [0, 2.0, 0], .3, 12); ball(r, .14, P.gold, [0, 2.2, 0], 1); ring(r, .8, .06, P.gold, [0, 1.25, 0], [Math.PI / 2, 0, 0], 20, 4);
  beam(r, [.75, 1.2, 0], [1.25, 1.75, 0], .1, P.cream); ring(r, .32, .08, P.cream, [-.85, 1.3, 0], [0, 0, 0], 10, 4);
  motion('ride_teacups_motion', r, { ride: 'ride_teacups', kind: 'spin', pivot: [0, 0, 0], speed: .6 });
  return g;
}

export function helter() {
  const g = new T.Group(); deckRound(g, 3.75, .25, 28);
  // striped tower
  const bands = 9; for (let i = 0; i < bands; i++) cyl(g, 1.3 - i * .03, 1.0, i % 2 ? P.cream : P.coral, [0, .25 + .5 + i, 0], 1.3 - (i + 1) * .03, 12);
  ring(g, 1.05, .07, P.gold, [0, 9.25, 0], [Math.PI / 2, 0, 0], 16, 4);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; beam(g, [Math.cos(a) * 1.05, 9.25, Math.sin(a) * 1.05], [Math.cos(a) * 1.05, 10.3, Math.sin(a) * 1.05], .05, P.cream); }
  box(g, [2.3, .12, 2.3], P.wood, [0, 9.25, 0], [0, Math.PI / 8, 0]);
  stripedCone(g, 1.7, 1.9, 10.35, 12, P.teal, P.cream); pennant(g, 0, 12.6, 0, P.coral, 1.2);
  bulbs(g, 1.66, 10.3, 16);
  // door and windows
  box(g, [.9, 1.6, .2], P.ink, [0, 1.05, 1.24]); box(g, [1.1, .14, .3], P.gold, [0, 1.9, 1.25]);
  for (const [y, a] of [[3.5, 2], [5.5, 4], [7.5, 0.6]]) box(g, [.35, .5, .1], P.glow, [Math.cos(a) * 1.25, y, Math.sin(a) * 1.25], [0, -a + Math.PI / 2, 0]);
  // spiral slide: 2.6 turns from the top down, ending at +Z
  const inner = [], outer = [], lip = [], n = 120, turns = 2.6, top = 8.9, bottom = .55, end = Math.PI / 2;
  for (let i = 0; i <= n; i++) {
    const s = i / n, a = end + (1 - s) * turns * Math.PI * 2, y = bottom + (top - bottom) * (1 - s);
    inner.push(V(Math.cos(a) * 1.3, y, Math.sin(a) * 1.3)); outer.push(V(Math.cos(a) * 2.75, y - .08, Math.sin(a) * 2.75));
    lip.push(V(Math.cos(a) * 2.85, y + .22, Math.sin(a) * 2.85));
  }
  strip(g, inner, outer, P.gold); tube(g, lip, .1, P.coral, false, 5);
  for (let i = 0; i <= n; i += 2) segBoxEdge(g, outer[i], lip[i]);
  for (let i = 6; i < n; i += 10) { const p = outer[i]; beam(g, [p.x * 1.02, .25, p.z * 1.02], [p.x, p.y - .05, p.z], .06, P.teal, 5); }
  // landing mat at the foot
  box(g, [1.6, .12, 1.2], P.blue, [1.95, .3, 1.4], [0, -.3, 0]);
  railing(g, [[-1.6, 3.2], [-.8, 3.55]], .25, P.cream, .7);
  return g;
}
function segBoxEdge(g, a, b) { beam(g, a, b, .035, P.coral, 4); }

export function haunted() {
  const g = new T.Group();
  box(g, [11.2, .25, 11.2], P.plum, [0, .12, 0]); box(g, [11, .06, 4.6], '#3a4d3f', [0, .27, 3.1]);
  // main house
  const H = group(g, [0, .25, -1.6]);
  box(H, [8.6, 4.2, 5.2], P.purple, [0, 2.1, 0]);
  for (const x of [-4.3, 4.3]) box(H, [.18, 4.3, 5.3], P.gold, [x, 2.15, 0]);
  box(H, [8.8, .2, 5.4], P.gold, [0, 4.2, 0]);
  const gable = (x, w, h, tilt, col) => { const s = new T.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
    const m = mesh(H, new T.ExtrudeGeometry(s, { depth: 5.6, bevelEnabled: false }), col, [x, 4.25, -2.8], [0, 0, tilt]); return m; };
  gable(-2.4, 3.8, 2.6, .06, P.plum); gable(1.2, 3.2, 3.3, -.08, P.plum); gable(3.4, 2.4, 1.9, .1, P.plum);
  // trim on gable fronts
  for (const [x, w, h, t] of [[-2.4, 3.8, 2.6, .06], [1.2, 3.2, 3.3, -.08], [3.4, 2.4, 1.9, .1]]) {
    const top = V(x - Math.sin(t) * h, 4.25 + Math.cos(t) * h, 2.85);
    beam(H, [x - w / 2, 4.25, 2.85], top, .06, P.gold, 4); beam(H, [x + w / 2, 4.25, 2.85], top, .06, P.gold, 4);
    box(H, [.6, .7, .08], P.glow, [x - Math.sin(t) * h * .4, 4.25 + h * .38, 2.84], [0, 0, t]);
  }
  // tower with crooked spire
  cyl(H, 1.1, 6.8, P.purple, [-3.6, 3.4, -1.4], 1.0, 8); ring(H, 1.05, .07, P.gold, [-3.6, 6.8, -1.4], [Math.PI / 2, 0, 0], 16, 4);
  const sp = mesh(H, new T.ConeGeometry(1.35, 3.0, 8), P.plum, [-3.5, 8.3, -1.4], [0, 0, .12]); ball(H, .14, P.gold, [-3.32, 9.8, -1.4], 0);
  box(H, [.5, .7, .1], P.glow, [-3.6, 5.2, -.35]);
  // chimney
  box(H, [.7, 2.2, .7], P.ink, [2.4, 6.2, -1.2], [0, 0, -.12]); box(H, [.9, .2, .9], P.gold, [2.25, 7.3, -1.2], [0, 0, -.12]);
  // windows with boards
  for (const [x, y] of [[-3, 1.6], [3, 1.6], [-1.2, 3], [1.4, 3], [3.3, 3]]) { box(H, [.8, 1, .08], P.glow, [x, y, 2.62]); box(H, [1.0, .1, .1], P.wood, [x, y, 2.68], [0, 0, .5]); box(H, [.95, .14, .14], P.gold, [x, y - .55, 2.65]); }
  // porch, two doors (in / out), track running out
  box(H, [5.6, .25, 1.6], P.darkwood, [0, .12, 3.4]);
  for (const x of [-2.6, -.9, .9, 2.6]) beam(H, [x, .25, 4.05], [x, 2.9, 4.05], .1, P.gold, 6);
  box(H, [5.8, .25, 1.9], P.plum, [0, 3.0, 3.4], [-.18, 0, 0]);
  for (const x of [-1.7, 1.7]) { box(H, [1.4, 2.3, .1], P.ink, [x, 1.25, 2.62]); box(H, [1.6, .12, .14], P.gold, [x, 2.45, 2.68]); for (const k of [-.75, .75]) box(H, [.1, 2.3, .14], P.gold, [x + k, 1.25, 2.68]); mesh(H, new T.ConeGeometry(.85, .7, 4), P.gold, [x, 2.85, 2.66], [0, Math.PI / 4, 0]).scale.set(1, 1, .15); }
  signBoard(g, [0, 3.85, 1.95], 3.2, .7, P.ink, { stripe: P.glow });
  // ghost-train track loop in front, out of one door and back in the other
  const loopPts = []; for (let i = 0; i <= 40; i++) { const a = i / 40 * Math.PI; loopPts.push(V(-Math.cos(a) * 1.7, .3, 1.1 + Math.sin(a) * 3.0)); }
  const sideAt = i => { const p = loopPts[Math.max(0, i - 1)], q = loopPts[Math.min(40, i + 1)], t = q.clone().sub(p).normalize(); return V(t.z, 0, -t.x); };
  for (const s of [-.32, .32]) tube(g, loopPts.map((p, i) => p.clone().addScaledVector(sideAt(i), s)), .05, P.chrome, false, 4, { metal: .5 });
  for (let i = 0; i <= 40; i += 3) { const p = loopPts[i], sd = sideAt(i); box(g, [.9, .06, .16], P.wood, [p.x, .27, p.z], [0, Math.atan2(sd.x, sd.z) + Math.PI / 2, 0]); }
  // ghost car
  const car = group(g, [-1.2, .32, 3.9], -1.0); box(car, [.9, .45, 1.3], P.ink, [0, .3, 0]); box(car, [.95, .6, .3], P.coral, [0, .55, .55]); box(car, [.7, .2, .5], P.gold, [0, .6, -.2]); ball(car, .2, P.white, [0, 1.0, .6], 1);
  // graves, dead trees, spiky fence
  for (const [x, z, r] of [[-4.6, 2.2, .1], [-3.8, 3.6, -.2], [4.2, 2.4, .15], [3.6, 4.2, -.1], [4.8, 3.6, .2]]) { box(g, [.55, .8, .16], P.stone, [x, .65, z], [0, r, r * .5]); ball(g, .27, P.stone, [x, 1.0, z], 0).scale.set(1, .5, .3); }
  for (const [x, z] of [[-4.7, 4.9], [4.6, 1.1]]) { beam(g, [x, .25, z], [x + .2, 3, z], .14, P.ink); beam(g, [x + .15, 2.2, z], [x + .9, 3, z + .3], .07, P.ink); beam(g, [x + .1, 1.8, z], [x - .7, 2.6, z - .2], .07, P.ink); }
  const fence = [[-5.5, 5.4], [-1.2, 5.4]], fence2 = [[1.2, 5.4], [5.5, 5.4]];
  for (const f of [fence, fence2]) { for (let x = f[0][0]; x <= f[1][0] + .01; x += .45) { box(g, [.08, 1.1, .08], P.ink, [x, .8, 5.4]); ball(g, .07, P.gold, [x, 1.38, 5.4], 0); } box(g, [f[1][0] - f[0][0], .08, .08], P.ink, [(f[0][0] + f[1][0]) / 2, 1.1, 5.4]); }
  for (const x of [-1.2, 1.2]) { box(g, [.4, 1.8, .4], P.stone, [x, 1.15, 5.4]); ball(g, .25, P.glow, [x, 2.25, 5.4], 1); }
  return g;
}

function vintageCar(g, pos, rot, color, top) {
  const c = group(g, pos, rot);
  box(c, [.95, .35, 1.9], color, [0, .45, 0]); box(c, [.75, .3, .7], color, [0, .7, .5]);
  ring(c, .5, .05, P.gold, [0, .8, .9], [0, 0, 0], 8, 4); box(c, [.7, .04, .3], P.chrome, [0, .95, .15], [-.5, 0, 0], { metal: .5 });
  box(c, [.85, .35, .55], P.darkwood, [0, .75, -.35]); box(c, [.85, .5, .12], P.darkwood, [0, .95, -.65]);
  for (const x of [-.52, .52]) for (const z of [-.6, .62]) { wheel(c, [x, .28, z], .26, .14); cyl(c, .1, .16, P.cream, [x * 1.02, .28, z], .1, 6).rotation.z = Math.PI / 2; }
  for (const x of [-.52, .52]) box(c, [.14, .06, 1.7], P.ink, [x, .55, 0]);
  for (const x of [-.25, .25]) ball(c, .09, P.glow, [x, .62, .98], 0);
  ball(c, .14, P.tyre, [0, .25, -.98], 0);
  if (top) { for (const x of [-.42, .42]) for (const z of [-.6, .1]) beam(c, [x, .6, z], [x, 1.45, z], .025, P.ink, 4); box(c, [1.0, .07, .95], P.cream, [0, 1.48, -.25]); }
  return c;
}
export function vintage() {
  const g = new T.Group();
  // figure-8 road
  const pts = []; const N = 120; for (let i = 0; i < N; i++) { const t = i / N * Math.PI * 2; pts.push(V(4.6 * Math.sin(t), .12, 2.3 * Math.sin(2 * t) - .9)); }
  ribbon(g, pts, 1.6, P.sand, .0, true); ribbon(g, pts, 1.3, P.asphalt, .03, true);
  for (let i = 0; i < N; i += 4) { const p = pts[i], q = pts[(i + 1) % N]; box(g, [.08, .02, .35], P.cream, [p.x, .17, p.z], [0, Math.atan2(q.x - p.x, q.z - p.z), 0]); }
  for (let i = 0; i < N; i += 2) { const p = pts[i], q = pts[(i + 1) % N], t = V(q.x - p.x, 0, q.z - p.z).normalize(), s = V(t.z, 0, -t.x);
    for (const k of [.8, -.8]) box(g, [.12, .12, .3], (i / 2) % 2 ? P.red : P.white, [p.x + s.x * k, .18, p.z + s.z * k], [0, Math.atan2(t.x, t.z), 0]); }
  // islands in the loops
  for (const x of [-2.6, 2.6]) { flat(g, ellipse(1.5, 1.0, 16, x, -.9), .1, P.leaf); shrub(g, x, -.9, .5); }
  lampPost(g, 0, -3.8, 2.6); lampPost(g, -5.3, 1.6, 2.6); lampPost(g, 5.3, 1.6, 2.6);
  // cars on the road
  const at = t => { const p = V(4.6 * Math.sin(t), .12, 2.3 * Math.sin(2 * t) - .9), d = V(4.6 * Math.cos(t), 0, 4.6 * Math.cos(2 * t)); return [p, Math.atan2(d.x, d.z)]; };
  for (const [t, col, top] of [[.5, P.coral, true], [2.4, P.teal, false], [4.1, P.gold, true]]) { const [p, r] = at(t); vintageCar(g, [p.x, .15, p.z], r, col, top); }
  // garage station on the +Z side
  const G = group(g, [0, 0, 3.9]);
  deckRect(G, 6.4, 2.6, .25, 0, .4);
  box(G, [2.4, 2.2, 1.8], P.cream, [-1.9, 1.35, .3]); box(G, [1.6, 1.6, .08], P.ink, [-1.9, 1.05, 1.22]);
  for (let i = 0; i < 5; i++) box(G, [1.6, .06, .1], P.grey, [-1.9, .4 + i * .3, 1.27]);
  box(G, [2.7, .2, 2.1], P.coral, [-1.9, 2.55, .3]); for (let i = 0; i < 6; i++) box(G, [.42, .08, 2.15], i % 2 ? P.cream : P.coral, [-3.0 + i * .45, 2.7, .3]);
  // ticket hut and petrol pump
  box(G, [1.2, 1.9, 1.1], P.teal, [1.2, 1.2, 0]); box(G, [.8, .6, .06], P.glass, [1.2, 1.4, .57]); cyl(G, .95, .5, P.gold, [1.2, 2.4, 0], .1, 4);
  box(G, [.5, 1.3, .4], P.red, [2.6, .9, .6]); ball(G, .22, P.cream, [2.6, 1.75, .6], 1); beam(G, [2.85, 1.0, .6], [2.95, .5, .9], .03, P.ink, 4);
  signBoard(G, [0, 2.9, 1.5], 2.6, .55, P.teal, { posts: true, postColor: P.cream, stripe: P.gold });
  bunting(G, [-3.1, 2.6, 1.6], [3.1, 2.6, 1.6], 12);
  return g;
}

export function obs(motion) {
  const g = new T.Group(); deckRound(g, 3.75, .3, 32);
  // mast with gold bands, rising to 18 m
  cyl(g, .55, 18, P.teal, [0, 9.3, 0], .42, 12);
  for (let y = 2; y < 18; y += 2) ring(g, .52 - y * .005, .06, P.gold, [0, y, 0], [Math.PI / 2, 0, 0], 14, 4);
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; beam(g, [Math.cos(a) * 1.5, .3, Math.sin(a) * 1.5], [Math.cos(a) * .45, 3.5, Math.sin(a) * .45], .1, P.teal); }
  // crown
  cyl(g, 1.4, .4, P.coral, [0, 18.4, 0], 1.4, 16); cyl(g, 1.4, .9, P.cream, [0, 19.05, 0], .15, 16); bulbs(g, 1.38, 18.25, 14);
  pennant(g, 0, 20.4, 0, P.gold, 1.4);
  // boarding ring and kiosk
  ringRail(g, 3.55, .3, .8, 32, Math.PI / 2, .3); stairs(g, 0, 3.75, 1.2, .3);
  box(g, [1.1, 1.8, 1.0], P.coral, [2.4, 1.2, -1.7]); cyl(g, .85, .5, P.gold, [2.4, 2.35, -1.7], .1, 4);
  signBoard(g, [-2.2, 2.0, 2.4], 1.6, .45, P.teal, { posts: true, rotY: -.5 });
  const c = new T.Group(); c.name = 'ObsCabin';
  cyl(c, 2.6, .25, P.cream, [0, .12, 0], 2.6, 24); ring(c, 2.6, .07, P.gold, [0, .25, 0], [Math.PI / 2, 0, 0], 32, 4);
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; box(c, [.95, 1.3, .06], P.glass, [Math.cos(a) * 2.45, .95, Math.sin(a) * 2.45], [0, -a + Math.PI / 2, 0]); beam(c, [Math.cos(a + Math.PI / 16) * 2.47, .25, Math.sin(a + Math.PI / 16) * 2.47], [Math.cos(a + Math.PI / 16) * 2.47, 1.65, Math.sin(a + Math.PI / 16) * 2.47], .05, P.coral, 4); }
  cyl(c, 2.7, .3, P.coral, [0, 1.75, 0], 2.6, 24); cyl(c, 2.7, .5, P.cream, [0, 2.15, 0], .9, 24); bulbs(c, 2.65, 1.75, 20);
  cyl(c, .85, 2.0, P.ink, [0, 1.15, 0], .85, 12);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; box(c, [.7, .45, .5], P.coral, [Math.cos(a) * 1.7, .45, Math.sin(a) * 1.7], [0, -a + Math.PI / 2, 0]); }
  motion('ride_obs_motion', c, { ride: 'ride_obs', kind: 'drop', pivot: [0, .32, 0], speed: .05, amplitude: 13 });
  return g;
}

// Deterministic hedge maze with a gazebo in the open centre.
export function maze() {
  const g = new T.Group(), N = 7, C = 1.5, half = N * C / 2;
  box(g, [11.2, .1, 11.2], P.sand, [0, .05, 0]);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const vis = Array.from({ length: N }, () => Array(N).fill(false));
  const wallsV = Array.from({ length: N }, () => Array(N + 1).fill(true)), wallsH = Array.from({ length: N + 1 }, () => Array(N).fill(true));
  const centre = (i, j) => Math.abs(i - 3) <= 1 && Math.abs(j - 3) <= 1;
  for (let i = 2; i <= 4; i++) for (let j = 2; j <= 4; j++) { vis[i][j] = true; if (i < 4) wallsH[i + 1][j] = false; if (j < 4) wallsV[i][j + 1] = false; }
  const stack = [[0, 0]]; vis[0][0] = true;
  while (stack.length) {
    const [i, j] = stack.at(-1), opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([di, dj]) => [i + di, j + dj, di, dj]).filter(([a, b]) => a >= 0 && b >= 0 && a < N && b < N && !vis[a][b]);
    if (!opts.length) { stack.pop(); continue; }
    const [a, b, di, dj] = opts[Math.floor(rnd() * opts.length)];
    if (di) wallsH[Math.max(i, a)][j] = false; else wallsV[i][Math.max(j, b)] = false;
    vis[a][b] = true; stack.push([a, b]);
  }
  // connect the centre: open one wall into it, entrance at +Z middle (row N-1 → z = +half), exit gap at -Z
  wallsH[2][3] = false; wallsH[N][3] = false; wallsH[0][1] = false;
  const H = 1.6, W = .45;
  const wall = (x, z, lx, lz) => { box(g, [lx, H, lz], P.hedge, [x, H / 2 + .1, z]); box(g, [lx + .04, .12, lz + .04], P.leaf, [x, H + .12, z]); };
  for (let i = 0; i <= N; i++) for (let j = 0; j < N; j++) if (wallsH[i][j]) wall(-half + (j + .5) * C, -half + i * C, C + W, W);
  for (let i = 0; i < N; i++) for (let j = 0; j <= N; j++) if (wallsV[i][j]) wall(-half + j * C, -half + (i + .5) * C, W, C + W);
  for (let i = 0; i <= N; i += 7) for (let j = 0; j <= N; j += 7) ball(g, .5, P.leaf, [-half + j * C, H + .45, -half + i * C], 1);
  // gazebo
  const z = group(g, [0, .1, 0]);
  cyl(z, 1.7, .25, P.cream, [0, .12, 0], 1.7, 8); cyl(z, 1.5, .1, P.wood, [0, .28, 0], 1.5, 8);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; beam(z, [Math.cos(a) * 1.4, .3, Math.sin(a) * 1.4], [Math.cos(a) * 1.4, 2.6, Math.sin(a) * 1.4], .07, P.cream, 6); }
  cyl(z, 1.7, .18, P.gold, [0, 2.65, 0], 1.7, 8); mesh(z, new T.ConeGeometry(1.9, 1.5, 8), P.coral, [0, 3.48, 0]); ball(z, .18, P.gold, [0, 4.3, 0], 1);
  pennant(z, 0, 4.9, 0, P.teal, 1.0); cyl(z, .5, .5, P.teal, [0, .55, 0], .4, 8);
  // entrance arch at +Z
  for (const x of [-.95, .95]) { box(g, [.35, 2.6, .35], P.cream, [x, 1.3, half]); ball(g, .2, P.gold, [x, 2.75, half], 1); }
  box(g, [2.3, .5, .2], P.teal, [0, 2.45, half + .05]); box(g, [1.6, .14, .22], P.gold, [0, 2.45, half + .07]);
  return g;
}
