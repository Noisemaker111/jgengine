import { describe, expect, test } from "bun:test";
import { seededRng } from "@jgengine/core/random/rng";

import { MANUFACTURERS } from "./guns";
import { rollGun } from "./roll";
import { UNIQUE_GUNS } from "./uniques";

describe("scrap-signal quest-reward uniques", () => {
  test("a unique always rolls as itself: its name, maker, family, rarity, element and model", () => {
    for (const unique of UNIQUE_GUNS) {
      for (const seed of ["a", "b", "c"]) {
        const gun = rollGun(seededRng(`${unique.name}:${seed}`), 7, { unique: unique.name });
        expect(gun.name).toBe(unique.name);
        expect(gun.manufacturer).toBe(unique.maker);
        expect(gun.family).toBe(unique.family);
        expect(gun.rarity).toBe(unique.rarity);
        expect(gun.element).toBe(unique.element);
        expect(gun.model).toBe(`unique:${unique.name}`);
        expect(gun.level).toBe(7);
      }
    }
  });

  test("a unique keeps its maker's element rules", () => {
    for (const unique of UNIQUE_GUNS) {
      const maker = MANUFACTURERS.find((candidate) => candidate.id === unique.maker);
      if (maker === undefined) throw new Error(`${unique.name}: unknown maker ${unique.maker}`);
      if (maker.neverElemental === true) expect(unique.element, unique.name).toBe("none");
      if (maker.forcedElement !== undefined) expect(unique.element, unique.name).toBe(maker.forcedElement);
      if (maker.id === "Voltek") expect(unique.element, unique.name).not.toBe("none");
    }
  });

  test("an unknown unique is refused rather than rolled as a plain gun", () => {
    expect(() => rollGun(seededRng("x"), 3, { unique: "Nonesuch" })).toThrow();
  });
});
