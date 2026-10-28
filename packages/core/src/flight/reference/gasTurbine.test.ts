import { describe, expect, test } from "bun:test";

import { trimReferenceAircraft } from "./aircraftTrim";
import { createF16Model, f16Thrust } from "./f16Aircraft";
import { createGasTurbineCycle, inletShockRecovery, perfectGas, type GasTurbineComponents, type GasTurbineFlight } from "./gasTurbine";
import { createGasTurbineEngine, type GasTurbineEngineOutput } from "./gasTurbineEngine";
import { createReferenceAircraft } from "./referenceAircraft";
import { F100_PW_220, F100_PW_220_DYNAMICS, F100_PW_220_PUBLISHED, V2500_A1, V2500_A1_PUBLISHED } from "./referenceEngines";
import { standardAtmosphere } from "./standardAtmosphere";

const FT = 0.3048;
const LBF = 4.4482216152605;
const SLS: GasTurbineFlight = { mach: 0, temperature: 288.15, pressure: 101325 };

function at(altitude: number, mach: number): GasTurbineFlight {
  const air = standardAtmosphere(altitude);
  return { mach, temperature: air.temperature, pressure: air.pressure };
}

function within(actual: number, expected: number, relative: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * relative);
}

const LOSSLESS: GasTurbineComponents = {
  fan: 1,
  compressor: 1,
  highTurbine: 1,
  lowTurbine: 1,
  burnerEfficiency: 1,
  burnerPressure: 1,
  mechanical: 1,
  inletRecovery: 1,
  nozzlePressure: 1,
  fanNozzlePressure: 1,
  bypassDuctPressure: 1,
  mixerPressure: 1,
  afterburnerDryPressure: 1,
  afterburnerPressure: 1,
  afterburnerEfficiency: 1,
};

describe("gas turbine cycle", () => {
  test("a lossless turbofan on a perfect gas matches the ideal-cycle closed form to 1e-6", () => {
    // Mattingly, Elements of Propulsion, ideal turbofan: (V9/a0)² = 2/(γ−1)·[τλ − τr(τc−1) − ατr(τf−1) − τλ/(τrτc)].
    const t0 = 216.7;
    const m0 = 0.8;
    const alpha = 5;
    const piF = 1.7;
    const piC = 30;
    const tt4 = 1600;
    const cycle = createGasTurbineCycle({
      name: "ideal",
      designMach: m0,
      designTemperature: t0,
      designPressure: 19400,
      massFlow: 100,
      bypassRatio: alpha,
      fanPressureRatio: piF,
      overallPressureRatio: piC,
      turbineInletTemperature: tt4,
      exhaust: "separate",
      nozzle: "ideal",
      inlet: "mil-e-5007d",
      components: LOSSLESS,
      gas: perfectGas(1004, 1.4),
      fuelHeatingValue: 1e15,
      limits: { turbineInletTemperature: tt4 },
    });
    const a0 = Math.sqrt(1.4 * ((1004 * 0.4) / 1.4) * t0);
    const tauR = 1 + 0.2 * m0 * m0;
    const tauC = piC ** (0.4 / 1.4);
    const tauF = piF ** (0.4 / 1.4);
    const tauL = tt4 / t0;
    const core = Math.sqrt(5 * (tauL - tauR * (tauC - 1) - alpha * tauR * (tauF - 1) - tauL / (tauR * tauC)));
    const fan = Math.sqrt(5 * (tauR * tauF - 1));
    within(cycle.reference.thrust / 100, (a0 / (1 + alpha)) * (core - m0 + alpha * (fan - m0)), 1e-6);
  });

  test("off design at the design point reproduces the sizing", () => {
    const cycle = createGasTurbineCycle(V2500_A1);
    const again = cycle.solve(SLS, V2500_A1.turbineInletTemperature);
    within(again.thrust, cycle.reference.thrust, 1e-9);
    within(cycle.reference.massFlow, V2500_A1.massFlow, 1e-6);
    within(cycle.reference.bypassRatio, V2500_A1.bypassRatio, 1e-6);
    within(cycle.reference.overallPressureRatio, V2500_A1.overallPressureRatio, 1e-6);
  });

  test("a normal-shock inlet recovers 0.7209 of total pressure at Mach 2 (NACA 1135)", () => {
    expect(inletShockRecovery("normal-shock", 2)).toBeCloseTo(0.7209, 4);
    expect(inletShockRecovery("mil-e-5007d", 0.9)).toBe(1);
  });
});

describe("F100-PW-220", () => {
  const cycle = createGasTurbineCycle(F100_PW_220);

  test("matches its sea-level static ratings: thrust fitted, SFC predicted within 8%", () => {
    const military = cycle.maxDry(SLS);
    within(military.thrust, F100_PW_220_PUBLISHED.militaryThrust, 0.005);
    within(cycle.maxAfterburner(SLS).thrust, F100_PW_220_PUBLISHED.afterburnerThrust, 0.005);
    // Published 0.73 lb/(lbf·h); the cycle gives 0.686 (−6%).
    within(military.tsfc, F100_PW_220_PUBLISHED.militaryTsfc, 0.08);
    within(military.fanPressureRatio, 3.05, 0.05);
  });

  test("installed thrust lapse follows the NASA TP-1538 tables: RMS 9% military, 11% afterburner over 36 points", () => {
    const installation = 12680 / 14590;
    const military: number[] = [];
    const afterburner: number[] = [];
    for (const altitude of [0, 10000, 20000, 30000, 40000, 50000]) {
      for (const mach of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
        const flight = at(altitude * FT, mach);
        military.push((cycle.maxDry(flight).thrust * installation) / f16Thrust(50, altitude * FT, mach) - 1);
        afterburner.push((cycle.maxAfterburner(flight).thrust * installation) / f16Thrust(100, altitude * FT, mach) - 1);
      }
    }
    const rms = (errors: number[]): number => Math.sqrt(errors.reduce((sum, e) => sum + e * e, 0) / errors.length);
    const worst = (errors: number[]): number => Math.max(...errors.map(Math.abs));
    expect(rms(military)).toBeLessThan(0.09);
    expect(worst(military)).toBeLessThan(0.2);
    expect(rms(afterburner)).toBeLessThan(0.11);
    expect(worst(afterburner)).toBeLessThan(0.23);
  });

  test("spools from idle to military in the Stevens & Lewis F100 power-lag time, 3.9 s to 90%, within 10%", () => {
    const engine = createGasTurbineEngine(cycle, F100_PW_220_DYNAMICS);
    const out: GasTurbineEngineOutput = { thrust: 0, fuelFlow: 0, rates: [0, 0, 0], angularMomentum: 0, turbineInletTemperature: 0 };
    const idle = engine.steady(SLS, { dry: 0, afterburner: 0 });
    engine.evaluate(idle, { dry: 0, afterburner: 0 }, SLS, out);
    const idleThrust = out.thrust;
    expect(Math.abs(out.rates[1])).toBeLessThan(1e-6);
    // TP-1538 sea-level static idle: 1060 lbf installed.
    within(idleThrust, 1060 * LBF, 0.05);
    engine.evaluate(engine.steady(SLS, { dry: 1, afterburner: 0 }), { dry: 1, afterburner: 0 }, SLS, out);
    const militaryThrust = out.thrust;
    within(militaryThrust, 12680 * LBF, 0.01);
    const state = [...idle];
    const dt = 0.0025;
    let t90 = Number.NaN;
    for (let time = 0; time < 8 && Number.isNaN(t90); time += dt) {
      engine.evaluate(state, { dry: 1, afterburner: 0 }, SLS, out);
      if ((out.thrust - idleThrust) / (militaryThrust - idleThrust) >= 0.9) t90 = time;
      for (let k = 0; k < 3; k += 1) state[k] = (state[k] ?? 0) + dt * (out.rates[k] ?? 0);
    }
    within(t90, 3.91, 0.1);
  });

  test("the F-16 trims on the cycle engine within 0.015 throttle of the thrust table", () => {
    const table = createReferenceAircraft(createF16Model(), { groundElevation: () => -1e5 });
    const cycleF16 = createReferenceAircraft(createF16Model({ engine: "cycle" }), { groundElevation: () => -1e5 });
    for (const [speed, altitude] of [
      [502, 0],
      [500, 10000],
      [700, 30000],
    ] as const) {
      const condition = { airspeed: speed * FT, altitude: altitude * FT };
      expect(Math.abs(trimReferenceAircraft(cycleF16, condition).throttle - trimReferenceAircraft(table, condition).throttle)).toBeLessThan(0.015);
    }
  });
});

describe("IAE V2500-A1 (Jenkinson et al. 1999)", () => {
  const cycle = createGasTurbineCycle(V2500_A1);
  const cruise = at(V2500_A1_PUBLISHED.cruiseAltitude, V2500_A1_PUBLISHED.cruiseMach);

  test("take-off: thrust fitted, SFC predicted within 3%", () => {
    within(cycle.reference.thrust, V2500_A1_PUBLISHED.takeoffThrust, 0.005);
    within(cycle.reference.tsfc, V2500_A1_PUBLISHED.takeoffTsfc, 0.03);
  });

  test("cruise at 35 000 ft, Mach 0.8: SFC at 5070 lbf within 3%, maximum climb thrust at 100% fan speed within 6%", () => {
    let low = 700;
    let high = V2500_A1.turbineInletTemperature;
    for (let i = 0; i < 40; i += 1) {
      const mid = 0.5 * (low + high);
      if (cycle.solve(cruise, mid).thrust < V2500_A1_PUBLISHED.cruiseThrust) low = mid;
      else high = mid;
    }
    within(cycle.solve(cruise, low).tsfc, V2500_A1_PUBLISHED.cruiseTsfc, 0.03);
    within(cycle.maxDry(cruise).thrust, V2500_A1_PUBLISHED.climbThrust, 0.06);
  });
});
