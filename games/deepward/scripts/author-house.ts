/**
 * CRUMB RUN's giant house, authored with the published editor session.
 *
 * The house is a yard of room templates, one per slot, plus the Littles' burrow. A run never plays
 * the yard in order: `src/game/runGen.ts` chains templates by seed, and each room rolls its own
 * loot, threats and exits from the spots authored here. One unit is about 1.5 cm, so a Little is a
 * thumb tall and a kitchen chair leg is a tree trunk.
 *
 * Run from games/deepward with `bun scripts/author-house.ts`. It rebuilds the whole document
 * (terrain included) and writes `src/editor.scene.json`; runtime reads only that export.
 */
import { createEditorHost } from '@jgengine/editor/session';
import { writeFileSync } from 'node:fs';

const path = new URL('../src/editor.scene.json', import.meta.url);
const SPACING = 110, COLS = 4, ROWS = 5;
const half = (SPACING * COLS) / 2;
const CELL = 10;
const cols = (SPACING * COLS) / CELL, rows = (SPACING * ROWS) / CELL;
const terrain = {
  bounds: { minX: -half, minZ: -half, maxX: half, maxZ: -half + SPACING * ROWS },
  cellSize: CELL, cols, rows,
  offsets: Array.from({ length: (cols + 1) * (rows + 1) }, () => 0),
  surfaces: Array.from({ length: cols * rows }, () => null),
  layers: [],
};
const { session, api, dispose } = createEditorHost({ gameId: 'deepward', layers: { version: 1, markers: [], volumes: [], terrain } as never });

type Meta = Record<string, unknown>;
type V3 = [number, number, number];
interface Ctx { id: string; cx: number; cz: number; n: number }
let slot = 0;
function slotCenter(index: number): [number, number] {
  const col = index % COLS, row = Math.floor(index / COLS);
  return [-half + SPACING / 2 + col * SPACING, -half + SPACING / 2 + row * SPACING];
}
const volumes: Record<string, unknown>[] = [];
const markers: Record<string, unknown>[] = [];

/** A room template: the walkable floor rect, its zone and what it says on the travel card. */
function template(id: string, spec: { name: string; zone: string; minDepth: number; w: number; d: number; floor: string; floorColor: string; flavor: string; root?: boolean; dark?: boolean; elevated?: number; ceiling?: number; weight?: number; mood?: string }): Ctx {
  const [cx, cz] = slotCenter(slot++);
  volumes.push({ id: `room-${id}`, kind: 'crumb-room', shape: 'box', center: { x: cx, y: 0.5, z: cz }, halfExtents: { x: spec.w / 2, y: 0.5, z: spec.d / 2 }, label: spec.name,
    meta: { template: id, zone: spec.zone, minDepth: spec.minDepth, floor: spec.floor, floorColor: spec.floorColor, flavor: spec.flavor, root: spec.root === true, dark: spec.dark === true, elevated: spec.elevated ?? 0, ceiling: spec.ceiling ?? 0, weight: spec.weight ?? 1, mood: spec.mood ?? 'night' } });
  return { id, cx, cz, n: 0 };
}
/** A visual or solid piece of the giant house. `at` is the local centre; boxes take a size, cylinders `[radius, height]`. */
function box(t: Ctx, role: string, at: V3, size: V3, material: string, color: string, opts: { solid?: boolean; cover?: boolean; turn?: number; tilt?: number; roll?: number; upgrade?: string; level?: number; glow?: number } = {}) {
  volumes.push({ id: `${t.id}-${role}-${++t.n}`, kind: 'crumb-prop', shape: 'box', center: { x: t.cx + at[0], y: at[1], z: t.cz + at[2] }, halfExtents: { x: size[0] / 2, y: size[1] / 2, z: size[2] / 2 }, color, label: role,
    meta: { template: t.id, material, solid: opts.solid === true, cover: opts.cover === true, turn: opts.turn ?? 0, tilt: opts.tilt ?? 0, roll: opts.roll ?? 0, ...(opts.upgrade ? { upgrade: opts.upgrade, level: opts.level ?? 1 } : {}), ...(opts.glow ? { glow: opts.glow } : {}) } });
}
function cyl(t: Ctx, role: string, at: V3, radius: number, height: number, material: string, color: string, opts: { solid?: boolean; turn?: number; tilt?: number; roll?: number; upgrade?: string; level?: number; glow?: number } = {}) {
  volumes.push({ id: `${t.id}-${role}-${++t.n}`, kind: 'crumb-prop', shape: 'cylinder', center: { x: t.cx + at[0], y: at[1], z: t.cz + at[2] }, radius, height, color, label: role,
    meta: { template: t.id, material, solid: opts.solid === true, turn: opts.turn ?? 0, tilt: opts.tilt ?? 0, roll: opts.roll ?? 0, ...(opts.upgrade ? { upgrade: opts.upgrade, level: opts.level ?? 1 } : {}), ...(opts.glow ? { glow: opts.glow } : {}) } });
}
function ball(t: Ctx, role: string, at: V3, radius: number, material: string, color: string, opts: { solid?: boolean; upgrade?: string; level?: number; glow?: number } = {}) {
  volumes.push({ id: `${t.id}-${role}-${++t.n}`, kind: 'crumb-prop', shape: 'sphere', center: { x: t.cx + at[0], y: at[1], z: t.cz + at[2] }, radius, color, label: role,
    meta: { template: t.id, material, solid: opts.solid === true, ...(opts.upgrade ? { upgrade: opts.upgrade, level: opts.level ?? 1 } : {}), ...(opts.glow ? { glow: opts.glow } : {}) } });
}
function mark(t: Ctx, id: string, kind: string, x: number, z: number, meta: Meta, label: string, y = 0, rotationY?: number) {
  markers.push({ id: `${t.id}-${id}`, kind, x: t.cx + x, y, z: t.cz + z, label, ...(rotationY === undefined ? {} : { rotationY }), meta: { template: t.id, ...meta } });
}
/** Where loot can land. Tier: `open` floor, `tucked` behind something, `cache` a lucky hoard. */
const spot = (t: Ctx, id: string, x: number, z: number, tier: 'open' | 'tucked' | 'cache', label: string, extra: Meta = {}) => mark(t, `spot-${id}`, 'crumb-spot', x, z, { tier, ...extra }, label);
const threat = (t: Ctx, id: string, threatKind: string, x: number, z: number, minDepth: number, label: string, extra: Meta = {}) => mark(t, `threat-${id}`, 'crumb-threat', x, z, { threat: threatKind, minDepth, ...extra }, label);
/** A way in or on. `entry` is where you arrive from the room before; each `forward` leads to a new room. */
const door = (t: Ctx, id: string, role: 'entry' | 'forward', x: number, z: number, kinds: string[], label: string) => mark(t, `door-${id}`, 'crumb-door', x, z, { role, kinds }, label);
const exit = (t: Ctx, id: string, exitKind: string, x: number, z: number, label: string) => mark(t, `exit-${id}`, 'crumb-exit', x, z, { exit: exitKind }, label);
const lamp = (t: Ctx, id: string, at: V3, color: string, intensity: number, distance: number, label: string) => mark(t, `lamp-${id}`, 'crumb-lamp', at[0], at[2], { color, intensity, distance }, label, at[1]);
const station = (t: Ctx, id: string, x: number, z: number, role: string, reach: number, label: string) => mark(t, `station-${id}`, 'crumb-station', x, z, { role, reach }, label);

// Palette: warm wood, cream enamel, terracotta tile, faded rug reds, toy primaries.
const OAK = '#b07a45', DARK_OAK = '#5c3b22', CREAM = '#efe4cf', TILE = '#c9b79a', LINO = '#bfae8e', STEEL = '#b9bdbf', CHROME = '#d8dde0', BRASS = '#c9a24b', RUG = '#8e3b2e', CARPET = '#5f6f8a', CARD = '#b48a58', PAPER = '#ede6d6', GLASS = '#a9c9d3', WAX = '#f2d7a4', PLASTER = '#d8cbb5', DUST = '#8d8478';

/** The back wall with its baseboard: every floor-level room is a corner of a giant room. */
function wall(t: Ctx, side: 'north' | 'south' | 'east' | 'west', w: number, d: number, color = PLASTER, base = CREAM, height = 120) {
  const horizontal = side === 'north' || side === 'south';
  const z = side === 'north' ? -d / 2 - 1 : side === 'south' ? d / 2 + 1 : 0;
  const x = side === 'east' ? w / 2 + 1 : side === 'west' ? -w / 2 - 1 : 0;
  const len = (horizontal ? w : d) + 4;
  box(t, `wall-${side}`, [x, height / 2, z], horizontal ? [len, height, 2] : [2, height, len], 'plaster', color);
  const bz = side === 'north' ? -d / 2 - 0.2 : side === 'south' ? d / 2 + 0.2 : 0, bx = side === 'east' ? w / 2 + 0.2 : side === 'west' ? -w / 2 - 0.2 : 0;
  box(t, `baseboard-${side}`, [bx, 2.8, bz], horizontal ? [len, 5.6, 0.8] : [0.8, 5.6, len], 'paint', base);
  box(t, `baseboard-lip-${side}`, [bx * 1.0, 5.75, bz], horizontal ? [len, 0.4, 1.2] : [1.2, 0.4, len], 'paint', base);
}
function chairLeg(t: Ctx, x: number, z: number, color = OAK, h = 62, r = 1.3) { cyl(t, 'chair-leg', [x, h / 2, z], r, h, 'wood', color, { solid: true }); }

// ---------------------------------------------------------------- the burrow
{
  const t = template('burrow', { name: 'The Burrow', zone: 'burrow', minDepth: 99, w: 30, d: 26, floor: 'wood', floorColor: '#6f4a2c', flavor: 'Home, inside the kitchen wall.', mood: 'home' });
  // Wall studs and the plaster back of the kitchen wall make a timber cave.
  box(t, 'plaster-back', [0, 30, -14], [40, 60, 1.5], 'plaster', '#8f7a60');
  box(t, 'drywall-front', [0, 30, 14], [40, 60, 1.5], 'cardboard', '#8b7457');
  for (const x of [-16, 16]) box(t, 'stud', [x, 30, 0], [3, 60, 26], 'wood', '#8a5d36');
  box(t, 'sole-plate', [0, 0.4, -13], [36, 0.8, 1.6], 'wood', '#7a5130');
  box(t, 'ceiling-board', [0, 14, 0], [36, 1, 30], 'wood', '#4e3420');
  // Fairy lights: a lost string of beads glowing along the ceiling board.
  for (let i = 0; i < 9; i++) ball(t, 'fairy-bead', [-12 + i * 3, 12.4 - Math.sin(i * 0.9) * 0.8, -6 + (i % 2) * 2], 0.35, 'emissive', i % 3 === 0 ? '#ffcf7a' : i % 3 === 1 ? '#ff9f6b' : '#ffe8b0', { glow: 1.6 });
  // The crack to the kitchen: daylight-less, a warm sliver of the giant house.
  box(t, 'crack-frame', [0, 3.5, -13.1], [3.2, 7, 0.6], 'emissive', '#3a2a1a');
  box(t, 'crack-light', [0, 3.2, -13.2], [1.4, 6, 0.2], 'emissive', '#ffb867', { glow: 1.2 });
  // Stash: a matchbox chest of drawers.
  box(t, 'matchbox-chest', [-11, 2.4, -8], [5, 4.8, 3.2], 'cardboard', '#c2462f', { solid: true });
  box(t, 'matchbox-strike', [-11, 2.4, -6.35], [4.6, 1.2, 0.1], 'paper', '#5b3a2a');
  // Workbench: a cotton reel table with a razor-blade saw.
  cyl(t, 'reel-table', [8, 2.2, -8], 2.6, 4.4, 'wood', '#d9b98a', { solid: true });
  cyl(t, 'reel-rim', [8, 4.5, -8], 3.2, 0.4, 'wood', '#a87b4c');
  box(t, 'bench-saw', [8.5, 4.9, -8.4], [2.6, 0.08, 1.2], 'chrome', CHROME, { upgrade: 'workbench', level: 2 });
  cyl(t, 'bench-vise', [6.6, 5.2, -7.2], 0.5, 1.2, 'metal', '#6a6f72', { upgrade: 'workbench', level: 2 });
  // Larder: bottle caps stacked as shelves of crumbs.
  for (let i = 0; i < 3; i++) cyl(t, 'larder-cap', [12, 0.5 + i * 1.1, 2 + i * 0.3], 1.6, 1, 'metal', i === 1 ? '#2f6e3c' : '#b8352b', { upgrade: 'larder', level: 1 });
  ball(t, 'larder-crumb', [12, 3.8, 2.6], 0.8, 'bread', '#c8873f', { upgrade: 'larder', level: 1 });
  box(t, 'larder-cheese', [12.4, 4.6, 2.2], [1.4, 1.2, 1.4], 'wax', '#f0c445', { upgrade: 'larder', level: 2 });
  // Map room: a postcard pinned to the stud with a pin-and-thread route.
  box(t, 'map-postcard', [-14.3, 6, 3], [0.2, 4.5, 6.5], 'paper', '#e8dcc0', { upgrade: 'mapRoom', level: 1 });
  cyl(t, 'map-pin', [-14.0, 7.2, 1.5], 0.25, 0.8, 'emissive', '#e0413a', { roll: Math.PI / 2, upgrade: 'mapRoom', level: 1, glow: 0.6 });
  // Satchel loft: a sock-cuff sling hammock.
  box(t, 'satchel-loft', [-6, 7, 6], [8, 0.6, 4], 'fabric', '#6e8f6a', { upgrade: 'satchel', level: 1 });
  // Littles' nook: matchbox beds.
  for (let i = 0; i < 3; i++) box(t, 'matchbox-bed', [3 + i * 3.6, 0.9, 8], [3, 1.8, 5], 'cardboard', ['#d3a35f', '#8db4c4', '#c98a8a'][i]!, { solid: true });
  box(t, 'trophy-shelf', [-12, 4, 10], [6, 0.4, 2.2], 'wood', '#9a6a3c', { upgrade: 'trophies', level: 1 });
  lamp(t, 'fairy', [0, 10, -4], '#ffb36b', 5, 26, 'fairy lights');
  lamp(t, 'crack', [0, 3, -11], '#ffcf8f', 3, 12, 'crack glow');
  station(t, 'crack', 0, -11, 'depart', 2.6, 'the baseboard crack');
  station(t, 'stash', -11, -5.4, 'stash', 2.8, 'matchbox chest');
  station(t, 'workbench', 8, -4.4, 'workbench', 3, 'reel workbench');
  station(t, 'nook', 6.6, 4.6, 'nook', 3, "Littles' nook");
  mark(t, 'spawn', 'crumb-station', 0, 3, { role: 'spawn', reach: 0 }, 'home spawn');
}

// ---------------------------------------------------------------- kitchen
{
  const w = 44, d = 30;
  const t = template('kitchen-cabinets', { name: 'Under the kitchen cabinets', zone: 'kitchen', minDepth: 0, w, d, floor: 'lino', floorColor: LINO, flavor: 'Lino the colour of old custard. The cabinets hang overhead like a roof.', root: true });
  wall(t, 'north', w, d); wall(t, 'west', w, d, CREAM, CREAM);
  // Cabinet plinth: a dark wooden roof over the back third of the room.
  box(t, 'cabinet-base', [4, 22, -10], [52, 30, 14], 'wood', '#e7dcc3');
  box(t, 'toe-kick', [4, 4.2, -4.4], [52, 8.4, 1.2], 'paint', '#3d2c20');
  box(t, 'cabinet-door-a', [-8, 22, -2.9], [14, 26, 0.8], 'paint', '#efe6d2');
  box(t, 'cabinet-door-b', [8, 22, -2.9], [14, 26, 0.8], 'paint', '#efe6d2');
  box(t, 'drawer-pull', [14, 20, -2.1], [5, 1.4, 1.4], 'chrome', CHROME);
  box(t, 'drawer-pull-low', [14, 11, -2.1], [5, 1.4, 1.4], 'chrome', CHROME);
  // The open kitchen floor: a chair, the cat's bowl, a dropped tea towel.
  chairLeg(t, -12, 9); chairLeg(t, 12, 12);
  box(t, 'chair-rail', [0, 18, 10.5], [24, 1.5, 1.5], 'wood', OAK);
  cyl(t, 'cat-bowl', [-2, 1.8, 4], 6, 3.6, 'ceramic', '#5c8fb3', { solid: true });
  cyl(t, 'kibble-heap', [-2, 3.8, 4], 4.5, 0.8, 'bread', '#7a4a26');
  box(t, 'tea-towel', [14, 0.4, 6], [12, 0.8, 9], 'fabric', '#c45a4a', { cover: true, turn: 0.3 });
  box(t, 'tea-towel-fold', [12, 1.4, 4.5], [7, 1.4, 4], 'fabric', '#b44c3d', { solid: true, turn: 0.3 });
  box(t, 'fridge-side', [-24, 50, -6], [4, 100, 22], 'metal', '#e9ecec');
  lamp(t, 'oven-clock', [8, 12, -1], '#7dffb0', 1.5, 28, 'oven clock glow');
  lamp(t, 'moon', [8, 48, 12], '#9fb9ff', 10, 90, 'moonlight from the window');
  door(t, 'entry', 'entry', -14, -2, ['crack'], 'the baseboard crack');
  door(t, 'up', 'forward', 14, -1.2, ['climb'], 'the drawer pulls');
  door(t, 'pantry', 'forward', -20, 12, ['crack', 'vent'], 'the gap under the pantry door');
  spot(t, 'bowl', 2.5, 7.5, 'open', 'beside the cat bowl', { bias: 'food' });
  spot(t, 'towel', 13, 8, 'tucked', 'under the tea towel');
  spot(t, 'plinth', -4, -1.5, 'tucked', 'along the toe-kick');
  spot(t, 'leg', -10, 11, 'open', 'by the chair leg');
  spot(t, 'corner', -20, -1, 'cache', 'in the dusty corner', { bias: 'curio' });
  threat(t, 'cat', 'cat', 4, 10, 0, 'the cat');
  threat(t, 'trap', 'trap', -6, 2, 1, 'a mousetrap');
  threat(t, 'roomba', 'roomba', 0, 8, 2, 'the roomba');
}
{
  const w = 46, d = 30;
  const t = template('counter-top', { name: 'The kitchen counter', zone: 'kitchen', minDepth: 1, w, d, floor: 'stone', floorColor: '#8f8a80', flavor: 'A granite plain sixty times your height above the floor. The toaster smells of yesterday.', elevated: 60 });
  box(t, 'backsplash', [0, 30, -16], [54, 60, 2], 'tile', '#d9c9a8');
  box(t, 'counter-slab', [0, -1.6, 0], [54, 3, 34], 'stone', '#8f8a80');
  box(t, 'counter-edge', [0, -1.6, 16.6], [54, 3.4, 1], 'wood', '#6b4a2e');
  box(t, 'toaster', [-11, 7, -7], [20, 14, 12], 'chrome', CHROME, { solid: true });
  box(t, 'toaster-slot', [-11, 14.1, -9], [14, 0.4, 2.2], 'paint', '#1d1d1d');
  box(t, 'toaster-slot-b', [-11, 14.1, -5], [14, 0.4, 2.2], 'paint', '#1d1d1d');
  box(t, 'toaster-lever', [-0.6, 9, -7], [1.2, 1.6, 4], 'plastic', '#222222');
  box(t, 'bread-board', [9, 0.6, 2], [22, 1.2, 14], 'wood', '#c99a63');
  box(t, 'bread-heel', [10, 3.6, 1], [9, 5, 7], 'bread', '#c07a35', { solid: true });
  cyl(t, 'sugar-bowl', [16, 4.5, -8], 5, 9, 'ceramic', '#f0ebe0', { solid: true });
  cyl(t, 'sugar-lid', [16, 9.4, -8], 5.4, 0.8, 'ceramic', '#e8e0d0');
  box(t, 'knife-block', [-20, 10, 4], [7, 20, 9], 'wood', DARK_OAK, { solid: true });
  box(t, 'phone-charger', [20, 12, -14.8], [4, 6, 1.6], 'plastic', '#f2f2f2');
  cyl(t, 'charger-cable', [21, 6, 0], 0.35, 30, 'plastic', '#f2f2f2', { tilt: Math.PI / 2 - 0.25 });
  box(t, 'far-floor', [0, -60, 40], [200, 1, 120], 'lino', LINO);
  box(t, 'far-table', [6, -30, 60], [70, 3, 50], 'wood', OAK);
  lamp(t, 'hood', [-6, 34, -6], '#ffd9a0', 4, 60, 'cooker hood bulb');
  lamp(t, 'moon', [20, 40, 18], '#9fb9ff', 9, 90, 'moonlight');
  door(t, 'entry', 'entry', 12, -12, ['climb'], 'the top of the drawer pulls');
  door(t, 'drop', 'forward', -4, 13.6, ['drop'], 'the counter edge');
  door(t, 'cable', 'forward', 20, 12, ['cable'], 'the charger cable');
  spot(t, 'toaster', -2, -1, 'open', 'crumbs by the toaster', { bias: 'food' });
  spot(t, 'board', 6, 6, 'open', 'on the bread board', { bias: 'food' });
  spot(t, 'sugar', 12, -10, 'tucked', 'behind the sugar bowl', { bias: 'food' });
  spot(t, 'block', -16, 9, 'tucked', 'behind the knife block');
  spot(t, 'backsplash', -2, -13, 'cache', 'against the backsplash', { bias: 'part' });
  threat(t, 'cat', 'cat', 0, 4, 1, 'the cat on the counter');
  threat(t, 'lights', 'lights', 0, 0, 2, 'the kitchen light');
}
{
  const w = 44, d = 26;
  const t = template('pantry-shelf', { name: 'The pantry shelf', zone: 'kitchen', minDepth: 1, w, d, floor: 'wood', floorColor: '#cfa774', flavor: 'Cereal boxes stand like tower blocks. Something has been weaving in the corner.', dark: true, elevated: 30 });
  box(t, 'shelf-back', [0, 26, -14], [50, 52, 1.5], 'plaster', '#e7dcc6');
  box(t, 'shelf-board', [0, -1, 0], [50, 2, 30], 'wood', '#cfa774');
  box(t, 'shelf-above', [0, 34, 0], [50, 2, 30], 'wood', '#bf9665');
  box(t, 'cereal-a', [-14, 15, -8], [14, 30, 5], 'cardboard', '#e0a52a', { solid: true });
  box(t, 'cereal-b', [-1, 13, -9], [12, 26, 5], 'cardboard', '#3c78c2', { solid: true });
  box(t, 'cereal-c', [10, 11, -8], [10, 22, 5], 'cardboard', '#c8402e', { solid: true, turn: -0.15 });
  cyl(t, 'jam-jar', [17, 6, 4], 4.5, 12, 'glass', '#a33a4a', { solid: true });
  cyl(t, 'jam-lid', [17, 12.4, 4], 4.7, 1.2, 'metal', BRASS);
  cyl(t, 'honey-jar', [-18, 5, 6], 4, 10, 'glass', '#d99a2b', { solid: true });
  box(t, 'flour-bag', [4, 6, 8], [11, 12, 7], 'paper', '#efe8dc', { solid: true, turn: 0.2 });
  box(t, 'spilled-rice', [-6, 0.15, 4], [8, 0.3, 5], 'bread', '#f4efe2');
  box(t, 'web-sheet', [20, 8, -10], [0.1, 16, 9], 'glass', '#ffffff', { turn: 0.8 });
  box(t, 'far-floor', [0, -30, 40], [200, 1, 120], 'lino', LINO);
  lamp(t, 'door-gap', [0, 10, 14], '#ffcf96', 4, 40, 'light under the door');
  door(t, 'entry', 'entry', -18, 10, ['crack', 'vent'], 'the pantry door gap');
  door(t, 'jars', 'forward', 18, -4, ['climb'], 'the jam-jar stack');
  door(t, 'edge', 'forward', 0, 12, ['drop', 'cable'], 'the shelf lip');
  spot(t, 'rice', -6, 2, 'open', 'in the spilled rice', { bias: 'food' });
  spot(t, 'cereal', -6, -5, 'tucked', 'between the cereal boxes', { bias: 'food' });
  spot(t, 'flour', 9, 11, 'tucked', 'behind the flour bag');
  spot(t, 'honey', -14, 10, 'open', 'by the honey jar', { bias: 'food' });
  spot(t, 'web', 17, -8, 'cache', 'in the old web', { bias: 'curio' });
  threat(t, 'spider', 'spider', 17, -8, 1, 'the pantry spider');
  threat(t, 'trap', 'trap', 0, 0, 1, 'a mousetrap');
}
{
  const w = 40, d = 24;
  const t = template('under-fridge', { name: 'Under the fridge', zone: 'kitchen', minDepth: 2, w, d, floor: 'lino', floorColor: '#9e906f', flavor: 'Warm, humming, dark. Everything anyone ever dropped rolls down here eventually.', dark: true, ceiling: 7 });
  wall(t, 'north', w, d, '#bdb29c', '#9a8f78');
  box(t, 'fridge-belly', [0, 8, -1], [46, 2, 30], 'metal', '#6e7376');
  for (const x of [-20, 20]) for (const z of [-11, 10]) cyl(t, 'fridge-foot', [x, 3.5, z], 1.2, 7, 'plastic', '#2a2a2a', { solid: true });
  for (let i = 0; i < 6; i++) cyl(t, 'cooling-coil', [-15 + i * 6, 5, -10], 0.6, 36, 'metal', '#4a4f52', { roll: Math.PI / 2, turn: Math.PI / 2 });
  for (const [x, z, r] of [[-12, 4, 3], [6, -4, 2.4], [14, 6, 3.4], [-4, 8, 2]] as const) ball(t, 'dust-bunny', [x, r * 0.6, z], r, 'dust', DUST);
  box(t, 'vent-grille', [12, 3, -12.3], [9, 5, 0.6], 'metal', '#8c8f88');
  lamp(t, 'motor', [-8, 4, -9], '#ff8a3c', 4, 22, 'compressor glow');
  lamp(t, 'gap', [0, 5, 12], '#9fb9ff', 4, 30, 'moonlight under the edge');
  door(t, 'entry', 'entry', -16, 9, ['crack', 'drop', 'cable'], 'the fridge gap');
  door(t, 'on', 'forward', 16, 9, ['crack', 'vent'], 'the back of the fridge');
  exit(t, 'vent', 'vent', 12, -10, 'the heating vent');
  spot(t, 'bunny-a', -12, 1, 'tucked', 'in a dust bunny', { bias: 'curio' });
  spot(t, 'bunny-b', 14, 3, 'tucked', 'in a dust bunny', { bias: 'curio' });
  spot(t, 'coil', 0, -8, 'cache', 'under the cooling coils', { bias: 'part' });
  spot(t, 'foot', -18, -9, 'open', 'by the fridge foot');
  spot(t, 'middle', 4, 2, 'open', 'in the warm middle');
  threat(t, 'spider', 'spider', 8, -7, 2, 'a spider in the coils');
  threat(t, 'trap', 'trap', -4, 0, 2, 'a mousetrap');
}

// ---------------------------------------------------------------- living room
{
  const w = 44, d = 30;
  const t = template('bookshelf-base', { name: 'Under the bookshelf', zone: 'living', minDepth: 0, w, d, floor: 'wood', floorColor: '#8c5a33', flavor: 'Floorboards wide as roads. The books above smell of dust and somebody else’s summer.', root: true });
  wall(t, 'north', w, d, '#a9b39a', '#e9e0cc'); wall(t, 'east', w, d, '#a9b39a', '#e9e0cc');
  box(t, 'shelf-bottom', [0, 18, -10], [50, 2, 14], 'wood', DARK_OAK);
  for (let i = 0; i < 9; i++) {
    const h = 26 + ((i * 7) % 9), wd = 2.5 + ((i * 3) % 3);
    box(t, 'book', [-20 + i * 4.8, 19 + h / 2, -11], [wd, h, 12], 'paper', ['#7b2e2e', '#2e4f7b', '#d6b45a', '#3f6b45', '#e8e0cc', '#5a3a6e'][i % 6]!);
  }
  box(t, 'fallen-book', [6, 3, 6], [14, 5, 20], 'paper', '#2e4f7b', { solid: true, turn: 0.4, roll: 0.25 });
  box(t, 'fallen-book-pages', [6, 3, 6], [13.4, 4.4, 19.6], 'paper', '#efe6d0');
  cyl(t, 'shelf-foot', [-22, 8, -4], 1.6, 16, 'wood', DARK_OAK, { solid: true });
  cyl(t, 'shelf-foot', [22, 8, -4], 1.6, 16, 'wood', DARK_OAK, { solid: true });
  box(t, 'domino', [-10, 1.8, 8], [3, 3.6, 6], 'plastic', '#f5f1e6', { solid: true, turn: 0.7 });
  box(t, 'rug-edge', [0, 0.25, 15], [60, 0.5, 6], 'rug', RUG);
  lamp(t, 'standard-lamp', [-24, 40, 16], '#ffc477', 10, 90, 'a lamp left on low');
  lamp(t, 'moon', [24, 50, 18], '#9fb9ff', 6, 90, 'moonlight');
  door(t, 'entry', 'entry', 20, -2, ['crack'], 'the baseboard crack');
  door(t, 'books', 'forward', -18, -1.5, ['climb'], 'the leaning books');
  door(t, 'rug', 'forward', 0, 13, ['crack', 'cable'], 'out onto the rug');
  spot(t, 'book', 10, 12, 'tucked', 'under the fallen book');
  spot(t, 'domino', -12, 11, 'open', 'by the domino');
  spot(t, 'shelf', -4, -2, 'tucked', 'under the bottom shelf', { bias: 'curio' });
  spot(t, 'board', 14, 3, 'open', 'in a floorboard gap', { bias: 'part' });
  spot(t, 'corner', -20, 10, 'cache', 'in the corner fluff', { bias: 'curio' });
  threat(t, 'cat', 'cat', 0, 8, 1, 'the cat');
  threat(t, 'roomba', 'roomba', 0, 8, 2, 'the roomba');
}
{
  const w = 46, d = 30;
  const t = template('under-couch', { name: 'Under the couch', zone: 'living', minDepth: 1, w, d, floor: 'rug', floorColor: '#7c3a30', flavor: 'A low, soft sky of upholstery. Coins and popcorn, the couch’s quiet tax.', dark: true, ceiling: 9 });
  box(t, 'couch-belly', [0, 10, -3], [52, 2, 26], 'fabric', '#4c5f4a');
  box(t, 'couch-skirt', [0, 20, 10.5], [52, 20, 1], 'fabric', '#5b7058');
  box(t, 'couch-back', [0, 30, -16], [52, 60, 4], 'fabric', '#4c5f4a');
  for (const x of [-22, 22]) for (const z of [-13, 9]) cyl(t, 'couch-foot', [x, 4.5, z], 1.6, 9, 'wood', DARK_OAK, { solid: true });
  box(t, 'remote', [-8, 1.3, -2], [8, 2.6, 22], 'plastic', '#26262a', { solid: true, turn: 0.3 });
  for (let i = 0; i < 6; i++) box(t, 'remote-button', [-8 + Math.sin(0.3) * (i * 3 - 7), 2.7, -2 + Math.cos(0.3) * (i * 3 - 7)], [1.6, 0.4, 1.6], 'plastic', i === 0 ? '#c0392b' : '#8a8a90');
  for (const [x, z] of [[10, 4], [12, -6], [4, 7], [16, 0]] as const) ball(t, 'popcorn', [x, 1.6, z], 1.8, 'bread', '#f4e3b3');
  box(t, 'lost-sock', [-16, 1, 6], [10, 2, 6], 'fabric', '#c9a83f', { cover: true, turn: -0.5 });
  box(t, 'room-floor', [0, 0.4, 24], [80, 0.8, 30], 'wood', '#8c5a33');
  lamp(t, 'tv-standby', [0, 6, 20], '#ff5a4a', 3, 40, 'tv standby light');
  lamp(t, 'moon', [10, 30, 30], '#9fb9ff', 7, 90, 'moonlight on the rug');
  door(t, 'entry', 'entry', -20, 12, ['crack', 'cable'], 'the couch skirt');
  door(t, 'out', 'forward', 20, 12, ['crack', 'cable'], 'out past the couch foot');
  door(t, 'back', 'forward', 18, -12, ['crack', 'vent'], 'the gap behind the couch');
  spot(t, 'cushion', 0, -10, 'cache', 'where the cushions shed coins', { bias: 'curio' });
  spot(t, 'popcorn', 10, 2, 'open', 'among the popcorn', { bias: 'food' });
  spot(t, 'remote', -4, 6, 'open', 'by the remote');
  spot(t, 'sock', -16, 9, 'tucked', 'in the lost sock');
  spot(t, 'foot', 20, -8, 'tucked', 'behind the couch foot');
  threat(t, 'cat', 'cat', 0, 14, 1, 'the cat at the skirt');
  threat(t, 'trap', 'trap', 6, -4, 2, 'a mousetrap');
}
{
  const w = 50, d = 40;
  const t = template('living-rug', { name: 'The living-room rug', zone: 'living', minDepth: 1, w, d, floor: 'rug', floorColor: RUG, flavor: 'A red plain with a woven sun in the middle. Nowhere to hide but under the coffee table.', weight: 1.2 });
  wall(t, 'north', w, d, '#a9b39a', '#e9e0cc');
  for (const x of [-14, 14]) for (const z of [-8, 8]) cyl(t, 'table-leg', [x, 18, z], 2.4, 36, 'wood', DARK_OAK, { solid: true });
  box(t, 'table-top', [0, 37, 0], [36, 2.4, 24], 'wood', '#6d4325');
  box(t, 'magazine', [-4, 0.4, 2], [14, 0.8, 18], 'paper', '#d9cdb0', { cover: true, turn: 0.15 });
  box(t, 'magazine-cover', [-4, 0.85, 2], [13.6, 0.1, 17.6], 'paper', '#c0473b', { turn: 0.15 });
  cyl(t, 'dog-bed', [12, 3, -6], 9, 6, 'fabric', '#7a6248', { solid: true });
  cyl(t, 'dog-bed-cushion', [12, 5.6, -6], 7, 1.4, 'fabric', '#a68b6c');
  box(t, 'slipper', [-18, 2.4, 12], [8, 4.8, 18], 'fabric', '#8b4f74', { solid: true, turn: 0.6 });
  cyl(t, 'rug-sun', [0, 0.06, 0], 9, 0.12, 'rug', '#d9a441');
  lamp(t, 'standard-lamp', [-26, 48, -10], '#ffc477', 9, 100, 'the standard lamp');
  lamp(t, 'moon', [24, 50, 18], '#9fb9ff', 7, 100, 'moonlight');
  door(t, 'entry', 'entry', -22, 17, ['crack', 'cable'], 'the rug fringe');
  door(t, 'hall', 'forward', 22, 17, ['crack'], 'the hallway door gap');
  door(t, 'kid', 'forward', 22, -17, ['climb', 'cable', 'train'], 'the stairs side');
  spot(t, 'table', 0, -4, 'tucked', 'under the coffee table');
  spot(t, 'magazine', -4, 2, 'tucked', 'under the magazine');
  spot(t, 'dogbed', 10, -6, 'cache', 'by the dog bed', { bias: 'curio' });
  spot(t, 'slipper', -16, 6, 'open', 'by the slipper');
  spot(t, 'sun', 6, 10, 'open', 'in the open on the woven sun', { bias: 'food' });
  threat(t, 'roomba', 'roomba', 0, 12, 1, 'the roomba');
  threat(t, 'dog', 'dog', 12, -6, 2, 'the dog in its bed');
  threat(t, 'cat', 'cat', -10, -10, 2, 'the cat');
  threat(t, 'lights', 'lights', 0, 0, 3, 'the big light');
}
{
  const w = 44, d = 32;
  const t = template('front-hall', { name: 'The front hall', zone: 'living', minDepth: 2, w, d, floor: 'tile', floorColor: '#b56a4a', flavor: 'Terracotta tiles and the giant front door. The mail slot is a letterbox-shaped moon.' });
  box(t, 'front-door', [0, 60, -17], [44, 120, 3], 'wood', '#6b2f2a');
  box(t, 'mail-slot', [6, 46, -15.3], [14, 3, 0.6], 'chrome', BRASS);
  box(t, 'dog-flap', [-12, 9, -15.4], [12, 16, 0.6], 'plastic', '#5d5a52');
  box(t, 'doormat', [0, 0.6, -10], [36, 1.2, 9], 'rug', '#6a5236');
  box(t, 'letter-a', [8, 1.35, -9], [14, 0.3, 9], 'paper', PAPER, { turn: 0.4 });
  box(t, 'letter-b', [-4, 1.5, -11], [12, 0.3, 8], 'paper', '#f2e6c8', { turn: -0.2 });
  box(t, 'sneaker', [-14, 5, 6], [10, 10, 24], 'fabric', '#e8e8e8', { solid: true, turn: 0.2 });
  box(t, 'sneaker-sole', [-14, 1, 6], [10.6, 2, 24.6], 'rubber', '#3a3a3a', { turn: 0.2 });
  box(t, 'welly', [14, 14, 8], [9, 28, 14], 'rubber', '#2f5b3a', { solid: true });
  cyl(t, 'umbrella-stand', [18, 22, -6], 5, 44, 'ceramic', '#3b5f7a', { solid: true });
  wall(t, 'east', w, d, '#d2c2a0', CREAM);
  lamp(t, 'porch', [6, 46, -14], '#ffd28a', 6, 60, 'porch light through the slot');
  lamp(t, 'moon', [-10, 60, 10], '#9fb9ff', 6, 90, 'moonlight on the stairs');
  door(t, 'entry', 'entry', -20, 14, ['crack'], 'the hall door gap');
  door(t, 'stairs', 'forward', 20, 14, ['climb', 'cable'], 'the bottom stair');
  door(t, 'garage', 'forward', -20, -2, ['crack', 'vent'], 'the garage door gap');
  exit(t, 'mail', 'mail', 6, -12, 'the mail slot');
  exit(t, 'dogdoor', 'dogdoor', -12, -12, 'the dog door');
  spot(t, 'mat', 0, -7, 'open', 'on the doormat');
  spot(t, 'letters', 9, -6, 'open', 'under the letters', { bias: 'curio' });
  spot(t, 'sneaker', -10, 14, 'tucked', 'in the sneaker’s shadow');
  spot(t, 'welly', 12, 0, 'tucked', 'behind the welly');
  spot(t, 'stand', 15, -12, 'cache', 'under the umbrella stand', { bias: 'curio' });
  threat(t, 'dog', 'dog', 0, 4, 2, 'the dog');
  threat(t, 'roomba', 'roomba', 0, 2, 2, 'the roomba');
  threat(t, 'cat', 'cat', 10, 8, 3, 'the cat');
}

// ---------------------------------------------------------------- kid's bedroom
{
  const w = 48, d = 34;
  const t = template('toy-shelf', { name: 'The toy corner', zone: 'kidroom', minDepth: 2, w, d, floor: 'carpet', floorColor: CARPET, flavor: 'Brick towers, a wooden railway and a sleeping giant who keeps everything.' });
  wall(t, 'north', w, d, '#9cc4d6', '#f4efe3'); wall(t, 'west', w, d, '#9cc4d6', '#f4efe3');
  const colors = ['#d23b30', '#2f6fd1', '#f2c531', '#3aa356'];
  for (let i = 0; i < 7; i++) {
    const x = -18 + (i % 4) * 4.4, z = -10 + Math.floor(i / 4) * 2.4, y = 1.1 + Math.floor(i / 2) * 0;
    box(t, 'brick', [x, y + (i % 3) * 2.2, z], [4.3, 2.2, 2.2], 'plastic', colors[i % 4]!, { solid: i % 3 === 0 });
    for (const s of [-1, 1]) cyl(t, 'brick-stud', [x + s * 1.05, y + (i % 3) * 2.2 + 1.35, z], 0.55, 0.5, 'plastic', colors[i % 4]!);
  }
  box(t, 'brick-tower', [-14, 7, -11], [5, 14, 5], 'plastic', '#d23b30', { solid: true });
  box(t, 'track-a', [6, 0.35, 4], [3, 0.7, 30], 'wood', '#d8b27a');
  box(t, 'track-b', [6, 0.35, -11], [26, 0.7, 3], 'wood', '#d8b27a');
  box(t, 'engine', [6, 3, 12], [4, 5, 7], 'plastic', '#c0392b', { solid: true });
  cyl(t, 'engine-funnel', [6, 6.5, 14], 0.9, 2.5, 'plastic', '#222222');
  box(t, 'wagon', [6, 2.4, 3], [4, 3.6, 6], 'plastic', '#2f6fd1', { solid: true });
  for (const [x, z, c] of [[-6, 10, '#7a3fb0'], [-3, 12, '#e67e22'], [-8, 14, '#27ae60']] as const) cyl(t, 'crayon', [x, 1, z], 1, 12, 'wax', c, { roll: Math.PI / 2, turn: 0.4, solid: true });
  box(t, 'bed-side', [26, 22, 4], [6, 44, 40], 'wood', '#e8d2b0');
  box(t, 'duvet', [40, 46, 4], [30, 10, 40], 'fabric', '#6a8fd6');
  box(t, 'toy-box', [-18, 6, 10], [12, 12, 9], 'wood', '#e5c95a', { solid: true });
  box(t, 'toy-box-lid', [-18, 12.4, 10], [12.6, 0.8, 9.6], 'wood', '#d2483b', { turn: 0.05 });
  lamp(t, 'nightlight', [-22, 6, -14], '#9effc8', 7, 50, 'a moon-shaped nightlight');
  lamp(t, 'stars', [0, 70, 0], '#9fb9ff', 5, 120, 'glow-in-the-dark stars');
  door(t, 'entry', 'entry', -20, 14, ['crack', 'climb', 'cable', 'train'], 'the door gap');
  door(t, 'train', 'forward', 10, 14, ['train', 'crack'], 'the railway');
  door(t, 'bed', 'forward', 20, -14, ['climb', 'cable'], 'the bed frame');
  spot(t, 'toybox', -14, 13, 'cache', "the kid's treasure box", { toybox: true });
  spot(t, 'bricks', -12, -6, 'open', 'among the bricks', { bias: 'curio' });
  spot(t, 'track', 9, -4, 'open', 'beside the track');
  spot(t, 'crayons', -4, 8, 'tucked', 'behind the crayons');
  spot(t, 'bedside', 18, 2, 'tucked', 'under the bed edge', { bias: 'curio' });
  threat(t, 'kid', 'kid', 28, 4, 2, 'the kid in bed');
  threat(t, 'cat', 'cat', 0, 0, 3, 'the cat on the carpet');
}
{
  const w = 44, d = 30;
  const t = template('under-bed', { name: 'Under the bed', zone: 'kidroom', minDepth: 3, w, d, floor: 'carpet', floorColor: '#4d5a72', flavor: 'Slats overhead like the ribs of a whale. This is where lost toys go to be found.', dark: true, ceiling: 16 });
  box(t, 'bed-base', [0, 17, -2], [52, 2, 30], 'wood', '#a88660');
  for (let i = 0; i < 7; i++) box(t, 'slat', [-21 + i * 7, 15.5, -2], [3, 1, 30], 'wood', '#c8a679');
  for (const x of [-24, 24]) for (const z of [-15, 11]) cyl(t, 'bed-leg', [x, 8, z], 1.8, 16, 'wood', '#a88660', { solid: true });
  box(t, 'shoebox', [-12, 5, -6], [18, 10, 11], 'cardboard', CARD, { solid: true });
  box(t, 'shoebox-lid', [-12, 10.4, -6], [18.6, 1, 11.6], 'cardboard', '#d84b3a');
  for (const [x, z] of [[4, 6], [8, -2], [14, 8]] as const) ball(t, 'marble', [x, 1.4, z], 1.4, 'glass', ['#3a7bd5', '#e74c3c', '#2ecc71'][(x / 4) % 3 | 0]!);
  box(t, 'sock', [14, 1, -8], [11, 2, 7], 'fabric', '#e8e4dc', { cover: true, turn: 0.7 });
  box(t, 'toy-car', [-2, 2.4, 8], [5, 4, 9], 'plastic', '#f1c40f', { solid: true, turn: -0.3 });
  box(t, 'vent-grille', [-16, 3, -14.3], [9, 5, 0.6], 'metal', '#c0c0b8');
  wall(t, 'north', w, d, '#9cc4d6', '#f4efe3');
  lamp(t, 'edge', [0, 8, 16], '#9fb9ff', 5, 40, 'moonlight at the bed edge');
  lamp(t, 'glowstick', [10, 2, -10], '#b4ff6a', 3, 18, 'a forgotten glow stick');
  door(t, 'entry', 'entry', -20, 12, ['train', 'climb', 'cable', 'crack'], 'the bed edge');
  door(t, 'beyond', 'forward', 20, 12, ['crack', 'cable'], 'the far side of the bed');
  exit(t, 'vent', 'vent', -16, -12, 'the heating vent');
  spot(t, 'shoebox', -12, 2, 'tucked', 'beside the shoebox', { bias: 'curio' });
  spot(t, 'marbles', 8, 3, 'open', 'among the marbles', { bias: 'curio' });
  spot(t, 'sock', 13, -6, 'tucked', 'in the sock');
  spot(t, 'car', -2, 13, 'open', 'by the toy car', { bias: 'part' });
  spot(t, 'deep', 4, -12, 'cache', 'in the deep dark under the middle', { bias: 'curio' });
  threat(t, 'kid', 'kid', 0, 16, 3, 'the kid leaning down');
  threat(t, 'spider', 'spider', 18, -10, 3, 'a spider');
  threat(t, 'roomba', 'roomba', 0, 4, 4, 'the roomba');
}

{
  const w = 44, d = 28;
  const t = template('bathroom-sink', { name: 'Under the bathroom sink', zone: 'kidroom', minDepth: 2, w, d, floor: 'tile', floorColor: '#cfe0e3', flavor: 'A cupboard of bottles taller than towers. The U-bend drips like a slow clock.', dark: true, ceiling: 34 });
  box(t, 'cabinet-back', [0, 18, -14.5], [50, 36, 1], 'paint', '#f2efe8');
  box(t, 'cabinet-top', [0, 35, 0], [50, 2, 30], 'paint', '#e8e3d8');
  for (const x of [-24, 24]) box(t, 'cabinet-side', [x, 18, 0], [1, 36, 30], 'paint', '#ebe6db');
  cyl(t, 'waste-pipe', [4, 22, -9], 1.8, 26, 'chrome', CHROME);
  cyl(t, 'u-bend', [4, 9, -6], 1.8, 8, 'chrome', CHROME, { roll: Math.PI / 2, turn: Math.PI / 2 });
  cyl(t, 'pipe-down', [4, 4, -3], 1.8, 8, 'chrome', CHROME);
  cyl(t, 'bleach', [-14, 13, -6], 5, 26, 'plastic', '#3a7bd5', { solid: true });
  cyl(t, 'bleach-cap', [-14, 27, -6], 2, 3, 'plastic', '#e74c3c');
  cyl(t, 'spray', [-4, 11, -9], 3.6, 22, 'plastic', '#7cc48a', { solid: true });
  box(t, 'spray-head', [-4, 23, -8], [2.4, 3, 5], 'plastic', '#f2f2f2');
  box(t, 'sponge', [12, 1.5, 6], [9, 3, 6], 'fabric', '#f1c40f', { cover: true, turn: 0.4 });
  box(t, 'sponge-scrub', [12, 3.2, 6], [9, 0.6, 6], 'fabric', '#27ae60', { turn: 0.4 });
  box(t, 'toothbrush', [-6, 0.7, 8], [2, 1.4, 26], 'plastic', '#c45ab3', { solid: true, turn: -0.9 });
  cyl(t, 'drip-puddle', [4, 0.05, -2], 3.5, 0.1, 'glass', '#9fd3ff');
  box(t, 'door-gap', [0, 17, 14.6], [44, 34, 0.4], 'paint', '#fbf8f1', { tilt: 0.4 });
  lamp(t, 'door-crack', [0, 14, 13], '#ffe9c4', 5, 40, 'landing light through the door crack');
  lamp(t, 'drip', [4, 2, -2], '#9fd3ff', 2, 14, 'the drip catching light');
  door(t, 'entry', 'entry', -18, 10, ['crack', 'vent', 'climb'], 'the cupboard door gap');
  door(t, 'on', 'forward', 18, 10, ['crack', 'vent', 'cable'], 'the gap behind the pedestal');
  spot(t, 'bleach', -10, -1, 'tucked', 'behind the bleach bottle');
  spot(t, 'sponge', 12, 9, 'tucked', 'under the sponge');
  spot(t, 'pipe', 6, -11, 'cache', 'behind the U-bend', { bias: 'curio' });
  spot(t, 'brush', -10, 11, 'open', 'by the toothbrush', { bias: 'part' });
  spot(t, 'puddle', 2, 2, 'open', 'beside the drip');
  threat(t, 'spider', 'spider', -18, -10, 2, 'a sink spider');
  threat(t, 'trap', 'trap', 6, 2, 3, 'a mousetrap');
  threat(t, 'lights', 'lights', 0, 0, 2, 'the bathroom light');
}
{
  const w = 48, d = 32;
  const t = template('dining-table', { name: 'On the dining table', zone: 'living', minDepth: 1, w, d, floor: 'wood', floorColor: '#7a4a2a', flavor: 'Last night’s supper was never cleared. Plates like frozen lakes, a fork like a fallen tower.', elevated: 50 });
  box(t, 'table-slab', [0, -1.5, 0], [56, 3, 38], 'wood', '#7a4a2a');
  box(t, 'table-edge', [0, -1.5, 19.3], [56, 3.2, 1], 'wood', '#5c3b22');
  cyl(t, 'plate', [-10, 0.5, 2], 11, 1, 'ceramic', '#f4f1ea', { solid: false });
  cyl(t, 'plate-rim', [-10, 1.1, 2], 11.2, 0.3, 'ceramic', '#3b5f7a');
  cyl(t, 'gravy', [-12, 1.2, 4], 4, 0.2, 'glass', '#7a4a26');
  box(t, 'fork-handle', [12, 0.6, 4], [3, 1.2, 26], 'chrome', CHROME, { solid: true, turn: 0.25 });
  for (let i = 0; i < 4; i++) box(t, 'fork-tine', [8.8 + i * 1.1, 0.6, -11], [0.6, 1, 8], 'chrome', CHROME, { turn: 0.25 });
  cyl(t, 'glass', [16, 9, -8], 5, 18, 'glass', '#d9eef4', { solid: true });
  cyl(t, 'glass-water', [16, 5, -8], 4.7, 9, 'glass', '#9fd3ff');
  cyl(t, 'salt', [-20, 6, -10], 2.4, 12, 'ceramic', '#f4f1ea', { solid: true });
  cyl(t, 'pepper', [-15, 6, -12], 2.4, 12, 'ceramic', '#3a3330', { solid: true });
  cyl(t, 'candle-stick', [2, 10, -10], 1.6, 20, 'metal', BRASS, { solid: true });
  cyl(t, 'candle-wax', [2, 26, -10], 1.2, 12, 'wax', WAX);
  ball(t, 'candle-flame', [2, 33, -10], 0.9, 'emissive', '#ffb347', { glow: 2.5 });
  box(t, 'napkin-fold', [-2, 1.4, 12], [12, 2.8, 8], 'fabric', '#c45a4a', { cover: true, turn: 0.2 });
  box(t, 'far-floor', [0, -50, 40], [200, 1, 120], 'wood', '#8c5a33');
  for (const x of [-40, 40]) cyl(t, 'far-chair', [x, -28, 26], 2, 44, 'wood', OAK);
  lamp(t, 'candle', [2, 32, -10], '#ffb347', 9, 50, 'a candle burning low');
  lamp(t, 'moon', [-20, 60, 20], '#9fb9ff', 6, 100, 'moonlight on the table');
  door(t, 'entry', 'entry', -20, 13, ['climb', 'cable'], 'the table leg');
  door(t, 'drop', 'forward', 6, 14.5, ['drop', 'cable'], 'the table edge');
  door(t, 'runner', 'forward', 21, -13, ['cable', 'climb'], 'the lamp flex');
  spot(t, 'plate', -10, 2, 'open', 'on the dinner plate', { bias: 'food' });
  spot(t, 'salt', -17, -7, 'tucked', 'behind the salt and pepper', { bias: 'food' });
  spot(t, 'napkin', -2, 15, 'tucked', 'under the napkin');
  spot(t, 'glass', 12, -5, 'open', 'by the water glass', { bias: 'curio' });
  spot(t, 'candle', 5, -12, 'cache', 'in the candle drips', { bias: 'curio' });
  threat(t, 'cat', 'cat', 0, 0, 1, 'the cat on the table');
  threat(t, 'lights', 'lights', 0, 0, 2, 'the dining light');
}
{
  const w = 46, d = 30;
  const t = template('laundry-pile', { name: 'The laundry mountain', zone: 'kidroom', minDepth: 3, w, d, floor: 'carpet', floorColor: '#6d7d96', flavor: 'A week of clothes in a heap by the basket. Pockets full of forgotten things.', dark: true });
  wall(t, 'north', w, d, '#c8b8d8', '#f4efe3');
  box(t, 'basket', [14, 18, -8], [18, 36, 14], 'cardboard', '#c8a06a', { solid: true });
  box(t, 'basket-rim', [14, 36.5, -8], [19, 1.5, 15], 'wood', '#a87b4c');
  box(t, 'jeans', [-6, 4, -4], [24, 8, 12], 'fabric', '#3d5a8a', { solid: true, turn: 0.15 });
  box(t, 'jeans-pocket', [-6, 8.2, 0.5], [6, 0.4, 4], 'fabric', '#33507c', { turn: 0.15 });
  box(t, 'tshirt', [-12, 1.5, 9], [18, 3, 12], 'fabric', '#e74c3c', { cover: true, turn: -0.3 });
  box(t, 'sock-a', [8, 1, 8], [10, 2, 5], 'fabric', '#f4efe3', { cover: true, turn: 0.8 });
  box(t, 'sock-b', [18, 1, 4], [10, 2, 5], 'fabric', '#2c3e50', { turn: -0.5 });
  box(t, 'hoodie', [-18, 6, -8], [14, 12, 14], 'fabric', '#7a5aa0', { solid: true, turn: 0.4 });
  lamp(t, 'hall', [0, 20, 15], '#ffd28a', 5, 50, 'hall light under the door');
  lamp(t, 'moon', [20, 50, -10], '#9fb9ff', 5, 90, 'moonlight');
  door(t, 'entry', 'entry', -20, 12, ['crack', 'climb', 'cable'], 'the door gap');
  door(t, 'on', 'forward', 20, 12, ['crack', 'climb'], 'over the sock pile');
  exit(t, 'vent', 'vent', 0, -13, 'the floor vent');
  spot(t, 'pocket', -6, 3, 'cache', 'in a jeans pocket', { bias: 'curio' });
  spot(t, 'tshirt', -12, 12, 'tucked', 'under the T-shirt');
  spot(t, 'sock', 8, 11, 'tucked', 'inside a sock', { bias: 'curio' });
  spot(t, 'hood', -18, 2, 'open', 'by the hoodie', { bias: 'part' });
  spot(t, 'basket', 4, -9, 'open', 'beside the basket');
  threat(t, 'roomba', 'roomba', 0, 6, 3, 'the roomba');
  threat(t, 'cat', 'cat', 6, 4, 3, 'the cat nesting in the laundry');
  threat(t, 'kid', 'kid', 0, 18, 4, 'the kid at the door');
}

// ---------------------------------------------------------------- garage
{
  const w = 48, d = 32;
  const t = template('workbench', { name: 'The garage workbench', zone: 'garage', minDepth: 3, w, d, floor: 'concrete', floorColor: '#8a8784', flavor: 'Cold concrete, oil stains like lakes. Screws lie about like felled trees.', dark: true });
  wall(t, 'north', w, d, '#b9b2a2', '#9c9584');
  box(t, 'pegboard', [0, 60, -15.6], [50, 50, 0.8], 'cardboard', '#c8a06a');
  for (const x of [-20, 20]) for (const z of [-12, 10]) box(t, 'bench-leg', [x, 30, z], [3, 60, 3], 'wood', '#7a5a3a', { solid: true });
  box(t, 'bench-top', [0, 61, -1], [50, 3, 28], 'wood', '#8f6a42');
  cyl(t, 'paint-can', [-12, 8, 4], 7, 16, 'metal', '#b5b8ba', { solid: true });
  cyl(t, 'paint-drip', [-12, 16.2, 4], 7.1, 0.6, 'paint', '#3f7fbf');
  cyl(t, 'paint-can-b', [12, 6, 8], 5.5, 12, 'metal', '#a9acae', { solid: true });
  for (const [x, z, r] of [[2, -6, 0.2], [6, 4, 1.4], [-4, 10, 2.6]] as const) cyl(t, 'screw', [x, 0.6, z], 0.5, 7, 'chrome', CHROME, { roll: Math.PI / 2, turn: r });
  box(t, 'oil-stain', [4, 0.05, -2], [16, 0.1, 10], 'glass', '#2a2622');
  cyl(t, 'extension-reel', [18, 7, -8], 7, 6, 'plastic', '#e8b52b', { solid: true, roll: Math.PI / 2 });
  cyl(t, 'cord', [8, 0.5, -8], 0.6, 22, 'plastic', '#e86a2b', { roll: Math.PI / 2, turn: Math.PI / 2 });
  box(t, 'flap', [-23.6, 9, 6], [0.6, 16, 12], 'plastic', '#5d5a52');
  lamp(t, 'charger', [18, 12, -8], '#ff4a3a', 4, 30, 'a battery charger LED');
  lamp(t, 'window', [10, 70, 10], '#9fb9ff', 6, 100, 'the garage window');
  door(t, 'entry', 'entry', -20, 14, ['crack', 'vent'], 'the garage door gap');
  door(t, 'cord', 'forward', 18, 14, ['cable', 'climb'], 'the extension cord');
  exit(t, 'dogdoor', 'dogdoor', -21, 6, 'the cat flap to the garden');
  spot(t, 'screws', 4, 6, 'open', 'among the screws', { bias: 'part' });
  spot(t, 'can', -8, 8, 'tucked', 'behind the paint can', { bias: 'part' });
  spot(t, 'reel', 14, -4, 'tucked', 'by the cord reel', { bias: 'part' });
  spot(t, 'stain', 2, -2, 'open', 'at the oil stain');
  spot(t, 'leg', -18, -10, 'cache', 'at the bench leg', { bias: 'part' });
  threat(t, 'trap', 'trap', -4, 0, 3, 'a mousetrap');
  threat(t, 'trap-b', 'trap', 10, 2, 4, 'a second mousetrap');
  threat(t, 'spider', 'spider', -18, -8, 3, 'a garage spider');
  threat(t, 'dog', 'dog', 6, 12, 4, 'the dog');
}

{
  const w = 46, d = 28;
  const t = template('garage-shelf', { name: 'The garage shelving', zone: 'garage', minDepth: 4, w, d, floor: 'metal', floorColor: '#7d8286', flavor: 'A steel shelf of jars and tins. Everything the family ever meant to fix is up here.', dark: true, elevated: 40, ceiling: 30 });
  box(t, 'shelf-steel', [0, -0.8, 0], [52, 1.6, 34], 'metal', '#7d8286');
  box(t, 'shelf-above', [0, 31, 0], [52, 1.6, 34], 'metal', '#6f7478');
  box(t, 'pegwall', [0, 16, -15], [52, 32, 0.8], 'cardboard', '#b9925c');
  cyl(t, 'screw-jar', [-14, 7, -7], 5, 14, 'glass', '#cfe0e3', { solid: true });
  cyl(t, 'screw-jar-lid', [-14, 14.6, -7], 5.3, 1.2, 'metal', '#c0392b');
  cyl(t, 'tin-a', [-2, 6, -8], 5.5, 12, 'metal', '#a9acae', { solid: true });
  cyl(t, 'tin-b', [8, 4, -6], 4, 8, 'metal', '#3f7fbf', { solid: true });
  box(t, 'toolbox', [16, 6, 2], [14, 12, 9], 'plastic', '#c0392b', { solid: true });
  box(t, 'toolbox-handle', [16, 12.8, 2], [8, 1.2, 1.4], 'metal', '#222222');
  box(t, 'tape-roll', [-12, 1.4, 8], [7, 2.8, 7], 'plastic', '#a6a6a6', { solid: true });
  box(t, 'rag', [2, 0.8, 8], [12, 1.6, 9], 'fabric', '#8a6d4a', { cover: true, turn: 0.3 });
  box(t, 'far-floor', [0, -40, 40], [200, 1, 120], 'concrete', '#8a8784');
  lamp(t, 'charger', [-20, 4, 10], '#ff4a3a', 3, 24, 'a charger LED');
  lamp(t, 'window', [10, 40, 20], '#9fb9ff', 6, 90, 'the garage window');
  door(t, 'entry', 'entry', -20, 11, ['climb', 'cable'], 'the shelf upright');
  door(t, 'edge', 'forward', 18, 12, ['drop', 'cable'], 'the shelf lip');
  spot(t, 'jar', -10, -3, 'cache', 'spilled from the screw jar', { bias: 'part' });
  spot(t, 'rag', 2, 11, 'tucked', 'under the oily rag');
  spot(t, 'toolbox', 10, 6, 'tucked', 'behind the toolbox', { bias: 'part' });
  spot(t, 'tape', -6, 8, 'open', 'by the tape roll', { bias: 'part' });
  spot(t, 'tin', 2, -2, 'open', 'between the tins');
  threat(t, 'spider', 'spider', 14, -9, 4, 'a shelf spider');
  threat(t, 'trap', 'trap', -2, 4, 4, 'a mousetrap');
}

// ---------------------------------------------------------------- attic
{
  const w = 46, d = 32;
  const t = template('attic-boxes', { name: 'The attic', zone: 'attic', minDepth: 4, w, d, floor: 'darkwood', floorColor: '#5e4630', flavor: 'Beams, boxes, and the family’s forgotten past. Treasure, if you can find it in the dark.', dark: true });
  for (let i = 0; i < 6; i++) box(t, 'joist', [-20 + i * 8, 0.6, 0], [3, 1.2, 40], 'wood', '#6e5236');
  box(t, 'box-a', [-12, 12, -8], [18, 24, 14], 'cardboard', CARD, { solid: true });
  box(t, 'box-a-tape', [-12, 24.1, -8], [3, 0.2, 14], 'paper', '#d9c79a');
  box(t, 'box-b', [-12, 30, -9], [14, 12, 12], 'cardboard', '#a07a4c', { turn: 0.2 });
  box(t, 'box-c', [14, 8, 6], [14, 16, 12], 'cardboard', '#c39a68', { solid: true, turn: -0.3 });
  box(t, 'trunk', [10, 8, -10], [20, 16, 10], 'wood', '#5a3420', { solid: true });
  box(t, 'trunk-band', [10, 8, -4.9], [20.4, 1.4, 0.4], 'metal', BRASS);
  box(t, 'trunk-lock', [10, 12, -4.7], [2, 2.6, 0.6], 'metal', BRASS);
  box(t, 'insulation', [-4, 1.4, 12], [16, 1.6, 8], 'dust', '#e6a2a8', { cover: true });
  box(t, 'rafter', [0, 50, -20], [50, 60, 2], 'wood', '#4a3424', { tilt: 0.6 });
  box(t, 'window', [20, 30, -16], [8, 12, 0.6], 'glass', '#3c5a8a');
  box(t, 'vent-grille', [-21, 3, 10], [0.6, 5, 9], 'metal', '#8c8f88');
  lamp(t, 'window', [18, 28, -12], '#a8c4ff', 9, 70, 'moonlight through the attic window');
  lamp(t, 'hatch', [-18, 6, 14], '#ffc477', 3, 24, 'light from the hatch');
  door(t, 'entry', 'entry', -18, 14, ['climb', 'cable', 'crack'], 'the attic hatch');
  door(t, 'beams', 'forward', 18, 14, ['crack', 'climb'], 'along the beams');
  exit(t, 'vent', 'vent', -19, 10, 'the heating vent');
  spot(t, 'trunk', 10, -3, 'cache', 'at the old trunk', { bias: 'curio' });
  spot(t, 'box', -4, -2, 'tucked', 'between the boxes', { bias: 'curio' });
  spot(t, 'insul', -4, 9, 'tucked', 'in the insulation');
  spot(t, 'joist', 4, 6, 'open', 'on the joist', { bias: 'part' });
  spot(t, 'window', 18, -4, 'open', 'under the window', { bias: 'curio' });
  threat(t, 'spider', 'spider', 0, -12, 4, 'the attic spider');
  threat(t, 'spider-b', 'spider', 18, 10, 5, 'another spider');
  threat(t, 'trap', 'trap', -10, 4, 4, 'an old mousetrap');
}

// Every marker a Little or a hunter must stand on is nudged off any solid it was placed inside, the
// same footprint rule `src/world.ts` walks by, so the authored intent survives a resized prop.
type Box = { x: number; z: number; w: number; d: number };
function footprintOf(v: Record<string, any>): Box {
  const turn = Number(v.meta?.turn ?? 0);
  if (v.shape === 'box') {
    const w = v.halfExtents.x * 2, d = v.halfExtents.z * 2, c = Math.abs(Math.cos(turn)), s = Math.abs(Math.sin(turn));
    return turn === 0 ? { x: v.center.x, z: v.center.z, w, d } : { x: v.center.x, z: v.center.z, w: (w * c + d * s) * 0.86, d: (w * s + d * c) * 0.86 };
  }
  return { x: v.center.x, z: v.center.z, w: (v.radius ?? 1) * 2, d: (v.radius ?? 1) * 2 };
}
const rooms = new Map(volumes.filter(v => v.kind === 'crumb-room').map(v => [String((v.meta as Meta).template), v as Record<string, any>]));
function clear(template: string, x: number, z: number, radius: number): boolean {
  const room = rooms.get(template)!;
  if (Math.abs(x - room.center.x) > room.halfExtents.x - radius || Math.abs(z - room.center.z) > room.halfExtents.z - radius) return false;
  for (const v of volumes as Record<string, any>[]) {
    if (v.kind !== 'crumb-prop' || v.meta.template !== template || v.meta.solid !== true) continue;
    const bottom = v.center.y - (v.halfExtents?.y ?? (v.height ?? (v.radius ?? 0) * 2) / 2);
    if (bottom >= 3) continue;
    const f = footprintOf(v);
    if (Math.abs(x - f.x) < f.w / 2 + radius && Math.abs(z - f.z) < f.d / 2 + radius) return false;
  }
  return true;
}
for (const m of markers as Record<string, any>[]) {
  const template = String(m.meta.template);
  if (!rooms.has(template) || m.kind === 'crumb-lamp') continue;
  const big = m.kind === 'crumb-threat' && ['cat', 'dog', 'roomba'].includes(String(m.meta.threat));
  const radius = big ? 2.2 : 0.9;
  if (m.kind === 'crumb-threat' && ['kid', 'lights'].includes(String(m.meta.threat))) continue;
  if (clear(template, m.x, m.z, radius)) continue;
  let best: [number, number] | null = null;
  for (let r = 0.5; r < 14 && best === null; r += 0.5) for (let a = 0; a < 24; a++) {
    const x = m.x + Math.cos(a / 24 * Math.PI * 2) * r, z = m.z + Math.sin(a / 24 * Math.PI * 2) * r;
    if (clear(template, x, z, radius)) { best = [x, z]; break; }
  }
  if (best === null) throw new Error(`No clear floor near ${m.id}`);
  m.x = Math.round(best[0] * 10) / 10; m.z = Math.round(best[1] * 10) / 10;
}

{
  const w = 46, d = 30;
  const t = template('attic-christmas', { name: 'The Christmas boxes', zone: 'attic', minDepth: 5, w, d, floor: 'darkwood', floorColor: '#54402c', flavor: 'Eleven months of the year the decorations sleep up here. Baubles big as houses glint in the dark.', dark: true });
  for (let i = 0; i < 6; i++) box(t, 'joist', [-20 + i * 8, 0.6, 0], [3, 1.2, 38], 'wood', '#6a4e33');
  box(t, 'xmas-box', [-12, 9, -9], [18, 18, 12], 'cardboard', '#b8323a', { solid: true });
  box(t, 'xmas-box-lid', [-12, 18.6, -8], [18.6, 1.2, 12.6], 'cardboard', '#2f7a46', { tilt: -0.35 });
  ball(t, 'bauble-red', [4, 4.5, -8], 4.5, 'glass', '#d23b30', { solid: true });
  ball(t, 'bauble-gold', [12, 3.5, -10], 3.5, 'chrome', '#d4af37', { solid: true });
  ball(t, 'bauble-blue', [-2, 3, 8], 3, 'glass', '#2f6fd1', { solid: true });
  cyl(t, 'bauble-cap', [4, 9.3, -8], 0.9, 1.2, 'metal', BRASS);
  for (let i = 0; i < 10; i++) ball(t, 'light-bulb', [-18 + i * 3.6, 0.7, 12 - Math.sin(i) * 2], 0.6, 'emissive', ['#ff5a4a', '#5aff7a', '#5ab4ff', '#ffd86b'][i % 4]!, { glow: 1.4 });
  cyl(t, 'light-flex', [-2, 0.3, 12], 0.15, 36, 'plastic', '#1d3a1d', { roll: Math.PI / 2, turn: Math.PI / 2 });
  box(t, 'tinsel-heap', [14, 1.2, 6], [10, 2.4, 8], 'dust', '#e8e2c8', { cover: true, turn: 0.4 });
  box(t, 'photo-album', [16, 2, -2], [10, 4, 14], 'paper', '#6b2f2a', { solid: true, turn: -0.2 });
  box(t, 'rafter', [0, 50, -19], [50, 60, 2], 'wood', '#4a3424', { tilt: 0.6 });
  lamp(t, 'fairy', [-2, 3, 12], '#ffcf8f', 6, 40, 'a string of fairy lights still plugged in');
  lamp(t, 'moon', [18, 30, -12], '#a8c4ff', 6, 70, 'moonlight through a gap in the tiles');
  door(t, 'entry', 'entry', -19, 13, ['crack', 'climb'], 'along the beams');
  door(t, 'on', 'forward', 19, 13, ['crack', 'cable', 'climb'], 'over the album');
  exit(t, 'vent', 'vent', -20, 2, 'the heating vent');
  spot(t, 'box', -10, -2, 'cache', 'spilling from the decorations box', { bias: 'curio' });
  spot(t, 'tinsel', 12, 9, 'tucked', 'in the tinsel');
  spot(t, 'album', 10, -6, 'tucked', 'behind the photo album', { bias: 'curio' });
  spot(t, 'lights', -8, 10, 'open', 'by the fairy lights');
  spot(t, 'bauble', 4, -2, 'open', 'reflected in a bauble', { bias: 'curio' });
  threat(t, 'spider', 'spider', 18, 10, 5, 'a spider in the tinsel');
  threat(t, 'trap', 'trap', 0, 2, 5, 'an old mousetrap');
}

{
  const w = 48, d = 32;
  const t = template('garage-bikes', { name: 'By the garage bikes', zone: 'garage', minDepth: 3, w, d, floor: 'concrete', floorColor: '#7f7c78', flavor: 'A bicycle wheel stands like a Ferris wheel. Football, pump, oil can: a playground for giants.', dark: true });
  wall(t, 'north', w, d, '#a9a395', '#8c8676');
  cyl(t, 'bike-tyre', [-10, 26, -10], 26, 3, 'rubber', '#222222', { roll: Math.PI / 2, turn: 0 });
  cyl(t, 'bike-rim', [-10, 26, -10], 22, 3.4, 'chrome', CHROME, { roll: Math.PI / 2 });
  for (let i = 0; i < 8; i++) cyl(t, 'spoke', [-10, 26, -10], 0.2, 44, 'chrome', CHROME, { roll: i * Math.PI / 8 });
  box(t, 'tyre-contact', [-10, 0.6, -10], [3, 1.2, 6], 'rubber', '#222222', { solid: true });
  ball(t, 'football', [12, 7, 2], 7, 'rubber', '#e8e2d0', { solid: true });
  cyl(t, 'pump', [18, 14, -10], 1.6, 28, 'metal', '#c0392b', { solid: true });
  box(t, 'pump-handle', [18, 28.5, -10], [8, 1.2, 1.2], 'plastic', '#222222');
  cyl(t, 'oil-can', [-18, 5, 8], 3.5, 10, 'metal', '#5a7a3a', { solid: true });
  cyl(t, 'oil-spout', [-15, 11, 8], 0.4, 8, 'metal', '#5a7a3a', { roll: -0.8 });
  box(t, 'oil-puddle', [-12, 0.05, 10], [8, 0.1, 6], 'glass', '#2a2622');
  box(t, 'cardboard-flat', [2, 0.4, 10], [16, 0.8, 12], 'cardboard', CARD, { cover: true, turn: 0.2 });
  box(t, 'flap', [23.6, 9, 4], [0.6, 16, 12], 'plastic', '#5d5a52');
  lamp(t, 'window', [0, 60, 18], '#9fb9ff', 7, 100, 'moonlight through the garage window');
  lamp(t, 'freezer', [-20, 6, -12], '#bfe8ff', 3, 26, 'a chest freezer’s light');
  door(t, 'entry', 'entry', -20, 13, ['crack', 'vent'], 'the garage door gap');
  door(t, 'on', 'forward', 6, -13, ['climb', 'cable'], 'up the pump hose');
  exit(t, 'dogdoor', 'dogdoor', 21, 4, 'the cat flap to the garden');
  spot(t, 'card', 2, 12, 'tucked', 'under the flattened box');
  spot(t, 'ball', 4, -2, 'open', 'behind the football', { bias: 'part' });
  spot(t, 'oil', -14, 2, 'open', 'by the oil can', { bias: 'part' });
  spot(t, 'wheel', -2, -12, 'cache', 'in the spokes', { bias: 'curio' });
  spot(t, 'pump', 14, -6, 'tucked', 'at the pump foot', { bias: 'part' });
  threat(t, 'dog', 'dog', 8, 10, 3, 'the dog, let in to the garage');
  threat(t, 'trap', 'trap', -6, 6, 3, 'a mousetrap');
  threat(t, 'spider', 'spider', -20, -10, 4, 'a spider on the wheel');
}

for (const volume of volumes) session.dispatch({ type: 'addVolume', volume: volume as never });
for (const marker of markers) {
  const result = api.handle({ method: 'add_marker', ...marker } as never);
  if (!result.ok) throw new Error(JSON.stringify(result));
}
writeFileSync(path, session.exportJson(true).replace(/\r\n/g, '\n') + '\n');
console.log(api.handle({ method: 'scene_summary' }));
dispose();
