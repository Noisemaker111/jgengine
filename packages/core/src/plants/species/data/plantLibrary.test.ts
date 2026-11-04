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

describe("plant species library", () => {
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

describe("palm trunks", () => {
  test("a coconut's surplus carbon never balloons its newest trunk sections (seed forest-b-cocos-nucifera, 60 years)", () => {
    const coconut = PLANT_LIBRARY.find((species) => species.id === "cocos-nucifera");
    if (coconut === undefined) throw new Error("cocos-nucifera missing");
    const growth = createPlantGrowth(coconut, { ...OPEN_TEMPERATE_SITE, light: 1 }, "forest-b-cocos-nucifera");
    growth.step(60);
    const { segments, stats } = growth.structure();
    // A coconut trunk is 25-40 cm across; a 15 m slab of bark came from metre-wide sections.
    expect(Math.max(...segments.radiusStart, ...segments.radiusEnd)).toBeLessThan(0.6);
    for (let i = 0; i < segments.order.length; i += 1) {
      expect(Math.hypot(segments.end[i * 3] ?? 0, segments.end[i * 3 + 2] ?? 0)).toBeLessThan(stats.crownRadiusM + 1);
      expect(segments.end[i * 3 + 1] ?? 0).toBeGreaterThanOrEqual(-0.01);
    }
  });
});

describe("posture", () => {
  test("a sweetgum whose young leader sagged rights itself and keeps every limb above ground (seed forest-b-liquidambar-styraciflua, 60 years)", () => {
    const sweetgum = PLANT_LIBRARY.find((species) => species.id === "liquidambar-styraciflua");
    if (sweetgum === undefined) throw new Error("liquidambar-styraciflua missing");
    const growth = createPlantGrowth(sweetgum, { ...OPEN_TEMPERATE_SITE, light: 1 }, "forest-b-liquidambar-styraciflua");
    growth.step(60);
    const { segments, stats } = growth.structure();
    let tip = 0;
    for (let i = 1; i < segments.order.length; i += 1) {
      if (segments.order[i] === 0 && (segments.end[i * 3 + 1] ?? 0) > (segments.end[tip * 3 + 1] ?? 0)) tip = i;
      expect(segments.end[i * 3 + 1] ?? 0).toBeGreaterThanOrEqual(-0.01);
    }
    // Without reaction wood the year-2 whip sagged 38 degrees and the tree grew lying along the ground.
    expect(stats.heightM).toBeGreaterThan(20);
    expect(Math.hypot(segments.end[tip * 3] ?? 0, segments.end[tip * 3 + 2] ?? 0)).toBeLessThan(0.2 * stats.heightM);
  });
});
