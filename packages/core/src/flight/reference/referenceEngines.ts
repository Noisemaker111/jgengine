// @skill jgengine-world
import type { GasTurbineComponents, GasTurbineDesign } from "./gasTurbine";
import type { GasTurbineEngineOptions } from "./gasTurbineEngine";

const LB = 0.45359237;
const LBF = 4.4482216152605;

/**
 * Component technology level 3 (about 1965–1985) of Mattingly, *Elements of Propulsion* (2006), table 4.4: polytropic
 * fan 0.86, compressor 0.88, cooled turbine 0.87, uncooled 0.89; burner 0.99 efficiency, 0.94 pressure ratio.
 */
export const MATTINGLY_LEVEL_3: GasTurbineComponents = {
  fan: 0.86,
  compressor: 0.88,
  highTurbine: 0.87,
  lowTurbine: 0.89,
  burnerEfficiency: 0.99,
  burnerPressure: 0.94,
  mechanical: 0.99,
  inletRecovery: 1,
  nozzlePressure: 0.97,
  fanNozzlePressure: 0.98,
  bypassDuctPressure: 0.98,
  mixerPressure: 0.97,
  afterburnerDryPressure: 0.97,
  afterburnerPressure: 0.94,
  afterburnerEfficiency: 0.95,
};

/** Component technology level 4 (about 1985–2005) of Mattingly's table 4.4: fan 0.89, compressor 0.90, turbines 0.89/0.90. */
export const MATTINGLY_LEVEL_4: GasTurbineComponents = {
  ...MATTINGLY_LEVEL_3,
  fan: 0.89,
  compressor: 0.9,
  highTurbine: 0.89,
  lowTurbine: 0.9,
  burnerEfficiency: 0.995,
  burnerPressure: 0.95,
  mechanical: 0.995,
  nozzlePressure: 0.98,
};

/** Mattingly's customer bleed and turbine coolant shares for a fighter-class core: 1% bleed, 5% nozzle, 5% rotor. */
const COOLING = { bleed: 0.01, nozzle: 0.05, rotor: 0.05 };

/**
 * Pratt & Whitney F100-PW-220 (F-16C/D), sized at sea-level static from its published figures: 228 lb/s airflow,
 * bypass ratio 0.63, overall pressure ratio 25. Fitted: the turbine inlet temperature so military thrust is 14 590 lbf,
 * the afterburner temperature so full afterburner is 23 770 lbf, and the control schedule (5% temperature margin over
 * the sea-level point, corrected fan speed rising 0.2 per unit cold inlet ratio) to the NASA TP-1538 installed thrust
 * tables. The fan pressure ratio comes from the mixed-flow rule (≈ 3.0). Mattingly level 3 components.
 */
export const F100_PW_220: GasTurbineDesign = {
  name: "F100-PW-220",
  massFlow: 228 * LB,
  bypassRatio: 0.63,
  overallPressureRatio: 25,
  turbineInletTemperature: 1549,
  exhaust: "mixed",
  nozzle: "ideal",
  mixerMach: 0.4,
  inlet: "normal-shock",
  components: MATTINGLY_LEVEL_3,
  cooling: COOLING,
  afterburnerTemperature: 1908,
  limits: { turbineInletTemperature: 1549 * 1.05, correctedLowSpeed: 1, coldSpeedGain: 0.2 },
};

/**
 * F100-PW-220 rotor dynamics. Inertias are estimates from the engine's published size and weight (about 30% of its
 * 1467 kg rotating, at half the 0.44 m fan tip radius), not published figures; speeds are typical of the family.
 * Installation is the TP-1538 sea-level static military thrust over the uninstalled rating, 12 680 / 14 590 lbf.
 */
export const F100_PW_220_DYNAMICS: GasTurbineEngineOptions = {
  lowInertia: 10,
  highInertia: 4,
  lowRpm: 10000,
  highRpm: 14000,
  idleSpeed: 0.72,
  accelerationLimit: 1.135,
  installation: 12680 / 14590,
  maxMach: 2,
};

/** F100-PW-220 published sea-level static ratings (uninstalled): military 14 590 lbf at 0.73 lb/(lbf·h), afterburner 23 770 lbf. */
export const F100_PW_220_PUBLISHED = {
  militaryThrust: 14590 * LBF,
  militaryTsfc: 0.73 * (LB / LBF / 3600),
  afterburnerThrust: 23770 * LBF,
};

/**
 * IAE V2500-A1 (A320), sized at sea-level static from Jenkinson, Simpkin & Rhodes, *Civil Jet Aircraft Design* (1999),
 * engine data file: 781 lb/s, bypass ratio 5.4, overall pressure ratio 29.4. Fitted: turbine inlet temperature so
 * take-off thrust is 25 000 lbf. The fan pressure ratio, 1.7, is an estimate (not published). Mattingly level 4
 * components; climb limited to 100% fan speed.
 */
export const V2500_A1: GasTurbineDesign = {
  name: "IAE V2500-A1",
  massFlow: 781 * LB,
  bypassRatio: 5.4,
  fanPressureRatio: 1.7,
  overallPressureRatio: 29.4,
  turbineInletTemperature: 1561,
  exhaust: "separate",
  nozzle: "convergent",
  inlet: "mil-e-5007d",
  components: MATTINGLY_LEVEL_4,
  cooling: COOLING,
  limits: { turbineInletTemperature: 1561, lowSpeed: 1 },
};

/**
 * IAE V2500-A1 figures from Jenkinson et al. (1999): take-off 25 000 lbf at 0.35 lb/(lbf·h) (ISA sea-level static);
 * maximum climb 5620 lbf and cruise 5070 lbf at 0.581 lb/(lbf·h), both at 35 000 ft and Mach 0.8.
 */
export const V2500_A1_PUBLISHED = {
  takeoffThrust: 25000 * LBF,
  takeoffTsfc: 0.35 * (LB / LBF / 3600),
  climbThrust: 5620 * LBF,
  cruiseThrust: 5070 * LBF,
  cruiseTsfc: 0.581 * (LB / LBF / 3600),
  cruiseAltitude: 35000 * 0.3048,
  cruiseMach: 0.8,
};
