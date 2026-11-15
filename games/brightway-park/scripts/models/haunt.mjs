// The haunt's own pieces: headstones, iron railings, gas lanterns and the scare props.
// Native three.js geometry graded through the kit's night palette; no images, no external meshes.
import { T, P, box, cyl, ball, ring, beam, group, mesh } from './core.mjs';

const PI = Math.PI;

function headstone(g, x, z, h, rot, kind) {
  const s = group(g, [x, 0, z], rot);
  if (kind === 'cross') {
    box(s, [.22, h, .18], P.stone, [0, h / 2, 0]); box(s, [.8, .2, .18], P.stone, [0, h * .72, 0]);
  } else {
    box(s, [.8, h - .3, .2], P.stone, [0, (h - .3) / 2, 0]);
    mesh(s, new T.CylinderGeometry(.4, .4, .2, 14, 1, false, 0, PI), P.stone, [0, h - .3, 0], [PI / 2, PI / 2, 0]);
    box(s, [.5, .06, .03], P.grey, [0, h * .55, .11]); box(s, [.36, .05, .03], P.grey, [0, h * .43, .11]);
  }
  box(s, [1.0, .12, .5], P.rock, [0, .06, .05]);
  // A tilt the years gave it.
  s.rotation.z = (x - z) * .06;
}

/** Two headstones and a cross on a heaped grave, a candle guttering at the foot. */
export function gravestone() {
  const g = new T.Group();
  cyl(g, 1.75, .24, P.moss, [0, .12, .1], 1.35, 18);
  headstone(g, -.85, -.6, 1.25, .12, 'stone'); headstone(g, .7, -.4, 1.05, -.18, 'stone'); headstone(g, .05, .9, 1.4, .05, 'cross');
  cyl(g, .07, .3, P.bone, [.55, .32, .55], .07, 8); ball(g, .07, P.glow, [.55, .52, .55], 0);
  return g;
}

/** A run of spiked iron railing the width of a cell, two posts with finials. */
export function ironFence() {
  const g = new T.Group();
  for (const x of [-1.85, 1.85]) { box(g, [.22, 1.7, .22], P.iron, [x, .85, 0]); ball(g, .14, P.iron, [x, 1.78, 0], 0); }
  for (const y of [.35, 1.35]) box(g, [3.7, .07, .07], P.iron, [0, y, 0], [0, 0, 0], { metal: .5 });
  for (let i = 0; i < 9; i++) {
    const x = -1.5 + i * .375;
    beam(g, [x, .1, 0], [x, 1.5, 0], .03, P.iron, 5);
    mesh(g, new T.ConeGeometry(.07, .22, 4), P.iron, [x, 1.6, 0]);
  }
  return g;
}

/** A crooked gas lantern: an iron post, a brass cage and a flame that lights the path amber. */
export function gasLantern() {
  const g = new T.Group(); cyl(g, .32, .16, P.iron, [0, .08, 0], .36, 10);
  beam(g, [0, .1, 0], [.08, 3.4, 0], .08, P.iron); beam(g, [.08, 3.3, 0], [.55, 3.55, 0], .05, P.iron);
  const cage = group(g, [.6, 3.0, 0]);
  box(cage, [.42, .06, .42], P.gold, [0, .0, 0]); box(cage, [.5, .06, .5], P.gold, [0, .62, 0]);
  for (const [x, z] of [[-.2, -.2], [.2, -.2], [-.2, .2], [.2, .2]]) beam(cage, [x, 0, z], [x * 1.15, .6, z * 1.15], .025, P.gold, 4);
  box(cage, [.3, .44, .3], P.glow, [0, .31, 0]);
  mesh(cage, new T.ConeGeometry(.36, .3, 4), P.iron, [0, .82, 0], [0, PI / 4, 0]);
  return g;
}

/** Great-Aunt Agatha on an easel: a gilt frame, a dark portrait and two eyes that glow. */
export function portrait() {
  const g = new T.Group();
  for (const [x, z] of [[-.7, .35], [.7, .35]]) beam(g, [x, 0, z], [x * .4, 2.6, -.05], .06, P.darkwood, 5);
  beam(g, [0, 0, -.8], [0, 2.4, -.1], .06, P.darkwood, 5);
  box(g, [1.3, .08, .3], P.darkwood, [0, .9, .2]);
  const frame = group(g, [0, 1.75, .12]); frame.rotation.x = -.12;
  box(frame, [1.5, 1.85, .14], P.gold, [0, 0, 0]); box(frame, [1.22, 1.55, .06], P.plum, [0, 0, .06]);
  const head = ball(frame, .3, P.bone, [0, .2, .1], 1); head.scale.set(.85, 1.05, .4);
  box(frame, [.7, .6, .04], P.ink, [0, -.4, .1]);
  for (const x of [-.11, .11]) ball(frame, .05, P.spirit, [x, .25, .2], 0);
  return g;
}

/** A cold spot: a frost-cracked disc on the path, ice shards and a faint spectral glow at its heart. */
export function coldSpot() {
  const g = new T.Group();
  cyl(g, 1.7, .05, P.waterEdge, [0, .03, 0], 1.7, 28);
  ring(g, 1.45, .04, P.spirit, [0, .07, 0], [PI / 2, 0, 0], 40, 4);
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * PI * 2, r = .6 + (i % 3) * .35, h = .35 + (i % 4) * .18;
    const shard = mesh(g, new T.ConeGeometry(.12, h, 4), P.foam, [Math.cos(a) * r, h / 2 + .04, Math.sin(a) * r]);
    shard.rotation.set(Math.sin(a) * .35, a, Math.cos(a) * .35);
  }
  ball(g, .22, P.spirit, [0, .28, 0], 1);
  return g;
}

/** Jack-in-the-Coffin: an upright coffin with a crank, the lid ajar on a spring and a grin inside. */
export function jackCoffin() {
  const g = new T.Group();
  box(g, [1.6, .2, 1.2], P.darkwood, [0, .1, 0]);
  const shape = new T.Shape([[-.35, 0], [.35, 0], [.5, 1.5], [.3, 2.1], [-.3, 2.1], [-.5, 1.5]].map(([x, y]) => new T.Vector2(x, y)));
  const body = mesh(g, new T.ExtrudeGeometry(shape, { depth: .5, bevelEnabled: false }), P.wood, [0, .2, -.35]);
  body.castShadow = true;
  box(g, [.62, 1.8, .04], P.plum, [0, 1.25, .16]);
  // The lid, sprung open on its hinge.
  const lid = mesh(g, new T.ExtrudeGeometry(shape, { depth: .08, bevelEnabled: false }), P.wood, [.52, .2, .2]);
  lid.rotation.y = -1.1;
  // The grin on its spring.
  beam(g, [0, .6, .1], [0, 1.4, .25], .04, P.chrome, 5);
  ball(g, .28, P.bone, [0, 1.6, .3], 1);
  for (const x of [-.1, .1]) ball(g, .05, P.spirit, [x, 1.66, .55], 0);
  box(g, [.26, .05, .04], P.red, [0, 1.48, .55]);
  // The crank.
  beam(g, [.5, 1.0, -.1], [.75, 1.0, -.1], .04, P.gold, 5); beam(g, [.75, 1.0, -.1], [.75, .7, -.1], .035, P.gold, 5); ball(g, .07, P.red, [.75, .68, -.1], 0);
  return g;
}

/** The flickering lamp: a bent iron standard with a cracked globe of spectral teal. */
export function flickerLamp() {
  const g = new T.Group(); cyl(g, .38, .2, P.iron, [0, .1, 0], .44, 10);
  const post = beam(g, [0, .1, 0], [.25, 3.6, .1], .09, P.iron); post.castShadow = true;
  beam(g, [.25, 3.5, .1], [.75, 3.85, .1], .06, P.iron);
  ball(g, .32, P.spirit, [.85, 3.6, .1], 1);
  ring(g, .32, .035, P.iron, [.85, 3.6, .1], [PI / 2, 0, 0], 16, 4);
  mesh(g, new T.ConeGeometry(.36, .3, 6), P.iron, [.85, 3.98, .1]);
  return g;
}

/**
 * A cell of sea-weathered boardwalk: tarred joists, then silvered planks laid across with gaps,
 * each a little warped, one in a few split short or missing a corner. Tiles end to end into a pier.
 */
export function boardwalk(queue = false) {
  const g = new T.Group();
  for (const x of [-1.5, 0, 1.5]) box(g, [.22, .1, 3.96], P.joist, [x, .05, 0]);
  box(g, [3.96, .04, 3.96], P.joist, [0, .02, 0]);
  const n = 8, pitch = 3.96 / n;
  for (let i = 0; i < n; i++) {
    const z = -1.98 + pitch * (i + .5);
    const warp = Math.sin(i * 2.7) * .025, tilt = Math.sin(i * 5.1) * .02;
    const color = (i * 7) % 3 === 0 ? P.plankDark : P.plank;
    if (!queue && i % 5 === 3) {
      // A split plank: two short boards with a gap where one rotted through.
      box(g, [2.1, .06, pitch - .07], color, [-.9, .13 + warp, z], [tilt, 0, 0]);
      box(g, [1.3, .06, pitch - .07], color, [1.3, .12, z], [0, .03, tilt]);
    } else box(g, [3.92, .06, pitch - .07], color, [0, .13 + warp, z], [tilt, 0, 0]);
    // Nail heads at the joists.
    for (const x of [-1.5, 0, 1.5]) box(g, [.05, .015, .05], P.iron, [x, .165 + warp, z]);
  }
  return g;
}

/** The paranormal TV crew's van: a boxy white van with a roof dish, a light bar and a crooked logo stripe. */
export function tvVan() {
  const g = new T.Group();
  box(g, [5.2, 2.2, 2.2], P.white, [0, 1.5, 0]);
  box(g, [1.4, 1.5, 2.2], P.white, [2.9, 1.15, 0]);
  box(g, [.9, .8, 2.1], P.glass, [3.2, 1.6, 0]);
  box(g, [5.2, .35, 2.24], P.purple, [0, 1.5, 0]);
  box(g, [2.4, .3, 2.26], P.spirit, [-.6, 2.1, 0]);
  for (const x of [-1.8, 2.6]) for (const z of [-1.05, 1.05]) cyl(g, .42, .3, P.tyre, [x, .42, z], .42, 12).rotation.x = PI / 2;
  cyl(g, .08, .5, P.grey, [-1.2, 2.85, 0], .08, 6);
  const dish = mesh(g, new T.SphereGeometry(.7, 12, 6, 0, PI * 2, 0, PI / 2.6), P.chrome, [-1.2, 3.2, 0], [-.9, 0, 0], { double: true });
  dish.scale.set(1, .45, 1);
  for (const z of [-.6, 0, .6]) ball(g, .12, z === 0 ? P.spirit : P.red, [1.2, 2.72, z], 0);
  return g;
}
