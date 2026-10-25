// Shops, facilities, scenery, path pieces and staff figures (4 m cells unless noted).
import { T, P, V, Y, box, cyl, ball, ring, beam, group, mesh, segBox, deckRect, bulbLine, pennant, bunting, railing, signBoard, stripedCone, stairs, tube, lampPost, shrub, wheel, humanoid } from './core.mjs';
const PI = Math.PI;

// Kiosk with striped awning; `top` draws the roof emblem at y≈3.2.
function kiosk(color, awning, top, o = {}) {
  const g = new T.Group(); deckRect(g, 3.5, 3.5, .2, 0, 0, '#e5ccaa');
  box(g, [2.8, 2.1, 2.4], color, [0, 1.25, -.1]); for (const x of [-1.42, 1.42]) box(g, [.1, 2.15, 2.45], P.cream, [x, 1.27, -.1]);
  box(g, [2.4, .95, .06], P.ink, [0, 1.75, 1.12]); box(g, [3.0, .14, .7], P.cream, [0, 1.17, 1.42]); box(g, [2.9, .9, .1], awning, [0, .7, 1.22]);
  for (let i = 0; i < 4; i++) box(g, [.5, .08, .08], P.gold, [-1.0 + i * .66, .75, 1.3]);
  if (o.wares) o.wares(g);
  for (let i = 0; i < 8; i++) { const x = -1.4 + i * .4; box(g, [.4, .1, 2.9], i % 2 ? awning : P.cream, [x, 2.62, .25], [.12, 0, 0]); box(g, [.4, .36, .06], i % 2 ? awning : P.cream, [x, 2.38, 1.68]); }
  bulbLine(g, [-1.5, 2.2, 1.72], [1.5, 2.2, 1.72], 8, .06);
  box(g, [2.4, .6, .18], P.cream, [0, 3.0, -.2]); box(g, [2.5, .08, .22], P.gold, [0, 3.32, -.2]); box(g, [1.8, .2, .2], awning, [0, 3.0, -.1]);
  for (const x of [-1.35, 1.35]) beam(g, [x, 1.2, 1.62], [x, 2.55, 1.62], .045, P.gold, 4);
  top(g); return g;
}
export function stallFood() { return kiosk(P.coral, P.coral, g => { cyl(g, .58, .17, P.gold, [0, 3.65, 0], .58, 14); cyl(g, .61, .14, P.darkwood, [0, 3.55, 0], .61, 14); cyl(g, .62, .05, P.leaf, [0, 3.62, 0], .62, 14); cyl(g, .58, .14, P.gold, [0, 3.43, 0], .58, 14); ball(g, .5, P.gold, [0, 3.72, 0], 1).scale.set(1.15, .35, 1.15); }, { wares: g => { for (const x of [-.8, 0, .8]) cyl(g, .18, .12, P.gold, [x, 1.3, 1.45], .2, 8); } }); }
export function stallDrink() { return kiosk(P.teal, P.teal, g => { cyl(g, .35, .75, P.blue, [0, 3.75, 0], .46, 12); cyl(g, .47, .06, P.cream, [0, 4.13, 0], .47, 12); beam(g, [.1, 4.1, 0], [.3, 4.7, 0], .045, P.coral); box(g, [.9, .12, .14], P.cream, [0, 3.6, .38]); }, { wares: g => { for (const x of [-.8, -.3, .2, .7]) cyl(g, .1, .3, x > 0 ? P.coral : P.blue, [x, 1.4, 1.45], .12, 8); } }); }
export function stallSouvenir() { return kiosk(P.pink, P.pink, g => { ball(g, .43, P.pink, [0, 3.7, 0]); for (const x of [-.33, .33]) ball(g, .2, P.pink, [x, 4, 0]); box(g, [.9, .16, .2], P.gold, [0, 3.7, 0]); box(g, [.16, .9, .2], P.gold, [0, 3.7, .01]); }, { wares: g => { for (const x of [-.9, -.3, .3, .9]) ball(g, .16, [P.gold, P.teal, P.coral, P.mint][Math.round(x * 2 + 2) % 4], [x, 1.4, 1.45], 0); } }); }
export function stallPizza() {
  return kiosk(P.gold, P.red, g => {
    const s = new T.Shape(); s.moveTo(0, -1.0); s.lineTo(.75, .55); s.quadraticCurveTo(0, .85, -.75, .55); s.closePath();
    const slice = group(g, [0, 3.85, 0]); slice.rotation.x = -.35;
    mesh(slice, new T.ExtrudeGeometry(s, { depth: .14, bevelEnabled: false, curveSegments: 6 }), P.yellow, [0, 0, -.07]);
    tube(slice, [V(-.75, .55, 0), V(-.4, .72, 0), V(0, .8, 0), V(.4, .72, 0), V(.75, .55, 0)], .13, P.orange, false, 6);
    for (const [x, y] of [[0, .3], [-.3, .1], [.28, .05], [0, -.35], [-.15, .55], [.35, .45]]) cyl(slice, .12, .04, P.red, [x, y, .08], .12, 8).rotation.x = PI / 2;
    beam(g, [0, 3.3, -.2], [0, 3.6, 0], .05, P.cream, 4);
  }, { wares: g => { for (const x of [-.7, .7]) cyl(g, .32, .04, P.yellow, [x, 1.27, 1.45], .32, 12); } });
}
export function stallCoffee() {
  return kiosk(P.darkwood, P.teal, g => {
    cyl(g, .55, .8, P.white, [0, 3.85, 0], .45, 14); cyl(g, .5, .04, P.darkwood, [0, 4.26, 0], .5, 14); ring(g, .22, .07, P.white, [.6, 3.85, 0], [0, 0, 0], 10, 4);
    cyl(g, .85, .08, P.white, [0, 3.42, 0], .7, 16); ball(g, .14, P.cream, [-.1, 4.55, 0], 0); ball(g, .12, P.cream, [.08, 4.85, 0], 0); ball(g, .1, P.cream, [-.05, 5.12, 0], 0);
  }, { wares: g => { box(g, [.6, .5, .4], P.chrome, [-.8, 1.5, 1.4], [0, 0, 0], { metal: .5 }); for (const x of [.3, .7]) cyl(g, .08, .16, P.white, [x, 1.32, 1.45], .1, 8); } });
}
export function stallIcecream() {
  const g = new T.Group(); deckRect(g, 3.5, 3.5, .2, 0, 0, '#e5ccaa');
  // cart on wheels with a striped parasol and a giant cone
  box(g, [2.4, 1.0, 1.3], P.mint, [0, 1.0, .2]); box(g, [2.5, .12, 1.4], P.cream, [0, 1.55, .2]); box(g, [2.0, .5, .05], P.pink, [0, 1.0, .87]);
  for (let i = 0; i < 4; i++) { cyl(g, .16, .1, [P.pink, P.cream, P.gold, P.mint][i], [-.75 + i * .5, 1.62, .2], .16, 8); }
  for (const x of [-.9, .9]) { wheel(g, [x, .4, .9], .38, .12, P.coral); wheel(g, [x, .4, -.5], .38, .12, P.coral); }
  beam(g, [1.2, .9, .2], [1.75, .9, .2], .04, P.chrome, 4);
  beam(g, [-.6, 1.6, -.2], [-.6, 3.0, -.2], .04, P.cream, 4); stripedCone(g, 1.1, .5, 2.95, 10, P.pink, P.cream, -.6, -.2);
  // giant cone sign on a post
  beam(g, [.8, 1.6, -.25], [.8, 2.6, -.25], .06, P.gold, 4);
  mesh(g, new T.ConeGeometry(.45, 1.2, 10), P.orange, [.8, 3.0, -.25], [PI, 0, 0]);
  ball(g, .45, P.pink, [.8, 3.65, -.25], 1); ball(g, .38, P.cream, [.8, 4.1, -.25], 1); ball(g, .1, P.red, [.8, 4.5, -.25], 0);
  box(g, [.5, .7, .4], P.chrome, [-1.4, .55, 1.3], [0, 0, 0], { metal: .4 }); signBoard(g, [0, .45, 1.7], 1.6, .4, P.pink, { bulbs: false });
  return g;
}
export function stallBalloon() {
  const g = new T.Group(); deckRect(g, 3.5, 3.5, .2, 0, 0, '#e5ccaa');
  box(g, [1.6, .8, 1.0], P.coral, [0, .8, .4]); box(g, [1.7, .1, 1.1], P.gold, [0, 1.25, .4]);
  for (const x of [-.7, .7]) wheel(g, [x, .4, .95], .35, .1, P.cream);
  beam(g, [.8, 1.0, .4], [1.4, 1.1, .4], .04, P.chrome, 4); cyl(g, .5, .7, P.blue, [-1.0, .55, -1.0], .5, 10); cyl(g, .52, .1, P.gold, [-1.0, .95, -1.0], .52, 10);
  const cols = [P.red, P.gold, P.teal, P.pink, P.blue, P.coral, P.mint, P.yellow, P.purple];
  const anchor = V(0, 1.3, .4);
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * PI * 2, r = i % 3 === 0 ? .3 : .75, p = V(Math.cos(a) * r, 3.2 + (i % 3) * .45 + (i === 0 ? .6 : 0), .2 + Math.sin(a) * r);
    beam(g, anchor, p.clone().add(V(0, -.4, 0)), .012, P.cream, 3); const b = ball(g, .38, cols[i], p.toArray(), 1); b.scale.set(1, 1.2, 1);
  }
  signBoard(g, [0, .8, .92], 1.2, .35, P.cream, { bulbs: false, stripe: P.red });
  return g;
}

// ---- facilities ----
function figureIcon(g, x, y, z, dress) {
  ball(g, .09, P.white, [x, y + .3, z], 0);
  if (dress) mesh(g, new T.ConeGeometry(.16, .34, 6), P.white, [x, y, z]); else box(g, [.2, .34, .04], P.white, [x, y, z]);
}
export function facToilet() {
  const g = new T.Group(); deckRect(g, 3.6, 3.6, .2, 0, 0, P.stone);
  box(g, [3.2, 2.4, 2.6], P.cream, [0, 1.4, -.3]); box(g, [3.3, .2, 2.7], P.teal, [0, .3, -.3]);
  const s = new T.Shape(); s.moveTo(-1.85, 0); s.lineTo(1.85, 0); s.lineTo(0, 1.1); s.closePath();
  mesh(g, new T.ExtrudeGeometry(s, { depth: 3.0, bevelEnabled: false }), P.teal, [0, 2.6, -1.8]);
  box(g, [.5, .7, .5], P.cream, [0, 3.6, -.3]);
  for (const [x, col, dress] of [[-.8, P.blue, false], [.8, P.coral, true]]) {
    box(g, [.9, 1.8, .08], col, [x, 1.1, 1.02]); box(g, [1.05, .1, .12], P.gold, [x, 2.05, 1.04]);
    cyl(g, .28, .05, col, [x, 2.4, 1.05], .28, 12).rotation.x = PI / 2; figureIcon(g, x, 2.33, 1.09, dress);
    ball(g, .05, P.gold, [x + .3, 1.1, 1.08], 0);
  }
  box(g, [.08, 2.0, .3], P.teal, [0, 1.2, 1.05]);
  for (const x of [-1.3, 1.3]) shrub(g, x * 1.1, 1.5, .35);
  box(g, [.8, .3, .2], P.glass, [-.9, 2.2, -1.6]); box(g, [.8, .3, .2], P.glass, [.9, 2.2, -1.6]);
  return g;
}
export function facInfo() {
  const g = new T.Group(); deckRect(g, 3.6, 3.6, .2, 0, 0, P.stone);
  cyl(g, 1.0, 2.0, P.blue, [-.4, 1.2, -.4], 1.0, 8); box(g, [1.2, .7, .06], P.glass, [-.4, 1.5, .55]); cyl(g, 1.1, .12, P.cream, [-.4, 1.25, -.4], 1.1, 8);
  cyl(g, 1.25, .2, P.gold, [-.4, 2.3, -.4], 1.25, 8); mesh(g, new T.ConeGeometry(1.35, .9, 8), P.coral, [-.4, 2.85, -.4]); ball(g, .15, P.gold, [-.4, 3.4, -.4], 0);
  // big "i" sign on a pole
  beam(g, [1.2, .2, -1.1], [1.2, 3.4, -1.1], .07, P.chrome, 6, { metal: .5 });
  cyl(g, .55, .1, P.blue, [1.2, 3.6, -1.05], .55, 16).rotation.x = PI / 2; ring(g, .55, .04, P.white, [1.2, 3.6, -.99], [0, 0, 0], 16, 4);
  box(g, [.14, .45, .06], P.white, [1.2, 3.5, -.98]); ball(g, .08, P.white, [1.2, 3.85, -.98], 0);
  // map board
  const M = group(g, [.7, 0, 1.3], -.3);
  for (const x of [-.8, .8]) beam(M, [x, .2, 0], [x, 1.8, 0], .05, P.darkwood, 4);
  box(M, [1.8, 1.1, .08], P.cream, [0, 1.3, 0]); box(M, [1.9, .08, .12], P.gold, [0, 1.88, 0]);
  for (const [x, y, w, h, c] of [[-.4, 1.45, .6, .4, P.leaf], [.35, 1.5, .5, .3, P.blue], [-.1, 1.05, .9, .25, P.mint], [.55, 1.05, .3, .3, P.coral]]) box(M, [w, h, .02], c, [x, y, .05]);
  ball(M, .05, P.red, [.1, 1.25, .07], 0);
  return g;
}
export function facFirstaid() {
  const g = new T.Group(); deckRect(g, 3.6, 3.6, .2, 0, 0, P.stone);
  box(g, [3.0, 2.3, 2.6], P.white, [0, 1.35, -.3]); box(g, [3.1, .15, 2.7], P.red, [0, .28, -.3]);
  const s = new T.Shape(); s.moveTo(-1.75, 0); s.lineTo(1.75, 0); s.lineTo(0, .9); s.closePath();
  mesh(g, new T.ExtrudeGeometry(s, { depth: 2.9, bevelEnabled: false }), P.red, [0, 2.5, -1.75]);
  // red cross on the roof gable and over the door
  box(g, [.9, .3, .06], P.white, [0, 2.85, 1.16]); box(g, [.3, .9, .06], P.white, [0, 2.85, 1.16]);
  box(g, [1.0, 1.0, .06], P.white, [0, 2.85, 1.15]); box(g, [.8, .25, .08], P.red, [0, 2.85, 1.19]); box(g, [.25, .8, .08], P.red, [0, 2.85, 1.19]);
  box(g, [1.0, 1.9, .08], P.mint, [-.5, 1.15, 1.02]); box(g, [1.1, .1, .1], P.gold, [-.5, 2.15, 1.04]);
  box(g, [.8, .6, .06], P.glass, [.85, 1.5, 1.02]); box(g, [.9, .08, .1], P.white, [.85, 1.17, 1.06]);
  beam(g, [1.1, 0, 1.5], [1.1, 2.4, 1.5], .05, P.chrome, 4); box(g, [.7, .7, .06], P.white, [1.1, 2.4, 1.52]); box(g, [.5, .15, .08], P.red, [1.1, 2.4, 1.56]); box(g, [.15, .5, .08], P.red, [1.1, 2.4, 1.56]);
  box(g, [1.2, .4, .5], P.cream, [-1.0, .45, 1.6]);
  return g;
}

// ---- scenery ----
export function statue() {
  const g = new T.Group();
  box(g, [2.6, .3, 2.6], P.stone, [0, .15, 0]); box(g, [1.9, .3, 1.9], P.stone, [0, .45, 0]); box(g, [1.3, 1.2, 1.3], P.cream, [0, 1.2, 0]);
  box(g, [1.45, .15, 1.45], P.stone, [0, 1.85, 0]); box(g, [.8, .3, .04], P.gold, [0, 1.25, .67]);
  const S = '#c8c1b1', f = group(g, [0, 1.92, 0]);
  for (const x of [-.15, .15]) box(f, [.22, .9, .26], S, [x, .45, 0]);
  const t = mesh(f, new T.CylinderGeometry(.3, .25, .75, 8), S, [0, 1.25, 0]); t.scale.set(1, 1, .7);
  beam(f, [-.38, 1.55, 0], [-.42, .95, .05], .09, S); beam(f, [.38, 1.55, 0], [.55, 2.25, .1], .09, S); ball(f, .1, S, [.58, 2.35, .1], 0);
  mesh(f, new T.ConeGeometry(.12, .3, 6), P.gold, [.6, 2.55, .1]); ball(f, .1, P.glow, [.6, 2.75, .1], 0);
  ball(f, .21, S, [0, 1.85, 0], 1); mesh(f, new T.CylinderGeometry(.32, .45, .9, 8, 1, true), S, [0, .75, -.05], [0, 0, 0], { double: true });
  for (const [x, z] of [[-1.1, 1.1], [1.1, 1.1], [-1.1, -1.1], [1.1, -1.1]]) shrub(g, x, z, .3);
  return g;
}
export function hedge() {
  const g = new T.Group();
  box(g, [3.9, .25, 1.0], P.stone, [0, .12, 0]); box(g, [3.7, 1.3, .8], P.hedge, [0, .9, 0]);
  for (let i = 0; i < 5; i++) ball(g, .45, i % 2 ? P.leaf : P.hedge, [-1.5 + i * .75, 1.55, 0], 1).scale.set(1, .6, .9);
  for (const x of [-1.85, 1.85]) { box(g, [.3, 1.0, 1.05], P.cream, [x, .5, 0]); ball(g, .14, P.gold, [x, 1.1, 0], 0); }
  return g;
}
export function arch() {
  const g = new T.Group();
  for (const x of [-1.55, 1.55]) {
    box(g, [.7, .3, .7], P.stone, [x, .15, 0]); box(g, [.5, 3.2, .5], P.cream, [x, 1.9, 0]); box(g, [.6, .2, .6], P.gold, [x, 3.55, 0]);
    for (let y = .8; y < 3.4; y += .5) { ball(g, .07, P.gold, [x, y, .27], 0); ball(g, .07, P.gold, [x, y, -.27], 0); }
    pennant(g, x, 4.4, 0, x < 0 ? P.coral : P.teal, 1.0, x < 0 ? 1 : -1);
  }
  ring(g, 1.55, .18, P.coral, [0, 3.6, 0], [0, 0, 0], 20, 6).geometry = new T.TorusGeometry(1.55, .18, 6, 20, PI);
  for (let i = 0; i <= 10; i++) { const a = i / 10 * PI; ball(g, .08, i % 2 ? P.gold : P.cream, [Math.cos(a) * 1.55, 3.6 + Math.sin(a) * 1.55, .2], 0); }
  signBoard(g, [0, 4.0, .05], 2.4, .6, P.teal, { stripe: P.gold });
  return g;
}
export function flagpole() {
  const g = new T.Group();
  box(g, [1.4, .3, 1.4], P.stone, [0, .15, 0]); box(g, [.9, .4, .9], P.cream, [0, .5, 0]); box(g, [.6, .1, .04], P.gold, [0, .5, .46]);
  beam(g, [0, .7, 0], [0, 8.5, 0], .07, P.chrome, 8, { metal: .5 }); ball(g, .14, P.gold, [0, 8.6, 0], 1);
  const s = new T.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(.8, .12, 1.6, -.05); s.lineTo(1.3, -.45); s.lineTo(1.6, -.85); s.quadraticCurveTo(.8, -.8, 0, -.9); s.closePath();
  mesh(g, new T.ShapeGeometry(s), P.coral, [.07, 8.4, 0], [0, 0, 0], { double: true });
  const st = new T.Shape(); st.moveTo(0, -.32); st.lineTo(1.45, -.35); st.lineTo(1.45, -.52); st.lineTo(0, -.55); st.closePath();
  mesh(g, new T.ShapeGeometry(st), P.cream, [.07, 8.4, .01], [0, 0, 0], { double: true });
  return g;
}

// ---- paths ----
export function pathQueue() {
  const g = new T.Group(); box(g, [3.96, .12, 3.96], P.wood, [0, .06, 0]);
  for (let i = 0; i < 6; i++) box(g, [3.8, .05, .58], i % 2 ? '#cfe3df' : '#b7d3cf', [0, .15, -1.65 + i * .66]);
  for (const x of [-1.72, 1.72]) {
    for (const z of [-1.9, -.65, .65, 1.9]) { cyl(g, .05, 1.0, P.chrome, [x, .66, z], .05, 8, { metal: .6 }); cyl(g, .1, .05, P.chrome, [x, .18, z], .1, 8, { metal: .6 }); }
    for (const y of [.65, 1.12]) beam(g, [x, y, -1.95], [x, y, 1.95], .035, P.chrome, 6, { metal: .6 });
  }
  return g;
}
function gateway(color, exit) {
  const g = new T.Group(); deckRect(g, 3.9, 3.9, .14, 0, 0, '#e5ccaa');
  for (const x of [-1.6, 1.6]) { box(g, [.4, 3.0, .4], P.cream, [x, 1.6, 0]); box(g, [.5, .15, .5], P.gold, [x, 3.15, 0]); ball(g, .14, P.gold, [x, 3.35, 0], 0); }
  box(g, [3.6, .2, .5], P.teal, [0, 3.0, 0]);
  signBoard(g, [0, 2.55, .2], 2.4, .7, color, { stripe: P.cream });
  if (!exit) {
    box(g, [1.0, 1.9, 1.0], P.coral, [-1.0, 1.1, -1.2]); box(g, [.6, .5, .06], P.glass, [-1.0, 1.4, -.68]); cyl(g, .75, .4, P.gold, [-1.0, 2.25, -1.2], .1, 4);
    for (const z of [-.2]) { cyl(g, .12, .9, P.chrome, [.4, .6, z], .12, 8, { metal: .5 }); for (let i = 0; i < 3; i++) { const a = i / 3 * PI * 2; beam(g, [.4, .95, z], [.4 + Math.cos(a) * .45, .95, z + Math.sin(a) * .45], .03, P.chrome, 4); } }
    for (const z of [-1.9, 1.9]) { /* queue rails leading in */ }
    railing(g, [[-.4, -1.9], [-.4, 1.9]], .14, P.chrome, .9, 1.3, P.chrome);
  } else {
    for (const x of [-.55, .55]) { box(g, [.95, .9, .06], P.chrome, [x, .65, -.5], [0, x * .6, 0], { metal: .5 }); }
    railing(g, [[-1.4, -1.9], [-1.4, -.6]], .14, P.chrome, .9, 1.3, P.chrome); railing(g, [[1.4, -1.9], [1.4, -.6]], .14, P.chrome, .9, 1.3, P.chrome);
  }
  bulbLine(g, [-1.4, 3.18, .27], [1.4, 3.18, .27], 10, .06);
  return g;
}
export const rideEntrance = () => gateway(P.green, false);
export const rideExit = () => gateway(P.red, true);

// ---- staff (about 1.8 m, origin at the feet, facing +Z) ----
export function staffHandyman() {
  const g = humanoid({ legs: P.green, top: P.green, sleeve: P.cream, skin: '#d9a582' });
  box(g, [.36, .3, .05], P.green, [0, 1.38, .2]); for (const x of [-.12, .12]) beam(g, [x, 1.25, .2], [x, 1.6, .15], .03, P.gold, 3);
  cyl(g, .23, .1, P.gold, [0, 2.02, 0], .2, 10); cyl(g, .3, .03, P.gold, [0, 1.98, .05], .3, 10);
  beam(g, [.42, .15, .3], [.42, 1.6, .1], .03, P.wood, 4); box(g, [.5, .12, .14], P.gold, [.42, .1, .32]);
  for (let i = 0; i < 5; i++) beam(g, [.25 + i * .085, .05, .33], [.25 + i * .085, .16, .32], .012, P.darkwood, 3);
  return g;
}
export function staffMechanic() {
  const g = humanoid({ legs: P.navy, top: P.blue, sleeve: P.blue, skin: '#b07a58' });
  box(g, [.52, .06, .32], P.gold, [0, .96, 0]); box(g, [.14, .1, .03], P.white, [.12, 1.45, .2]);
  cyl(g, .22, .14, P.blue, [0, 1.99, -.02], .2, 10); box(g, [.3, .04, .2], P.blue, [0, 1.94, .2]);
  box(g, [.5, .3, .24], P.red, [.45, .5, .05]); beam(g, [.32, .72, .05], [.58, .72, .05], .03, P.chrome, 4); beam(g, [.42, .66, .05], [.42, .98, .05], .02, P.chrome, 3);
  beam(g, [-.42, 1.0, .05], [-.45, .55, .2], .03, P.chrome, 4);
  return g;
}
export function staffEntertainer() {
  const g = new T.Group(), fur = P.cream, patch = P.ink;
  for (const x of [-.15, .15]) { box(g, [.26, .7, .3], patch, [x, .4, 0]); box(g, [.3, .14, .4], P.coral, [x, .07, .05]); }
  const body = ball(g, .45, P.coral, [0, 1.05, 0], 1); body.scale.set(1, 1.1, .85); ball(g, .3, fur, [0, 1.0, .3], 1).scale.set(1, 1.2, .55);
  for (const x of [-.46, .46]) { beam(g, [x, 1.3, 0], [x * 1.25, .85, .1], .12, patch); ball(g, .13, patch, [x * 1.27, .78, .1], 0); }
  ball(g, .48, fur, [0, 1.85, 0], 1);
  for (const x of [-.32, .32]) { ball(g, .15, patch, [x, 2.25, -.02], 1); ball(g, .12, patch, [x * .5, 1.92, .4], 0).scale.set(1, 1.3, .5); ball(g, .045, P.white, [x * .5, 1.94, .45], 0); }
  ball(g, .14, fur, [0, 1.74, .42], 0); ball(g, .06, patch, [0, 1.78, .55], 0);
  box(g, [.9, .1, .1], P.gold, [0, 1.42, .1], [0, 0, .1]); ball(g, .1, P.gold, [0, 1.38, .35], 0);
  cyl(g, .14, .3, P.teal, [.18, 2.4, 0], .1, 8); cyl(g, .2, .04, P.teal, [.18, 2.26, 0], .2, 8);
  return g;
}
export function staffSecurity() {
  const g = humanoid({ legs: P.navy, top: P.navy, sleeve: P.navy, skin: '#8a5a40', shoes: '#14181a' });
  box(g, [.52, .07, .32], P.ink, [0, .96, 0]); ball(g, .05, P.gold, [.13, 1.48, .2], 0); box(g, [.5, .05, .04], P.gold, [0, 1.58, .16]);
  cyl(g, .22, .16, P.navy, [0, 2.0, 0], .24, 10); box(g, [.32, .04, .2], P.ink, [0, 1.94, .22]); ball(g, .045, P.gold, [0, 2.03, .22], 0);
  box(g, [.08, .2, .06], P.ink, [-.3, 1.0, .12]);
  return g;
}
