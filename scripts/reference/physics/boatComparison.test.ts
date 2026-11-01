import { describe, expect, test } from "bun:test";

import type { BoatTuning } from "@jgengine/core/physics/boatDynamics";
import { compareBoat, holtropExampleSubject, kvlcc2Subject, referenceSubjectFor, speedboatSubject, surgeAddedMass, type BoatComparisonSubject } from "./boatComparison";

function failures(subject: BoatComparisonSubject): string[] {
  return compareBoat(subject).checks.filter((check) => !check.pass).map((check) => `${check.label}: ${(100 * check.gap).toFixed(1)}%`);
}

describe("compareBoat", () => {
  test("boatFromReference's Holtrop–Mennen ship holds resistance, top speed and RAOs to its reference, and the reference holds the published 25-knot resistance", () => {
    const subject = holtropExampleSubject();
    const table = compareBoat(subject);
    const atDesign = table.rows.find((entry) => entry.label.startsWith("resistance at 25.0 kn"));
    expect(Math.abs((atDesign?.reference ?? 0) / (atDesign?.real ?? 1) - 1)).toBeLessThan(1e-3);
    expect(table.checks.map((check) => check.label)).toContain("top speed");
    expect(table.checks.filter((check) => !check.pass)).toEqual([]);
  });

  test("boatFromReference's speedboat holds Savitsky resistance and running trim, top speed on its outboard, and RAOs", () => {
    const table = compareBoat(speedboatSubject());
    expect(table.checks.filter((check) => check.label.startsWith("running trim"))).toHaveLength(2);
    expect(table.checks.filter((check) => !check.pass)).toEqual([]);
  });

  test("boatFromReference's KVLCC2 holds MMG turning circles and zig-zags, and the MMG model holds the tank", () => {
    const table = compareBoat(kvlcc2Subject());
    const row = (label: string) => table.rows.find((entry) => entry.label.startsWith(label));
    const tactical = row("tactical diameter, 35° to starboard");
    expect(Math.abs((tactical?.reference ?? 0) / (tactical?.real ?? 1) - 1)).toBeLessThan(0.07);
    expect(table.checks.filter((check) => check.label.includes("zig-zag"))).toHaveLength(3);
    expect(table.checks.filter((check) => !check.pass)).toEqual([]);
  });

  test("a metric that drifts fails its tolerance", () => {
    const subject = kvlcc2Subject();
    const effects = subject.tuning.effects ?? {};
    const resistance = effects.resistance;
    const manoeuvring = effects.manoeuvring;
    if (resistance === undefined || manoeuvring === undefined) throw new Error("kvlcc2 build lost its effects");
    const drifted: BoatTuning = {
      ...subject.tuning,
      effects: {
        ...effects,
        resistance: { ...resistance, coefficient: 1.25 * (resistance.coefficient ?? 0) },
        manoeuvring: { ...manoeuvring, derivatives: { ...manoeuvring.derivatives, Nr: 1.4 * manoeuvring.derivatives.Nr } },
      },
    };
    const missed = failures({ ...subject, tuning: drifted });
    expect(missed.some((label) => label.startsWith("resistance at"))).toBe(true);
    expect(missed.some((label) => label.startsWith("tactical diameter"))).toBe(true);
  });

  test("the simple model a game builds by hand is reported, not passed", () => {
    const simple: BoatTuning = { massKg: 900, length: 6, beam: 2.3, maxThrust: 7000, propSpeed: 30, planingSpeed: 8, steering: { kind: "outboard" } };
    const table = compareBoat(referenceSubjectFor("speedboat", simple));
    const resistance = table.checks.find((check) => check.label.startsWith("resistance at"));
    expect(resistance?.pass).toBe(false);
    const heave = table.rows.find((row) => row.label === "heave RAO, head seas λ = L");
    // The simple hull rides the surface point under it; a hull a boat length long averages the wave out.
    expect(Math.abs((heave?.game ?? 0) - 1)).toBeLessThan(0.02);
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
