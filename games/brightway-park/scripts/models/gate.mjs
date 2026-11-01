// The park gate: two bevelled teal pillars with gold finials, coral ticket booths under striped awnings and a gold lintel.
import { T, P, box, ball, group, mesh, bunting, bulbLine } from './core.mjs';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const bevelled = (g, size, color, pos, radius = .1) => mesh(g, new RoundedBoxGeometry(size[0], size[1], size[2], 3, radius), color, pos);

function booth(parent, x) {
  const g = group(parent, [x, 0, 0]);
  bevelled(g, [2, 2.4, 2.4], P.coral, [0, 1.2, 0], .14);
  box(g, [1.4, .8, .06], P.blue, [0, 1.65, 1.22]);
  box(g, [1.7, .12, .5], P.cream, [0, 1.05, 1.4]);
  for (let i = 0; i < 6; i++) box(g, [.34, .1, 1.5], i % 2 ? P.coral : P.cream, [-.85 + i * .34 + .17, 2.62, .4], [.2, 0, 0]);
  for (let i = 0; i < 6; i++) box(g, [.34, .3, .06], i % 2 ? P.coral : P.cream, [-.85 + i * .34 + .17, 2.4, 1.14]);
  return g;
}

/** Origin at the gate's centre on the ground, facing +Z; pillars at x = ±6. */
export function gate() {
  const g = new T.Group();
  for (const x of [-6, 6]) {
    bevelled(g, [.8, 4.6, .8], P.teal, [x, 2.3, 0], .12);
    bevelled(g, [1.05, .3, 1.05], P.gold, [x, .15, 0], .08);
    bevelled(g, [1.05, .3, 1.05], P.gold, [x, 4.5, 0], .08);
    ball(g, .42, P.gold, [x, 4.95, 0], 2);
    booth(g, x);
  }
  bevelled(g, [12.8, .4, .5], P.gold, [0, 4.2, 0], .1);
  for (let i = 0; i < 12; i++) box(g, [.5, .12, .52], i % 2 ? P.coral : P.cream, [-5.5 + i, 4.46, 0]);
  bulbLine(g, [-5.4, 3.9, .3], [5.4, 3.9, .3], 14, .08);
  bunting(g, [-5.6, 4.0, .4], [5.6, 4.0, .4], 14);
  return g;
}
