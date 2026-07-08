import { describe, expect, test } from "bun:test";

import { createNameGenerator, fillTemplate, pickFrom } from "./nameGen";
import { seededRng } from "./rng";

describe("createNameGenerator", () => {
  test("same seed reproduces the same name sequence", () => {
    const draw = () => {
      const generator = createNameGenerator({
        rng: seededRng("vaelmere"),
        syllables: { onset: ["k", "t", "z"], nucleus: ["a", "e", "o"], coda: ["r", "n"] },
        minSyllables: 2,
        maxSyllables: 3,
      });
      return Array.from({ length: 5 }, () => generator.name());
    };

    expect(draw()).toEqual(draw());
  });

  test("different seeds diverge", () => {
    const names = (seed: string) => {
      const generator = createNameGenerator({
        rng: seededRng(seed),
        syllables: { onset: ["k", "t", "z"], nucleus: ["a", "e", "o"], coda: ["r", "n"] },
        maxSyllables: 3,
      });
      return Array.from({ length: 5 }, () => generator.name());
    };

    expect(names("vaelmere")).not.toEqual(names("osterholt"));
  });

  test("respects minSyllables and maxSyllables using fixed-length syllable parts", () => {
    const generator = createNameGenerator({
      rng: seededRng("syllable-bounds"),
      syllables: { onset: ["b"], nucleus: ["a"], coda: ["n"] },
      minSyllables: 2,
      maxSyllables: 4,
      capitalize: false,
    });

    for (let i = 0; i < 50; i++) {
      const name = generator.name();
      expect(name.length % 3).toBe(0);
      const syllableCount = name.length / 3;
      expect(syllableCount).toBeGreaterThanOrEqual(2);
      expect(syllableCount).toBeLessThanOrEqual(4);
      expect(name).toMatch(/^(ban){2,4}$/);
    }
  });

  test("capitalizes the first letter by default", () => {
    const generator = createNameGenerator({
      rng: seededRng("capitalized"),
      syllables: { nucleus: ["a", "e"] },
      minSyllables: 2,
      maxSyllables: 2,
    });

    const name = generator.name();
    expect(name.charAt(0)).toBe(name.charAt(0).toUpperCase());
  });

  test("capitalize: false leaves the case untouched", () => {
    const generator = createNameGenerator({
      rng: seededRng("lowercase"),
      syllables: { nucleus: ["a", "e"] },
      minSyllables: 2,
      maxSyllables: 2,
      capitalize: false,
    });

    const name = generator.name();
    expect(name).toBe(name.toLowerCase());
  });

  test("works with nucleus-only syllables (no onset or coda configured)", () => {
    const generator = createNameGenerator({
      rng: seededRng("nucleus-only"),
      syllables: { nucleus: ["a", "e", "i", "o", "u"] },
      minSyllables: 3,
      maxSyllables: 3,
      capitalize: false,
    });

    expect(generator.name()).toHaveLength(3);
  });
});

describe("pickFrom", () => {
  test("is deterministic for a fixed rng sequence", () => {
    const bank = ["alpha", "beta", "gamma"] as const;
    expect(pickFrom(seededRng("pick-seed"), bank)).toBe(pickFrom(seededRng("pick-seed"), bank));
  });

  test("always returns an element from the bank", () => {
    const rng = seededRng("pick-range");
    const bank = ["alpha", "beta", "gamma"] as const;
    for (let i = 0; i < 50; i++) {
      expect(bank).toContain(pickFrom(rng, bank));
    }
  });

  test("throws on an empty bank", () => {
    expect(() => pickFrom(seededRng("empty"), [])).toThrow();
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
