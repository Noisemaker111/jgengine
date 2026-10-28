import { describe, expect, test } from "bun:test";

import { fitT10, t10 } from "../../fracture/fragmentSize";
import { BASALT, BEREA_SANDSTONE, INDIANA_LIMESTONE, ROCKS, WESTERLY_GRANITE, brazilianTest, calibrateBondedRock, impactBreakage, type BondedRockModel } from "./bondedRock";
import { createDiscreteElements, type DemMaterial } from "./discreteElements";

const GRAIN: DemMaterial = { id: "grain", density: 2650, youngsModulus: 50e9, poissonRatio: 0.25, restitution: 0.5, friction: 0.5, rollingFriction: 0 };
const SLOW = 360_000;

function pair(velocity: number, strength = 1e12) {
  const dem = createDiscreteElements({ materials: [GRAIN], domain: { min: [-1, -1, -1], max: [1, 1, 1] }, gravity: [0, 0, 0], maxBodies: 2, maxBonds: 1 });
  const r = 1e-3;
  dem.addBody({ position: [0, 0, 0], radius: r, material: 0, velocity: [-velocity, 0, 0] });
  dem.addBody({ position: [2 * r, 0, 0], radius: r, material: 0, velocity: [velocity, 0, 0] });
  dem.bond(0, 1, { modulus: 50e9, tensileStrength: strength, shearStrength: strength, damping: 0 });
  return { dem, r };
}

describe("parallel bonds", () => {
  test("a bonded pair oscillates at √(k̄n A / m*) and peaks at k̄n A times the amplitude", () => {
    const { dem, r } = pair(0.01);
    const stiffness = (50e9 / (2 * r)) * Math.PI * r * r;
    const reduced = (dem.mass[0] ?? 0) / 2;
    const omega = Math.sqrt(stiffness / reduced);
    let peak = 0;
    let crossings = 0;
    let previous = 0;
    let first = 0;
    let last = 0;
    for (let i = 0; i < 4000; i += 1) {
      dem.step();
      const tension = dem.bondLoad(0).tension;
      peak = Math.max(peak, tension);
      if (previous < 0 && tension >= 0) {
        if (crossings === 0) first = dem.time;
        last = dem.time;
        crossings += 1;
      }
      previous = tension;
    }
    const period = (last - first) / (crossings - 1);
    expect(Math.abs(period * omega - 2 * Math.PI) / (2 * Math.PI)).toBeLessThan(0.01);
    // Peak force of a spring released at relative speed 0.02 m/s: k (Δv/ω).
    expect(Math.abs(peak - (stiffness * 0.02) / omega) / peak).toBeLessThan(0.02);
  });

  test("a bond breaks once its tensile stress reaches the strength, and a snapshot replays bonds exactly", () => {
    const { dem } = pair(0.5, 2e6);
    let broke = 0;
    for (let i = 0; i < 200 && broke === 0; i += 1) broke = dem.step().bondsBroken;
    expect(broke).toBe(1);
    expect(dem.bondIntact[0]).toBe(0);

    const intact = pair(0.01);
    for (let i = 0; i < 37; i += 1) intact.dem.step();
    const snap = intact.dem.snapshot();
    for (let i = 0; i < 50; i += 1) intact.dem.step();
    const expected = intact.dem.bondLoad(0);
    intact.dem.restore(snap);
    for (let i = 0; i < 50; i += 1) intact.dem.step();
    expect(intact.dem.bondLoad(0)).toEqual(expected);
  });
});

describe("bonded-particle rock against laboratory tests", () => {
  test(
    "each rock calibrates to its Young's modulus and Brazilian strength, and at one impact energy soft rocks break finer",
    () => {
      const fines = new Map<string, number>();
      for (const rock of ROCKS) {
        const calibrated = calibrateBondedRock(rock, { grainsAcross: 12, modulusGrainsAcross: 8 });
        expect(Math.abs(calibrated.modulus - rock.youngsModulus) / rock.youngsModulus).toBeLessThan(0.03);
        expect(Math.abs(calibrated.tensileStrength - rock.tensileStrength) / rock.tensileStrength).toBeLessThan(0.03);
        fines.set(rock.id, t10(impactBreakage(calibrated.model, { energy: 0.03, grainsAcross: 12 }).fragments, 0.05));
      }
      // σ_t²/(E ρ), the strain energy a rock stores per kilogram at failure, orders them: sandstone, limestone, granite, basalt.
      const order = [BEREA_SANDSTONE, INDIANA_LIMESTONE, WESTERLY_GRANITE, BASALT].map((rock) => fines.get(rock.id) ?? 0);
      for (let i = 1; i < order.length; i += 1) expect(order[i - 1] ?? 0).toBeGreaterThan(order[i] ?? 0);
    },
    SLOW,
  );

  test(
    "Brazilian strength does not depend on the loading rate once quasi-static",
    () => {
      const model: BondedRockModel = { rock: WESTERLY_GRANITE, bondModulus: 57e9, bondStrength: 3e7 };
      const slow = brazilianTest(model, { grainsAcross: 12, rateScale: 0.5 }).tensileStrength;
      const fast = brazilianTest(model, { grainsAcross: 12, rateScale: 2 }).tensileStrength;
      expect(Math.abs(slow - fast) / slow).toBeLessThan(0.05);
    },
    SLOW,
  );

  test(
    "granite fired at an anvil stays whole at 5 m/s and breaks finer with energy, as the JKMRC t10 law describes",
    () => {
      const { model } = calibrateBondedRock(WESTERLY_GRANITE, { grainsAcross: 12, modulusGrainsAcross: 8 });
      const energies = [0.003, 0.01, 0.03, 0.1];
      const runs = energies.map((energy) => impactBreakage(model, { energy, grainsAcross: 12 }));
      expect(runs[0]?.largest ?? 0).toBeGreaterThan(0.9);
      const t10s = runs.map((run) => t10(run.fragments, 0.05));
      for (let i = 1; i < t10s.length; i += 1) expect(t10s[i] ?? 0).toBeGreaterThan(t10s[i - 1] ?? 0);
      expect(fitT10(energies, t10s).r2).toBeGreaterThan(0.98);
    },
    SLOW,
  );
});
