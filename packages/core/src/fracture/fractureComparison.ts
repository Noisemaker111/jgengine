// @skill jgengine-world
/**
 * Score the engine's ways of breaking things against the comminution laws: a granite block hit at
 * several specific energies, broken by `fractureRock`, by `StructureGraph.toDebris` and by
 * `toDebrisBodies`, each read for fragment count, largest piece, t10 and the share of the impact
 * energy its pieces fly off with. The laws say t10 = A(1 − e^(−b E)) and 0.5–5% of the energy as
 * fragment motion (Fujiwara & Tsukamoto 1980).
 *
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */

import { boxCell, cellVolume } from "./convexCell";
import { KWH_PER_TONNE, jkT10, t10 } from "./fragmentSize";
import { GRANITE_BREAKAGE, fractureRock } from "./rockFracture";
import { seededRng } from "../random/rng";
import { toDebrisBodies, type SupportPiece } from "../world/support";
import { PhysicsWorld } from "../physics/physicsWorld";
import { StructureGraph } from "../physics/structure";

/** One subject at one energy. */
export interface FractureComparisonRow {
  subject: string;
  /** Specific impact energy, kWh/t. */
  energy: number;
  pieces: number;
  /** Largest piece over the block's mass. */
  largest: number;
  /** t10 of the pieces, percent. */
  t10: number;
  /** t10 the JKMRC law gives, percent. */
  lawT10: number;
  /** Fragment kinetic energy over impact energy. */
  kineticShare: number;
}

/** Edge of the compared block, m: a 0.5 m granite block. */
const EDGE = 0.5;

/**
 * Break a 0.5 m granite block at each energy with every subject. The structure subjects get the block as 2×2×2 pieces, their
 * finest possible split.
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export function compareFracture(energies: readonly number[] = [0.01, 0.1, 1]): FractureComparisonRow[] {
  const material = GRANITE_BREAKAGE;
  const half = EDGE / 2;
  const block = boxCell([-half, -half, -half], [half, half, half]);
  const volume = cellVolume(block).volume;
  const mass = volume * material.density;
  const size = Math.cbrt((6 * volume) / Math.PI);
  const quarter = EDGE / 4;
  const pieces: SupportPiece[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) pieces.push({ id: `${x}${y}${z}`, position: [x * quarter, y * quarter + 1, z * quarter], halfExtents: [quarter, quarter, quarter], mass: mass / 8 });
  const rows: FractureComparisonRow[] = [];
  for (const energy of energies) {
    const joules = energy * KWH_PER_TONNE * mass;
    const lawT10 = jkT10(energy, material.a, material.b);
    const row = (subject: string, masses: readonly number[], sizes: readonly number[], kinetic: number, count = masses.length): FractureComparisonRow => ({
      subject,
      energy,
      pieces: count,
      largest: Math.max(...masses) / mass,
      t10: t10({ sizes, masses }, size),
      lawT10,
      kineticShare: kinetic / joules,
    });

    const broken = fractureRock(block, { material, energy: joules, impactPoint: [0, half, 0], rng: seededRng(`compare:${energy}`), force: true });
    const kinetic = broken.fragments.reduce((sum, f) => sum + 0.5 * f.mass * (f.velocity[0] ** 2 + f.velocity[1] ** 2 + f.velocity[2] ** 2), 0);
    rows.push(row("fractureRock", [...broken.fragments.map((f) => f.mass), broken.finesMass], [...broken.fragments.map((f) => f.size), 0], kinetic, broken.fragments.length));

    const graph = new StructureGraph({ nodes: [{ id: "ground", position: [0, 0, 0], halfExtents: [1, 0.1, 1], anchor: true }, ...pieces.map((piece) => ({ id: piece.id, position: piece.position ?? [0, 0, 0], halfExtents: piece.halfExtents ?? [quarter, quarter, quarter], mass: mass / 8 }))], edges: pieces.map((piece) => ({ a: "ground", b: piece.id })) });
    const fell: string[] = [];
    for (const piece of pieces) fell.push(...graph.severEdge("ground", piece.id).fell);
    const world = new PhysicsWorld({ capacity: 16, bounds: { min: [-10, -10, -10], max: [10, 10, 10] } });
    const bodies = graph.toDebris(world, { fell, collapsed: true }, { origin: [0, 1 + half, 0] });
    let structureKinetic = 0;
    for (const b of bodies) structureKinetic += 0.5 * (mass / 8) * ((world.velX[b] ?? 0) ** 2 + (world.velY[b] ?? 0) ** 2 + (world.velZ[b] ?? 0) ** 2);
    rows.push(row("StructureGraph.toDebris", bodies.map(() => mass / 8), bodies.map(() => size / 2), structureKinetic));

    const debris = toDebrisBodies(pieces, pieces.map((piece) => piece.id));
    let supportKinetic = 0;
    for (const body of debris) {
      const v = body.velocity ?? [0, 0, 0];
      supportKinetic += 0.5 * (mass / 8) * (v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
    }
    rows.push(row("toDebrisBodies", debris.map(() => mass / 8), debris.map(() => size / 2), supportKinetic));
  }
  return rows;
}

/**
 * The comparison as a markdown table.
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export function formatFractureComparison(rows: readonly FractureComparisonRow[]): string {
  const lines = ["| Subject | Energy, kWh/t | Pieces | Largest | t10 | Law t10 | Energy into motion (law 0.5–5%) |", "|---|---|---|---|---|---|---|"];
  for (const row of rows) {
    lines.push(`| ${row.subject} | ${row.energy} | ${row.pieces} | ${(100 * row.largest).toFixed(0)}% | ${row.t10.toFixed(1)}% | ${row.lawT10.toFixed(1)}% | ${(100 * row.kineticShare).toFixed(2)}% |`);
  }
  return lines.join("\n");
}
