// Original Brightway Park geometry. Run from brightway-park with `bun run author-models`.
// No external artwork or source models are used in these meshes. The model kit lives in scripts/models/.
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { T, P, bake, vertices, triangles } from './models/core.mjs';
import * as L from './models/legacy.mjs';
import * as G from './models/gentle.mjs';
import * as H from './models/thrill.mjs';
import * as W from './models/water.mjs';
import * as R from './models/transport.mjs';
import * as C from './models/coasters.mjs';
import * as S from './models/shops.mjs';

// GLTFExporter uses this browser interface to package buffers, without images.
globalThis.FileReader = class {
  async readAsArrayBuffer(blob) { this.result = await blob.arrayBuffer(); this.onloadend?.(); }
  async readAsDataURL(blob) { this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`; this.onloadend?.(); }
};
const out = new URL('../public/art/models/', import.meta.url);
await mkdir(out, { recursive: true });

const models = {}, footprint = {}, motion = {}, motionParts = {};
const add = (name, g, side) => { models[name] = g; footprint[name] = side; };
// A ride's moving part: its own GLB whose origin is the pivot, listed in motion.json.
const moving = (name, g, spec) => { const { ride, ...rest } = spec; models[name] = g; motionParts[name] = ride; motion[ride] = { model: name, ...rest }; };

// gentle
add('ride_carousel', L.carousel(moving), 8); add('ride_teacups', G.teacups(moving), 8); add('ride_helter', G.helter(), 8);
add('ride_ferris', L.ferris(moving), 12); add('ride_haunted', G.haunted(), 12); add('ride_vintage', G.vintage(), 12);
add('ride_obs', G.obs(moving), 8); add('ride_maze', G.maze(), 12);
// thrill
add('ride_bumper', H.bumper(), 12); add('ride_swings', H.swings(moving), 12); add('ride_pirate', H.pirate(moving), 12);
add('ride_topspin', H.topspin(moving), 8); add('ride_enterprise', H.enterprise(moving), 12); add('ride_dropzone', L.drop(moving), 8);
add('ride_gokarts', H.gokarts(), 16); add('ride_simulator', H.simulator(), 8);
// water
add('ride_boats', W.boats(), 12); add('ride_logflume', W.logflume(), 16); add('ride_rapids', W.rapids(), 16); add('ride_splash', W.splash(), 16);
// transport
add('ride_train', R.train(), 16); add('ride_monorail', R.monorail(), 16); add('ride_chairlift', R.chairlift(), 12);
// coasters and builder pieces
add('ride_coaster', L.station(), 8); add('ride_junior', C.junior(), 16); add('ride_mouse', C.mouse(), 16);
add('ride_looping', C.looping(), 16); add('ride_inverted', C.inverted(), 20);
add('track_piece', C.trackStraight(), 4); add('track_straight', C.trackStraight(), 4);
add('track_slope_up', C.trackSlope(true), 4); add('track_slope_down', C.trackSlope(false), 4);
add('track_turn_left', C.trackTurn(true), 4); add('track_turn_right', C.trackTurn(false), 4);
add('track_loop', C.trackLoop(), 4); add('track_lift', C.trackLift(), 4); add('track_station', C.trackStation(), 4);
// shops and facilities
add('stall_food', S.stallFood(), 4); add('stall_drink', S.stallDrink(), 4); add('stall_souvenir', S.stallSouvenir(), 4);
add('stall_pizza', S.stallPizza(), 4); add('stall_icecream', S.stallIcecream(), 4); add('stall_coffee', S.stallCoffee(), 4); add('stall_balloon', S.stallBalloon(), 4);
add('fac_toilet', S.facToilet(), 4); add('fac_info', S.facInfo(), 4); add('fac_firstaid', S.facFirstaid(), 4);
// scenery
add('deco_fountain', L.fountain(), 8); add('deco_topiary', L.topiary(), 4); add('deco_tree', L.treeModel(), 4); add('deco_flowerbed', L.flowers(), 4); add('deco_lamp', L.lamp(), 4);
add('deco_statue', S.statue(), 4); add('deco_hedge', S.hedge(), 4); add('deco_arch', S.arch(), 4); add('deco_flagpole', S.flagpole(), 4);
// paths
add('path_walk', L.path(), 4); add('path_queue', S.pathQueue(), 4); add('ride_entrance', S.rideEntrance(), 4); add('ride_exit', S.rideExit(), 4);
// people
add('staff_janitor', L.janitor(), 4); add('staff_handyman', S.staffHandyman(), 2); add('staff_mechanic', S.staffMechanic(), 2);
add('staff_entertainer', S.staffEntertainer(), 2); add('staff_security', S.staffSecurity(), 2);
for (let i = 0; i < 5; i++) add(`guest_${'abcde'[i]}`, L.guest([P.coral, P.blue, P.gold, P.mint, P.pink][i], i), 2);
// The coaster train is its own model: the ride's own cycle drives it around the authored circuit.
models.coaster_train = L.coasterTrain();

// ---- export ----
const exporter = new GLTFExporter(); let bytes = 0; const sizes = {}, baked = {};
for (const [name, g] of Object.entries(models)) {
  g.name = name; const b = bake(g); baked[name] = b;
  const buffer = await exporter.parseAsync(b, { binary: true, copyright: 'Original geometry authored for Brightway Park, 2026' });
  await writeFile(new URL(`${name}.glb`, out), Buffer.from(buffer)); bytes += buffer.byteLength; sizes[name] = buffer.byteLength;
}
await writeFile(new URL('motion.json', out), JSON.stringify(motion, null, 2) + '\n');

// ---- check: bounds against each footprint (moving parts swept through their motion) ----
const extent = verts => { const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (const v of verts) { const a = v.toArray(); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], a[k]); hi[k] = Math.max(hi[k], a[k]); } } return [lo, hi]; };
function swept(name) {
  const m = motion[motionParts[name]], [px, py, pz] = m.pivot, vs = vertices(baked[name]), outv = [];
  const steps = m.kind === 'swing' ? [-1, -.5, 0, .5, 1].map(s => s * m.amplitude) : m.kind === 'drop' ? [0, m.amplitude] : Array.from({ length: 24 }, (_, i) => i / 24 * Math.PI * 2);
  for (const s of steps) {
    const mat = m.kind === 'spin' ? new T.Matrix4().makeRotationY(s) : m.kind === 'drop' ? new T.Matrix4().makeTranslation(0, s, 0) : new T.Matrix4().makeRotationX(s);
    for (const v of vs) outv.push(v.clone().applyMatrix4(mat).add(new T.Vector3(px, py, pz)));
  }
  return extent(outv);
}
const f2 = n => n.toFixed(2).padStart(6); let problems = 0;
console.log('model                     bytes    tris   min x/y/z                  max x/y/z              fit');
for (const name of Object.keys(models)) {
  const ride = motionParts[name], side = ride ? footprint[ride] : footprint[name];
  const [lo, hi] = ride ? swept(name) : extent(vertices(baked[name]));
  let note = 'ok';
  if (side) {
    const half = side / 2, reach = Math.max(-lo[0], hi[0], -lo[2], hi[2]);
    const tol = name.startsWith('track_') ? .15 : .001;
    if (reach > half + tol) { note = `OUTSIDE ${side} m (reach ${reach.toFixed(2)})`; problems++; }
    else if (reach > half - .2 + .001) note = `edge (reach ${reach.toFixed(2)} of ${half})`;
    if (lo[1] < -.05) { note += ` BELOW GROUND ${lo[1].toFixed(2)}`; problems++; }
    if (!ride && lo[1] > .05) { note += ` floating ${lo[1].toFixed(2)}`; problems++; }
  } else note = 'no footprint';
  if (sizes[name] > 600 * 1024) { note += ' OVER 600KB'; problems++; }
  console.log(`${name.padEnd(22)}${String(sizes[name]).padStart(9)}${String(Math.round(triangles(baked[name]))).padStart(8)}  ${lo.map(f2).join(' ')}   ${hi.map(f2).join(' ')}   ${ride ? `[${m(ride)}] ` : ''}${note}`);
}
function m(ride) { return `${motion[ride].kind} of ${ride}`; }
for (const [ride, spec] of Object.entries(motion)) if (!models[spec.model] || !models[ride]) { console.log(`! motion.json ${ride} references a missing model`); problems++; }
console.log(`Authored ${Object.keys(models).length} original GLBs (${bytes.toLocaleString()} bytes) and motion.json (${Object.keys(motion).length} rides) in ${fileURLToPath(out)}${problems ? ` — ${problems} problem(s)` : ''}`);
