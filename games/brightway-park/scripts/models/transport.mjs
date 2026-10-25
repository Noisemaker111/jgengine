// Transport rides.
import { T, P, V, Y, box, cyl, ball, ring, beam, group, mesh, segBox, deckRect, bulbLine, pennant, bunting, railing, signBoard, stairs, tube, ribbon, spline, frames, pathLengths, onPath, lampPost, shrub, tree, wheel } from './core.mjs';

const rect = (x0, x1, z0, z1, r) => [[x1 - r, z1], [x0 + r, z1], [x0, z1 - r], [x0, z0 + r], [x0 + r, z0], [x1 - r, z0], [x1, z0 + r], [x1, z1 - r]];

function loco(c) {
  box(c, [1.0, .25, 3.0], P.ink, [0, .35, 0]);
  const boiler = cyl(c, .45, 1.9, P.teal, [0, .95, .45], .45, 12); boiler.rotation.x = Math.PI / 2;
  for (const z of [-.2, .5, 1.2]) ring(c, .46, .04, P.gold, [0, .95, z], [0, 0, 0], 14, 4);
  cyl(c, .47, .2, P.ink, [0, .95, 1.45], .47, 12).rotation.x = Math.PI / 2;
  cyl(c, .14, .55, P.ink, [0, 1.6, 1.15], .2, 8); cyl(c, .22, .08, P.gold, [0, 1.9, 1.15], .22, 8); ball(c, .2, P.gold, [0, 1.42, .45], 1);
  box(c, [1.1, 1.2, .9], P.coral, [0, 1.15, -.95]); box(c, [1.25, .1, 1.1], P.cream, [0, 1.8, -.95]); box(c, [.7, .4, .05], P.glass, [0, 1.3, -.49]);
  for (const x of [-.45, .45]) for (const z of [-.7, .1, .9]) { wheel(c, [x, .3, z], .3, .1, P.red); }
  for (const x of [-.48, .48]) box(c, [.05, .06, 1.6], P.chrome, [x, .32, .1], [0, 0, 0], { metal: .5 });
  mesh(c, new T.ConeGeometry(.5, .45, 4), P.red, [0, .32, 1.62], [Math.PI / 2, Math.PI / 4, 0]).scale.set(1, 1, .5);
  ball(c, .1, P.glow, [0, 1.15, 1.58], 0); box(c, [1.1, .14, .1], P.red, [0, .45, 1.5]);
  for (const [y, z, r] of [[2.2, 1.0, .25], [2.55, .7, .32], [2.85, .25, .4]]) ball(c, r, P.white, [0, y, z], 1);
}
function coach(c, color) {
  box(c, [1.0, .25, 2.4], P.ink, [0, .35, 0]); box(c, [1.05, .45, 2.3], color, [0, .7, 0]);
  for (const z of [-.6, .3]) { box(c, [.9, .14, .4], P.cream, [0, .95, z]); box(c, [.9, .35, .08], P.wood, [0, 1.1, z - .2]); }
  for (const x of [-.48, .48]) for (const z of [-1.05, 1.05]) beam(c, [x, .9, z], [x, 1.8, z], .03, P.gold, 4);
  box(c, [1.2, .08, 2.5], P.cream, [0, 1.85, 0]); for (const x of [-.4, .4]) for (const z of [-.75, .75]) wheel(c, [x, .25, z], .22, .1, P.red);
}
export function train() {
  const g = new T.Group();
  const pts = spline(rect(-6.6, 6.6, -6.0, 5.4, 2.6).map(([x, z]) => V(x, .2, z)), .3), n = pts.length;
  ribbon(g, pts, 1.6, P.sand, -.1, true); ribbon(g, pts, 1.25, P.grey, -.06, true);
  const F = frames(pts, null, true), lens = pathLengths(F, true);
  for (let i = 0; i < n; i += 2) { const f = F[i]; segBox(g, f.p.clone().addScaledVector(f.side, .55).add(V(0, -.02, 0)), f.p.clone().addScaledVector(f.side, -.55).add(V(0, -.02, 0)), .16, .06, P.darkwood); }
  for (const s of [.35, -.35]) tube(g, F.map(f => f.p.clone().addScaledVector(f.side, s).add(V(0, .05, 0))), .04, P.chrome, true, 4, { metal: .6 });
  // station platform on +Z
  deckRect(g, 7.0, 1.4, .5, 0, 6.6, P.stone); box(g, [7.0, .06, .12], P.gold, [0, .52, 5.95]);
  for (const x of [-3.2, 0, 3.2]) beam(g, [x, .5, 7.1], [x, 2.9, 7.1], .08, P.teal);
  box(g, [7.4, .14, 1.8], P.coral, [0, 2.95, 6.6], [-.12, 0, 0]); for (let i = 0; i < 9; i++) box(g, [.42, .06, 1.85], i % 2 ? P.cream : P.coral, [-3.36 + i * .84, 3.05, 6.6], [-.12, 0, 0]);
  for (let i = 0; i < 18; i++) box(g, [.36, .25, .04], i % 2 ? P.coral : P.gold, [-3.4 + i * .4, 2.75, 5.7]);
  box(g, [1.4, .14, .4], P.wood, [-1.6, .85, 7.2]); box(g, [1.4, .4, .08], P.wood, [-1.6, 1.1, 7.4]);
  signBoard(g, [1.6, 2.2, 7.15], 2.2, .5, P.teal, { stripe: P.cream }); ball(g, .25, P.cream, [0, 2.5, 7.08], 1);
  // tunnel on the back straight
  const tun = mesh(g, new T.CylinderGeometry(1.5, 1.5, 3.4, 12, 1, true, 0, Math.PI), P.stone, [0, .1, -6.0], [0, 0, Math.PI / 2], { double: true });
  for (const x of [-1.75, 1.75]) mesh(g, new T.TorusGeometry(1.55, .18, 4, 12, Math.PI), P.rock, [x, .1, -6.0], [0, Math.PI / 2, 0]);
  const hill = mesh(g, new T.SphereGeometry(2.0, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2), P.leaf, [0, 0, -6.0]); hill.scale.set(1.0, 1.15, .85); tree(g, .6, -6.2, .6);
  // signal and scenery
  beam(g, [5.0, 0, 3.8], [5.0, 2.6, 3.8], .06, P.ink); box(g, [.3, .7, .2], P.ink, [5.0, 2.5, 3.8]); ball(g, .09, P.red, [5.0, 2.7, 3.92], 0); ball(g, .09, P.green, [5.0, 2.35, 3.92], 0);
  for (const [x, z] of [[-2.5, -1.5], [2.8, 1.0], [-3.5, 2.5]]) tree(g, x, z, .9);
  for (const [x, z] of [[0, -1], [-1, 2], [2, -2.5], [3.5, -3]]) shrub(g, x, z, .5);
  // train on the station straight, heading -X
  const d0 = lens.total * .02;
  loco(onPath(g, F, lens, d0, .05)); coach(onPath(g, F, lens, d0 - 3.1, .05), P.gold); coach(onPath(g, F, lens, d0 - 5.7, .05), P.coral);
  return g;
}

function monoCar(c, color, nose) {
  box(c, [1.3, 1.1, 2.5], color, [0, 1.0, 0]); box(c, [1.32, .4, 2.2], P.glass, [0, 1.25, 0]); box(c, [1.35, .08, 2.5], P.cream, [0, .95, 0]);
  box(c, [1.1, .1, 2.4], P.cream, [0, 1.6, 0]);
  for (const s of [-1, 1]) box(c, [.12, .55, 2.3], P.ink, [s * .45, .25, 0]);
  if (nose) { const b = ball(c, .65, color, [0, 1.0, nose * 1.25], 1); b.scale.set(1, .85, 1.0); ball(c, .35, P.glass, [0, 1.25, nose * 1.6], 1).scale.set(1.2, .7, .6); }
}
export function monorail() {
  const g = new T.Group(), BY = 4.4;
  const pts = spline(rect(-6.6, 6.6, -6.6, 5.2, 3.0).map(([x, z]) => V(x, BY, z)), .4), n = pts.length;
  const F = frames(pts, null, true), lens = pathLengths(F, true);
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; segBox(g, a.clone().add(V(0, -.4, 0)), b.clone().add(V(0, -.4, 0)), .62, .8, P.cream, Y, .06); }
  tube(g, pts.map(p => p.clone().add(V(0, .02, 0))), .08, P.gold, true, 4); tube(g, pts.map(p => p.clone().add(V(0, -.82, 0))), .06, P.teal, true, 4);
  for (let i = 0; i < n; i += 8) { const p = pts[i]; if (p.z > 4.6 && Math.abs(p.x) < 4) continue; beam(g, [p.x, 0, p.z], [p.x, BY - .9, p.z], .22, P.teal, 8); box(g, [1.2, .3, .5], P.teal, [p.x, BY - .95, p.z]); box(g, [.9, .2, .9], P.stone, [p.x, .1, p.z]); }
  // elevated station on +Z
  const S = group(g, [0, 0, 6.65]);
  for (const x of [-3.6, 0, 3.6]) beam(S, [x, 0, .1], [x, BY - .55, .1], .2, P.teal);
  box(S, [8, .3, 1.6], P.wood, [0, BY - .55, 0]); box(S, [7.8, .06, 1.4], P.cream, [0, BY - .38, 0]); railing(S, [[-3.9, .75], [3.9, .75]], BY - .38, P.chrome, 1.0);
  for (const x of [-3.6, 0, 3.6]) beam(S, [x, BY - .38, .65], [x, BY + 2.4, .65], .08, P.teal);
  box(S, [8.2, .16, 2.8], P.coral, [0, BY + 2.45, -.4]); for (let i = 0; i < 10; i++) box(S, [.42, .08, 2.85], i % 2 ? P.cream : P.coral, [-3.78 + i * .84, BY + 2.56, -.4]);
  signBoard(S, [0, BY + 3.05, .5], 3.2, .6, P.navy, { stripe: P.gold });
  // stair tower to the ground
  box(S, [1.6, BY - .4, 1.4], P.navy, [4.8, (BY - .4) / 2, 0]); box(S, [1.0, BY - 1.2, .06], P.glass, [4.8, (BY - .4) / 2, .72]); box(S, [1.8, .2, 1.6], P.gold, [4.8, BY - .3, 0]);
  stairs(S, 5.62, 0, 1.0, .4, Math.PI / 2);
  for (const [x, z] of [[-2, -1], [2, 1.2], [0, -3]]) tree(g, x, z, 1.0);
  // three-car train at the station
  const d0 = lens.total * .01;
  monoCar(onPath(g, F, lens, d0, 0), P.coral, 1); monoCar(onPath(g, F, lens, d0 - 2.6, 0), P.teal, 0); monoCar(onPath(g, F, lens, d0 - 5.2, 0), P.coral, -1);
  return g;
}

function chair(g, top, dir, color) {
  const c = group(g, [top.x, top.y, top.z], dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  ball(c, .07, P.ink, [0, 0, 0], 0); beam(c, [0, 0, 0], [0, -1.25, 0], .03, P.chrome, 4, { metal: .5 });
  beam(c, [0, -1.25, 0], [0, -1.25, -.3], .03, P.chrome, 4);
  box(c, [.95, .08, .45], color, [0, -1.5, .0]); box(c, [.95, .45, .08], color, [0, -1.3, -.25]);
  for (const x of [-.48, .48]) beam(c, [x, -1.25, -.3], [x, -1.5, -.25], .025, P.chrome, 3);
  box(c, [.9, .04, .2], P.ink, [0, -1.8, .3]); beam(c, [-.45, -1.15, .3], [.45, -1.15, .3], .02, P.gold, 3);
}
export function chairlift() {
  const g = new T.Group(), TW = 1.7, TH = 6.6, SY = 3.4, SX = 4.4, CZ = .95;
  // towers
  for (const x of [-TW, TW]) {
    beam(g, [x, 0, 0], [x, TH, 0], .22, P.teal, 8); box(g, [.8, .3, .8], P.stone, [x, .15, 0]);
    box(g, [.2, .2, CZ * 2 + .6], P.gold, [x, TH, 0]); for (const z of [-CZ, CZ]) { cyl(g, .16, .12, P.ink, [x, TH + .12, z], .16, 8).rotation.x = Math.PI / 2; }
    beam(g, [x, TH - 1.4, 0], [x, TH, -CZ], .05, P.teal, 4); beam(g, [x, TH - 1.4, 0], [x, TH, CZ], .05, P.teal, 4);
    ball(g, .1, P.coral, [x, TH + .45, 0], 0);
  }
  // stations at each end
  for (const s of [-1, 1]) {
    const S = group(g, [s * SX, 0, 0]);
    deckRect(S, 2.2, 3.6, .4); box(S, [1.6, 1.4, 1.0], P.cream, [-s * .1, 1.1, -1.3]); box(S, [.8, .6, .06], P.glass, [-s * .1, 1.2, -.78]);
    for (const [x, z] of [[-.9, -1.6], [.9, -1.6], [-.9, 1.6], [.9, 1.6]]) beam(S, [x, .4, z], [x, SY + .9, z], .08, P.teal);
    ring(S, CZ, .1, P.gold, [0, SY + .1, 0], [Math.PI / 2, 0, 0], 20, 5); cyl(S, .25, .9, P.ink, [0, SY + .5, 0], .25, 8);
    box(S, [2.6, .18, 4.0], P.coral, [0, SY + 1.0, 0]); for (let i = 0; i < 6; i++) box(S, [.42, .08, 4.05], i % 2 ? P.cream : P.coral, [-1.05 + i * .42, SY + 1.12, 0]);
    pennant(S, 0, SY + 2.1, 0, s > 0 ? P.gold : P.teal, 1.0);
  }
  signBoard(g, [0, 1.6, 4.6], 2.4, .55, P.teal, { posts: true, stripe: P.gold });
  railing(g, [[-1.2, 3.6], [-1.2, 5.4]], 0, P.chrome, .9); railing(g, [[1.2, 3.6], [1.2, 5.4]], 0, P.chrome, .9);
  // cables with sag
  const span = (a, b, n, sag) => { const out = []; for (let i = 0; i <= n; i++) { const t = i / n, p = a.clone().lerp(b, t); p.y -= Math.sin(t * Math.PI) * sag; out.push(p); } return out; };
  const cols = [P.coral, P.teal, P.gold, P.pink];
  for (const z of [-CZ, CZ]) {
    const segs = [span(V(-SX, SY + .1, z), V(-TW, TH + .2, z), 12, .25), span(V(-TW, TH + .2, z), V(TW, TH + .2, z), 12, .35), span(V(TW, TH + .2, z), V(SX, SY + .1, z), 12, .25)];
    const all = segs[0].concat(segs[1].slice(1), segs[2].slice(1)); tube(g, all, .035, P.ink, false, 4);
    let k = 0; for (let i = 3; i < all.length - 2; i += 4) chair(g, all[i], z > 0 ? 1 : -1, cols[(k++ + (z > 0 ? 0 : 2)) % 4]);
  }
  return g;
}
