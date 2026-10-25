// Shared geometry kit for the Brightway Park model generator.
// Everything is native three.js geometry; no images, no external meshes.
import * as T from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
export { T };

export const P = {
  cream: '#fff1cf', coral: '#ef7059', teal: '#247f83', gold: '#edbc5c', ink: '#24444c', wood: '#ad7960',
  leaf: '#4c8866', mint: '#a1cbb0', blue: '#77b8c8', pink: '#d77c9d',
  white: '#fbf7ee', red: '#d64538', green: '#3f9a5a', navy: '#22314d', purple: '#4b3866', plum: '#2e2340',
  stone: '#cfc7b6', grey: '#8d969a', asphalt: '#4a5054', tyre: '#262a2c', chrome: '#d4dde0',
  water: '#3d93bd', waterEdge: '#9fd8e6', foam: '#eef8f8', rock: '#8a8378', hedge: '#3d7550', sand: '#e6d3a6',
  darkwood: '#7a5240', glass: '#5fa3b8', glow: '#ffd977', orange: '#e8913a', yellow: '#f2d04b',
};
export const Y = new T.Vector3(0, 1, 0);
export const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
export const smooth = s => s * s * (3 - 2 * s);
// Sideways offset through a loop: zero (with zero slope) at entry and exit, opposite signs where the track crosses itself.
export const loopShift = th => -(1 - Math.cos(th)) / 2 * (th / Math.PI - 1);

// ---- materials ----------------------------------------------------------
const materials = new Map();
export function material(color, metal = 0, double = false) {
  const key = `${color}:${metal}:${double}`;
  if (!materials.has(key)) materials.set(key, new T.MeshStandardMaterial({
    color, roughness: metal ? .38 : .72, metalness: metal, side: double ? T.DoubleSide : T.FrontSide,
  }));
  return materials.get(key);
}

// ---- primitives ---------------------------------------------------------
export function mesh(g, geometry, color, pos = [0, 0, 0], rot = [0, 0, 0], o = {}) {
  const m = new T.Mesh(geometry, material(color, o.metal ?? 0, o.double ?? false));
  m.position.set(...pos); m.rotation.set(...rot); g.add(m); return m;
}
export const box = (g, size, color, pos, rot, o) => mesh(g, new T.BoxGeometry(...size), color, pos, rot, o);
export const cyl = (g, r, h, color, pos, top = r, seg = 16, o) => mesh(g, new T.CylinderGeometry(top, r, h, seg), color, pos, [0, 0, 0], o);
export const ball = (g, r, color, pos, detail = 1, o) => mesh(g, new T.IcosahedronGeometry(r, detail), color, pos, [0, 0, 0], o);
export const ring = (g, r, tube, color, pos, rot, seg = 32, rad = 6, o) => mesh(g, new T.TorusGeometry(r, tube, rad, seg), color, pos, rot, o);
export const group = (parent, pos = [0, 0, 0], rotY = 0, name) => {
  const n = new T.Group(); n.position.set(...pos); n.rotation.y = rotY; if (name) n.name = name; parent?.add(n); return n;
};
const vec = a => a instanceof T.Vector3 ? a.clone() : new T.Vector3(...a);

export function beam(g, a, b, r, color, seg = 6, o) {
  const av = vec(a), bv = vec(b), d = bv.clone().sub(av);
  const m = mesh(g, new T.CylinderGeometry(r, r, d.length(), seg), color, av.clone().add(bv).multiplyScalar(.5).toArray(), [0, 0, 0], o);
  m.quaternion.setFromUnitVectors(Y, d.normalize()); return m;
}
// Box from a to b (length along a->b), w across, h along `up`.
export function segBox(g, a, b, w, h, color, up = Y, extra = 0, o) {
  const av = vec(a), bv = vec(b), len = av.distanceTo(bv);
  const m = mesh(g, new T.BoxGeometry(w, h, len + extra), color, av.clone().add(bv).multiplyScalar(.5).toArray(), [0, 0, 0], o);
  const dir = bv.clone().sub(av).normalize();
  let u = up.clone(); if (Math.abs(u.dot(dir)) > .999) u = Math.abs(dir.y) > .9 ? V(0, 0, 1) : Y.clone();
  m.quaternion.setFromRotationMatrix(new T.Matrix4().lookAt(bv, av, u)); return m;
}
export function tube(g, pts, r, color, closed = false, radial = 6, o) {
  const curve = new T.CatmullRomCurve3(pts.map(vec), closed, 'centripetal');
  const segs = Math.min(400, Math.max(8, pts.length));
  return mesh(g, new T.TubeGeometry(curve, segs, r, radial, closed), color, [0, 0, 0], [0, 0, 0], o);
}
// Double-sided strip between two matched polylines.
export function strip(g, A, B, color, o = {}) {
  const pos = [], idx = [];
  for (let i = 0; i < A.length; i++) { pos.push(...vec(A[i]).toArray(), ...vec(B[i]).toArray()); }
  for (let i = 0; i < A.length - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  if (o.closed) { const a = (A.length - 1) * 2; idx.push(a, a + 1, 0, a + 1, 1, 0); }
  const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  return mesh(g, geo, color, [0, 0, 0], [0, 0, 0], { double: true, ...o });
}
// Flat horizontal band of width w following a path, lifted by dy.
export function ribbon(g, pts, w, color, dy = 0, closed = false, o) {
  const P3 = pts.map(vec), A = [], B = [];
  for (let i = 0; i < P3.length; i++) {
    const prev = P3[closed ? (i - 1 + P3.length) % P3.length : Math.max(0, i - 1)], next = P3[closed ? (i + 1) % P3.length : Math.min(P3.length - 1, i + 1)];
    const t = next.clone().sub(prev); t.y = 0; t.normalize(); const s = V(t.z, 0, -t.x).multiplyScalar(w / 2);
    A.push(P3[i].clone().add(s).add(V(0, dy, 0))); B.push(P3[i].clone().sub(s).add(V(0, dy, 0)));
  }
  return strip(g, A, B, color, { closed, ...o });
}
// Flat shape / extruded slab from [x, z] outline points.
function shapeOf(pts, holes = []) {
  const s = new T.Shape(pts.map(([x, z]) => new T.Vector2(x, -z)));
  for (const h of holes) s.holes.push(new T.Path(h.map(([x, z]) => new T.Vector2(x, -z))));
  return s;
}
export const flat = (g, pts, y, color, holes, o) => mesh(g, new T.ShapeGeometry(shapeOf(pts, holes)), color, [0, y, 0], [-Math.PI / 2, 0, 0], { double: true, ...o });
export const slab = (g, pts, y, h, color, holes, o) => mesh(g, new T.ExtrudeGeometry(shapeOf(pts, holes), { depth: h, bevelEnabled: false, curveSegments: 4 }), color, [0, y, 0], [-Math.PI / 2, 0, 0], o);
export function ellipse(rx, rz, n = 32, cx = 0, cz = 0, wob = 0, phase = 0) {
  const out = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, k = 1 + wob * Math.sin(a * 3 + phase); out.push([cx + Math.cos(a) * rx * k, cz + Math.sin(a) * rz * k]); }
  return out;
}
export const scalePts = (pts, k, cx = 0, cz = 0) => pts.map(([x, z]) => [cx + (x - cx) * k, cz + (z - cz) * k]);

// Water surface with a lighter rim, as the art direction asks.
export function pool(g, pts, y = .12, edge = 1.07, holes) {
  flat(g, scalePts(pts, edge), y - .02, P.waterEdge, holes);
  flat(g, pts, y, P.water, holes);
}

// ---- fairground dressing -------------------------------------------------
export function deckRound(g, r = 3.6, h = .3, seg = 28) {
  cyl(g, r, h - .08, P.wood, [0, (h - .08) / 2, 0], r, seg); cyl(g, r - .12, .1, P.cream, [0, h - .05, 0], r - .12, seg);
  ring(g, r - .2, .06, P.gold, [0, h, 0], [Math.PI / 2, 0, 0], seg + 8);
}
export function deckRect(g, w, d, h = .3, x = 0, z = 0, top = P.cream) {
  box(g, [w, h - .06, d], P.wood, [x, (h - .06) / 2, z]); box(g, [w - .16, .08, d - .16], top, [x, h - .04, z]);
}
export function bulbs(g, r, y, count = 24, cx = 0, cz = 0, size = .085) {
  for (let i = 0; i < count; i++) { const a = i / count * Math.PI * 2; ball(g, size, i % 2 ? P.gold : P.cream, [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r], 0); }
}
export function bulbLine(g, a, b, n, size = .07) {
  const av = vec(a), bv = vec(b); for (let i = 0; i <= n; i++) ball(g, size, i % 2 ? P.gold : P.cream, av.clone().lerp(bv, i / n).toArray(), 0);
}
export function pennant(g, x, y, z, color, pole = 2.1, dir = 1) {
  beam(g, [x, y - pole + .8, z], [x, y + .8, z], .045, P.cream);
  const s = new T.Shape(); s.moveTo(0, 0); s.lineTo(.7, -.24); s.lineTo(0, -.48); s.closePath();
  mesh(g, new T.ShapeGeometry(s), color, [x, y + .7, z], [0, dir < 0 ? Math.PI : 0, 0], { double: true }); ball(g, .07, P.gold, [x, y + .84, z], 0);
}
export function bunting(g, a, b, n, colors = [P.coral, P.gold, P.teal, P.cream], sag = .35) {
  const av = vec(a), bv = vec(b), pts = [];
  for (let i = 0; i <= n; i++) { const s = i / n, p = av.clone().lerp(bv, s); p.y -= Math.sin(s * Math.PI) * sag; pts.push(p); }
  tube(g, pts, .015, P.cream, false, 3);
  const dir = bv.clone().sub(av); dir.y = 0; const ang = Math.atan2(dir.x, dir.z) - Math.PI / 2;
  for (let i = 0; i < n; i++) {
    const p = pts[i].clone().lerp(pts[i + 1], .5), s = new T.Shape(); s.moveTo(-.16, 0); s.lineTo(.16, 0); s.lineTo(0, -.32); s.closePath();
    mesh(g, new T.ShapeGeometry(s), colors[i % colors.length], p.toArray(), [0, ang, 0], { double: true });
  }
}
// Railing along a polyline of [x, z] points at deck height y.
export function railing(g, pts, y = .3, color = P.cream, h = .9, every = 1.1, post = P.gold) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = V(pts[i][0], y, pts[i][1]), b = V(pts[i + 1][0], y, pts[i + 1][1]), n = Math.max(1, Math.round(a.distanceTo(b) / every));
    for (let k = 0; k <= n; k++) { if (k === n && i < pts.length - 2) continue; const p = a.clone().lerp(b, k / n); cyl(g, .045, h, post, [p.x, y + h / 2, p.z], .045, 6); }
    segBox(g, a.clone().add(V(0, h, 0)), b.clone().add(V(0, h, 0)), .07, .07, color);
    segBox(g, a.clone().add(V(0, h * .5, 0)), b.clone().add(V(0, h * .5, 0)), .04, .04, color);
  }
}
export function ringRail(g, r, y, h = .9, n = 24, gapA = null, gapW = .6, color = P.cream) {
  const pts = []; for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2; pts.push([Math.cos(a) * r, Math.sin(a) * r, a]); }
  for (let i = 0; i < n; i++) {
    const [x0, z0, a0] = pts[i], [x1, z1] = pts[i + 1];
    if (gapA !== null) { const d = Math.atan2(Math.sin(a0 - gapA + Math.PI / n), Math.cos(a0 - gapA + Math.PI / n)); if (Math.abs(d) < gapW) continue; }
    cyl(g, .04, h, P.gold, [x0, y + h / 2, z0], .04, 5);
    segBox(g, V(x0, y + h, z0), V(x1, y + h, z1), .07, .07, color, Y, .04);
  }
}
// Sign board facing +Z (rotate with rotY) with gold frame and simple emblem dots.
export function signBoard(g, pos, w, h, color, o = {}) {
  const s = group(g, pos, o.rotY ?? 0);
  box(s, [w, h, .12], color, [0, 0, 0]);
  box(s, [w + .14, .1, .16], o.frame ?? P.gold, [0, h / 2, 0]); box(s, [w + .14, .1, .16], o.frame ?? P.gold, [0, -h / 2, 0]);
  for (const x of [-w / 2, w / 2]) box(s, [.1, h + .1, .16], o.frame ?? P.gold, [x, 0, 0]);
  if (o.bulbs !== false) for (let i = 0; i <= 6; i++) ball(s, .06, i % 2 ? P.cream : P.gold, [-w / 2 + i * w / 6, h / 2 + .1, .06], 0);
  if (o.stripe) box(s, [w * .7, h * .18, .04], o.stripe, [0, 0, .08]);
  if (o.posts) for (const x of [-w / 2 + .1, w / 2 - .1]) beam(g, [pos[0] + x * Math.cos(o.rotY ?? 0), 0, pos[2] - x * Math.sin(o.rotY ?? 0)], [pos[0] + x * Math.cos(o.rotY ?? 0), pos[1], pos[2] - x * Math.sin(o.rotY ?? 0)], .07, o.postColor ?? P.teal);
  return s;
}
// Striped cone roof (tent) made of alternating wedges.
export function stripedCone(g, r, h, y, n = 12, a = P.coral, b = P.cream, cx = 0, cz = 0) {
  for (let i = 0; i < n; i++) mesh(g, new T.CylinderGeometry(0, r, h, 2, 1, true, i / n * Math.PI * 2, Math.PI * 2 / n), i % 2 ? a : b, [cx, y + h / 2, cz], [0, 0, 0], { double: true });
  for (let i = 0; i < n * 2; i++) { const ang = (i + .5) / (n * 2) * Math.PI * 2; box(g, [r * Math.PI / n * .95, .28, .05], i % 2 ? a : b, [cx + Math.sin(ang) * r * .99, y - .1, cz + Math.cos(ang) * r * .99], [0, ang, 0]); }
}
export function stairs(g, x, z, w, h, rotY = 0, color = P.wood) {
  const s = group(g, [x, 0, z], rotY), n = Math.max(1, Math.round(h / .2));
  for (let i = 0; i < n; i++) box(s, [w, h * (n - i) / n, .32], color, [0, h * (n - i) / n / 2, i * .32]);
  return s;
}
export function lampPost(g, x, z, h = 3, color = P.teal) {
  cyl(g, .16, .12, P.wood, [x, .06, z], .16, 8); beam(g, [x, .1, z], [x, h, z], .05, color);
  ball(g, .17, P.glow, [x, h + .1, z], 1); cyl(g, .2, .12, color, [x, h + .28, z], .02, 6);
}
export function shrub(g, x, z, r = .5, c = P.leaf) { ball(g, r, c, [x, r * .97, z], 1); ball(g, r * .6, P.mint, [x + r * .3, r * 1.25, z - r * .2], 0); }
export function tree(g, x, z, s = 1) {
  cyl(g, .16 * s, 1.6 * s, P.wood, [x, .8 * s, z], .12 * s, 6);
  ball(g, .9 * s, P.leaf, [x, 2.1 * s, z], 1); ball(g, .6 * s, P.mint, [x + .3 * s, 2.7 * s, z - .2 * s], 1);
}
export function wheel(g, pos, r, w, color = P.tyre, axis = 'x') {
  const m = mesh(g, new T.CylinderGeometry(r, r, w, 10), color, pos, axis === 'x' ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]); return m;
}

// ---- figures --------------------------------------------------------------
// A humanoid about 1.8 m tall, origin at the feet, facing +Z.
export function humanoid(o = {}) {
  const g = new T.Group(), skin = o.skin ?? '#e2b08f', legs = o.legs ?? P.ink, top = o.top ?? P.coral;
  for (const x of [-.13, .13]) { box(g, [.2, .8, .24], legs, [x, .48, 0]); box(g, [.23, .14, .38], o.shoes ?? P.ink, [x, .07, .06]); }
  box(g, [.5, .22, .3], legs, [0, .92, 0]);
  const torso = mesh(g, new T.CylinderGeometry(.27, .24, .62, 8), top, [0, 1.3, 0]); torso.scale.set(1, 1, .72);
  for (const x of [-.36, .36]) { beam(g, [x, 1.56, 0], [x * 1.08, 1.1, .04], .08, o.sleeve ?? top); ball(g, .08, skin, [x * 1.1, 1.0, .05], 0); }
  cyl(g, .08, .1, skin, [0, 1.65, 0], .08, 6); ball(g, .2, skin, [0, 1.83, 0], 1);
  ball(g, .025, P.ink, [-.07, 1.86, .18], 0); ball(g, .025, P.ink, [.07, 1.86, .18], 0);
  return g;
}

// ---- track kit ----------------------------------------------------------
// Moving frame along a sampled path: tangents, ups (orthogonalised) and sides.
export function frames(pts, ups, closed) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], next = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const t = next.clone().sub(prev).normalize();
    let up = (ups?.[i] ?? Y).clone(); up.addScaledVector(t, -up.dot(t));
    if (up.lengthSq() < 1e-6) up = V(0, 0, 1).cross(t); up.normalize();
    const side = t.clone().cross(up).normalize();
    out.push({ p: pts[i], t, up, side });
  }
  return out;
}
export function pathLengths(F, closed) {
  const L = [0]; for (let i = 1; i < F.length; i++) L.push(L[i - 1] + F[i].p.distanceTo(F[i - 1].p));
  const total = L.at(-1) + (closed ? F.at(-1).p.distanceTo(F[0].p) : 0); return { L, total };
}
export function frameAt(F, lens, d) {
  const { L, total } = lens; d = ((d % total) + total) % total; let i = 0;
  while (i < L.length - 1 && L[i + 1] < d) i++;
  const j = (i + 1) % F.length, seg = (i + 1 < L.length ? L[i + 1] : total) - L[i], s = seg > 0 ? (d - L[i]) / seg : 0;
  const p = F[i].p.clone().lerp(F[j].p, s), t = F[i].t.clone().lerp(F[j].t, s).normalize(), up = F[i].up.clone().lerp(F[j].up, s).normalize();
  return { p, t, up, side: t.clone().cross(up).normalize() };
}
// Places a child group on the path at distance d with local +Z = travel, +Y = track up.
export function onPath(g, F, lens, d, lift = 0) {
  const f = frameAt(F, lens, d), c = new T.Group();
  const x = f.up.clone().cross(f.t).normalize(), up = f.t.clone().cross(x).normalize();
  c.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(x, up, f.t));
  c.position.copy(f.p).addScaledVector(up, lift); g.add(c); return c;
}
// Steel / wood / hanging coaster track along sampled points.
export function buildTrack(g, pts, ups, o = {}) {
  const closed = o.closed ?? true, F = frames(pts, ups, closed), gauge = o.gauge ?? .9, half = gauge / 2;
  const railColor = o.railColor ?? P.cream, spineOff = o.spineOff ?? .3, spineR = o.spineR ?? .13;
  const L = F.map(f => f.p.clone().addScaledVector(f.side, half)), R = F.map(f => f.p.clone().addScaledVector(f.side, -half));
  tube(g, L, o.railR ?? .065, railColor, closed, 5, { metal: .3 }); tube(g, R, o.railR ?? .065, railColor, closed, 5, { metal: .3 });
  if (o.spine !== false) tube(g, F.map(f => f.p.clone().addScaledVector(f.up, (o.hang ? 1 : -1) * spineOff)), spineR, o.spineColor ?? P.teal, closed, 6);
  const tieEvery = o.tieEvery ?? 3;
  for (let i = 0; i < F.length; i += tieEvery) {
    const f = F[i];
    segBox(g, L[i].clone().addScaledVector(f.up, -.06), R[i].clone().addScaledVector(f.up, -.06), .12, .09, o.tieColor ?? P.ink, f.up);
    if (o.spine !== false) beam(g, f.p.clone().addScaledVector(f.up, o.hang ? .04 : -.06), f.p.clone().addScaledVector(f.up, (o.hang ? 1 : -1) * spineOff), .05, o.tieColor ?? P.ink, 4);
  }
  const every = o.supportEvery ?? 6, sc = o.supportColor ?? P.teal, sr = o.supportR ?? .13, centre = o.centre ?? V(0, 0, 0);
  for (let i = o.supportStart ?? 0; i < F.length; i += every) {
    const f = F[i]; if (o.skipSupport?.(i, f)) continue;
    if (o.hang) {
      if (f.up.y < .75) continue;
      const h = f.side.clone(); h.y = 0; h.normalize(); const toC = centre.clone().sub(f.p); toC.y = 0; if (h.dot(toC) < 0) h.negate();
      const top = f.p.clone().add(V(0, spineOff + .9, 0)), foot = f.p.clone().addScaledVector(h, o.hangReach ?? 1.6); foot.y = 0;
      const head = foot.clone(); head.y = top.y;
      beam(g, foot, head, sr, sc, 8); beam(g, head, top, sr * .8, sc, 6); beam(g, top, f.p.clone().addScaledVector(f.up, spineOff), sr * .6, sc, 6);
      box(g, [.6, .2, .6], P.stone, [foot.x, .1, foot.z]);
    } else {
      if (f.up.y < .6 || f.p.y < (o.minSupportY ?? .9)) continue;
      const top = f.p.clone().addScaledVector(f.up, -(spineOff + spineR * .5)), foot = V(top.x, 0, top.z);
      if (o.style === 'wood') {
        for (const s of [half + .1, -half - .1]) { const q = f.p.clone().addScaledVector(f.side, s); beam(g, [q.x, 0, q.z], [q.x, q.y - .1, q.z], .07, sc, 4); }
        const a = f.p.clone().addScaledVector(f.side, half + .1), b = f.p.clone().addScaledVector(f.side, -half - .1);
        if (f.p.y > 1.6) { beam(g, [a.x, .2, a.z], [b.x, f.p.y - .2, b.z], .04, sc, 4); }
      } else {
        beam(g, foot, top, sr, sc, 8); box(g, [.5, .16, .5], P.stone, [foot.x, .08, foot.z]);
      }
    }
  }
  return { F, lens: pathLengths(F, closed) };
}

// Turtle that lays a coaster centre-line: heading h, dir = (sin h, 0, cos h); positive turns swing toward +X when heading +Z.
export class Turtle {
  constructor(x, y, z, h, step = .3) { this.p = V(x, y, z); this.h = h; this.step = step; this.pts = [this.p.clone()]; this.ups = [null]; }
  dir(h = this.h) { return V(Math.sin(h), 0, Math.cos(h)); }
  straight(len, dy = 0, linear = false) {
    const n = Math.max(2, Math.ceil(Math.hypot(len, dy) / this.step)), s0 = this.p.clone(), d = this.dir();
    for (let i = 1; i <= n; i++) {
      const s = i / n, k = .18;
      const ee = linear ? (s < k ? s * s / (2 * k) : s > 1 - k ? (1 - k) - (1 - s) * (1 - s) / (2 * k) : s - k / 2) / (1 - k) : smooth(s);
      const q = s0.clone().addScaledVector(d, len * s); q.y = s0.y + dy * ee; this.pts.push(q); this.ups.push(null);
    }
    this.p = this.pts.at(-1).clone(); return this;
  }
  turn(angle, r, dy = 0, bank = 0) {
    const n = Math.max(4, Math.ceil(Math.abs(angle) * r / this.step)), da = angle / n, y0 = this.p.y, p = this.p.clone(), sg = Math.sign(angle);
    for (let i = 1; i <= n; i++) {
      p.addScaledVector(this.dir(this.h + da / 2), 2 * r * Math.sin(Math.abs(da) / 2)); this.h += da;
      const s = i / n; p.y = y0 + dy * smooth(s);
      const b = bank * Math.sin(Math.PI * s), c = V(Math.cos(this.h), 0, -Math.sin(this.h)).multiplyScalar(sg);
      this.pts.push(p.clone()); this.ups.push(bank ? Y.clone().multiplyScalar(Math.cos(b)).addScaledVector(c, Math.sin(b)) : null);
    }
    this.p = p.clone(); return this;
  }
  loop(R, adv, lat = 1) {
    const d = this.dir(), S = d.clone().cross(Y).normalize(), c = adv / (Math.PI * 2), a = R * .55, s0 = this.p.clone();
    const n = Math.ceil(Math.PI * 2 * R * 1.2 / this.step);
    for (let i = 1; i <= n; i++) {
      const th = i / n * Math.PI * 2, along = c * th + a * Math.sin(th), y = R * (1 - Math.cos(th));
      this.pts.push(s0.clone().addScaledVector(d, along).addScaledVector(S, lat * 3.7 * loopShift(th)).add(V(0, y, 0)));
      this.ups.push(d.clone().multiplyScalar(-R * Math.sin(th)).add(V(0, c + a * Math.cos(th), 0)).normalize());
    }
    this.p = this.pts.at(-1).clone(); return this;
  }
  corkscrew(len, r) {
    const d = this.dir(), S = d.clone().cross(Y).normalize(), s0 = this.p.clone(), n = Math.ceil((len + r * 6) / this.step);
    for (let i = 1; i <= n; i++) {
      const s = i / n, ph = Math.PI * 2 * smooth(s);
      this.pts.push(s0.clone().addScaledVector(d, len * s).add(V(0, r * (1 - Math.cos(ph)), 0)).addScaledVector(S, -r * Math.sin(ph)));
      this.ups.push(Y.clone().multiplyScalar(Math.cos(ph)).addScaledVector(S, Math.sin(ph)));
    }
    this.p = this.pts.at(-1).clone(); return this;
  }
  closed(label) {
    const gap = this.pts.at(-1).distanceTo(this.pts[0]);
    if (gap > .35) console.warn(`  ! ${label} circuit gap ${gap.toFixed(2)} m`);
    const pts = this.pts.slice(0, -1), ups = this.ups.slice(0, -1); return { pts, ups };
  }
}
// Sample a closed Catmull-Rom spline through control points at ~step spacing.
export function spline(ctrl, step = .35, closed = true) {
  const c = new T.CatmullRomCurve3(ctrl.map(vec), closed, 'centripetal'), n = Math.ceil(c.getLength() / step);
  const pts = []; for (let i = 0; i < (closed ? n : n + 1); i++) pts.push(c.getPointAt(i / n)); return pts;
}

// ---- baking & checks ------------------------------------------------------
// Merge every mesh under a node into one mesh per material; children flagged keep stay separate nodes.
export function bake(node, inv) {
  node.updateWorldMatrix(true, true);
  const ownInv = node.matrixWorld.clone().invert(), res = new T.Group(); res.name = node.name;
  if (inv) { new T.Matrix4().multiplyMatrices(inv, node.matrixWorld).decompose(res.position, res.quaternion, res.scale); }
  const byMat = new Map();
  const walk = n => {
    for (const c of n.children) {
      if (c.userData.keep) { res.add(bake(c, ownInv)); continue; }
      if (c.isMesh) {
        let geo = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
        for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
        geo.clearGroups(); geo.applyMatrix4(new T.Matrix4().multiplyMatrices(ownInv, c.matrixWorld));
        if (!byMat.has(c.material)) byMat.set(c.material, []); byMat.get(c.material).push(geo);
      }
      walk(c);
    }
  };
  walk(node);
  let i = 0;
  for (const [mat, geos] of byMat) { const merged = mergeVertices(mergeGeometries(geos, false), 1e-4); const m = new T.Mesh(merged, mat); m.name = `${node.name || 'part'}_${i++}`; res.add(m); }
  return res;
}
export function vertices(root) {
  root.updateWorldMatrix(true, true); const out = [];
  root.traverse(n => { if (!n.isMesh) return; const p = n.geometry.attributes.position, v = new T.Vector3(); for (let i = 0; i < p.count; i++) out.push(v.fromBufferAttribute(p, i).applyMatrix4(n.matrixWorld).clone()); });
  return out;
}
export function triangles(root) { let t = 0; root.traverse(n => { if (n.isMesh) t += (n.geometry.index ? n.geometry.index.count : n.geometry.attributes.position.count) / 3; }); return t; }
