import { describe, expect, it } from "bun:test";
import {
  armorMitigation,
  assertDamageTable,
  DuplicateDamageTypeError,
  formatDamageTable,
  readDamageTable,
  resolveTableDamage,
  typeMultiplier,
  UnknownDamageTypeError,
  type DamageTableDef,
} from "./damageTable";

const table: DamageTableDef = {
  types: [
    { id: "kinetic", vs: { flesh: 0.75, shield: 1, armor: 0.5 } },
    { id: "fire", vs: { flesh: 1.5, shield: 0.75, armor: 0.75 } },
    { id: "corrosion", vs: { flesh: 0.5, shield: 0.5, armor: 2 } },
    { id: "void", bypassArmor: true, vs: { flesh: 1 } },
  ],
  armor: { halfValue: 100, maxMitigation: 0.9 },
};

describe("typeMultiplier", () => {
  it("reads a listed type × resistance pair", () => {
    expect(typeMultiplier(table, "corrosion", "armor")).toBe(2);
    expect(typeMultiplier(table, "fire", "flesh")).toBe(1.5);
  });

  it("uses the table default for a resistance class the type does not list", () => {
    expect(typeMultiplier(table, "kinetic", "bone")).toBe(1);
  });

  it("throws on a type the table does not define instead of dealing 1×", () => {
    expect(() => typeMultiplier(table, "plasma", "flesh")).toThrow(UnknownDamageTypeError);
  });
});

describe("armorMitigation", () => {
  it("is zero at zero armor and one half at the half value", () => {
    expect(armorMitigation(0, { halfValue: 100 })).toBe(0);
    expect(armorMitigation(100, { halfValue: 100 })).toBeCloseTo(0.5, 10);
    expect(armorMitigation(300, { halfValue: 100 })).toBeCloseTo(0.75, 10);
  });

  it("caps so armor never fully negates a hit", () => {
    expect(armorMitigation(1_000_000, { halfValue: 100, maxMitigation: 0.9 })).toBe(0.9);
  });

  it("skips armor for a type that bypasses it", () => {
    const row = resolveTableDamage(table, { type: "void", resistance: "flesh", armor: 500, base: 10 });
    expect(row.mitigation).toBe(0);
    expect(row.damage).toBe(10);
  });
});

describe("resolveTableDamage", () => {
  it("multiplies the type multiplier by the unmitigated fraction", () => {
    const row = resolveTableDamage(table, { type: "kinetic", resistance: "armor", armor: 60, base: 25 });
    expect(row.multiplier).toBe(0.5);
    expect(row.mitigation).toBeCloseTo(0.375, 10);
    expect(row.net).toBeCloseTo(0.3125, 10);
    expect(row.damage).toBeCloseTo(7.8125, 10);
  });
});

describe("readDamageTable", () => {
  it("emits one row per type × resistance with the armor read applied", () => {
    const rows = readDamageTable(table, { base: 25, armor: { flesh: 0, armor: 60 } });
    expect(rows.length).toBe(table.types.length * 3);
    const kineticArmored = rows.find((row) => row.type === "kinetic" && row.resistance === "armor");
    expect(kineticArmored?.armor).toBe(60);
    expect(kineticArmored?.damage).toBeCloseTo(7.8125, 10);
    const kineticFlesh = rows.find((row) => row.type === "kinetic" && row.resistance === "flesh");
    expect(kineticFlesh?.armor).toBe(0);
    expect(kineticFlesh?.mitigation).toBe(0);
  });

  it("reads as fixed-width text a designer can scan", () => {
    const lines = formatDamageTable(readDamageTable(table, { base: 25, armor: 60 }));
    expect(lines.length).toBe(table.types.length * 3);
    expect(lines[0]).toContain("vs");
    expect(lines.some((line) => line.startsWith("kinetic") && line.includes("armor") && line.includes("→ 7.8"))).toBe(true);
  });
});

describe("assertDamageTable", () => {
  it("rejects duplicate type ids", () => {
    expect(() => assertDamageTable({ types: [{ id: "fire" }, { id: "fire" }] })).toThrow(DuplicateDamageTypeError);
  });

  it("rejects a non-finite multiplier", () => {
    expect(() => assertDamageTable({ types: [{ id: "fire", vs: { flesh: Number.NaN } }] })).toThrow(RangeError);
  });
});
