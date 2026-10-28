import { describe, expect, test } from "bun:test";

import { compareBoat, holtropExampleSubject, kvlcc2Subject, referenceSubjectFor, speedboatSubject, surgeAddedMass } from "./boatComparison";

describe("compareBoat", () => {
  test("lines the Holtrop–Mennen example ship's game build up against its reference and the published 25-knot resistance", () => {
    const table = compareBoat(holtropExampleSubject());
    const row = (label: string) => table.rows.find((entry) => entry.label.startsWith(label));
    const atDesign = row("resistance at 25.0 kn");
    expect(Math.abs((atDesign?.reference ?? 0) / (atDesign?.real ?? 1) - 1)).toBeLessThan(1e-3);
    // The game hull's drag is two orders of magnitude below the ship's, so it overshoots the ship's top speed.
    expect(atDesign?.game).toBeLessThan(0.05 * (atDesign?.reference ?? 0));
    expect(row("top speed")?.game).toBeGreaterThan(row("top speed")?.reference ?? 0);
    expect(row("net bollard thrust")?.game).toBeCloseTo(row("net bollard thrust")?.reference ?? 0, 6);
  });

  test("measures the speedboat's resistance, top speed and running trim on its planing reference", () => {
    const table = compareBoat(speedboatSubject());
    expect(table.rows.every((row) => Number.isFinite(row.reference))).toBe(true);
    const trim = table.rows.find((row) => row.label.startsWith("running trim"));
    expect(trim?.reference).toBeGreaterThan(1);
    expect(trim?.reference).toBeLessThan(6);
  });

  test("runs the KVLCC2 game build and its MMG model through the same turning circles and zig-zags, beside the tank", () => {
    const table = compareBoat(kvlcc2Subject());
    const row = (label: string) => table.rows.find((entry) => entry.label.startsWith(label));
    const tactical = row("tactical diameter, 35° to starboard");
    expect(Math.abs((tactical?.reference ?? 0) / (tactical?.real ?? 1) - 1)).toBeLessThan(0.07);
    expect(Number.isFinite(tactical?.game)).toBe(true);
    const overshoot = row("10/10 zig-zag, 1st overshoot");
    expect(overshoot?.reference).toBeGreaterThan(3);
    expect(Number.isFinite(overshoot?.game)).toBe(true);
    expect(row("resistance at")?.unit).toBe("N");
  });

  test("builds a reference for any game tuning, planing or not", () => {
    const tug = referenceSubjectFor("tug", { massKg: 30000, length: 18, beam: 6, maxThrust: 90000, propSpeed: 9, steering: { kind: "rudder", area: 2.5 } });
    expect(tug.reference.resistance(5)).toBeGreaterThan(0);
    const skiff = referenceSubjectFor("skiff", { massKg: 400, length: 4.5, beam: 1.8, maxThrust: 3000, propSpeed: 20, planingSpeed: 6, steering: { kind: "outboard" } });
    expect(skiff.reference.resistance(10)).toBeGreaterThan(0);
  });

  test("surge added mass of a slender hull is a few percent of its mass (Lamb's spheroid)", () => {
    const share = surgeAddedMass(38.4e6, 205) / 38.4e6;
    expect(share).toBeGreaterThan(0.02);
    expect(share).toBeLessThan(0.08);
  });
});
