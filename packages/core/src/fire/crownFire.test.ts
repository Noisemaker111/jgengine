import { describe, expect, test } from "bun:test";
import { assessCrownFire, crownLengthToBreadth, type CanopyFuel } from "./crownFire";
import { M_PER_FT, SCOTT_BURGAN_FUEL_MODELS, type FuelMoisture } from "./fuelModels";
import { KW_M_PER_BTU_FT_S, MPS_PER_MPH, surfaceFuelbed, surfaceSpread } from "./surfaceFire";
import { surfaceFireSpotDistance, torchingTreeSpotDistance, emberIgnitionProbability, type SpotTerrain } from "./spotting";
import { windAdjustmentFactor } from "./windAdjustment";

/** Reference values: BehavePlus engine test suite (firelab/behave `testBehave.cpp`, USFS, public domain). */
const TOLERANCE = 1e-6;
const CHAIN = 66 * M_PER_FT;
const MILE = 5280 * M_PER_FT;
const LB_FT3 = 0.45359237 / M_PER_FT ** 3;

function expectClose(actual: number, expected: number, tolerance = TOLERANCE): void {
  expect(Math.abs(actual - expected) / Math.max(1, Math.abs(expected))).toBeLessThan(tolerance);
}

function need<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("missing fixture");
  return value;
}

const GS4 = need(SCOTT_BURGAN_FUEL_MODELS["GS4"]);
const LOW: FuelMoisture = { oneHour: 0.06, tenHour: 0.07, hundredHour: 0.08, liveHerb: 0.6, liveWoody: 0.9 };
const CANOPY: CanopyFuel = { baseHeightM: 6 * M_PER_FT, heightM: 30 * M_PER_FT, bulkDensity: 0.03 * LB_FT3, foliarMoisture: 1.2 };

/** BehavePlus crown run: GS4, 30 % slope, upslope 20-ft wind, 50 % cover, crown ratio from the canopy base. */
function crownRun(windMph: number, moisture: FuelMoisture = LOW, canopy: CanopyFuel = CANOPY) {
  const bed = surfaceFuelbed(GS4, moisture);
  const crownRatio = (canopy.heightM - canopy.baseHeightM) / canopy.heightM;
  const waf = windAdjustmentFactor(GS4.depthM, { cover: 0.5, heightM: canopy.heightM, crownRatio });
  const wind = windMph * MPS_PER_MPH;
  const surface = surfaceSpread(bed, { midflameWind: wind * waf, windAngle: 0, slope: 0.3 });
  return {
    surface,
    crown: assessCrownFire({ canopy, moisture, twentyFootWind: wind, surfaceIntensity: surface.firelineIntensity, surfaceHeatPerUnitArea: bed.heatPerUnitArea }),
  };
}

describe("crown fire against BehavePlus (Rothermel 1991, Van Wagner 1977)", () => {
  test("crown spread rate, intensity, flame length and shape", () => {
    const { crown } = crownRun(5);
    expectClose(crown.crownRate / (CHAIN / 3600), 10.259921);
    expectClose(crown.crownIntensity / KW_M_PER_BTU_FT_S, 1775.061222);
    expectClose(crown.crownFlameLength / M_PER_FT, 29.320557);
    expect(crown.lengthToBreadth).toBe(1.625);
    expectClose(crownLengthToBreadth(10 * MPS_PER_MPH), 2.25);
    expectClose(crownLengthToBreadth(15 * MPS_PER_MPH), 2.875);
    // Rothermel 1991 eqs. 11 and 13 after one hour.
    const d = crown.crownRate * 3600;
    expectClose((Math.PI * d * d) / (4 * crown.lengthToBreadth) / 4046.8564224, 5.087736);
    expectClose((0.5 * Math.PI * d * (1 + 1 / crown.lengthToBreadth)) / CHAIN, 26.033937);
  });

  test("fire type", () => {
    expect(crownRun(5, { ...LOW, oneHour: 0.2 }).crown.type).toBe("surface");
    expect(crownRun(5).crown.type).toBe("torching");
    expect(crownRun(10).crown.type).toBe("crowning");
    const tall: CanopyFuel = { baseHeightM: 30 * M_PER_FT, heightM: 60 * M_PER_FT, bulkDensity: 0.06 * LB_FT3, foliarMoisture: 1.2 };
    expect(crownRun(5, LOW, tall).crown.type).toBe("conditional");
  });
});

describe("ember spotting against BehavePlus (Albini 1979, 1983; Chase 1981)", () => {
  const terrain: SpotTerrain = { coverHeightM: 30 * M_PER_FT, ridgeToValleyDistanceM: MILE, ridgeToValleyElevationM: 2000 * M_PER_FT, location: 3 };

  test("surface fire", () => {
    const bed = surfaceFuelbed(GS4, LOW);
    const wind = 5 * MPS_PER_MPH;
    const flame = surfaceSpread(bed, { midflameWind: wind, windAngle: 0, slope: 0.3 }).flameLength;
    const spot = surfaceFireSpotDistance(flame, wind, terrain);
    expectClose(spot.mountain / MILE, 0.267467, 2e-6);
    expectClose(spot.flat / MILE, 0.22005, 2e-6);
  });

  test("torching trees", () => {
    const spot = torchingTreeSpotDistance({ species: "engelmannSpruce", dbhM: 20 * 0.0254, treeHeightM: 30 * M_PER_FT, trees: 15, twentyFootWind: 5 * MPS_PER_MPH, terrain });
    expectClose(spot.mountain / MILE, 0.222396, 2e-6);
    expectClose(spot.flat / MILE, 0.181449, 2e-6);
  });

  test("ember ignition probability falls with fuel moisture", () => {
    const dry = emberIgnitionProbability(0.03, 30);
    const damp = emberIgnitionProbability(0.12, 30);
    expect(dry).toBeGreaterThan(damp);
    expect(dry).toBeLessThanOrEqual(1);
    expect(emberIgnitionProbability(0.35, 10)).toBe(0);
  });
});
