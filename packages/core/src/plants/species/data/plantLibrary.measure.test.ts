import { describe, expect, test } from "bun:test";
import { OPEN_TEMPERATE_SITE, type PlantEnvironment } from "../../growth/plantEnvironment";
import { createPlantGrowth } from "../../growth/plantGrowth";
import { buildPlantMesh } from "../../mesh/plantMesh";
import type { PlantStructure } from "../../structure/plantStructure";
import { PLANT_LIBRARY } from "./plantLibrary";
import { validatePlantSpecies } from "../plantSpecies";

const SITES: readonly [string, PlantEnvironment][] = [
  ["open", OPEN_TEMPERATE_SITE],
  ["stand", { ...OPEN_TEMPERATE_SITE, stand: { spacingIndex: 0.25 } }],
];
const AGES = [5, 60] as const;

/** The first non-finite value in a float array, as `name[i]=value`, or undefined. */
function nonFinite(name: string, values: Float32Array): string | undefined {
  for (let i = 0; i < values.length; i += 1) if (!Number.isFinite(values[i] ?? Number.NaN)) return `${name}[${i}]=${values[i]}`;
  return undefined;
}

function brokenNumbers(structure: PlantStructure): string[] {
  const problems: string[] = [];
  for (const [key, value] of Object.entries(structure.stats)) if (!Number.isFinite(value) || value < 0) problems.push(`stats.${key}=${value}`);
  const { segments, leaves } = structure;
  for (const [name, values] of [
    ["segments.start", segments.start],
    ["segments.end", segments.end],
    ["segments.radiusStart", segments.radiusStart],
    ["segments.radiusEnd", segments.radiusEnd],
    ["leaves.position", leaves.position],
    ["leaves.size", leaves.size],
  ] as const) {
    const bad = nonFinite(name, values);
    if (bad !== undefined) problems.push(bad);
  }
  for (const radii of [segments.radiusStart, segments.radiusEnd]) if (radii.some((r) => r < 0)) problems.push("a negative segment radius");
  if (leaves.size.some((s) => s < 0)) problems.push("a negative leaf size");
  return problems;
}

describe("plant species library, every species", () => {
  for (const species of PLANT_LIBRARY) {
    test(`${species.id}: a valid record that grows finite, non-negative sizes and builds a mesh, open and in a stand`, () => {
      expect(validatePlantSpecies(species)).toEqual([]);
      for (const [site, env] of SITES) {
        const plant = createPlantGrowth(species, env, "a");
        for (const age of AGES) {
          plant.step(age - plant.ageYears());
          const structure = plant.structure();
          const where = `${site} ${age} y`;
          expect(brokenNumbers(structure), where).toEqual([]);
          expect(structure.stats.heightM, where).toBeGreaterThan(0);
          const mesh = buildPlantMesh({ structure, detail: 0.5, structureHash: "-" });
          expect(mesh.triangles, where).toBeGreaterThan(0);
          for (const part of [mesh.bark, mesh.leaves]) {
            expect(nonFinite("positions", part.positions), where).toBeUndefined();
            const vertices = part.positions.length / 3;
            expect(part.indices.every((index) => index < vertices), where).toBe(true);
          }
        }
      }
    }, 60_000);
  }
});

