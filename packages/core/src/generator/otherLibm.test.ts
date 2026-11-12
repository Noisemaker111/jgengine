import { describe, expect, test } from "bun:test";

import { BUILDING_GENERATOR } from "../buildings/buildingGenerator";
import { CITY_GENERATOR, resolveCityObject } from "../city/cityKind";
import { ROCK_FRACTURE_GENERATOR } from "../fracture/rockFractureGenerator";
import { GRASS_GENERATOR } from "../grass/grassKind";
import { DRIFTWOOD_GENERATOR, ROCK_GENERATOR } from "../nature/natureGenerators";
import { roundedFingerprint, withOtherLibm } from "../random/testFixtures/otherLibm";
import { RACE_CIRCUIT_GENERATOR } from "../roads/raceCircuit";
import { STREET_NETWORK_GENERATOR } from "../roads/streetGenerator";
import { SCATTER_GENERATOR } from "../scatter/scatterRegion";
import type { SceneKindObject } from "../scene/sceneKinds";
import { runGenerator, type GeneratorDefinition } from "./generator";

// A seeded generator must give the same output on every machine, but `Math.sin`, `pow`, `atan2`...
// differ in the last bit between libms (glibc releases, browsers). Each salt is a different
// consistent "other libm"; the output, rounded far above an ulp, must not notice. A failure here
// is a discrete decision (a tie, a boundary test, a wrap) that hangs on rounding noise.
const OTHER_LIBMS = [1, 5, 7];

function expectLibmIndependent(produce: () => unknown): void {
  const here = roundedFingerprint(produce());
  for (const salt of OTHER_LIBMS) expect(roundedFingerprint(withOtherLibm(salt, produce))).toBe(here);
}

function presetBags(definition: GeneratorDefinition): [string, Record<string, unknown>][] {
  return [["defaults", { seed: "libm" }], ...(definition.schema.presets ?? []).map((preset): [string, Record<string, unknown>] => [preset.id, { ...preset.values, seed: `libm-${preset.id}` }])];
}

describe("seeded generators do not depend on the platform's libm", () => {
  // `SURFACE_MATERIAL_GENERATOR` is left out: it bakes textures for seconds per preset.
  const generators: GeneratorDefinition[] = [
    STREET_NETWORK_GENERATOR,
    RACE_CIRCUIT_GENERATOR,
    SCATTER_GENERATOR,
    GRASS_GENERATOR,
    BUILDING_GENERATOR,
    ROCK_GENERATOR,
    DRIFTWOOD_GENERATOR,
    ROCK_FRACTURE_GENERATOR,
  ] as GeneratorDefinition[];
  for (const definition of generators) {
    test(`${definition.id}: every preset`, () => {
      for (const [, meta] of presetBags(definition)) expectLibmIndependent(() => runGenerator(definition, meta));
    }, 60_000);
  }

  const volume = (meta: Record<string, unknown>, rotationY = 0): SceneKindObject => ({
    id: "libm-city",
    kind: "city",
    center: { x: 10, y: 0, z: -5 },
    halfExtents: { x: 220, y: 10, z: 180 },
    rotationY,
    meta,
  });

  for (const [id, meta] of presetBags(CITY_GENERATOR as GeneratorDefinition)) {
    test(`city: ${id}`, () => {
      expectLibmIndependent(() => resolveCityObject(volume(meta)));
    }, 60_000);
  }

  test("city: a street race, a rotated volume, terrain with bridges and tunnels, a zone override", () => {
    const terrain = (x: number, z: number): number => 6 * Math.sin(x / 37) + 4 * Math.cos(z / 23) - 2;
    const zone: SceneKindObject = { id: "z", kind: "cityzone", center: { x: 0, y: 0, z: 0 }, halfExtents: { x: 60, y: 5, z: 60 }, meta: { band: "edge", mix: [{ item: "barn", weight: 1 }] } };
    expectLibmIndependent(() => resolveCityObject(volume({ seed: "fp-race", race: true, gridness: 0.8 })));
    expectLibmIndependent(() => resolveCityObject(volume({ seed: "turned", race: true }, 0.6)));
    expectLibmIndependent(() =>
      resolveCityObject(volume({ seed: "relief", elevation: 0.6, bridges: true, tunnels: true, minElevation: -3 }), { sampleHeight: terrain }),
    );
    expectLibmIndependent(() => resolveCityObject(volume({ seed: "zoned" }), { zoneOverrides: [zone] }));
  }, 120_000);
});
