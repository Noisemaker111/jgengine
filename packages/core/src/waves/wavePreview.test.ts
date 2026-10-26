import { describe, expect, test } from "bun:test";

import { summarizeWave } from "./wavePreview";

const wave = {
  id: "w3",
  label: "Breakers",
  groups: [
    { unit: "grunt", entry: "west", count: 4, at: 3 },
    { unit: "harpy", entry: "east", count: 2, at: 0 },
    { unit: "grunt", entry: "west", count: 2, at: 1 },
    { unit: "shaman", entry: "west", at: 8 },
    { unit: "captain", entry: "west", at: 9, elite: true },
    { unit: "ghost", entry: "north", count: 0 },
  ],
};

const traits: Record<string, readonly string[]> = { harpy: ["flying"], shaman: ["healer", "warded"], grunt: ["armored"] };

describe("wave preview", () => {
  test("units total across groups in order of first arrival, with traits and entries", () => {
    const preview = summarizeWave(wave, { traitsOf: (unit) => traits[unit] ?? [] });
    expect(preview.total).toBe(9);
    expect(preview.units).toEqual([
      { unit: "harpy", count: 2, firstAt: 0 },
      { unit: "grunt", count: 6, firstAt: 1 },
      { unit: "shaman", count: 1, firstAt: 8 },
    ]);
    expect(preview.traits).toEqual({ armored: 6, flying: 2, healer: 1, warded: 1 });
    expect(preview.entries).toEqual(["west", "east"]);
    expect(preview.label).toBe("Breakers");
  });

  test("elite groups count only when asked, and no trait reader means no traits", () => {
    const preview = summarizeWave(wave, { includeElite: true });
    expect(preview.total).toBe(10);
    expect(preview.units.at(-1)).toEqual({ unit: "captain", count: 1, firstAt: 9 });
    expect(preview.traits).toEqual({});
  });
});
