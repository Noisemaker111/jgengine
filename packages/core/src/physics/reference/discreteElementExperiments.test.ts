import { describe, expect, test } from "bun:test";

import { DEM_SAND, beverlooHopper, brazilNutShaker, janssenLoad, janssenSilo, linearFit, nowakExcessAngle, pouredCone, waterBridges } from "./discreteElementExperiments";

const SLOW = 180_000;

describe("DEM sand against published experiments", () => {
  test(
    "dry sand pours a cone at 28–36°, and 1% water steepens it by about the Nowak et al. (2005) capillary excess",
    () => {
      const dry = pouredCone({ seed: "dry" });
      // Al-Hashemi & Al-Amoudi (2018): dry quartz sands repose at 28–36°.
      expect(dry.fittedAngle).toBeGreaterThan(28);
      expect(dry.fittedAngle).toBeLessThan(36);
      // Worst transient overlap while grains land, as a share of the radius.
      expect(dry.maxOverlap).toBeLessThan(0.2);

      const wet = pouredCone({ seed: "dry", liquid: waterBridges(0.01, 0.005) });
      const predicted = (nowakExcessAngle((dry.fittedAngle * Math.PI) / 180, 0.072, DEM_SAND.density, 0.005, dry.slopeLength) * 180) / Math.PI;
      expect(predicted).toBeGreaterThan(2);
      const excess = wet.fittedAngle - dry.fittedAngle;
      expect(excess).toBeGreaterThan(predicted * 0.4);
      expect(excess).toBeLessThan(predicted * 1.8);
    },
    SLOW,
  );

  test(
    "a filling silo's base load saturates as Janssen (1895) predicts, with a stress ratio between Rankine's active limit and isotropic",
    () => {
      const silo = janssenSilo();
      const last = silo.fillMass.length - 1;
      const fill = silo.fillMass[last] ?? 0;
      const apparent = silo.apparentMass[last] ?? 0;
      // Wall friction carries a large share of the full silo.
      expect(apparent / fill).toBeLessThan(0.65);
      // Early layers rest almost wholly on the base.
      expect((silo.apparentMass[0] ?? 0) / (silo.fillMass[0] ?? 1)).toBeGreaterThan(0.85);

      // The last layer adds little: the wall carries nearly all of it.
      const lastShare = (apparent - (silo.apparentMass[last - 1] ?? 0)) / (fill - (silo.fillMass[last - 1] ?? 0));
      expect(lastShare).toBeLessThan(0.2);

      let janssenError = 0;
      for (const [i, m] of silo.fillMass.entries()) janssenError += (janssenLoad(m, silo.fit) - (silo.apparentMass[i] ?? 0)) ** 2;
      const line = linearFit(silo.fillMass, silo.apparentMass);
      let lineError = 0;
      for (const [i, m] of silo.fillMass.entries()) lineError += (line.slope * m + line.intercept - (silo.apparentMass[i] ?? 0)) ** 2;
      expect(janssenError).toBeLessThan(lineError / 10);

      // Rankine active K_a = (1 − sin φ)/(1 + sin φ) is 0.27 at φ = 35°; a settled fill sits between it and 1.
      expect(silo.stressRatio).toBeGreaterThan(0.27);
      expect(silo.stressRatio).toBeLessThan(1);
    },
    SLOW,
  );

  test(
    "a silo drains at the Beverloo (1961) rate, independent of the head above the orifice",
    () => {
      const spheres = { ...DEM_SAND, id: "spheres", rollingFriction: 0 };
      const hopper = beverlooHopper({ material: spheres, orifices: [6, 8], grains: 1500, siloRadius: 14 });
      const d = hopper.grainDiameter;
      for (const [i, n] of hopper.orifices.entries()) {
        // C = 0.58, k = 1.5: Beverloo, Leniger & van de Velde (1961), Nedderman (1992).
        const beverloo = 0.58 * hopper.bulkDensity * Math.sqrt(9.81) * ((n - 1.5) * d) ** 2.5;
        const rate = hopper.rates[i] ?? 0;
        expect(Math.abs(rate - beverloo) / beverloo).toBeLessThan(0.25);
        const [first, second] = hopper.halves[i] ?? [0, 0];
        expect(Math.abs(first - second) / rate).toBeLessThan(0.3);
      }
      // W ∝ (D − k d)^{5/2}: the larger orifice drains faster by about that power.
      const ratio = (hopper.rates[1] ?? 0) / (hopper.rates[0] ?? 1);
      expect(ratio).toBeGreaterThan(1.8);
      expect(ratio).toBeLessThan(3.5);
    },
    SLOW,
  );

  test(
    "a large intruder rises through a bed shaken at 3 g and stays buried in an unshaken one (Brazil-nut effect)",
    () => {
      const shaken = brazilNutShaker({ acceleration: 3, seconds: 2 });
      const start = shaken.intruderHeight[0] ?? 0;
      const tail = shaken.intruderHeight.slice(-4);
      const end = tail.reduce((sum, h) => sum + h, 0) / tail.length;
      expect(end - start).toBeGreaterThan(0.6);

      const still = brazilNutShaker({ acceleration: 0, seconds: 0.5 });
      const drift = Math.abs((still.intruderHeight.at(-1) ?? 0) - (still.intruderHeight[0] ?? 0));
      expect(drift).toBeLessThan(0.1);
    },
    SLOW,
  );
});
