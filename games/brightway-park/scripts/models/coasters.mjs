// Coasters and coaster-builder track pieces.
import { T, P, V, Y, loopShift, box, cyl, ball, ring, beam, group, mesh, segBox, deckRect, bulbLine, pennant, bunting, railing, signBoard, stairs, tube, frames, pathLengths, onPath, buildTrack, Turtle, lampPost, shrub, tree } from './core.mjs';

const PI = Math.PI;
function steelCar(c, color, front) {
  box(c, [1.05, .22, 1.55], P.ink, [0, .22, 0]); box(c, [1.0, .45, 1.5], color, [0, .5, 0]);
  for (const z of [-.35, .4]) { box(c, [.85, .12, .45], P.ink, [0, .7, z]); box(c, [.85, .45, .1], color, [0, .9, z - .25]); beam(c, [-.38, .95, z + .1], [.38, .95, z + .1], .035, P.gold, 4); }
  if (front) { mesh(c, new T.ConeGeometry(.55, .7, 4), color, [0, .5, 1.05], [PI / 2, PI / 4, 0]).scale.set(1, 1, .6); ball(c, .08, P.glow, [0, .6, 1.3], 0); }
  for (const x of [-.45, .45]) for (const z of [-.55, .55]) cyl(c, .1, .1, P.chrome, [x, .1, z], .1, 6).rotation.z = PI / 2;
}
function juniorCar(c, color, front) {
  box(c, [.85, .2, 1.2], P.ink, [0, .2, 0]); const b = ball(c, .55, color, [0, .52, 0], 1); b.scale.set(.85, .55, 1.15);
  box(c, [.6, .1, .45], P.cream, [0, .72, -.05]); beam(c, [-.3, .85, .25], [.3, .85, .25], .03, P.gold, 4);
  if (front) { ball(c, .38, color, [0, .78, .65], 1); for (const x of [-.14, .14]) { ball(c, .1, P.white, [x, .9, .95], 0); ball(c, .05, P.ink, [x, .9, 1.03], 0); } beam(c, [-.15, 1.1, .6], [-.3, 1.5, .5], .025, P.ink, 3); beam(c, [.15, 1.1, .6], [.3, 1.5, .5], .025, P.ink, 3); ball(c, .06, P.gold, [-.3, 1.5, .5], 0); ball(c, .06, P.gold, [.3, 1.5, .5], 0); }
}
function mouseCar(c, color) {
  box(c, [1.0, .25, 1.3], P.ink, [0, .22, 0]); box(c, [1.1, .5, 1.4], color, [0, .55, 0]);
  box(c, [.9, .14, .5], P.cream, [0, .75, -.2]); box(c, [.9, .4, .1], P.cream, [0, .95, -.45]); beam(c, [-.4, 1.0, .1], [.4, 1.0, .1], .035, P.gold, 4);
  const nose = ball(c, .5, color, [0, .55, .7], 1); nose.scale.set(1.05, .5, .6); ball(c, .08, P.glow, [0, .65, 1.0], 0);
  box(c, [1.25, .12, .2], P.tyre, [0, .35, .75]); box(c, [1.25, .12, .2], P.tyre, [0, .35, -.75]);
}
function invertedCar(c, color, front) {
  box(c, [.8, .3, 1.3], P.ink, [0, .32, 0]); beam(c, [0, .2, 0], [0, -.75, 0], .1, P.grey, 6);
  box(c, [2.0, .14, .6], color, [0, -.8, 0]);
  for (const x of [-.75, -.25, .25, .75]) {
    box(c, [.42, .1, .45], P.ink, [x, -1.0, .05]); box(c, [.42, .6, .1], color, [x, -.75, -.2]);
    beam(c, [x, -.5, -.1], [x, -.85, .25], .05, P.gold, 4);
    for (const k of [-.1, .1]) box(c, [.09, .55, .09], P.navy, [x + k, -1.35, .25]);
  }
  if (front) { const n = ball(c, .45, color, [0, -.75, .55], 1); n.scale.set(2.2, .5, .6); }
}
function station(g, x0, x1, z, y, o = {}) {
  const w = x1 - x0, cx = (x0 + x1) / 2, side = o.side ?? 1, dz = o.depth ?? 1.2, zp = z + side * (.55 + dz / 2);
  deckRect(g, w + .4, dz, y, cx, zp); railing(g, [[x0, zp + side * dz / 2 - side * .08], [x1, zp + side * dz / 2 - side * .08]], y, P.cream, .9);
  const roofY = o.roofY ?? y + 2.8;
  for (const x of [x0, cx, x1]) { beam(g, [x, y, zp + side * dz / 2 - side * .15], [x, roofY, zp + side * dz / 2 - side * .15], .1, P.teal); beam(g, [x, 0, z - side * .8], [x, roofY, z - side * .8], .1, P.teal); }
  const outer = zp + side * dz / 2, inner = z - side * .8, rd = Math.abs(outer - inner) + .3, rz = (outer + inner) / 2;
  box(g, [w + .8, .18, rd], o.roof ?? P.coral, [cx, roofY, rz]);
  for (let i = 0; i < Math.floor((w + .8) / .8); i++) box(g, [.4, .08, rd + .05], P.cream, [x0 - .4 + .2 + i * .8, roofY + .12, rz]);
  bulbLine(g, [x0 - .4, roofY - .14, rz + side * rd / 2], [x1 + .4, roofY - .14, rz + side * rd / 2], Math.round(w * 2));
  signBoard(g, [cx, roofY + .6, rz + side * rd / 2 - side * .3], Math.min(3.4, w * .7), .65, o.sign ?? P.teal, { stripe: P.gold });
}

export function junior() {
  const g = new T.Group(), t = new Turtle(3, 1.0, 5.5, -PI / 2);
  t.straight(4).straight(2.5, 2.2, true).turn(-PI / 2, 3, -.4, .3).straight(3, -1.8).straight(3, 1.0).turn(-PI / 2, 3, -.6, .35)
    .straight(2.5, .8).straight(2.5, -1.0).straight(1.0).turn(-PI / 2, 3, .8, .35).straight(3.2, -.9).straight(3.3, .3).turn(-PI / 2, 2.5, -.4, .3);
  const { pts, ups } = t.closed('junior');
  const { F, lens } = buildTrack(g, pts, ups, { gauge: .8, railR: .055, railColor: P.cream, spineColor: P.coral, spineR: .1, spineOff: .22, tieColor: P.coral, supportEvery: 5, supportColor: P.gold, supportR: .09, minSupportY: .6 });
  station(g, -1, 3, 5.5, .7, { sign: P.coral, roof: P.teal });
  // a cheerful tunnel over the back straight
  for (const x of [-1.6, -.4, .8]) { const a = mesh(g, new T.TorusGeometry(1.25, .2, 5, 10, PI), x === -.4 ? P.gold : P.coral, [x, .6, -6.5], [0, PI / 2, 0]); }
  tube(g, [V(-1.6, 1.85, -6.5), V(.8, 1.85, -6.5)], .12, P.cream, false, 5);
  for (const [x, z] of [[-3, 0], [1.5, -1], [-1.2, 2], [2.8, 1.8]]) tree(g, x, z, .8);
  const cols = [P.leaf, P.mint, P.leaf, P.mint];
  for (let k = 0; k < 4; k++) juniorCar(onPath(g, F, lens, 3.6 - k * 1.25, .05), cols[k], k === 0);
  return g;
}

export function mouse() {
  const g = new T.Group(), t = new Turtle(4.5, 1.2, 5.2, -PI / 2);
  t.straight(4).turn(-PI / 2, 4).straight(6.5, 7.2, true).turn(-PI / 2, 1).straight(8)
    .turn(-PI, 1, -.5).straight(7, -1.2).turn(PI, 1, -.3).straight(7, -2).turn(-PI, 1, -.3).straight(7, -2).turn(PI, 1, -.2).straight(6, -.7).turn(-PI, 1.75);
  const { pts, ups } = t.closed('mouse');
  const { F, lens } = buildTrack(g, pts, ups, { gauge: .7, railR: .05, railColor: P.chrome, spineColor: P.ink, spineR: .09, spineOff: .2, tieColor: P.ink, supportEvery: 1e9 });
  // tall lattice frame: columns under the track, tied together at each storey
  const cols = []; for (let i = 0; i < F.length; i += 4) { const p = F[i].p; if (p.y < 1.4) continue; beam(g, [p.x, 0, p.z], [p.x, p.y - .3, p.z], .1, P.teal, 6); box(g, [.4, .14, .4], P.stone, [p.x, .07, p.z]); cols.push(p); }
  for (let a = 0; a < cols.length; a++) for (let b = a + 1; b < cols.length; b++) {
    const A = cols[a], B = cols[b], d = Math.hypot(A.x - B.x, A.z - B.z); if (d > 2.3 || d < .5) continue;
    const top = Math.min(A.y, B.y) - .4; for (let y = 2; y < top; y += 2) beam(g, [A.x, y, A.z], [B.x, y, B.z], .04, P.cream, 4);
    if (top > 2) beam(g, [A.x, .3, A.z], [B.x, Math.min(top, 3), B.z], .035, P.cream, 4);
  }
  station(g, .5, 4.5, 5.2, .9, { sign: P.gold, roof: P.coral });
  const colsC = [P.gold, P.coral, P.teal];
  for (const [k, d] of [.02, .42, .7].entries()) mouseCar(onPath(g, F, lens, 3.5 + d * lens.total, .05), colsC[k]);
  pennant(g, 5.5, 9.2, -6.3, P.coral, 1.5, -1);
  return g;
}

export function looping() {
  const g = new T.Group(), t = new Turtle(3, 1.2, 5.6, -PI / 2);
  t.straight(5).turn(-PI / 2, 3).straight(5.5, 7, true).turn(-PI / 2, 2.5, -.3).straight(4, -6.7).loop(3.3, 3.4, 1.2)
    .turn(-PI / 2, 2, .8, .5).straight(2.55, 1.5).straight(2.55, -2.3).turn(-PI / 2, 3.9, 0, .4);
  const { pts, ups } = t.closed('looping');
  const { F, lens } = buildTrack(g, pts, ups, { gauge: .9, railColor: P.cream, spineColor: P.teal, supportEvery: 6, supportColor: P.cream, supportR: .12 });
  // lift chain
  for (let i = 0; i < F.length; i++) { const f = F[i]; if (f.p.x < -4.6 && f.p.z < 2.4 && f.p.z > -2.8 && i % 2 === 0) segBox(g, f.p.clone().addScaledVector(f.t, -.12), f.p.clone().addScaledVector(f.t, .12), .18, .05, P.ink, f.up); }
  // loop and turn braces
  for (const s of [-1, 1]) beam(g, [3.2, 0, -5.4 + s * 2.4], [3.2, 3.6, -5.4 + s * 1.1], .14, P.cream, 6);
  station(g, -2, 3, 5.6, .9, { sign: P.teal, roof: P.coral });
  for (let k = 0; k < 4; k++) steelCar(onPath(g, F, lens, 4.4 - k * 1.75, .05), k % 2 ? P.gold : P.coral, k === 0);
  pennant(g, -5, 9.4, -2.9, P.gold, 1.2);
  return g;
}

export function inverted() {
  const g = new T.Group(), t = new Turtle(7, 2.8, 7.4, -PI / 2);
  t.straight(4).straight(7, 8.5, true).turn(-PI / 2, 3, -.3).straight(5, -8).loop(3.6, 3.4, 1.2)
    .turn(-PI / 2, 2.8, .5, .6).corkscrew(6, 1.6).turn(-PI / 2, 7.2, 1, .7).straight(2.5, 1).straight(2.5, -2).turn(-PI / 2, 2, -.7, .4);
  const { pts, ups } = t.closed('inverted');
  const { F, lens } = buildTrack(g, pts, ups, { hang: true, gauge: .9, railColor: P.cream, spineColor: P.coral, spineR: .17, spineOff: .35, supportEvery: 6, supportColor: P.gold, supportR: .15, centre: V(1, 0, 0), hangReach: 1.6,
    skipSupport: (i, f) => f.p.z > 6.6 && f.p.x > 2.6 && f.p.x < 7.4 });
  // station: supports and roof straddle the hanging train
  deckRect(g, 5.0, 3.2, .45, 5, 7.6, P.stone); railing(g, [[2.6, 9.15], [7.4, 9.15]], .45, P.cream, .9);
  for (const x of [2.8, 5, 7.2]) { beam(g, [x, .45, 9.1], [x, 4.4, 9.1], .12, P.teal); beam(g, [x, .45, 6.1], [x, 4.4, 6.1], .12, P.teal); beam(g, [x, 4.4, 6.1], [x, 4.4, 9.1], .1, P.teal); beam(g, [x, 4.4, 7.4], [x, 3.2, 7.4], .1, P.gold); }
  box(g, [5.4, .2, 3.6], P.navy, [5, 4.6, 7.6]); for (let i = 0; i < 7; i++) box(g, [.4, .08, 3.65], i % 2 ? P.gold : P.cream, [2.6 + i * .8, 4.74, 7.6]);
  signBoard(g, [5, 5.3, 9.2], 3.2, .7, P.coral, { stripe: P.gold });
  // lift chain on the front climb
  for (let i = 0; i < F.length; i++) { const f = F[i]; if (f.p.x < 2.8 && f.p.x > -3.8 && f.p.z > 6.5 && i % 2 === 0) segBox(g, f.p.clone().addScaledVector(f.t, -.12), f.p.clone().addScaledVector(f.t, .12), .18, .05, P.ink, f.up); }
  for (let k = 0; k < 4; k++) invertedCar(onPath(g, F, lens, 3.4 - k * 1.5, -.1), k % 2 ? P.teal : P.coral, k === 0);
  return g;
}

// ---- coaster builder pieces: 4 m cells, track centre-line at y 1.1 ----
function piece(g, pts, ups, supportAt = []) {
  const F = frames(pts, ups, false), half = .65;
  const L = F.map(f => f.p.clone().addScaledVector(f.side, half)), R = F.map(f => f.p.clone().addScaledVector(f.side, -half));
  for (let i = 0; i < F.length - 1; i++) for (const A of [L, R]) segBox(g, A[i].clone().addScaledVector(F[i].up, .05), A[i + 1].clone().addScaledVector(F[i + 1].up, .05), .1, .13, P.coral, F[i].up.clone().lerp(F[i + 1].up, .5).normalize(), 0);
  const { L: len, total } = pathLengths(F, false); let next = .2;
  for (let i = 0; i < F.length; i++) if (len[i] >= next) { next += .4; segBox(g, L[i].clone().addScaledVector(F[i].up, -.08).addScaledVector(F[i].side, .15), R[i].clone().addScaledVector(F[i].up, -.08).addScaledVector(F[i].side, -.15), .12, .12, P.wood, F[i].up); }
  for (const i of supportAt) for (const A of [L, R]) { const p = A[i].clone().addScaledVector(F[i].up, -.15); beam(g, [p.x, 0, p.z], p, .07, P.teal, 6); }
  return F;
}
const line = (a, b, n = 12) => Array.from({ length: n + 1 }, (_, i) => a.clone().lerp(b, i / n));
export function trackStraight() { const g = new T.Group(); piece(g, line(V(0, 1.1, -2), V(0, 1.1, 2)), null, [1, 11]); return g; }
export function trackSlope(up) {
  const g = new T.Group(), a = V(0, up ? 1.1 : 3.1, -2), b = V(0, up ? 3.1 : 1.1, 2), pts = line(a, b, 12);
  piece(g, pts, null, [1, 6, 11]);
  for (const x of [-.65, .65]) beam(g, [x, .5, pts[1].z], [x, pts[11].y - .4, pts[11].z], .04, P.teal, 4);
  return g;
}
// Quarter turn of radius 2 m: enters at the -Z edge centre heading +Z; left leaves at the -X edge (centre -2,-2), right at +X (centre 2,-2).
export function trackTurn(left) {
  const g = new T.Group(), pts = [];
  for (let i = 0; i <= 16; i++) { const th = i / 16 * PI / 2; pts.push(V(left ? -2 + 2 * Math.cos(th) : 2 - 2 * Math.cos(th), 1.1, -2 + 2 * Math.sin(th))); }
  piece(g, pts, null, [1, 8, 15]); return g;
}
export function trackLoop() {
  const g = new T.Group(), pts = [], ups = [], R = 3, c = 4 / (PI * 2), a = 1.6, n = 64;
  for (let i = 0; i <= n; i++) {
    const th = i / n * PI * 2;
    pts.push(V(4.4 * loopShift(th), 1.1 + R * (1 - Math.cos(th)), -2 + c * th + a * Math.sin(th)));
    ups.push(V(0, c + a * Math.cos(th), -R * Math.sin(th)).normalize());
  }
  const F = piece(g, pts, ups, [1, n - 1]);
  for (const s of [-1, 1]) { const p = pts[s > 0 ? n / 4 : 3 * n / 4]; beam(g, [s * 1.75, 0, p.z], [s * 1.7, p.y - .2, p.z], .1, P.teal, 6); beam(g, [s * 1.7, p.y - .2, p.z], [p.x + s * .62, p.y, p.z], .07, P.teal, 6); box(g, [.5, .14, .5], P.stone, [s * 1.5, .07, p.z]); }
  return g;
}
export function trackLift() {
  const g = new T.Group(), pts = line(V(0, 1.1, -2), V(0, 3.1, 2), 12), F = piece(g, pts, null, [1, 6, 11]);
  for (let i = 0; i < F.length - 1; i++) segBox(g, F[i].p.clone().addScaledVector(F[i].up, .02), F[i + 1].p.clone().addScaledVector(F[i + 1].up, .02), .22, .06, P.ink, F[i].up);
  for (let i = 0; i < F.length; i += 2) box(g, [.3, .06, .08], P.gold, F[i].p.clone().addScaledVector(F[i].up, .07).toArray(), [-Math.atan2(2, 4), 0, 0]);
  for (const x of [-.65, .65]) beam(g, [x, .5, pts[1].z], [x, pts[11].y - .4, pts[11].z], .04, P.teal, 4);
  return g;
}
export function trackStation() {
  const g = new T.Group(); piece(g, line(V(0, 1.1, -2), V(0, 1.1, 2)), null, [1, 11]);
  box(g, [1.1, .9, 3.9], P.wood, [1.4, .45, 0]); box(g, [1.0, .06, 3.85], P.cream, [1.4, .93, 0]); box(g, [.08, .06, 3.85], P.gold, [.88, .96, 0]);
  box(g, [.7, .9, 3.9], P.wood, [-1.6, .45, 0]); box(g, [.6, .06, 3.85], P.cream, [-1.6, .93, 0]);
  railing(g, [[1.9, -1.9], [1.9, 1.9]], .96, P.cream, .9); railing(g, [[-1.9, -1.9], [-1.9, 1.9]], .96, P.cream, .9);
  for (const x of [-1.85, 1.85]) for (const z of [-1.8, 1.8]) beam(g, [x, .96, z], [x, 3.6, z], .08, P.teal, 6);
  for (let i = 0; i < 9; i++) box(g, [.44, .1, 3.95], i % 2 ? P.coral : P.cream, [-1.76 + i * .44, 3.68, 0]);
  for (const x of [-1.95, 1.95]) bulbLine(g, [x, 3.55, -1.9], [x, 3.55, 1.9], 8);
  return g;
}
