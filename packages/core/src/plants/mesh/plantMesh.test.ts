import { describe, expect, test } from "bun:test";

import { OPEN_TEMPERATE_SITE } from "../growth/plantEnvironment";
import { createPlantGrowth } from "../growth/plantGrowth";
import { ACER_SACCHARUM } from "../species/data/acerSaccharum";
import { PLANT_CLUSTER_LEVELS, type PlantStructure } from "../structure/plantStructure";
import { buildPlantMesh, DEFAULT_PLANT_STYLE, PLANT_MESH_LODS } from "./plantMesh";

/** The structure with only the given leaf rows and no flowers or fruit. */
function keepLeafRows(structure: PlantStructure, rows: readonly number[]): PlantStructure {
  const pick = <T extends Float32Array | Uint16Array | Int32Array>(source: T, stride: number, make: (n: number) => T): T => {
    const out = make(rows.length * stride);
    rows.forEach((row, i) => {
      for (let k = 0; k < stride; k += 1) out[i * stride + k] = source[row * stride + k] ?? 0;
    });
    return out;
  };
  const f32 = (n: number) => new Float32Array(n);
  const { leaves } = structure;
  return {
    ...structure,
    leaves: {
      position: pick(leaves.position, 3, f32),
      normal: pick(leaves.normal, 3, f32),
      up: pick(leaves.up, 3, f32),
      size: pick(leaves.size, 1, f32),
      count: pick(leaves.count, 1, (n) => new Uint16Array(n)),
      segment: pick(leaves.segment, 1, (n) => new Int32Array(n)),
      cluster: pick(leaves.cluster, PLANT_CLUSTER_LEVELS, (n) => new Int32Array(n)),
      crownDepth: pick(leaves.crownDepth, 1, f32),
      colorState: pick(leaves.colorState, 4, f32),
      health: pick(leaves.health, 1, f32),
    },
    reproductive: { kind: new Uint8Array(0), position: new Float32Array(0), size: new Float32Array(0), stage: new Float32Array(0), count: new Uint16Array(0) },
  };
}

/** Farthest any foliage vertex lies from its nearest leaf row, metres. */
function farthestFromLeaves(positions: Float32Array, leaves: Float32Array): number {
  let worst = 0;
  for (let v = 0; v < positions.length; v += 3) {
    let best = Number.POSITIVE_INFINITY;
    for (let r = 0; r < leaves.length; r += 3) {
      const d = ((positions[v] ?? 0) - (leaves[r] ?? 0)) ** 2 + ((positions[v + 1] ?? 0) - (leaves[r + 1] ?? 0)) ** 2 + ((positions[v + 2] ?? 0) - (leaves[r + 2] ?? 0)) ** 2;
      if (d < best) best = d;
    }
    worst = Math.max(worst, Math.sqrt(best));
  }
  return worst;
}

describe("plant mesh", () => {
  test("a few stray leaves draw a clump or cluster card the size of their leaves, not of the grid cell (#2735)", () => {
    // The issue's maple: 25 years open-grown, drawn with leaves scaled 2.6× as Fernwild's were.
    const growth = createPlantGrowth(ACER_SACCHARUM, { ...OPEN_TEMPERATE_SITE, light: 1 }, "tree~v0");
    growth.step(25);
    const structure = growth.structure(200);
    const { position } = structure.leaves;
    const rows = structure.leaves.size.length;
    // The lowest leaf row on the tree and the row nearest it: two stray leaves low on a limb.
    let lowest = 0;
    for (let row = 1; row < rows; row += 1) if ((position[row * 3 + 1] ?? 0) < (position[lowest * 3 + 1] ?? 0)) lowest = row;
    let nearest = -1;
    let nearestD = Number.POSITIVE_INFINITY;
    for (let row = 0; row < rows; row += 1) {
      if (row === lowest) continue;
      const d = Math.hypot((position[row * 3] ?? 0) - (position[lowest * 3] ?? 0), (position[row * 3 + 1] ?? 0) - (position[lowest * 3 + 1] ?? 0), (position[row * 3 + 2] ?? 0) - (position[lowest * 3 + 2] ?? 0));
      if (d < nearestD) {
        nearestD = d;
        nearest = row;
      }
    }
    const stray = keepLeafRows(structure, [lowest, nearest]);
    const leafScale = 2.6;
    const drawnLeaf = (structure.leaves.size[lowest] ?? 0) * leafScale;
    // Clumps group leaves at every level; leaf cards group them into cluster cards past the first two.
    for (const foliage of ["clumps", "leaves"] as const) {
      for (const detail of foliage === "clumps" ? PLANT_MESH_LODS : PLANT_MESH_LODS.slice(2)) {
        const mesh = buildPlantMesh({ structure: stray, style: { ...DEFAULT_PLANT_STYLE, foliage, leafScale }, detail, structureHash: "-" });
        expect(mesh.leaves.positions.length, `${foliage} at ${detail}`).toBeGreaterThan(0);
        // A group reaches one drawn leaf past the rows it stands for, its lumps and card corners a little more.
        expect(farthestFromLeaves(mesh.leaves.positions, stray.leaves.position), `${foliage} at ${detail}`).toBeLessThan(2.5 * drawnLeaf + nearestD);
      }
    }
  });
});
