import { describe, expect, it } from "bun:test";
import {
  resolveResistance,
  resistanceScale,
  UnknownResistanceCategoryError,
  UnknownResistancePropertyError,
  type ResistanceMatrix,
} from "./resistance";

const bloonsMatrix: ResistanceMatrix = {
  categories: {
    sharp: { lead: "immune", frozen: "immune" },
    explosive: { black: "immune", lead: "vulnerable" },
    energy: { camo: "normal", white: "immune" },
  },
  default: "normal",
};

const elementalMatrix: ResistanceMatrix = {
  categories: {
    fire: { icy: "vulnerable", flame: "immune", stone: "resist" },
    ice: { flame: "vulnerable", icy: "immune" },
  },
};

describe("resolveResistance", () => {
  it("blocks a whole category as immune (Bloons lead vs sharp)", () => {
    const result = resolveResistance(bloonsMatrix, "sharp", ["lead"]);
    expect(result.verdict).toBe("immune");
    expect(result.multiplier).toBe(0);
    expect(result.immune).toBe(true);
  });

  it("amplifies vulnerable categories (explosive vs lead)", () => {
    const result = resolveResistance(bloonsMatrix, "explosive", ["lead"]);
    expect(result.verdict).toBe("vulnerable");
    expect(result.multiplier).toBe(2);
  });

  it("halves damage on resist (fire vs stone)", () => {
    const result = resolveResistance(elementalMatrix, "fire", ["stone"]);
    expect(result.verdict).toBe("resist");
    expect(result.multiplier).toBe(0.5);
  });

  it("returns normal when a valid property has no rule for the category", () => {
    const result = resolveResistance(bloonsMatrix, "sharp", ["red"]);
    expect(result.verdict).toBe("normal");
    expect(result.multiplier).toBe(1);
  });

  it("immune on any property wins over other matches", () => {
    const result = resolveResistance(bloonsMatrix, "sharp", ["frozen", "camo"]);
    expect(result.immune).toBe(true);
    expect(result.multiplier).toBe(0);
  });

  it("stacks multiple resist properties multiplicatively", () => {
    const matrix: ResistanceMatrix = {
      categories: { fire: { wet: "resist", armored: "resist" } },
    };
    const result = resolveResistance(matrix, "fire", ["wet", "armored"]);
    expect(result.multiplier).toBe(0.25);
    expect(result.verdict).toBe("resist");
  });

  it("lets a cell carry an explicit scalar multiplier alongside named verdicts", () => {
    const matrix: ResistanceMatrix = {
      categories: {
        shielded: { shock: 2, incendiary: 0.75 },
        armor: { corrosive: 1.5, incendiary: 0.75 },
        flesh: { incendiary: 1.5, corrosive: 0.9 },
      },
      default: "normal",
    };
    expect(resistanceScale(matrix, "shielded", ["shock"])).toBe(2);
    expect(resistanceScale(matrix, "shielded", ["none"])).toBe(1);
    expect(resistanceScale(matrix, "armor", ["corrosive"])).toBe(1.5);
    expect(resistanceScale(matrix, "flesh", ["corrosive"])).toBe(0.9);
    expect(resistanceScale(matrix, "flesh", ["incendiary"])).toBe(1.5);
    expect(resistanceScale(matrix, "armor", ["incendiary"])).toBe(0.75);
  });

  it("reports verdict from a scalar cell relative to normal", () => {
    const matrix: ResistanceMatrix = { categories: { flesh: { corrosive: 0.9 } } };
    const result = resolveResistance(matrix, "flesh", ["corrosive"]);
    expect(result.multiplier).toBe(0.9);
    expect(result.verdict).toBe("resist");
    expect(result.immune).toBe(false);
  });

  it("stacks scalar and named cells multiplicatively", () => {
    const matrix: ResistanceMatrix = { categories: { fire: { wet: 0.9, armored: "resist" } } };
    expect(resistanceScale(matrix, "fire", ["wet", "armored"])).toBeCloseTo(0.45);
  });

  it("honors a custom multiplier table", () => {
    const matrix: ResistanceMatrix = {
      categories: { fire: { stone: "resist" } },
      multipliers: { resist: 0.75 },
    };
    expect(resistanceScale(matrix, "fire", ["stone"])).toBe(0.75);
  });

  it("supports an empty catalog with a default verdict for any category", () => {
    const matrix: ResistanceMatrix = { categories: {}, default: "immune" };
    const result = resolveResistance(matrix, "holy", ["ghost"]);
    expect(result.immune).toBe(true);
    expect(result.multiplier).toBe(0);
  });

  it("throws on a misspelled category that is not in the catalog", () => {
    expect(() => resolveResistance(bloonsMatrix, "sharpp", ["lead"])).toThrow(
      UnknownResistanceCategoryError,
    );
  });

  it("uses unknownCategory when a category is intentionally unlisted", () => {
    const matrix: ResistanceMatrix = {
      categories: { fire: { stone: "resist" } },
      unknownCategory: "immune",
    };
    const result = resolveResistance(matrix, "holy", ["ghost"]);
    expect(result.immune).toBe(true);
    expect(result.multiplier).toBe(0);
  });

  it("throws on invalid property ids when propertyIds is declared", () => {
    const matrix: ResistanceMatrix = {
      categories: { sharp: { lead: "immune" } },
      propertyIds: ["lead", "red"],
      default: "normal",
    };
    expect(resolveResistance(matrix, "sharp", ["red"]).verdict).toBe("normal");
    expect(() => resolveResistance(matrix, "sharp", ["leed"])).toThrow(UnknownResistancePropertyError);
  });
});
