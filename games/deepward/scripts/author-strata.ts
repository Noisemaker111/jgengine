/** Deepward strata: Marrow's bays and fabricator, receiving's lift and harvest, and the three deep
 * floor plans (II Cold Stores, III Ink Wells, IV Choir Deep), authored with the published editor session.
 * Idempotent: removes everything it authored before (ids in OWN_IDS or prefixed `strata-`), then adds.
 * Run from deepward with `bun scripts/author-strata.ts` (after author-station.ts if both are run).
 */
import { createEditorHost } from '@jgengine/editor/session';
import { readFileSync, writeFileSync } from 'node:fs';
const path = new URL('../src/editor.scene.json', import.meta.url);
const { session, api, dispose } = createEditorHost({ gameId: 'deepward', layers: JSON.parse(readFileSync(path, 'utf8')) });

type Place = 'home' | 'vault' | 'cold' | 'wells' | 'choir';
type Meta = Record<string, unknown>;
interface MarkerSpec { id: string; kind: string; x: number; y: number; z: number; rotationY?: number; label: string; meta: Meta }
const markers: MarkerSpec[] = [];
const volumes: Record<string, unknown>[] = [];
let n = 0;

// ---------- helpers ----------
function mark(id: string, kind: string, place: Place, x: number, z: number, label: string, meta: Meta = {}, rotationY?: number, y = 0) {
  markers.push({ id, kind, x, y, z, ...(rotationY === undefined ? {} : { rotationY }), label, meta: { place, ...meta } });
}
function anchor(id: string, place: Place, x: number, z: number, label: string, meta: Meta, rotationY?: number) { mark(id, 'deepward-anchor', place, x, z, label, meta, rotationY); }
function node(place: Place, nodeId: string, x: number, z: number, label: string, yields: string, tool: string, amount: number) { mark(`strata-node-${nodeId}`, 'deepward-node', place, x, z, label, { nodeId, yields, tool, amount }); }
function supply(place: Place, supplyId: string, x: number, z: number, label: string, gives: 'ration' | 'water', amount: number) { mark(`strata-supply-${supplyId}`, 'deepward-supply', place, x, z, label, { supplyId, gives, amount }); }
function fragment(place: Place, fragmentId: string, x: number, z: number, label: string, entry: string) { mark(`strata-fragment-${fragmentId}`, 'deepward-fragment', place, x, z, label, { fragmentId, entry }); }
function fauna(place: Place, creatureId: string, x: number, z: number, label: string, species: string) { mark(`strata-fauna-${creatureId}`, 'deepward-fauna', place, x, z, label, { creatureId, species }); }
function sign(place: Place, key: string, x: number, y: number, z: number, turn: number, title: string, subtitle: string, width = 2.4) {
  mark(`strata-sign-${place}-${key}`, 'deepward-station-sign', place, x, z, title, { subtitle, width }, turn, y);
}
/** A room: x0..x1, z0..z1, floor at 0 and ceiling at `height`. */
function room(place: Place, key: string, label: string, x0: number, x1: number, z0: number, z1: number, height: number) {
  volumes.push({ id: `strata-room-${place}-${key}`, kind: 'deepward-room', shape: 'box', center: { x: (x0 + x1) / 2, y: height / 2, z: (z0 + z1) / 2 }, halfExtents: { x: (x1 - x0) / 2, y: height / 2, z: (z1 - z0) / 2 }, label, meta: { place } });
}
function hazard(place: Place, key: string, kind: 'frost' | 'ink', x: number, z: number, w: number, d: number, label: string) {
  volumes.push({ id: `strata-hazard-${place}-${key}`, kind: 'deepward-hazard', shape: 'box', center: { x, y: 1, z }, halfExtents: { x: w / 2, y: 1, z: d / 2 }, label, meta: { place, hazard: kind } });
}
function box(place: Place, role: string, at: number[], size: number[], color: string, solid = false, surface = 'paint', turn = 0) {
  volumes.push({ id: `strata-${place}-${role}-${++n}`, kind: 'deepward-structure', shape: 'box', center: { x: at[0]!, y: at[1]!, z: at[2]! }, halfExtents: { x: size[0]! / 2, y: size[1]! / 2, z: size[2]! / 2 }, color, label: role, meta: { place, surface, turn, solid } });
}
function drum(place: Place, role: string, at: number[], radius: number, height: number, color: string, turnX = 0, turnZ = 0, surface = 'steel') {
  volumes.push({ id: `strata-${place}-${role}-${++n}`, kind: 'deepward-structure', shape: 'cylinder', center: { x: at[0]!, y: at[1]!, z: at[2]! }, radius, height, color, label: role, meta: { place, surface, turnX, turnZ } });
}
const facing = (x: number, z: number, cx: number, cz: number) => Math.atan2(cx - x, cz - z);

// ---------- Marrow: fabricator and six base bays ----------
anchor('fabricator-marrow', 'home', -5.2, 16.4, 'Fabricator', { role: 'fabricator', reach: 2.1 }, Math.PI / 2);
const bays: [number, number][] = [[5.6, 9.6], [5.6, 12.4], [5.6, 17.6], [2.8, 17.9], [0, 17.9], [-2.8, 17.9]];
bays.forEach(([x, z], i) => anchor(`bay-${i + 1}`, 'home', x, z, `Bay ${i + 1}`, { role: 'bay' }, facing(x, z, 0, 13)));
sign('home', 'bays', 6.85, 2.5, 11, -Math.PI / 2, 'BAYS / MARROW', 'BUILD WITH WHAT YOU BRING HOME', 2.6);
for (const [x, z] of bays) box('home', 'bay-floor-plate', [x, 0.012, z], [1.7, 0.024, 1.7], '#3a4446', false, 'floor');

// ---------- I Receiving additions ----------
anchor('lift-vault-down', 'vault', -1.2, -42.6, 'Descent lift / II', { role: 'lift', to: 'cold', reach: 2 });
anchor('spawn-vault-lift', 'vault', -1.2, -41.1, 'Lift landing', { role: 'stratum-spawn' });
box('vault', 'lift-cage-post', [-2.45, 1.7, -43.6], [0.16, 3.4, 0.16], '#d59b48');
box('vault', 'lift-cage-post', [0.05, 1.7, -43.6], [0.16, 3.4, 0.16], '#d59b48');
box('vault', 'lift-cage-head', [-1.2, 3.45, -43.6], [2.7, 0.2, 0.2], '#263739');
sign('vault', 'lift', -1.2, 2.9, -43.85, 0, 'LIFT / II COLD STORES', '120 M  ↓  SEAL 2', 2.4);
node('vault', 'vault-scrap-wire', -6.2, -0.5, 'Scrap heap', 'wire', 'hands', 2);
node('vault', 'vault-scrap-polymer', 6.5, -31.8, 'Scrap heap', 'polymer', 'hands', 1);
supply('vault', 'vault-ration-locker', -3.8, -21.2, 'Ration locker', 'ration', 2);
supply('vault', 'vault-coolant-tap', -6.8, -24, 'Coolant tap', 'water', 2);
fragment('vault', 'vault-cart-wreck', 6.2, 1, 'Rail cart wreck', 'cutter');
fragment('vault', 'vault-shift-log', 3.2, -8.2, 'Shift log terminal', 'log-receiving');
fauna('vault', 'vault-hand-1', -4.5, -17, 'Hand', 'hand');
fauna('vault', 'vault-hand-2', 3.5, -24.5, 'Hand', 'hand');

// ---------- II Cold Stores ----------
{
  const P: Place = 'cold', H = 4.4, enamel = '#c9d6dc', ice = '#9fc4dd', deep = '#3b5568', frost = '#e6f2f8', lamp = '#d4e8ff';
  room(P, 'landing', '05 / lift landing', -4, 4, 10, 19, H);
  room(P, 'aisles', '06 / freezer aisles', -8, 8, -14, 10, H);
  room(P, 'icehouse', '07 / ice house', -5, 5, -26, -14, H);
  // Bulkheads narrow each shared edge to a 2.4 m doorway.
  for (const s of [-1, 1]) {
    box(P, 'bulkhead', [s * 2.6, H / 2, 10], [2.8, H, 0.4], deep, true);
    box(P, 'bulkhead', [s * 3.1, H / 2, -14], [3.8, H, 0.4], deep, true);
  }
  box(P, 'door-header', [0, H - 0.3, 10], [2.4, 0.6, 0.4], deep);
  box(P, 'door-header', [0, H - 0.3, -14], [2.4, 0.6, 0.4], deep);
  // Shelving rows: four long runs broken by a cross aisle at z -3.5..-1.5.
  for (const x of [-5.5, -2.5, 2.5, 5.5]) for (const [z, d] of [[-7.25, 7.5], [2.25, 7.5]] as const) {
    box(P, 'shelf-row', [x, 1.7, z], [0.9, 3.4, d], enamel, true);
    for (const y of [0.9, 1.8, 2.7]) box(P, 'shelf-frost-lip', [x, y, z], [1.0, 0.05, d + 0.04], frost, false, 'steel');
    for (let i = 0; i < 3; i++) box(P, 'frozen-crate', [x, 3.62, z - d / 3 + i * d / 3], [0.8, 0.44, 0.9], i % 2 ? ice : deep);
  }
  // Frosted pipes overhead, lamp strips over the main and side aisles.
  for (const x of [-4, 4]) drum(P, 'frost-pipe', [x, 4.0, -2], 0.14, 23.5, frost, Math.PI / 2);
  drum(P, 'frost-header', [0, 4.05, 8.6], 0.16, 15.4, frost, 0, Math.PI / 2);
  for (const x of [-7, -4, 0, 4, 7]) box(P, 'cold-lamp', [x, 4.3, -2], [0.12, 0.04, 20], lamp, false, 'lamp');
  box(P, 'cold-lamp', [0, 4.3, 14.5], [0.12, 0.04, 7], lamp, false, 'lamp');
  box(P, 'cold-lamp', [0, 4.3, -20], [0.12, 0.04, 10], lamp, false, 'lamp');
  // Landing: lift cage at the north wall.
  for (const x of [-1.4, 1.4]) box(P, 'lift-cage-post', [x, 1.7, 18.7], [0.16, 3.4, 0.16], '#d59b48');
  box(P, 'lift-cage-head', [0, 3.45, 18.7], [3, 0.2, 0.2], deep);
  // Ice house: solid block stacks and rime on the floor.
  box(P, 'ice-stack', [-4.3, 1.1, -20.5], [1.2, 2.2, 2], ice, true);
  box(P, 'ice-stack', [4.3, 1.1, -18.5], [1.2, 2.2, 2], ice, true);
  box(P, 'ice-rime', [-4.3, 2.3, -20.5], [1.3, 0.2, 2.1], frost);
  box(P, 'ice-rime', [4.3, 2.3, -18.5], [1.3, 0.2, 2.1], frost);
  for (const x of [-1.4, 1.4]) box(P, 'lift-cage-post', [x, 1.7, -25.7], [0.16, 3.4, 0.16], '#d59b48');
  box(P, 'lift-cage-head', [0, 3.45, -25.7], [3, 0.2, 0.2], deep);
  hazard(P, 'frost-aisle', 'frost', -0.5, 3, 3, 4, 'Frost patch');
  hazard(P, 'frost-icehouse', 'frost', 2, -18, 3, 4, 'Frost patch');
  anchor('lift-cold-up', P, 0, 17.6, 'Lift / I Receiving', { role: 'lift', to: 'vault', reach: 2 });
  anchor('spawn-cold', P, 0, 16.1, 'Lift landing', { role: 'stratum-spawn' });
  anchor('lift-cold-down', P, 0, -24.4, 'Descent lift / III', { role: 'lift', to: 'wells', reach: 2 });
  node(P, 'cold-cable-wire', -7.4, -6, 'Cable run', 'wire', 'cutter', 2);
  node(P, 'cold-cable-cells', 7.4, 2, 'Cable run', 'cells', 'cutter', 1);
  node(P, 'cold-scrap-polymer', 4, -12.5, 'Scrap heap', 'polymer', 'hands', 1);
  supply(P, 'cold-ration-crate-1', 3, 12, 'Ration crate', 'ration', 2);
  supply(P, 'cold-ration-crate-2', -4, -2.5, 'Ration crate', 'ration', 1);
  supply(P, 'cold-ice-block', -3.5, -24, 'Ice block', 'water', 2);
  fragment(P, 'cold-cart-wreck', 7, -9, 'Rail cart wreck', 'cutter');
  fragment(P, 'cold-diver-suit-1', -4, 4, 'Frozen diver suit', 'seal2');
  fragment(P, 'cold-diver-suit-2', 4, -7, 'Frozen diver suit', 'seal2');
  fragment(P, 'cold-diver-suit-3', -4, -17, 'Frozen diver suit', 'seal2');
  fragment(P, 'cold-drill-rig', 4.2, -22, 'Abandoned drill rig', 'drill');
  fragment(P, 'cold-seed-tray', -3, 12.5, 'Seed tray', 'growbed');
  fragment(P, 'cold-shift-log', 3, 16.5, 'Cold stores log', 'log-cold');
  fauna(P, 'cold-hand-1', -4, -8, 'Hand', 'hand');
  fauna(P, 'cold-hand-2', 4, 0, 'Hand', 'hand');
  fauna(P, 'cold-hand-3', -7, 2, 'Hand', 'hand');
  fauna(P, 'cold-hand-4', 7, -12, 'Hand', 'hand');
  fauna(P, 'cold-courier-1', -2.5, -20, 'Courier', 'courier');
  sign(P, 'landing', 2.6, 2.6, 18.85, Math.PI, '05 / LIFT LANDING', 'II COLD STORES / 120 M');
  sign(P, 'aisles', -2.6, 2.6, 10.25, 0, '06 / FREEZER AISLES', 'KEEP DOORS SHUT');
  sign(P, 'icehouse', -3.1, 2.6, -13.75, 0, '07 / ICE HOUSE', 'LIFT III  ↓');
}

// ---------- III Ink Wells ----------
{
  const P: Place = 'wells', H = 4.2, tank = '#5a3d75', band = '#9279aa', rail = '#4a4552', dark = '#1d1824', lamp = '#b48cff';
  room(P, 'sump', '08 / lift sump', -9, -1, 11, 19, H);
  room(P, 'catwalk-north', '09 / reservoir catwalks', -3.2, -0.8, -2, 11, H);
  room(P, 'catwalk-cross', '09 / reservoir catwalks', -9, 8, -4.4, -2, H);
  room(P, 'catwalk-east', '09 / reservoir catwalks', 5.6, 8, -2, 8, H);
  room(P, 'reservoir-deck', '09 / reservoir catwalks', 3, 9, 8, 14, H);
  room(P, 'catwalk-south', '09 / reservoir catwalks', 2, 4.4, -22, -4.4, H);
  room(P, 'well-floor', '10 / ink well floor', -8, 8, -36, -22, H);
  room(P, 'relay-spur', '10 / ink well floor', -8, -5.6, -22, -12, H);
  // Ink tanks: solid square bases under violet cylinders.
  for (const [x, z, r] of [[-7.5, 12.5, 0.8], [-4.5, -26.5, 1.1], [4.5, -29, 1.1], [0, -32.5, 1.1]] as const) {
    box(P, 'tank-base', [x, 0.2, z], [r * 2, 0.4, r * 2], dark, true);
    drum(P, 'ink-tank', [x, 2.2, z], r * 0.92, 3.6, tank, 0, 0, 'paint');
    for (const y of [1.0, 2.2, 3.4]) drum(P, 'tank-band', [x, y, z], r * 0.95, 0.12, band);
  }
  // Catwalk rails along the narrow runs (non-solid, at the edges).
  for (const x of [-3.12, -0.88]) box(P, 'catwalk-rail', [x, 1.0, 4.5], [0.06, 0.06, 13], rail, false, 'steel');
  for (const x of [2.08, 4.32]) box(P, 'catwalk-rail', [x, 1.0, -13.2], [0.06, 0.06, 17.6], rail, false, 'steel');
  for (const x of [5.68, 7.92]) box(P, 'catwalk-rail', [x, 1.0, 3], [0.06, 0.06, 10], rail, false, 'steel');
  for (const z of [-4.32, -2.08]) box(P, 'catwalk-rail', [-0.5, 1.0, z], [17, 0.06, 0.06], rail, false, 'steel');
  for (const [x, z, w, d] of [[-2, 4.5, 2.4, 13], [3.2, -13.2, 2.4, 17.6], [6.8, 3, 2.4, 10], [-0.5, -3.2, 17, 2.4]] as const)
    box(P, 'grating', [x, 0.01, z], [w - 0.3, 0.02, d - 0.3], '#2c2633', false, 'floor');
  drum(P, 'ink-main', [-2, 3.6, 4.5], 0.16, 13, band, Math.PI / 2);
  drum(P, 'ink-main', [3.2, 3.6, -13.2], 0.16, 17.6, band, Math.PI / 2);
  for (const [x, z] of [[-5, 15], [-2, 4.5], [-0.5, -3.2], [6, 11], [3.2, -13], [0, -27]] as const) box(P, 'well-lamp', [x, 4.1, z], [0.5, 0.05, 0.5], lamp, false, 'lamp');
  for (const x of [-6.4, -3.6]) box(P, 'lift-cage-post', [x, 1.7, 18.7], [0.16, 3.4, 0.16], '#d59b48');
  for (const x of [-6.9, -4.1]) box(P, 'lift-cage-post', [x, 1.7, -35.7], [0.16, 3.4, 0.16], '#d59b48');
  hazard(P, 'pool-catwalk', 'ink', 3.2, -12.5, 2.6, 3, 'Ink pool');
  hazard(P, 'pool-floor', 'ink', -2, -28, 2.5, 3, 'Ink pool');
  hazard(P, 'pool-deck', 'ink', 5, 10.5, 2.5, 3, 'Ink pool');
  anchor('lift-wells-up', P, -5, 17.8, 'Lift / II Cold Stores', { role: 'lift', to: 'cold', reach: 2 });
  anchor('spawn-wells', P, -5, 16.3, 'Lift landing', { role: 'stratum-spawn' });
  anchor('lift-wells-down', P, -5.5, -34.2, 'Descent lift / IV', { role: 'lift', to: 'choir', reach: 2 });
  node(P, 'wells-ink-seam-1', 7.2, 13, 'Ink seam', 'ink', 'drill', 1);
  node(P, 'wells-ink-seam-2', 6.8, -34.5, 'Ink seam', 'ink', 'drill', 1);
  node(P, 'wells-cable-cells', -8.2, -3.2, 'Cable run', 'cells', 'cutter', 2);
  supply(P, 'wells-condensate', -2.5, 12.5, 'Condensate drip', 'water', 1);
  supply(P, 'wells-ration-tin', 3.2, -19, 'Ration tin', 'ration', 1);
  fragment(P, 'wells-drill-rig', -6.8, -16, 'Seized drill rig', 'drill');
  fragment(P, 'wells-diver-suit-1', 4, 13, 'Drowned diver suit', 'seal3');
  fragment(P, 'wells-diver-suit-2', -2, 5, 'Drowned diver suit', 'seal3');
  fragment(P, 'wells-diver-suit-3', 6.5, -24.5, 'Drowned diver suit', 'seal3');
  fragment(P, 'wells-crawler-1', 6.8, 3, 'Crawler wreck', 'crawler');
  fragment(P, 'wells-crawler-2', -6.5, -30, 'Crawler wreck', 'crawler');
  fragment(P, 'wells-o2-scrubber', -2.5, 17.5, 'O2 scrubber', 'o2');
  fragment(P, 'wells-shift-log', -7.6, 15.5, 'Ink wells log', 'log-wells');
  fragment(P, 'wells-radio-relay', -6.8, -13, 'Radio relay', 'log-relay');
  fauna(P, 'wells-courier-1', 0, -29, 'Courier', 'courier');
  fauna(P, 'wells-courier-2', 0, -3.2, 'Courier', 'courier');
  fauna(P, 'wells-hand-1', -5, 13.5, 'Hand', 'hand');
  fauna(P, 'wells-hand-2', 7.6, 9.2, 'Hand', 'hand');
  sign(P, 'sump', -5, 2.4, 18.85, Math.PI, '08 / LIFT SUMP', 'III INK WELLS / 260 M');
  sign(P, 'catwalks', -5.5, 2.4, 11.15, 0, '09 / RESERVOIR CATWALKS', 'MIND THE RAILS');
  sign(P, 'floor', 3.5, 2.4, -35.85, 0, '10 / INK WELL FLOOR', 'LIFT IV  ↓  SEAL 4');
}

// ---------- IV Choir Deep ----------
{
  const P: Place = 'choir', H = 6, pillar = '#2a1416', red = '#7a1f1a', black = '#0e0a0b', ember = '#ff6a52';
  room(P, 'hall', '11 / choir hall', -8, 8, -14, 16, H);
  room(P, 'sanctum', '12 / sanctum', -4, 4, -24, -14, H);
  for (const s of [-1, 1]) box(P, 'bulkhead', [s * 2.75, H / 2, -14], [2.5, H, 0.4], black, true);
  box(P, 'door-header', [0, H - 0.5, -14], [3, 1, 0.4], black);
  // Printer pillars: staggered rows that break line of sight across the hall.
  const rows: [number, number[]][] = [[10, [-5, 0, 5]], [6, [-2.5, 2.5]], [2, [-5, 0, 5]], [-2, [-2.5, 2.5]], [-6, [-5, 0, 5]], [-10, [-2.5, 2.5]]];
  for (const [z, xs] of rows) for (const x of xs) {
    box(P, 'printer-pillar', [x, H / 2, z], [1.4, H, 1.4], pillar, true);
    box(P, 'pillar-head', [x, 1.6, z], [1.6, 0.5, 1.6], red);
    box(P, 'pillar-cap', [x, H - 0.25, z], [1.7, 0.5, 1.7], black);
    box(P, 'pillar-glow', [x, 1.25, z], [1.62, 0.04, 1.62], ember, false, 'lamp');
  }
  for (const x of [-4, 4]) drum(P, 'choir-conduit', [x, 5.4, 1], 0.2, 29, red, Math.PI / 2);
  for (const x of [-1.4, 1.4]) box(P, 'lift-cage-post', [x, 1.7, 15.7], [0.16, 3.4, 0.16], '#d59b48');
  for (const [x, z] of [[-2.6, -22.6], [2.6, -22.6], [-2.6, -17], [2.6, -17]] as const) drum(P, 'sanctum-cable', [x, 3, z], 0.18, 6, black);
  box(P, 'sanctum-glow', [0, 5.9, -21.5], [2.4, 0.05, 2.4], ember, false, 'lamp');
  anchor('lift-choir-up', P, 0, 14.8, 'Lift / III Ink Wells', { role: 'lift', to: 'wells', reach: 2 });
  anchor('spawn-choir', P, 0, 13.3, 'Lift landing', { role: 'stratum-spawn' });
  anchor('printer-zero', P, 0, -21.5, 'Printer Zero', { role: 'goal', reach: 2.2 });
  node(P, 'choir-ink-seam', -7, 7, 'Ink seam', 'ink', 'drill', 2);
  node(P, 'choir-cable-cells', 7, -4, 'Cable run', 'cells', 'cutter', 2);
  fragment(P, 'choir-crawler', 6.8, 12, 'Crawler wreck', 'crawler');
  fragment(P, 'choir-log', -6.8, 12.5, 'Choir log', 'log-choir');
  fragment(P, 'choir-zero-log', 2.6, -19.5, 'Printer Zero log', 'log-zero');
  fauna(P, 'choir-overrun', 0, -0.2, 'Overrun', 'overrun');
  fauna(P, 'choir-courier-1', -6, -9, 'Courier', 'courier');
  sign(P, 'hall', 3, 3, 15.85, Math.PI, '11 / CHOIR HALL', 'IV CHOIR DEEP / 400 M');
  sign(P, 'sanctum', -2.75, 3, -13.75, 0, '12 / SANCTUM', 'PRINTER ZERO');
}

// ---------- apply: remove what this script authored before, then add ----------
const OWN_IDS = new Set([...markers.map(m => m.id), ...volumes.map(v => v.id as string)]);
const doc = session.getState().document;
for (const entry of [...doc.markers, ...doc.volumes]) if (entry.id.startsWith('strata-') || OWN_IDS.has(entry.id)) session.dispatch({ type: 'remove', id: entry.id });
for (const volume of volumes) session.dispatch({ type: 'addVolume', volume: volume as never });
for (const m of markers) {
  const result = api.handle({ method: 'add_marker', ...m });
  if (!result.ok) throw Error(JSON.stringify(result));
}
writeFileSync(path, session.exportJson(true).replace(/\r\n/g, '\n') + '\n');
console.log(api.handle({ method: 'scene_summary' })); dispose();
