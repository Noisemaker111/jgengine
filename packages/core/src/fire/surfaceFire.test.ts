import { describe, expect, test } from "bun:test";
import { ANDERSON_FUEL_MODELS, M_PER_FT, MOISTURE_SCENARIOS, SCOTT_BURGAN_FUEL_MODELS, standardFuelModel, type FuelModel, type FuelMoisture } from "./fuelModels";
import {
  KW_M_PER_BTU_FT_S,
  MPS_PER_MPH,
  normalSpreadRate,
  rayFromIgnitionRate,
  scorchHeight,
  surfaceFuelbed,
  surfaceSpread,
  type SurfaceSpread,
} from "./surfaceFire";
import { windAdjustmentFactor, type CanopyShelter } from "./windAdjustment";

/**
 * Reference values are the expected outputs of the BehavePlus 6 engine's own test suite
 * (firelab/behave, `testBehave.cpp`, USFS RMRS, public domain), which checks them to 1e-6.
 */
const CHAINS_PER_HOUR = (66 * M_PER_FT) / 3600;
const DEG = Math.PI / 180;
/** Agreement with BehavePlus, relative. */
const TOLERANCE = 1e-6;

const GS4 = need(SCOTT_BURGAN_FUEL_MODELS.GS4);
const LOW_MOISTURE: FuelMoisture = { oneHour: 0.06, tenHour: 0.07, hundredHour: 0.08, liveHerb: 0.6, liveWoody: 0.9 };
const CANOPY: CanopyShelter = { cover: 0.5, heightM: 30 * M_PER_FT, crownRatio: 0.5 };

function need<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("missing fixture");
  return value;
}

function expectClose(actual: number, expected: number, tolerance = TOLERANCE): void {
  const scale = Math.max(1, Math.abs(expected));
  expect(Math.abs(actual - expected) / scale).toBeLessThan(tolerance);
}

interface BehaveRun {
  fuel?: FuelModel;
  moisture?: FuelMoisture;
  /** 20-ft wind, mph, unless `midflame`. */
  windMph: number;
  midflame?: boolean;
  /** Wind direction relative to upslope (BehavePlus upslope mode), degrees. */
  windFromUpslopeDeg: number;
  slopeTan: number;
  canopy?: CanopyShelter;
}

function run(input: BehaveRun): SurfaceSpread {
  const fuel = input.fuel ?? GS4;
  const bed = surfaceFuelbed(fuel, input.moisture ?? LOW_MOISTURE);
  const waf = input.midflame === true ? 1 : windAdjustmentFactor(fuel.depthM, input.canopy ?? CANOPY);
  return surfaceSpread(bed, { midflameWind: input.windMph * MPS_PER_MPH * waf, windAngle: input.windFromUpslopeDeg * DEG, slope: input.slopeTan });
}

/** BehavePlus north-oriented mode: wind direction (from) minus aspect is the wind angle from upslope. */
function northMode(windDeg: number, aspectDeg: number): number {
  return windDeg - aspectDeg;
}

const chains = (mps: number): number => mps / CHAINS_PER_HOUR;
const PERCENT_30 = 0.3;
const DEGREES_30 = Math.tan(30 * DEG);

describe("Rothermel surface spread against BehavePlus", () => {
  test("GS4 fuel bed intermediates", () => {
    const bed = surfaceFuelbed(GS4, LOW_MOISTURE);
    expectClose(bed.characteristicSavr * M_PER_FT, 1631.128734);
    expectClose(bed.liveExtinctionMoisture * 100, 137.968551);
    expectClose(bed.liveMoisture * 100, 85.874007);
    expectClose(bed.deadMoisture * 100, 6.005463);
  });

  test("GS4 head fire rates, upslope and north-oriented modes", () => {
    const cases: Array<[string, BehaveRun, number]> = [
      ["45° wind, 95° aspect, 30° slope", { windMph: 5, windFromUpslopeDeg: northMode(45, 95), slopeTan: DEGREES_30 }, 19.677584],
      ["5 mph upslope wind, 30 % slope", { windMph: 5, windFromUpslopeDeg: 0, slopeTan: PERCENT_30 }, 8.876216],
      ["cross-slope wind", { windMph: 5, windFromUpslopeDeg: 90, slopeTan: PERCENT_30 }, 7.091665],
      ["north wind, zero aspect", { windMph: 5, windFromUpslopeDeg: northMode(0, 0), slopeTan: PERCENT_30 }, 8.876216],
      ["north-east wind, 215° aspect", { windMph: 5, windFromUpslopeDeg: northMode(45, 215), slopeTan: PERCENT_30 }, 4.113265],
      ["north-east wind, 5° aspect", { windMph: 5, windFromUpslopeDeg: northMode(45, 5), slopeTan: PERCENT_30 }, 8.50396],
      ["D1L1 moisture scenario", { windMph: 5, windFromUpslopeDeg: 0, slopeTan: PERCENT_30, moisture: need(MOISTURE_SCENARIOS.D1L1) }, 15.023945],
      ["D2L3 moisture scenario", { windMph: 5, windFromUpslopeDeg: 0, slopeTan: PERCENT_30, moisture: need(MOISTURE_SCENARIOS.D2L3) }, 1.97884],
      [
        "FM4 chaparral, 90° wind, 30° slope, 40 % canopy",
        { fuel: need(ANDERSON_FUEL_MODELS.FM4), windMph: 5, windFromUpslopeDeg: 90, slopeTan: DEGREES_30, canopy: { ...CANOPY, cover: 0.4 } },
        46.631688,
      ],
    ];
    for (const [, input, expected] of cases) expectClose(chains(run(input).headRate), expected);
  });

  test("backing and flanking rates and two-hour distances", () => {
    const spread = run({ windMph: 5, windFromUpslopeDeg: 0, slopeTan: PERCENT_30 });
    expectClose(chains(spread.backingRate), 2.91614659);
    expectClose(chains(spread.flankingRate), 5.08766627);
    expectClose(chains(spread.headRate) * 2, 17.7524327);
    expectClose(chains(spread.backingRate) * 2, 5.8322932);
    expectClose(chains(spread.flankingRate) * 2, 10.17533253);
  });

  test("non-burnable cover does not spread", () => {
    const spread = run({ fuel: need(standardFuelModel("NB1")), windMph: 5, windFromUpslopeDeg: 0, slopeTan: DEGREES_30 });
    expect(spread.headRate).toBe(0);
  });

  test("Byram fireline intensity at the head", () => {
    const spread = run({ windMph: 5, windFromUpslopeDeg: 0, slopeTan: PERCENT_30 });
    expectClose(spread.firelineIntensity / KW_M_PER_BTU_FT_S, 598.339039);
  });

  test("Anderson 1983 length-to-breadth ratios", () => {
    expect(run({ windMph: 0, windFromUpslopeDeg: 0, slopeTan: 0 }).lengthToBreadth).toBe(1);
    expectClose(run({ windMph: 5, midflame: true, windFromUpslopeDeg: 0, slopeTan: 0 }).lengthToBreadth, 1.590064);
    expectClose(run({ windMph: 5, windFromUpslopeDeg: northMode(45, 95), slopeTan: DEGREES_30 }).lengthToBreadth, 1.375624);
    expectClose(run({ windMph: 15, windFromUpslopeDeg: northMode(45, 95), slopeTan: DEGREES_30 }).lengthToBreadth, 1.519936);
  });

  test("ellipse dimensions, area and perimeter", () => {
    const spread = run({ windMph: 5, midflame: true, windFromUpslopeDeg: 0, slopeTan: 0 });
    const minutes = 3.5869124;
    const along = ((spread.headRate + spread.backingRate) / 2) * minutes * 60;
    const across = spread.flankingRate * minutes * 60;
    const centreOffset = along - spread.backingRate * minutes * 60;
    const chain = 66 * M_PER_FT;
    expectClose(along / chain, 1.0);
    expectClose(across / chain, 0.628905);
    expectClose(centreOffset / chain, 0.777482);
    expectClose(spread.headRate / spread.backingRate, 7.988029);
    const a = spread.flankingRate * 3600;
    const b = ((spread.headRate + spread.backingRate) / 2) * 3600;
    expectClose((Math.PI * a * b) / 4046.8564224, 55.283555);
    const h = (a - b) ** 2 / (a + b) ** 2;
    expectClose((Math.PI * (a + b) * (1 + h / 4 + (h * h) / 64)) / chain, 86.71476);
  });

  test("spread rate in a direction of interest", () => {
    const toHeading = (spread: SurfaceSpread, directionFromUpslopeDeg: number): number => directionFromUpslopeDeg * DEG - spread.headingAngle;
    const upslopeWind = run({ windMph: 5, windFromUpslopeDeg: 0, slopeTan: PERCENT_30 });
    expectClose(normalSpreadRate(upslopeWind, toHeading(upslopeWind, 90)), upslopeWind.flankingRate, 1e-12);
    const w290 = run({ windMph: 5, windFromUpslopeDeg: 290, slopeTan: PERCENT_30 });
    expectClose(chains(normalSpreadRate(w290, toHeading(w290, 160))), 2.766387);
    const w215 = run({ windMph: 5, windFromUpslopeDeg: 215, slopeTan: PERCENT_30 });
    expectClose(chains(normalSpreadRate(w215, toHeading(w215, 215))), 2.818063);

    // From the ignition point, north-oriented: the heading from north is upslope heading + aspect + 180°.
    const fromNorth = (windDeg: number, aspectDeg: number, interestDeg: number): number => {
      const spread = run({ windMph: 5, windFromUpslopeDeg: northMode(windDeg, aspectDeg), slopeTan: PERCENT_30 });
      const headingNorth = spread.headingAngle + (aspectDeg + 180) * DEG;
      return chains(rayFromIgnitionRate(spread, interestDeg * DEG - headingNorth));
    };
    expectClose(fromNorth(280, 135, 30), 4.180938);
    expectClose(fromNorth(0, 45, 90), 3.438243);
    expectClose(fromNorth(280, 263, 285), 2.944975);
  });

  test("Van Wagner 1973 scorch height, within 2e-6 (BehavePlus rounds the 7/6 exponent)", () => {
    const f = (c: number): number => (c - 32) / 1.8;
    expectClose(scorchHeight(50 * KW_M_PER_BTU_FT_S, 5 * MPS_PER_MPH, f(80)) / M_PER_FT, 7.617325, 2e-6);
    expectClose(scorchHeight(55 * KW_M_PER_BTU_FT_S, (300 * M_PER_FT) / 60, f(70)) / M_PER_FT, 9.92372, 2e-6);
  });
});

describe("surface spread behaviour", () => {
  test("every standard model spreads in dry, windy conditions and stops when soaked", () => {
    for (const fuel of Object.values(SCOTT_BURGAN_FUEL_MODELS)) {
      const dry = surfaceSpread(surfaceFuelbed(fuel, need(MOISTURE_SCENARIOS.D1L1)), { midflameWind: 3, windAngle: 0, slope: 0 });
      expect(dry.headRate).toBeGreaterThan(0);
      expect(dry.flameLength).toBeGreaterThan(0);
      const soaked: FuelMoisture = { oneHour: 0.6, tenHour: 0.6, hundredHour: 0.6, liveHerb: 3, liveWoody: 3 };
      expect(surfaceSpread(surfaceFuelbed(fuel, soaked), { midflameWind: 3, windAngle: 0, slope: 0 }).headRate).toBe(0);
    }
  });

  test("rate rises with wind and slope and falls with moisture", () => {
    const fuel = need(SCOTT_BURGAN_FUEL_MODELS.GR2);
    const bed = surfaceFuelbed(fuel, need(MOISTURE_SCENARIOS.D2L2));
    const rate = (wind: number, slope: number): number => surfaceSpread(bed, { midflameWind: wind, windAngle: 0, slope }).headRate;
    expect(rate(2, 0)).toBeGreaterThan(rate(0, 0));
    expect(rate(4, 0)).toBeGreaterThan(rate(2, 0));
    expect(rate(0, 0.5)).toBeGreaterThan(rate(0, 0));
    const wetter = surfaceFuelbed(fuel, need(MOISTURE_SCENARIOS.D4L2));
    expect(surfaceSpread(wetter, { midflameWind: 2, windAngle: 0, slope: 0 }).headRate).toBeLessThan(rate(2, 0));
  });

  test("wind limits cap the effective wind", () => {
    const bed = surfaceFuelbed(need(SCOTT_BURGAN_FUEL_MODELS.TL1), need(MOISTURE_SCENARIOS.D1L1));
    const free = surfaceSpread(bed, { midflameWind: 20, windAngle: 0, slope: 0 });
    const capped = surfaceSpread(bed, { midflameWind: 20, windAngle: 0, slope: 0, windLimit: "rothermel1972" });
    expect(capped.windLimited).toBe(true);
    expect(capped.headRate).toBeLessThan(free.headRate);
  });

  test("the ellipse support function gives head, flank and back rates", () => {
    const spread = run({ windMph: 10, windFromUpslopeDeg: 0, slopeTan: 0.2 });
    expectClose(normalSpreadRate(spread, 0), spread.headRate, 1e-12);
    expectClose(normalSpreadRate(spread, Math.PI), spread.backingRate, 1e-12);
    expectClose(rayFromIgnitionRate(spread, Math.PI), spread.backingRate, 1e-12);
  });
});
