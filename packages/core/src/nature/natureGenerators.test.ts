import { describe, expect, test } from "bun:test";

import { bakeGeneratorVariants, generatorVariants, getGenerator, runGenerator } from "@jgengine/core/generator/generator";
import { placedGeneratorFor } from "@jgengine/core/scene/assetGenerator";
import { registerBuiltinSceneKinds } from "@jgengine/core/scene/builtinSceneKinds";
import { isNatureMesh, type NatureMesh } from "./natureMesh";
import { findSchemaPreset, parseParams } from "@jgengine/core/generator/paramSchema";
import type { GeneratorDefinition } from "@jgengine/core/generator/generator";
import { BUSH_GENERATOR, NATURE_GENERATORS, NATURE_OUTPUT, PALM_GENERATOR, ROCK_GENERATOR } from "./natureGenerators";

function mesh(value: unknown): NatureMesh {
  if (!isNatureMesh(value)) throw new Error("not a nature mesh");
  return value;
}

const noValues: Record<string, unknown> = {};

const SPECIES = NATURE_GENERATORS.flatMap((definition) => [
  { definition, preset: "default", values: noValues },
  ...(definition.schema.presets ?? []).map((preset) => ({ definition, preset: preset.id, values: { ...preset.values } })),
]);

/** Most triangles one variant may cost at full detail; the half-detail level must be cheaper still. */
const FULL_DETAIL_TRIANGLES = 3200;

describe("nature generators", () => {
  test("cover every species the issue names", () => {
    const presets = new Set(SPECIES.map((species) => species.preset));
    for (const name of ["coconut", "cycad", "shrub", "berry", "fern", "rock", "boulder", "pebbles", "driftwood"]) {
      expect(presets.has(name)).toBe(true);
    }
    expect(NATURE_GENERATORS.every((definition) => definition.output === NATURE_OUTPUT)).toBe(true);
  });

  test("the same params and seed always grow the same mesh", () => {
    for (const { definition, values } of SPECIES) {
      const a = mesh(runGenerator(definition, { ...values, seed: "same" }));
      const b = mesh(runGenerator(definition, { ...values, seed: "same" }));
      expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
      expect(Array.from(a.colors)).toEqual(Array.from(b.colors));
      const other = mesh(runGenerator(definition, { ...values, seed: "other" }));
      expect(Array.from(other.positions)).not.toEqual(Array.from(a.positions));
    }
  });

  test("twenty variants of every species stay finite, grounded, bounded and look alike", () => {
    for (const { definition, preset, values } of SPECIES) {
      const baked = bakeGeneratorVariants(definition, values, { count: 20, explore: 1 });
      const base = mesh(baked[0]?.lods[0]?.output);
      const baseHeight = base.bounds.max[1] - base.bounds.min[1];
      for (const variant of baked) {
        const [full, half] = variant.lods.map((lod) => mesh(lod.output));
        if (full === undefined || half === undefined) throw new Error(`${definition.id}/${preset}: missing a detail level`);
        expect(full.triangles).toBeGreaterThan(0);
        expect(full.triangles).toBeLessThanOrEqual(FULL_DETAIL_TRIANGLES);
        expect(half.triangles).toBeLessThanOrEqual(full.triangles);
        expect(full.positions.every(Number.isFinite)).toBe(true);
        expect(full.normals.every(Number.isFinite)).toBe(true);
        expect(full.colors.every((c) => c >= 0 && c <= 1)).toBe(true);
        expect(Math.max(...full.indices)).toBeLessThan(full.positions.length / 3);
        // Grounded: the base sits at or just under y = 0 so a placement never floats.
        expect(full.bounds.min[1]).toBeLessThanOrEqual(0.05);
        expect(full.bounds.min[1]).toBeGreaterThan(-Math.max(0.6, baseHeight * 0.08));
        // Alike: even at full explore a variant stays within a believable size of its species.
        const height = full.bounds.max[1] - full.bounds.min[1];
        expect(height / baseHeight).toBeGreaterThan(0.4);
        expect(height / baseHeight).toBeLessThan(2.5);
      }
    }
  });

  test("variants keep what makes the species: cycads fruitless, shrubs berry-free, boulders one stone", () => {
    const pinned: [GeneratorDefinition, string, string][] = [
      [PALM_GENERATOR, "cycad", "fruit"],
      [BUSH_GENERATOR, "shrub", "berries"],
      [ROCK_GENERATOR, "boulder", "count"],
    ];
    for (const [definition, presetId, key] of pinned) {
      const preset = findSchemaPreset(definition.schema, presetId);
      const base = { ...preset?.values };
      const expected = parseParams(definition.schema, base)[key];
      for (const variant of generatorVariants(definition, base, { count: 20, explore: 1 })) expect(variant.params[key]).toBe(expected);
    }
  });

  test("variants differ from each other", () => {
    for (const { definition, values } of SPECIES) {
      const grid = generatorVariants(definition, values, { count: 6 });
      const shapes = new Set(grid.map((variant) => mesh(runGenerator(definition, variant.meta)).positions.slice(0, 60).join(",")));
      expect(shapes.size).toBe(6);
    }
  });

  test("palms draw their trunks with the bark surface and bushes their canopy as two-sided leaves", () => {
    const palm = mesh(runGenerator(PALM_GENERATOR, { preset: "coconut" }));
    expect(palm.parts?.some((part) => part.surface === "bark")).toBe(true);
    expect(palm.parts?.reduce((sum, part) => sum + part.count, 0)).toBe(palm.indices.length);
    const shrub = mesh(runGenerator(BUSH_GENERATOR, { preset: "shrub" }));
    expect(shrub.parts?.some((part) => part.surface === "leaf")).toBe(true);
    const rock = mesh(runGenerator(ROCK_GENERATOR, {}));
    expect(rock.parts).toBeUndefined();
    expect(rock.surface).toBe("rock");
  });

  test("register as placeable generators", () => {
    registerBuiltinSceneKinds();
    for (const definition of NATURE_GENERATORS) {
      expect(getGenerator(definition.id)?.output).toBe(NATURE_OUTPUT);
      expect(placedGeneratorFor({ assetId: definition.id })?.id).toBe(definition.id);
    }
  });
});
