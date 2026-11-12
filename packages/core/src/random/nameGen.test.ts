import { describe, expect, test } from "bun:test";

import { generatorVariants, runGenerator, untypedGenerator } from "../generator/generator";
import { generatorVariantText } from "../generator/generatorText";
import { defineNameGenerator, fillTemplate, NAMES_OUTPUT, registerNameGeneratorText } from "./nameGen";

const BANK = { onset: ["k", "t", "z"], nucleus: ["a", "e", "o"], coda: ["r", "n"] };
const NAMES = defineNameGenerator({ id: "test.names", label: "Test names", syllables: BANK, defaults: { minSyllables: 2, maxSyllables: 3, count: 5 } });

describe("defineNameGenerator", () => {
  test("is a generator of the names family with a seed field", () => {
    expect(NAMES.output).toBe(NAMES_OUTPUT);
    expect(NAMES.schema.fields.some((field) => field.type === "seed")).toBe(true);
  });

  test("same seed reproduces the same names", () => {
    expect(runGenerator(NAMES, { seed: "vaelmere" })).toEqual(runGenerator(NAMES, { seed: "vaelmere" }));
    expect(runGenerator(NAMES, { seed: "vaelmere" })).toHaveLength(5);
  });

  test("different seeds diverge", () => {
    expect(runGenerator(NAMES, { seed: "vaelmere" })).not.toEqual(runGenerator(NAMES, { seed: "osterholt" }));
  });

  test("a shorter roll is a prefix of a longer one", () => {
    const long = runGenerator(NAMES, { seed: "prefix", count: 12 });
    expect(runGenerator(NAMES, { seed: "prefix", count: 4 })).toEqual(long.slice(0, 4));
  });

  test("respects minSyllables and maxSyllables using fixed-length syllable parts", () => {
    const bounded = defineNameGenerator({ id: "test.bounded", label: "Bounded", syllables: { onset: ["b"], nucleus: ["a"], coda: ["n"] } });
    const names = runGenerator(bounded, { seed: "syllable-bounds", count: 50, minSyllables: 2, maxSyllables: 4, capitalize: false });
    const lengths = new Set<number>();
    for (const name of names) {
      expect(name).toMatch(/^(ban){2,4}$/);
      lengths.add(name.length / 3);
    }
    expect([...lengths].sort()).toEqual([2, 3, 4]);
  });

  test("capitalizes the first letter by default, and capitalize: false leaves the case", () => {
    const vowels = defineNameGenerator({ id: "test.vowels", label: "Vowels", syllables: { nucleus: ["a", "e"] } });
    for (const name of runGenerator(vowels, { seed: "capitalized" })) expect(name.charAt(0)).toBe(name.charAt(0).toUpperCase());
    for (const name of runGenerator(vowels, { seed: "lowercase", capitalize: false })) expect(name).toBe(name.toLowerCase());
  });

  test("works with nucleus-only syllables", () => {
    const vowels = defineNameGenerator({ id: "test.nucleus", label: "Nucleus", syllables: { nucleus: ["a", "e", "i", "o", "u"] } });
    expect(runGenerator(vowels, { seed: "nucleus-only", count: 1, minSyllables: 3, maxSyllables: 3 })[0]).toHaveLength(3);
  });

  test("a template wraps each name and draws a fresh name per placeholder", () => {
    const [titled] = runGenerator(NAMES, { seed: "template", count: 1, template: "Sir {name} of {name}" });
    expect(titled).toMatch(/^Sir [A-Z][a-z]+ of [A-Z][a-z]+$/);
  });

  test("onset, nucleus and coda draws spread across the bank", () => {
    const counts = new Map<string, number>();
    for (const name of runGenerator(NAMES, { seed: "spread", count: 64, minSyllables: 1, maxSyllables: 1, capitalize: false })) {
      counts.set(name.charAt(0), (counts.get(name.charAt(0)) ?? 0) + 1);
    }
    for (const onset of BANK.onset) expect(counts.get(onset) ?? 0).toBeGreaterThan(64 / 3 / 2);
  });

  test("an empty nucleus fails at declaration", () => {
    expect(() => defineNameGenerator({ id: "test.empty", label: "Empty", syllables: { nucleus: [] } })).toThrow(/nucleus/);
  });

  test("variants read as text: one line per name", () => {
    registerNameGeneratorText();
    const definition = untypedGenerator(NAMES);
    const variants = generatorVariants(definition, { seed: "grid" }, { count: 20 });
    const sets = variants.map((variant) => generatorVariantText(definition, variant));
    expect(sets).toHaveLength(20);
    expect(sets[0]).toEqual(runGenerator(NAMES, { seed: "grid" }));
    expect(new Set(sets.map((set) => set?.join(","))).size).toBe(20);
  });
});

describe("fillTemplate", () => {
  test("fills every placeholder from function vars", () => {
    const result = fillTemplate("{title} {name} of {realm}", {
      title: () => "Sir",
      name: () => "Aldric",
      realm: () => "Vaelmere",
    });

    expect(result).toBe("Sir Aldric of Vaelmere");
  });

  test("fills placeholders from plain string vars", () => {
    const result = fillTemplate("{title} {name}", { title: "Lady", name: "Osgira" });
    expect(result).toBe("Lady Osgira");
  });

  test("leaves unknown placeholders untouched", () => {
    const result = fillTemplate("{title} {mystery}", { title: "Sir" });
    expect(result).toBe("Sir {mystery}");
  });

  test("fills repeated placeholders independently on each occurrence", () => {
    let calls = 0;
    const result = fillTemplate("{n}-{n}", { n: () => String((calls += 1)) });
    expect(result).toBe("1-2");
  });
});
