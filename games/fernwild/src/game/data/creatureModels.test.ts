import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { CREATURE_MODEL_SOURCES, SPECIES_MODELS } from "./creatureModels";
import { SPECIES } from "./species";

const folder = join(import.meta.dir, "..", "..", "..", "public", "models", "imported", "creatures");

describe("creature models", () => {
  test("every species has a model, and only species have one", () => {
    expect(Object.keys(SPECIES_MODELS).sort()).toEqual(Object.keys(SPECIES).sort());
  });

  test("every model file is baked, and every source is worn by some species", () => {
    const worn = new Set<string>(Object.values(SPECIES_MODELS).map((model) => model.file));
    for (const file of Object.keys(CREATURE_MODEL_SOURCES)) {
      expect(existsSync(join(folder, `${file}.glb`))).toBe(true);
      expect(worn.has(file)).toBe(true);
    }
  });
});
