// Water rides: blue surfaces with a lighter rim.
import { T, P, V, Y, box, cyl, ball, ring, beam, group, mesh, segBox, deckRect, bulbLine, pennant, bunting, railing, signBoard, stairs, strip, tube, ribbon, flat, slab, ellipse, scalePts, pool, spline, frames, pathLengths, onPath, lampPost, shrub, tree } from './core.mjs';

// Hull: open lower half-ellipsoid, double sided.
function hull(g, pos, rx, ry, rz, color, rotY = 0) {
  const m = mesh(g, new T.SphereGeometry(1, 12, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), color, pos, [0, rotY, 0], { double: true }); m.scale.set(rx, ry, rz);
  const r = ring(g, 1, .06, P.gold, pos, [Math.PI / 2, 0, 0], 20, 4); r.scale.set(rx, rz, 1); r.rotation.set(Math.PI / 2, 0, rotY); return m;
}
function rowBoat(g, x, z, rot, color) {
  const b = group(g, [x, .3, z], rot); hull(b, [0, .05, 0], .55, .35, 1.25, color);
  box(b, [1.0, .06, .25], P.wood, [0, -.05, .3]); box(b, [1.0, .06, .25], P.wood, [0, -.05, -.45]);
  for (const s of [-1, 1]) beam(b, [s * .5, .05, .1], [s * 1.5, -.12, .5], .03, P.wood, 4);
}
function swanBoat(g, x, z, rot) {
  const b = group(g, [x, .4, z], rot); hull(b, [0, .05, 0], .75, .45, 1.3, P.white);
  for (const s of [-1, 1]) { const w = ball(b, .5, P.white, [s * .55, .25, -.25], 1); w.scale.set(.35, .6, 1.2); }
  tube(b, [V(0, .1, 1.0), V(0, .6, 1.35), V(0, 1.2, 1.2), V(0, 1.55, 1.35)], .13, P.white, false, 6);
  ball(b, .2, P.white, [0, 1.6, 1.42], 1); mesh(b, new T.ConeGeometry(.08, .3, 6), P.orange, [0, 1.58, 1.68], [Math.PI / 2, 0, 0]);
  ball(b, .04, P.ink, [.13, 1.66, 1.5], 0); ball(b, .04, P.ink, [-.13, 1.66, 1.5], 0);
  box(b, [1.0, .25, .5], P.coral, [0, .15, -.35]); box(b, [1.0, .45, .1], P.coral, [0, .35, -.6]);
}
export function boats() {
  const g = new T.Group();
  const edge = ellipse(5.0, 3.9, 40, 0, -.9, .05, .7);
  slab(g, scalePts(edge, 1.13, 0, -.9), 0, .3, P.stone, [edge]);
  flat(g, edge, .13, P.waterEdge); flat(g, scalePts(edge, .93, 0, -.9), .15, P.water);
  // island with a tree and a little lighthouse
  slab(g, ellipse(1.3, 1.0, 14, -2.6, -2.2, .1), 0, .35, P.sand); tree(g, -2.9, -2.3, .8);
  cyl(g, .3, 1.6, P.white, [-1.9, 1.15, -2.0], .22, 8); for (const y of [.7, 1.3]) cyl(g, .29, .18, P.red, [-1.9, y, -2.0], .26, 8); ball(g, .2, P.glow, [-1.9, 2.05, -2.0], 1); cyl(g, .25, .2, P.red, [-1.9, 2.25, -2.0], .02, 8);
  for (const [x, z] of [[2.8, -3.2], [3.4, -2.6], [-3.8, .4], [1.2, -4.2], [-1, 1.2]]) flat(g, ellipse(.35, .35, 8, x, z), .17, P.leaf);
  // jetty at +Z
  box(g, [1.6, .14, 4.4], P.wood, [.8, .42, 1.9]); for (let z = 0; z < 4.4; z += .3) box(g, [1.6, .03, .05], P.darkwood, [.8, .5, z]);
  for (const x of [.05, 1.55]) for (let z = .2; z < 4.2; z += 1.3) cyl(g, .08, .6, P.darkwood, [x, .3, z], .08, 6);
  railing(g, [[1.55, -.2], [1.55, 4.1]], .49, P.cream, .8);
  // boat hire hut
  const H = group(g, [-2.6, 0, 4.4]);
  box(H, [2.6, 1.9, 1.4], P.teal, [0, 1.1, 0]); box(H, [1.6, .6, .06], P.cream, [0, 1.3, .73]); box(H, [1.8, .1, .3], P.wood, [0, 1.0, .85]);
  for (let i = 0; i < 7; i++) box(H, [.42, .1, 1.9], i % 2 ? P.coral : P.cream, [-1.26 + i * .42, 2.15, .15], [.12, 0, 0]);
  signBoard(H, [0, 2.6, 0], 2.0, .45, P.blue, { stripe: P.white });
  for (const [x, z] of [[-4.6, 4.2], [4.6, 3.6]]) lampPost(g, x, z, 2.6);
  bunting(g, [-1.3, 2.6, 4.6], [1.55, 1.3, 4.1], 6);
  rowBoat(g, -.4, 1.4, .3, P.coral); rowBoat(g, 2.6, -1.5, 1.9, P.teal);
  swanBoat(g, 2.2, 1.4, -.2); swanBoat(g, -.8, -2.8, 2.4);
  return g;
}

// U-trough along a path; returns frames for placing boats.
function trough(g, pts, w, o = {}) {
  const F = frames(pts, null, true), n = pts.length, hw = w / 2, wall = o.wall ?? .55;
  const L0 = [], L1 = [], R0 = [], R1 = [], W = [];
  for (const f of F) { const s = V(f.t.z, 0, -f.t.x).normalize(); L0.push(f.p.clone().addScaledVector(s, hw).add(V(0, -.08, 0))); L1.push(f.p.clone().addScaledVector(s, hw).add(V(0, wall, 0))); R0.push(f.p.clone().addScaledVector(s, -hw).add(V(0, -.08, 0))); R1.push(f.p.clone().addScaledVector(s, -hw).add(V(0, wall, 0))); }
  strip(g, L0, R0, o.bottom ?? P.wood, { closed: true }); strip(g, L0, L1, o.side ?? P.wood, { closed: true }); strip(g, R0, R1, o.side ?? P.wood, { closed: true });
  tube(g, L1, .06, o.trim ?? P.cream, true, 4); tube(g, R1, .06, o.trim ?? P.cream, true, 4);
  ribbon(g, pts, w - .1, P.water, .14, true);
  const every = o.supportEvery ?? 5;
  for (let i = 0; i < n; i += every) {
    const f = F[i]; if (f.p.y < .7) continue; const s = V(f.t.z, 0, -f.t.x).normalize();
    for (const k of [hw + .05, -hw - .05]) { const q = f.p.clone().addScaledVector(s, k); beam(g, [q.x, 0, q.z], [q.x, q.y - .05, q.z], o.postR ?? .08, o.post ?? P.darkwood, 5); }
    const a = f.p.clone().addScaledVector(s, hw + .05), b = f.p.clone().addScaledVector(s, -hw - .05);
    beam(g, a.clone().add(V(0, -.15, 0)), b.clone().add(V(0, -.15, 0)), .06, o.post ?? P.darkwood, 4);
    if (f.p.y > 2) beam(g, [a.x, .3, a.z], [b.x, f.p.y - .3, b.z], .045, o.post ?? P.darkwood, 4);
  }
  return { F, lens: pathLengths(F, true) };
}
function logBoat(c) {
  const l = mesh(c, new T.CylinderGeometry(.42, .42, 2.2, 10), P.darkwood, [0, .35, 0], [Math.PI / 2, 0, 0]); l.scale.set(1, 1, .7);
  mesh(c, new T.ConeGeometry(.42, .5, 10), P.darkwood, [0, .35, 1.35], [Math.PI / 2, 0, 0]).scale.set(1, 1, .7);
  cyl(c, .4, .06, P.wood, [0, .35, -1.12], .4, 10).rotation.x = Math.PI / 2;
  for (const z of [-.5, .3]) { box(c, [.55, .16, .45], P.cream, [0, .58, z]); box(c, [.55, .3, .08], P.coral, [0, .7, z - .25]); }
}
export function logflume() {
  const g = new T.Group();
  const ctrl = [[4, .6, 6], [-2, .6, 6], [-5.4, .7, 4.8], [-6.5, 1.2, 2.2], [-6.5, 4.4, -2.8], [-5.6, 5, -6.2], [-2, 5, -6.6], [1, 5, -5.2], [3.4, 5, -6.5], [5.7, 5, -6.0], [6.0, 4.9, -3.6], [6.0, 4.6, -2.6], [6.0, .7, 1.6], [5.9, .5, 3.6], [5.5, .6, 5.6]];
  const pts = spline(ctrl, .35); const { F, lens } = trough(g, pts, 1.3, { supportEvery: 5 });
  // lift chain
  for (let i = 0; i < pts.length; i++) { const p = pts[i]; if (p.x < -6 && p.y > 1.3 && p.y < 4.3 && i % 2 === 0) box(g, [.25, .05, .2], P.ink, [p.x, p.y + .08, p.z]); }
  // splash pool at the foot of the drop
  pool(g, ellipse(1.5, 2.1, 20, 5.9, 3.0), .3);
  slab(g, ellipse(1.75, 2.35, 20, 5.9, 3.0), 0, .26, P.stone);
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; ball(g, .28 + (i % 3) * .1, P.foam, [5.95 + Math.cos(a) * 1.0, .9 + (i % 4) * .25, 2.2 + Math.sin(a) * .9], 0); }
  // station with roof on the +Z side
  deckRect(g, 6.4, 1.0, .55, 1, 7.2); railing(g, [[-2.2, 7.62], [4.2, 7.62]], .55, P.cream, .9);
  for (const x of [-2.1, 1, 4.1]) for (const z of [5.1, 7.5]) beam(g, [x, z > 6 ? .55 : .6, z], [x, 3.2, z], .1, P.teal);
  box(g, [6.8, .18, 3.0], P.coral, [1, 3.25, 6.3]); for (let i = 0; i < 9; i++) box(g, [.4, .08, 3.1], P.cream, [-2.2 + i * .8, 3.38, 6.3]);
  signBoard(g, [1, 3.9, 6.6], 3, .65, P.darkwood, { stripe: P.gold });
  // logs on the course
  for (const d of [1.5, .3 * lens.total, .52 * lens.total, .74 * lens.total]) logBoat(onPath(g, F, lens, d, .05));
  // a little mill hut at the top
  const M = group(g, [-3.0, 0, -3.6]); box(M, [2.4, 2.6, 2.0], P.wood, [0, 1.3, 0]); mesh(M, new T.ConeGeometry(2.0, 1.3, 4), P.coral, [0, 3.25, 0], [0, Math.PI / 4, 0]); box(M, [.8, 1.2, .06], P.ink, [0, .6, 1.02]);
  ring(M, .9, .12, P.darkwood, [1.3, 1.4, 0], [0, Math.PI / 2, 0], 16, 4); for (let i = 0; i < 6; i++) box(M, [.08, .2, 1.8], P.darkwood, [1.32, 1.4, 0], [i / 6 * Math.PI, 0, 0]);
  return g;
}

function roundBoat(c, color) {
  cyl(c, .95, .45, color, [0, .3, 0], 1.0, 14); ring(c, 1.0, .16, P.tyre, [0, .22, 0], [Math.PI / 2, 0, 0], 16, 5);
  cyl(c, .35, .5, P.cream, [0, .5, 0], .3, 10); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; box(c, [.45, .4, .1], P.cream, [Math.cos(a) * .72, .65, Math.sin(a) * .72], [0, -a + Math.PI / 2, 0]); }
  ring(c, .9, .04, P.gold, [0, .78, 0], [Math.PI / 2, 0, 0], 16, 4);
}
export function rapids() {
  const g = new T.Group();
  const ctrl = [[3.5, .25, 5.2], [-3, .25, 5.2], [-6.0, .25, 3.4], [-5.0, .25, 0], [-6.2, .25, -3.6], [-3.6, .25, -6.1], [-.4, .25, -4.4], [2.4, .25, -6.3], [5.8, .25, -5.0], [6.1, .25, -1.4], [4.3, .25, 1.2], [6.2, .25, 3.6]].map(a => V(...a));
  const pts = spline(ctrl, .35), n = pts.length;
  ribbon(g, pts, 3.2, P.stone, 0, true); ribbon(g, pts, 2.9, P.waterEdge, .02, true); ribbon(g, pts, 2.4, P.water, .04, true);
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n], t = q.clone().sub(p).normalize(), s = V(t.z, 0, -t.x);
    if (i % 2 === 0) for (const k of [1.55, -1.55]) segBox(g, p.clone().addScaledVector(s, k).add(V(0, .12, 0)), q.clone().addScaledVector(s, k).add(V(0, .12, 0)), .25, .3, P.rock, Y, .1);
    if (i % 4 === 0) { const k = (rnd() - .5) * 2.4, r = .2 + rnd() * .35; if (!(p.z > 4.5 && Math.abs(p.x) < 4)) ball(g, r, rnd() > .5 ? P.rock : P.grey, [p.x + s.x * k, r * .7, p.z + s.z * k], 0).scale.set(1, .7, 1); }
    if (i % 3 === 1) { const k = (i % 2 ? 1 : -1) * (1.7 + rnd() * .4); const x = p.x + s.x * k, z = p.z + s.z * k; const rr = .3 + rnd() * .4; if (Math.abs(x) < 7.6 - rr && Math.abs(z) < 7.6 - rr) ball(g, rr, P.rock, [x, rr * .92, z], 0); }
    if (i % 5 === 2) ball(g, .3, P.foam, [p.x + s.x * (rnd() - .5) * 1.6, .3, p.z + s.z * (rnd() - .5) * 1.6], 0).scale.set(1.6, .25, 1);
  }
  // waterfall mound in the middle
  for (const [x, y, z, r] of [[0, 1.28, -.6, 1.6], [-1.2, .88, .5, 1.1], [1.2, .8, .4, 1.0], [.2, 2.2, -1.0, 1.0], [-.6, 2.8, -1.3, .7]]) ball(g, r, P.rock, [x, y, z], 1).scale.set(1, .8, 1);
  segBox(g, V(.2, 2.9, -.4), V(.6, .3, 1.8), .9, .08, P.waterEdge); ball(g, .5, P.foam, [.6, .45, 1.7], 1).scale.set(1.5, .4, 1);
  tree(g, -1.2, -1.6, .8); shrub(g, 1.7, -1.4, .6);
  // station on +Z
  deckRect(g, 7.4, 1.0, .45, 0, 7.2); railing(g, [[-3.6, 7.65], [3.6, 7.65]], .45, P.cream, .9);
  for (const x of [-3.4, 0, 3.4]) for (const z of [3.4, 7.55]) beam(g, [x, .2, z], [x, 3.1, z], .1, P.teal);
  box(g, [7.4, .2, 4.4], P.teal, [0, 3.15, 5.5]); for (let i = 0; i < 9; i++) box(g, [.42, .08, 4.5], i % 2 ? P.cream : P.gold, [-3.36 + i * .84, 3.3, 5.5]);
  signBoard(g, [0, 3.85, 6.4], 3, .65, P.blue, { stripe: P.white });
  const F = frames(pts, null, true), lens = pathLengths(F, true), cols = [P.coral, P.gold, P.teal, P.pink];
  for (const [i, d] of [.06, .33, .58, .82].entries()) roundBoat(onPath(g, F, lens, d * lens.total, .0), cols[i]);
  return g;
}

function splashBoat(c) {
  const hg = mesh(c, new T.SphereGeometry(1, 12, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), P.white, [0, .65, 0], [0, 0, 0], { double: true }); hg.scale.set(1.0, .55, 2.4);
  ring(c, 1, .08, P.coral, [0, .65, 0], [Math.PI / 2, 0, 0], 20, 4).scale.set(1.0, 2.4, 1);
  for (let k = 0; k < 5; k++) { const z = -1.6 + k * .75; box(c, [1.5, .2, .4], P.coral, [0, .55, z]); box(c, [1.5, .35, .08], P.teal, [0, .78, z - .22]); }
  box(c, [.6, .4, .5], P.gold, [0, .9, 2.0]);
}
export function splash() {
  const g = new T.Group();
  const ctrl = [[4.0, .55, 6.0], [-2.6, .55, 6.0], [-5.4, .6, 5.0], [-6.2, .9, 2.2], [-6.2, 8.0, -4.0], [-5.0, 8.4, -6.3], [-2.4, 8.4, -6.4], [-.8, 8.0, -5.2], [3.6, .7, 1.8], [5.0, .5, 3.6], [5.4, .55, 5.4]];
  const pts = spline(ctrl, .35);
  const { F, lens } = trough(g, pts, 2.0, { bottom: P.cream, side: P.cream, trim: P.teal, post: P.teal, postR: .1, supportEvery: 4, wall: .65 });
  for (let i = 0; i < pts.length; i++) { const p = pts[i]; if (p.x < -5.7 && p.y > 1.2 && p.y < 7.8 && i % 2 === 0) box(g, [.3, .05, .22], P.ink, [p.x, p.y + .08, p.z]); }
  // tall landing tower at the crest
  pennant(g, -6.9, 9.8, -5.6, P.coral, 1.6); pennant(g, -3.6, 9.8, -7.3, P.gold, 1.6); bulbLine(g, [-7.1, 9.1, -4.4], [-7.1, 9.1, -1.2], 8);
  // big splash pool at the foot of the drop
  const pl = [[1.6, -.4], [7.4, -.4], [7.4, 4.6], [1.6, 4.6]];
  slab(g, [[1.4, -.6], [7.6, -.6], [7.6, 4.8], [1.4, 4.8]], 0, .3, P.stone, [pl]); flat(g, pl, .1, P.waterEdge); flat(g, [[1.9, -.1], [7.1, -.1], [7.1, 4.3], [1.9, 4.3]], .32, P.water);
  for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI; ball(g, .35 + (i % 3) * .15, P.foam, [3.9 + Math.cos(a) * 1.5, .9 + Math.sin(a) * 1.7, 2.4 + (i % 2) * .4], 0); }
  // viewing bridge over the pool
  segBox(g, V(1.6, 1.7, 4.1), V(7.4, 1.7, 4.1), 1.0, .14, P.wood); railing(g, [[1.6, 3.65], [7.4, 3.65]], 1.7, P.cream, .9);
  for (const x of [1.7, 7.3]) beam(g, [x, 0, 4.1], [x, 1.7, 4.1], .1, P.teal);
  // station
  deckRect(g, 6.6, .75, .55, .7, 7.37); railing(g, [[-2.5, 7.65], [3.9, 7.65]], .55, P.cream, .9);
  for (const x of [-2.4, .7, 3.8]) for (const z of [4.8, 7.6]) beam(g, [x, .55, z], [x, 3.3, z], .1, P.teal);
  box(g, [7.0, .2, 3.1], P.blue, [.7, 3.35, 6.2]); for (let i = 0; i < 9; i++) box(g, [.42, .08, 3.2], i % 2 ? P.cream : P.coral, [-2.66 + i * .84, 3.5, 6.2]);
  signBoard(g, [.7, 4.0, 6.8], 3, .65, P.teal, { stripe: P.gold });
  for (const d of [.04, .3, .69]) splashBoat(onPath(g, F, lens, d * lens.total, 0));
  return g;
}
