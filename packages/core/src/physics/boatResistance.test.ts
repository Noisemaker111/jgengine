import { describe, expect, test } from "bun:test";

import { frictionLineCoefficient, prepareHullResistance } from "./boatResistance";

// Holtrop and Mennen's 1982 worked example: 205 m waterline, 32 m beam, 10 m draught, 37 500 m³; 1793.26 kN at 25 kn.
const example = {
  draft: 10,
  volume: 37500,
  lcb: -0.75,
  bulbArea: 20,
  bulbCentre: 4,
  midshipCoefficient: 0.98,
  waterplaneCoefficient: 0.75,
  transomArea: 16,
  sternShape: 10,
  appendages: [{ area: 50, formFactor: 1.5 }],
};

describe("prepareHullResistance", () => {
  test("reproduces Holtrop and Mennen's own worked example at 25 knots", () => {
    const resistance = prepareHullResistance(example, 205, 32, 1025 * 37500);
    expect(Math.abs(resistance(25 * 0.5144444) / 1793.26e3 - 1)).toBeLessThan(2e-3);
  });

  test("with wave-making off it is the friction line times the form factor", () => {
    const resistance = prepareHullResistance({ draft: 0.5, wettedArea: 10, formFactor: 1.2, waveMaking: false, correlationAllowance: 0 }, 6, 1.5, 3000);
    const cf = frictionLineCoefficient("ittc1957", (2 * 6) / 1.18831e-6);
    expect(resistance(2)).toBeCloseTo(0.5 * 1025 * 4 * 10 * cf * 1.2, 6);
    expect(resistance(-2)).toBeCloseTo(-resistance(2), 9);
  });

  test("a measured coefficient is R = C·½ρLTU²", () => {
    const resistance = prepareHullResistance({ coefficient: 0.022, draft: 0.46 }, 7, 1.27, 3270, { density: 1000 });
    expect(resistance(0.76)).toBeCloseTo(0.5 * 1000 * 7 * 0.46 * 0.022 * 0.76 * 0.76, 9);
  });

  test("Schoenherr and ITTC-1957 agree within a few percent at ship Reynolds numbers", () => {
    const ratio = frictionLineCoefficient("schoenherr", 1e9) / frictionLineCoefficient("ittc1957", 1e9);
    expect(Math.abs(ratio - 1)).toBeLessThan(0.08);
  });
});
