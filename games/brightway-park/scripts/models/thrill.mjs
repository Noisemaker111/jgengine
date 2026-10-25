// Thrill rides.
import { T, P, V, Y, box, cyl, ball, ring, beam, group, mesh, segBox, deckRound, deckRect, bulbs, bulbLine, pennant, bunting, railing, ringRail, signBoard, stripedCone, stairs, tube, ribbon, flat, spline, lampPost, shrub, wheel, humanoid } from './core.mjs';

function bumperCar(g, x, z, rot, color) {
  const c = group(g, [x, .32, z], rot);
  const body = mesh(c, new T.CylinderGeometry(.75, .8, .4, 12), color, [0, .3, 0]); body.scale.set(1, 1, 1.25);
  const rub = ring(c, .8, .12, P.tyre, [0, .14, 0], [Math.PI / 2, 0, 0], 16, 5); rub.scale.set(1, 1.25, 1);
  box(c, [.9, .55, .3], color, [0, .65, -.45]); box(c, [.75, .2, .5], P.cream, [0, .55, -.1]);
  cyl(c, .14, .12, P.ink, [0, .62, .35], .14, 8); ball(c, .09, P.gold, [-.35, .52, .75], 0); ball(c, .09, P.gold, [.35, .52, .75], 0);
  beam(c, [0, .6, -.75], [0, 3.6, -.75], .03, P.gold, 4); ball(c, .08, P.glow, [0, 3.6, -.75], 0);
}
export function bumper() {
  const g = new T.Group();
  box(g, [11.4, .3, 9.4], P.wood, [0, .15, -.6]); box(g, [10.4, .04, 8.4], '#5a6266', [0, .32, -.6], [0, 0, 0], { metal: .4 });
  // padded barrier
  for (let i = 0; i < 26; i++) { const x = -5.1 + i * .408; for (const z of [-4.8, 3.6]) if (!(z > 0 && Math.abs(x) < 1)) box(g, [.4, .45, .3], i % 2 ? P.coral : P.cream, [x, .55, z]); }
  for (let i = 0; i < 21; i++) { const z = -4.6 + i * .4; for (const x of [-5.15, 5.15]) box(g, [.3, .45, .4], i % 2 ? P.coral : P.cream, [x, .55, z]); }
  // posts and striped roof
  for (const x of [-5.3, 0, 5.3]) for (const z of [-5.0, 3.8]) beam(g, [x, .3, z], [x, 4.2, z], .13, P.teal, 8);
  box(g, [11.2, .25, 9.4], P.ink, [0, 4.25, -.6]);
  for (let i = 0; i < 14; i++) box(g, [.8, .12, 9.6], i % 2 ? P.coral : P.cream, [-5.2 + i * .8, 4.44, -.6]);
  for (let i = 0; i < 12; i++) beam(g, [-5.3 + i * .96, 4.12, -5.0], [-5.3 + i * .96, 4.12, 3.8], .025, P.ink, 4);
  // lantern top and valance
  box(g, [4, .9, 3], P.cream, [0, 4.95, -.6]); box(g, [4.4, .2, 3.4], P.coral, [0, 5.45, -.6]); box(g, [3.6, .5, .06], P.glass, [0, 4.95, .92]);
  for (let i = 0; i < 28; i++) { const x = -5.4 + i * .4; for (const z of [-5.35, 4.15]) box(g, [.38, .35, .05], i % 2 ? P.coral : P.gold, [x, 4.05, z]); }
  bulbLine(g, [-5.4, 3.82, 4.18], [5.4, 3.82, 4.18], 24); bulbLine(g, [-5.4, 3.82, -5.38], [5.4, 3.82, -5.38], 24);
  signBoard(g, [0, 5.0, 4.3], 3.6, .9, P.teal, { stripe: P.gold });
  const cols = [P.coral, P.teal, P.gold, P.pink, P.blue, P.mint, P.coral];
  for (const [i, [x, z, r]] of [[-3.5, -3, .6], [-1, -2, 2.2], [2.4, -3.4, -.8], [3.6, .4, 2.8], [.2, .6, -2.3], [-3.3, 1.2, 1.1], [1.6, 2.4, .2]].entries()) bumperCar(g, x, z, r, cols[i]);
  // entrance gap and steps at +Z
  stairs(g, 0, 4.0, 1.8, .3); railing(g, [[-1, 4.1], [-1, 5.4]], 0, P.chrome, .9); railing(g, [[1, 4.1], [1, 5.4]], 0, P.chrome, .9);
  return g;
}

export function swings(motion) {
  const g = new T.Group(); deckRound(g, 5.6, .3, 36);
  ringRail(g, 5.4, .3, .9, 36, Math.PI / 2, .25); stairs(g, 0, 5.6, 1.2, .3);
  // tower
  cyl(g, .75, 7.2, P.teal, [0, 3.9, 0], .55, 12);
  for (let y = 1.5; y < 7.5; y += 1.5) ring(g, .7 - y * .02, .07, P.gold, [0, y, 0], [Math.PI / 2, 0, 0], 14, 4);
  cyl(g, 1.4, .6, P.cream, [0, .6, 0], 1.6, 12); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; box(g, [.5, .45, .06], i % 2 ? P.coral : P.gold, [Math.cos(a) * 1.5, .62, Math.sin(a) * 1.5], [0, -a + Math.PI / 2, 0]); }
  ball(g, .4, P.gold, [0, 7.6, 0], 1);
  const r = new T.Group(); r.name = 'SwingCanopy';
  cyl(r, 1.0, .5, P.gold, [0, 7.75, 0], 1.0, 12);
  stripedCone(r, 3.9, 1.5, 7.9, 16, P.coral, P.cream);
  ring(r, 3.85, .08, P.gold, [0, 7.85, 0], [Math.PI / 2, 0, 0], 40, 4); bulbs(r, 3.8, 7.68, 32);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; beam(r, [0, 8.0, 0], [Math.cos(a) * 3.7, 7.85, Math.sin(a) * 3.7], .05, P.teal, 4); }
  ball(r, .3, P.gold, [0, 9.5, 0], 1); pennant(r, 0, 10.4, 0, P.teal, 1.0);
  const seatCols = [P.coral, P.teal, P.gold, P.pink];
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2, out = V(Math.cos(a), 0, Math.sin(a)), tan = V(-Math.sin(a), 0, Math.cos(a));
    const top = out.clone().multiplyScalar(3.35).add(V(0, 7.7, 0)), tilt = .28, L = 3.4;
    const seat = top.clone().addScaledVector(out, Math.sin(tilt) * L).add(V(0, -Math.cos(tilt) * L, 0));
    for (const s of [-.22, .22]) beam(r, top.clone().addScaledVector(tan, s), seat.clone().addScaledVector(tan, s).add(V(0, .55, 0)), .018, P.chrome, 3, { metal: .5 });
    const c = group(r, seat.toArray(), -a + Math.PI / 2);
    c.rotation.set(0, Math.PI / 2 - a, 0);
    const tiltG = group(c); tiltG.rotation.x = 0; tiltG.rotation.z = 0;
    box(tiltG, [.55, .08, .5], seatCols[i % 4], [0, 0, 0]); box(tiltG, [.55, .5, .08], seatCols[i % 4], [0, .25, -.23]);
    box(tiltG, [.04, .3, .45], P.chrome, [-.28, .2, 0]); box(tiltG, [.04, .3, .45], P.chrome, [.28, .2, 0]); box(tiltG, [.4, .05, .25], P.ink, [0, -.25, .3]);
  }
  motion('ride_swings_motion', r, { ride: 'ride_swings', kind: 'spin', pivot: [0, 0, 0], speed: .9 });
  return g;
}

export function pirate(motion) {
  const g = new T.Group();
  deckRect(g, 8.6, 11.2, .25, 0, 0, P.cream);
  // boarding decks either side of the ship
  for (const x of [-3.2, 3.2]) { deckRect(g, 2.0, 6.6, .9, x, 0, P.cream); railing(g, [[x + Math.sign(x) * .95, -3.2], [x + Math.sign(x) * .95, 3.2]], .9, P.cream, .9); }
  for (const x of [-3.2, 3.2]) stairs(g, x, 3.3, 1.4, .9, 0);
  // A-frames
  const PY = 7.4;
  for (const x of [-1.95, 1.95]) {
    for (const z of [-3.9, 3.9]) { beam(g, [x * 1.08, .25, z], [x, PY, 0], .2, P.teal, 8); box(g, [.6, .2, .6], P.stone, [x * 1.08, .3, z]); }
    beam(g, [x * 1.06, 2.6, -2.7], [x * 1.06, 2.6, 2.7], .1, P.teal); beam(g, [x * 1.04, 4.8, -1.45], [x * 1.04, 4.8, 1.45], .08, P.cream);
    ball(g, .35, P.gold, [x, PY, 0], 1);
  }
  cyl(g, .22, 4.2, P.gold, [0, PY, 0], .22, 10).rotation.z = Math.PI / 2;
  signBoard(g, [0, 1.6, 5.2], 3.0, .8, P.ink, { posts: true, postColor: P.wood, stripe: P.gold });
  // the swinging ship, pivot at the axle
  const s = new T.Group(); s.name = 'PirateShip';
  const hullShape = new T.Shape(); const prof = [[-4.1, 1.35], [-3.5, .5], [-2.4, -.55], [-1, -.95], [1, -.95], [2.4, -.55], [3.5, .5], [4.1, 1.35], [3.4, 1.05], [2.9, .5], [-2.9, .5], [-3.4, 1.05]];
  hullShape.moveTo(...prof[0]); for (const p of prof.slice(1)) hullShape.lineTo(...p); hullShape.closePath();
  const hg = new T.ExtrudeGeometry(hullShape, { depth: 2.5, bevelEnabled: true, bevelSize: .08, bevelThickness: .08, bevelSegments: 1 }); hg.translate(0, 0, -1.25);
  const deckY = -5.0;
  mesh(s, hg, P.coral, [0, deckY - .5, 0], [0, Math.PI / 2, 0]).scale.x = .86;
  for (const x of [-1.34, 1.34]) { box(s, [.05, .14, 5.7], P.gold, [x, deckY - .35, 0]); box(s, [.05, .1, 4.6], P.cream, [x, deckY - .85, 0]); for (let k = -2; k <= 2; k++) ball(s, .11, P.gold, [x * 1.02, deckY - .6, k * 1.0], 0); }
  box(s, [2.4, .06, 5.0], P.wood, [0, deckY + .02, 0]);
  for (let k = -2; k <= 2; k++) { const z = k * .92; box(s, [2.1, .35, .4], P.darkwood, [0, deckY + .2, z]); box(s, [2.1, .5, .1], P.cream, [0, deckY + .45, z - .22]); box(s, [2.1, .06, .08], P.gold, [0, deckY + .7, z + .25]); }
  // bow figurehead and stern lantern
  ball(s, .28, P.gold, [0, deckY + .7, 3.62], 1); box(s, [.3, .3, .5], P.gold, [0, deckY + .4, 3.4]); ball(s, .2, P.glow, [0, deckY + 1.0, -3.55], 1);
  // mast, sail, flag
  beam(s, [0, deckY, 0], [0, -1.15, 0], .1, P.darkwood, 6); beam(s, [0, -2.4, -1.4], [0, -2.4, 1.4], .06, P.darkwood, 4);
  const sail = new T.Shape(); sail.moveTo(-1.3, 0); sail.lineTo(1.3, 0); sail.quadraticCurveTo(1.6, -1.3, 1.35, -2.2); sail.lineTo(-1.35, -2.2); sail.quadraticCurveTo(-1.6, -1.3, -1.3, 0);
  mesh(s, new T.ShapeGeometry(sail), P.cream, [.15, -2.45, 0], [0, Math.PI / 2, 0], { double: true }).scale.set(1.3, 1, 1);
  box(s, [.04, .5, 1.6], P.coral, [.17, -3.5, 0]);
  cyl(s, .35, .3, P.darkwood, [0, -1.9, 0], .4, 8);
  const flag = new T.Shape(); flag.moveTo(0, 0); flag.lineTo(.9, -.1); flag.lineTo(.8, -.55); flag.lineTo(0, -.5); flag.closePath();
  mesh(s, new T.ShapeGeometry(flag), P.ink, [0, -1.25, .1], [0, -Math.PI / 2, 0], { double: true });
  // arms from axle to the hull
  for (const x of [-1.42, 1.42]) for (const z of [-2.2, 2.2]) beam(s, [x * .98, 0, 0], [x, deckY + .35, z], .12, P.teal, 6);
  for (const x of [-1.42, 1.42]) beam(s, [x, deckY + .35, -2.2], [x, deckY + .35, 2.2], .08, P.teal, 6);
  cyl(s, .32, 2.8, P.gold, [0, 0, 0], .32, 10).rotation.z = Math.PI / 2;
  motion('ride_pirate_motion', s, { ride: 'ride_pirate', kind: 'swing', pivot: [0, PY, 0], speed: .12, amplitude: .75 });
  return g;
}

export function topspin(motion) {
  const g = new T.Group(); deckRect(g, 7.5, 7.5, .3);
  const PY = 4.0;
  for (const x of [-3.15, 3.15]) {
    box(g, [.75, PY + .3, 1.4], P.teal, [x, (PY + .3) / 2 + .2, 0]); box(g, [.9, .3, 1.6], P.gold, [x, PY + .5, 0]);
    box(g, [.25, PY - .5, .08], P.coral, [x, PY / 2, .72]);
    for (let y = .9, k = 0; y < PY; y += .6, k++) ball(g, .07, k % 2 ? P.gold : P.cream, [x + Math.sign(x) * .25, y, .74], 0);
    box(g, [1.2, .2, 2.6], P.ink, [x, .35, 0]);
  }
  railing(g, [[-2.4, -3.5], [2.4, -3.5]], .3, P.cream, .9); railing(g, [[-2.6, 3.5], [-1.2, 3.5]], .3, P.cream, .9); railing(g, [[1.2, 3.5], [2.6, 3.5]], .3, P.cream, .9);
  signBoard(g, [0, 1.5, 3.55], 2.0, .5, P.coral, { stripe: P.gold, posts: true });
  for (const x of [-3.15, 3.15]) { ball(g, .3, P.gold, [x, PY + .85, 0], 1); pennant(g, x, PY + 1.7, 0, P.coral, 1.0); }
  const m = new T.Group(); m.name = 'TopSpinArms';
  for (const x of [-2.6, 2.6]) { box(m, [.3, 2.8, .45], P.coral, [x, -1.3, 0]); cyl(m, .3, .5, P.gold, [x, 0, 0], .3, 10).rotation.z = Math.PI / 2; }
  cyl(m, .18, 5.2, P.chrome, [0, -2.6, 0], .18, 8, { metal: .5 }).rotation.z = Math.PI / 2;
  // gondola: two rows of seats facing +Z
  box(m, [4.8, .2, 1.6], P.ink, [0, -2.85, .1]); box(m, [4.8, .12, 1.7], P.gold, [0, -2.72, .1]);
  for (const row of [0, 1]) for (let i = 0; i < 6; i++) {
    const x = -2.0 + i * .8, z = row ? -.35 : .45, yb = -2.7 + row * .25;
    box(m, [.65, .1, .55], i % 2 ? P.teal : P.coral, [x, yb, z]); box(m, [.65, .8, .12], i % 2 ? P.teal : P.coral, [x, yb + .4, z - .28]);
    for (const k of [-.18, .18]) beam(m, [x + k, yb + .75, z - .2], [x + k, yb + .3, z + .25], .03, P.gold, 4);
  }
  for (let i = 0; i < 9; i++) ball(m, .06, i % 2 ? P.gold : P.cream, [-2.4 + i * .6, -2.95, .9], 0);
  motion('ride_topspin_motion', m, { ride: 'ride_topspin', kind: 'wheel', pivot: [0, PY, 0], speed: .8 });
  return g;
}

export function enterprise(motion) {
  const g = new T.Group(); deckRound(g, 5.3, .35, 36);
  ringRail(g, 5.1, .35, .9, 36, Math.PI / 2, .25); stairs(g, 0, 5.3, 1.4, .35);
  const HY = 5.7;
  // tilting arm on the -X side with its ram
  box(g, [2.0, 1.0, 2.0], P.ink, [-1.6, .85, 0]); beam(g, [-1.6, 1.2, 0], [-.9, HY, 0], .45, P.teal, 8);
  beam(g, [-3.0, .4, 0], [-1.3, 3.5, 0], .14, P.chrome, 6, { metal: .5 }); box(g, [.6, .4, .6], P.gold, [-3.0, .5, 0]);
  cyl(g, .55, 1.2, P.gold, [-.7, HY, 0], .55, 12).rotation.z = Math.PI / 2;
  for (const z of [-4.2, 4.2]) lampPost(g, 4.2, z * .7, 3);
  signBoard(g, [3.3, 1.8, 3.6], 2.2, .55, P.teal, { posts: true, rotY: .6 });
  const w = new T.Group(); w.name = 'EnterpriseWheel';
  ring(w, 4.2, .14, P.coral, [0, 0, 0], [0, Math.PI / 2, 0], 48, 6); ring(w, 2.0, .1, P.gold, [0, 0, 0], [0, Math.PI / 2, 0], 24, 5);
  cyl(w, .7, .6, P.cream, [0, 0, 0], .7, 12).rotation.z = Math.PI / 2;
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2, y = Math.sin(a), z = Math.cos(a);
    beam(w, [0, 0, 0], [0, y * 4.2, z * 4.2], .07, P.cream, 5);
    const c = group(w, [.45, y * 4.55, z * 4.55]); c.rotation.x = -a + Math.PI / 2;
    box(c, [.85, .9, .55], i % 3 === 0 ? P.gold : i % 3 === 1 ? P.teal : P.coral, [0, 0, 0]);
    box(c, [.9, .3, .6], P.cream, [0, .5, 0]); box(c, [.7, .5, .06], P.ink, [0, .05, .29]);
    ball(w, .09, P.glow, [.2, y * 3.6, z * 3.6], 0);
  }
  motion('ride_enterprise_motion', w, { ride: 'ride_enterprise', kind: 'wheel', pivot: [0, HY, 0], speed: 1.0 });
  return g;
}

function kart(g, x, z, rot, color) {
  const k = group(g, [x, .16, z], rot);
  box(k, [.8, .12, 1.3], P.ink, [0, .12, 0]); box(k, [.6, .22, .7], color, [0, .3, -.1]); box(k, [.7, .12, .3], color, [0, .2, .55]);
  for (const sx of [-.42, .42]) for (const sz of [-.45, .45]) wheel(k, [sx, .14, sz], .14, .14);
  ball(k, .18, color === P.gold ? P.coral : P.gold, [0, .65, -.15], 1); box(k, [.5, .3, .06], P.ink, [0, .45, -.48]);
}
export function gokarts() {
  const g = new T.Group();
  const ctrl = [[-6, 3.6], [-6.3, -2.5], [-4.6, -5.8], [-1.6, -6.2], [0, -3.6], [1.4, -1.6], [3.4, -2.4], [4.8, -5.4], [6.4, -4.0], [6.3, 1.4], [5.2, 3.6], [2, 3.8], [-2, 3.8]].map(([x, z]) => V(x * .94, .1, z * .97));
  const pts = spline(ctrl, .35);
  ribbon(g, pts, 2.6, P.sand, 0, true); ribbon(g, pts, 2.2, P.asphalt, .03, true);
  // kerbs and tyre walls
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n], t = q.clone().sub(p); t.y = 0; t.normalize(); const s = V(t.z, 0, -t.x), ang = Math.atan2(t.x, t.z);
    if (i % 2 === 0) for (const k of [1.12, -1.12]) box(g, [.22, .06, .36], (i / 2) % 2 ? P.red : P.white, [p.x + s.x * k, .17, p.z + s.z * k], [0, ang, 0]);
    if (i % 3 === 0) for (const k of [1.6, -1.6]) {
      const x = p.x + s.x * k, z = p.z + s.z * k; if (Math.abs(x) > 7.5 || Math.abs(z) > 7.5) continue;
      for (const h of [0, 1]) cyl(g, .26, .2, (i / 3 + h) % 4 === 0 ? P.coral : P.tyre, [x, .1 + h * .21, z], .26, 8);
    }
  }
  // start/finish chequers and gantry
  const p0 = V(0, .1, 3.8);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) box(g, [.3, .02, .36], (i + j) % 2 ? P.white : P.ink, [-.6 + j * .3, .155, 2.85 + i * .38]);
  for (const z of [2.45, 5.15]) beam(g, [0, 0, z], [0, 3.2, z], .1, P.teal);
  box(g, [.3, .7, 2.9], P.ink, [0, 3.2, 3.8]); for (let i = 0; i < 6; i++) box(g, [.32, .3, .45], i % 2 ? P.white : P.ink, [0, 3.2 + (i % 2 ? .18 : -.18), 2.7 + i * .45]);
  // pit building inside the loop, facing +Z
  const B = group(g, [-2.6, 0, .6]);
  deckRect(B, 4.2, 2.4, .2); box(B, [4.0, 2.0, 2.0], P.cream, [0, 1.2, 0]);
  for (let i = 0; i < 3; i++) { box(B, [1.0, 1.4, .06], P.grey, [-1.3 + i * 1.3, .95, 1.02]); for (let k = 0; k < 4; k++) box(B, [1.0, .04, .08], P.ink, [-1.3 + i * 1.3, .4 + k * .35, 1.06]); }
  box(B, [4.4, .2, 2.4], P.coral, [0, 2.3, 0]); box(B, [2.6, .9, 1.6], P.teal, [.4, 2.85, -.2]); box(B, [2.2, .4, .06], P.glass, [.4, 2.9, .62]);
  pennant(B, -1.8, 3.6, -.6, P.gold); pennant(B, 1.8, 3.6, -.6, P.coral);
  // karts on the track
  const at = d => { const i = Math.floor(d * n) % n, p = pts[i], q = pts[(i + 1) % n]; return [p, Math.atan2(q.x - p.x, q.z - p.z)]; };
  for (const [d, col, off] of [[.03, P.coral, .4], [.22, P.teal, -.4], [.47, P.gold, .3], [.7, P.blue, -.3]]) { const [p, r] = at(d); kart(g, p.x + Math.cos(r) * off, p.z - Math.sin(r) * off, r, col); }
  lampPost(g, 3.0, -.2, 3); shrub(g, 2.6, 1.6, .6); shrub(g, -4.2, -3.4, .7);
  return g;
}

export function simulator() {
  const g = new T.Group(); deckRect(g, 7.4, 7.4, .3, 0, 0, P.cream);
  box(g, [7.0, .06, 2.0], P.ink, [0, .33, 2.4]);
  // capsule on hydraulic legs
  const C = group(g, [0, 0, -.8]);
  for (const [x, z] of [[-1.6, -1.4], [1.6, -1.4], [-1.6, 1.4], [1.6, 1.4]]) {
    beam(C, [x * 1.25, .3, z * 1.25], [x * .7, 2.0, z * .7], .14, P.chrome, 8, { metal: .6 }); beam(C, [x * 1.25, .3, z * 1.25], [x * 1.0, 1.2, z * 1.0], .22, P.grey, 8);
    box(C, [.6, .3, .6], P.ink, [x * 1.25, .45, z * 1.25]);
  }
  box(C, [3.0, .3, 2.6], P.ink, [0, 2.1, 0]);
  const pod = ball(C, 1.0, P.white, [0, 3.4, 0], 2); pod.scale.set(1.8, 1.25, 1.55);
  const band = mesh(C, new T.CylinderGeometry(1.0, 1.0, .5, 20, 1, true), P.ink, [0, 3.55, 0], [0, 0, 0], { double: true }); band.scale.set(1.82, 1, 1.57);
  const stripe = mesh(C, new T.CylinderGeometry(1.0, 1.0, .14, 20, 1, true), P.teal, [0, 3.05, 0], [0, 0, 0], { double: true }); stripe.scale.set(1.86, 1, 1.6);
  for (let i = 0; i < 7; i++) ball(C, .07, P.glow, [-1.2 + i * .4, 3.05, 1.6], 0);
  box(C, [1.0, 1.1, .3], P.teal, [0, 3.2, 1.45]); box(C, [.7, .8, .08], P.ink, [0, 3.2, 1.62]);
  beam(C, [.6, 4.55, 0], [.6, 5.6, 0], .03, P.chrome, 4); ball(C, .1, P.coral, [.6, 5.65, 0], 0);
  // gangway to the door
  segBox(g, V(0, .35, 3.4), V(0, 2.4, .7), 1.1, .12, P.grey); railing(g, [[-.6, 3.4], [-.6, .9]], .35, P.chrome, .9); railing(g, [[.6, 3.4], [.6, .9]], .35, P.chrome, .9);
  // queue kiosk with neon sign
  box(g, [1.6, 2.2, 1.4], P.navy, [2.5, 1.4, 2.4]); box(g, [1.2, .7, .06], P.pink, [2.5, 1.9, 3.12]); box(g, [1.8, .2, 1.6], P.gold, [2.5, 2.6, 2.4]);
  signBoard(g, [-2.4, 2.4, 2.9], 2.0, .6, P.navy, { posts: true, postColor: P.chrome, stripe: P.pink });
  return g;
}
