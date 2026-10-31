// @skill jgengine-world
import { SEA_LEVEL_PRESSURE } from "./standardAtmosphere";

/**
 * Thermodynamic properties of air and of air with burnt fuel, per kg of mixture. Enthalpy is zero at 298.15 K; the
 * entropy function is `∫cp/T dT`, so an isentrope between two pressures is `Δφ = R·ln(P₂/P₁)`.
 */
export interface GasModel {
  /** J/(kg·K). */
  cp(temperature: number, fuelAirRatio: number): number;
  /** J/kg. */
  enthalpy(temperature: number, fuelAirRatio: number): number;
  /** J/(kg·K). */
  entropy(temperature: number, fuelAirRatio: number): number;
  /** J/(kg·K). */
  readonly gasConstant: number;
}

const REFERENCE_TEMPERATURE = 298.15;

// Walsh & Fletcher, *Gas Turbine Performance* (2nd ed., 2004), ch. 3: cp in kJ/(kg·K) of dry air (A) and the
// increment for kerosene combustion products (B, weighted by FAR/(1 + FAR)), polynomials in T/1000 K.
const AIR_CP = [0.992313, 0.236688, -1.852148, 6.083152, -8.893933, 7.097112, -3.234725, 0.794571, -0.081873];
const PRODUCTS_CP = [-0.718874, 8.747481, -15.863157, 17.254096, -10.233795, 3.081778, -0.361112, -0.003919];

function polynomial(coefficients: readonly number[], x: number): number {
  let sum = 0;
  for (let i = coefficients.length - 1; i >= 0; i -= 1) sum = sum * x + (coefficients[i] ?? 0);
  return sum;
}

function integratedPolynomial(coefficients: readonly number[], x: number): number {
  let sum = 0;
  for (let i = coefficients.length - 1; i >= 0; i -= 1) sum = sum * x + (coefficients[i] ?? 0) / (i + 1);
  return sum * x;
}

function entropyPolynomial(coefficients: readonly number[], x: number): number {
  let sum = 0;
  for (let i = coefficients.length - 1; i >= 1; i -= 1) sum = sum * x + (coefficients[i] ?? 0) / i;
  return (coefficients[0] ?? 0) * Math.log(x) + sum * x;
}

function fuelWeight(fuelAirRatio: number): number {
  return fuelAirRatio / (1 + fuelAirRatio);
}

const REFERENCE_X = REFERENCE_TEMPERATURE / 1000;
const AIR_H0 = integratedPolynomial(AIR_CP, REFERENCE_X);
const PRODUCTS_H0 = integratedPolynomial(PRODUCTS_CP, REFERENCE_X);

/**
 * Dry air and kerosene combustion products with temperature-dependent specific heat, from the polynomials of Walsh &
 * Fletcher, *Gas Turbine Performance* (2nd ed., 2004). R = 287.05 J/(kg·K) for both, as they take it.
 * @capability gas-turbine real-gas air and combustion product properties
 */
export const WALSH_FLETCHER_GAS: GasModel = {
  gasConstant: 287.05,
  cp(temperature, fuelAirRatio) {
    const x = temperature / 1000;
    return 1000 * (polynomial(AIR_CP, x) + fuelWeight(fuelAirRatio) * polynomial(PRODUCTS_CP, x));
  },
  enthalpy(temperature, fuelAirRatio) {
    const x = temperature / 1000;
    return 1e6 * (integratedPolynomial(AIR_CP, x) - AIR_H0 + fuelWeight(fuelAirRatio) * (integratedPolynomial(PRODUCTS_CP, x) - PRODUCTS_H0));
  },
  entropy(temperature, fuelAirRatio) {
    const x = temperature / 1000;
    return 1000 * (entropyPolynomial(AIR_CP, x) + fuelWeight(fuelAirRatio) * entropyPolynomial(PRODUCTS_CP, x));
  },
};

/**
 * A calorically perfect gas, fuel ignored: the textbook ideal-cycle check.
 * @capability gas-turbine constant-cp gas for ideal-cycle analysis
 */
export function perfectGas(cp: number, gamma: number): GasModel {
  return {
    gasConstant: (cp * (gamma - 1)) / gamma,
    cp: () => cp,
    enthalpy: (temperature) => cp * (temperature - REFERENCE_TEMPERATURE),
    entropy: (temperature) => cp * Math.log(temperature),
  };
}

/** How the inlet loses total pressure with flight Mach number. */
export type InletKind = "mil-e-5007d" | "normal-shock";

/** Component losses and efficiencies. Polytropic efficiencies hold across the operating range. */
export interface GasTurbineComponents {
  /** Fan polytropic efficiency. */
  fan: number;
  /** High-pressure compressor polytropic efficiency. */
  compressor: number;
  /** High-pressure turbine polytropic efficiency (a cooled turbine's cooling losses folded in). */
  highTurbine: number;
  /** Low-pressure turbine polytropic efficiency. */
  lowTurbine: number;
  /** Burner combustion efficiency. */
  burnerEfficiency: number;
  /** Burner total pressure ratio. */
  burnerPressure: number;
  /** Shaft mechanical efficiency, each spool. */
  mechanical: number;
  /** Subsonic duct total pressure recovery, on top of the inlet's shock losses. */
  inletRecovery: number;
  /** Core (or mixed) nozzle total pressure ratio. */
  nozzlePressure: number;
  /** Fan nozzle total pressure ratio (separate exhausts). */
  fanNozzlePressure: number;
  /** Bypass duct total pressure ratio (mixed exhaust). */
  bypassDuctPressure: number;
  /** Mixer total pressure ratio on top of the mixing loss itself. */
  mixerPressure: number;
  /** Afterburner duct total pressure ratio when unlit. */
  afterburnerDryPressure: number;
  /** Afterburner total pressure ratio when lit. */
  afterburnerPressure: number;
  /** Afterburner combustion efficiency. */
  afterburnerEfficiency: number;
}

/**
 * A two-spool gas turbine at its design point: a turbojet (`bypassRatio: 0`, `fanPressureRatio: 1`), a separate-flow
 * turbofan or a mixed-flow turbofan, with or without an afterburner. SI units.
 */
export interface GasTurbineDesign {
  name: string;
  /** Design flight condition (default sea-level static, standard day). */
  designMach?: number;
  designTemperature?: number;
  designPressure?: number;
  /** Total air mass flow at the design point, kg/s. */
  massFlow: number;
  bypassRatio: number;
  /**
   * Fan pressure ratio (`1` for a turbojet). Omit on a mixed-flow turbofan to size it by the mixed-flow design rule:
   * bypass and core total pressures equal at the mixer.
   */
  fanPressureRatio?: number;
  /** Overall pressure ratio, fan times high-pressure compressor. */
  overallPressureRatio: number;
  /** Burner exit total temperature at the design point, K. Uncooled cycle, so this is the cooling-mixed rotor inlet value. */
  turbineInletTemperature: number;
  exhaust: "separate" | "mixed";
  /** `"convergent"` chokes at the throat; `"ideal"` expands to ambient (a variable convergent-divergent nozzle). */
  nozzle: "convergent" | "ideal";
  /** Core Mach number entering the mixer at the design point (mixed exhaust, default `0.4`). */
  mixerMach?: number;
  inlet: InletKind;
  components: GasTurbineComponents;
  /**
   * Air drawn off the compressor exit, as shares of core air: `nozzle` cools the HPT nozzle and joins the gas ahead of
   * the rotor (it does work there), `rotor` cools the rotor and joins behind it, `bleed` leaves for the airframe.
   */
  cooling?: { nozzle?: number; rotor?: number; bleed?: number };
  /** Default {@link WALSH_FLETCHER_GAS}. */
  gas?: GasModel;
  /** Lower heating value of the fuel at 298 K, J/kg (default 43.1 MJ/kg, kerosene). */
  fuelHeatingValue?: number;
  /** Afterburner exit total temperature at full afterburner, K; omit for no afterburner. */
  afterburnerTemperature?: number;
  /** Control limits for maximum dry power: the lowest-reaching one sets the turbine inlet temperature. */
  limits: {
    /** Highest burner exit temperature, K. */
    turbineInletTemperature: number;
    /** Highest overall pressure ratio. */
    overallPressureRatio?: number;
    /** Highest physical low- and high-spool speed, share of the design speed. */
    lowSpeed?: number;
    highSpeed?: number;
    /** Highest corrected low- and high-spool speed (speed over the root of inlet total temperature), share of design. */
    correctedLowSpeed?: number;
    correctedHighSpeed?: number;
    /**
     * Rise of both corrected-speed limits per unit fall of the fan inlet temperature ratio below design
     * (`Tt2 / Tt2,design`), as fuel controls schedule more corrected speed in cold air (default `0`).
     */
    coldSpeedGain?: number;
  };
}

/** Free-stream flight condition. */
export interface GasTurbineFlight {
  mach: number;
  /** Static temperature, K. */
  temperature: number;
  /** Static pressure, Pa. */
  pressure: number;
}

/** A gas stream: air and fuel mass flow, kg/s, total temperature, K, and total pressure, Pa. */
export interface GasStream {
  air: number;
  fuel: number;
  temperature: number;
  pressure: number;
}

/** One steady operating point. Forces in N, flows in kg/s, temperatures in K, pressures in Pa, powers in W. */
export interface GasTurbinePoint {
  flight: GasTurbineFlight;
  converged: boolean;
  /** Uninstalled net thrust. */
  thrust: number;
  /** Burner plus afterburner fuel flow. */
  fuelFlow: number;
  afterburnerFuelFlow: number;
  /** Thrust-specific fuel consumption, kg/(N·s). */
  tsfc: number;
  /** Total air flow, core air flow and bypass ratio. */
  massFlow: number;
  coreFlow: number;
  bypassRatio: number;
  fanPressureRatio: number;
  overallPressureRatio: number;
  inletRecovery: number;
  /** Fan inlet total temperature. */
  fanInletTemperature: number;
  /** Compressor exit total temperature and pressure. */
  compressorTemperature: number;
  compressorPressure: number;
  turbineInletTemperature: number;
  /** Burner fuel-air ratio. */
  fuelAirRatio: number;
  /** Afterburner exit total temperature (the mixed temperature when unlit). */
  afterburnerTemperature: number;
  /** Physical spool speeds, share of design. */
  lowSpeed: number;
  highSpeed: number;
  /** Corrected spool speeds, `N/√(Tt,in/Tt,in design)`, share of design. */
  correctedLowSpeed: number;
  correctedHighSpeed: number;
  /** Power absorbed by the fan and by the high-pressure compressor. */
  fanPower: number;
  compressorPower: number;
  /** High- and low-pressure turbine expansion ratios, inlet over exit total pressure. */
  highTurbineExpansion: number;
  lowTurbineExpansion: number;
  /** Ram drag, `ṁ₀·V₀`. */
  ramDrag: number;
  /** Gas entering the afterburner duct (the core stream for separate exhausts). */
  exhaust: GasStream;
  /** Gross thrust of the bypass stream through its own nozzle (separate exhausts). */
  fanGross: number;
  /** Nozzle throat area the point needs, m² (the scheduled area of a variable nozzle). */
  nozzleThroat: number;
}

/** A sized gas turbine cycle that solves steady off-design points. */
export interface GasTurbineCycle {
  readonly design: Readonly<GasTurbineDesign>;
  readonly gas: GasModel;
  /** The design point as sized. */
  readonly reference: GasTurbinePoint;
  /** Steady point at a burner exit temperature and, if lit, an afterburner exit temperature, K. */
  solve(flight: GasTurbineFlight, turbineInletTemperature: number, afterburnerTemperature?: number): GasTurbinePoint;
  /** Maximum dry power: the highest turbine inlet temperature no control limit forbids. */
  maxDry(flight: GasTurbineFlight): GasTurbinePoint;
  /** Full afterburner on top of maximum dry power; equals {@link maxDry} without an afterburner. */
  maxAfterburner(flight: GasTurbineFlight): GasTurbinePoint;
  /** Gross thrust and afterburner fuel flow of burning an exhaust stream to a temperature, K, through the nozzle. */
  afterburn(exhaust: GasStream, flight: GasTurbineFlight, temperature: number): { gross: number; fuelFlow: number };
  /**
   * Turbine shaft powers, W, at a steady point's compressor delivery with a different burner fuel flow: what drives a
   * spool off its steady speed in a transient.
   */
  turbinePowers(point: GasTurbinePoint, fuelFlow: number): { high: number; low: number };
}

/** Gas-dynamic helpers on a {@link GasModel}. */
interface Thermo {
  temperatureAtEnthalpy(enthalpy: number, far: number, guess: number): number;
  temperatureAtEntropy(entropy: number, far: number, guess: number): number;
  /** Exit total temperature of a polytropic compression by a pressure ratio. */
  compress(temperature: number, ratio: number, efficiency: number): number;
  /** Exit total temperature of a polytropic expansion by an expansion ratio. */
  expand(temperature: number, far: number, ratio: number, efficiency: number): number;
  /** Expansion ratio of a polytropic turbine between two total temperatures. */
  expansionRatio(inlet: number, exit: number, far: number, efficiency: number): number;
  /** Static temperature and velocity after isentropic expansion from total conditions by a total-to-static pressure ratio. */
  staticAt(temperature: number, far: number, ratio: number): { temperature: number; velocity: number };
  /** Total-to-static pressure ratio at the sonic throat. */
  criticalRatio(temperature: number, far: number): number;
  /** `ṁ / (A·Pt)` at a total-to-static ratio, s/m. */
  flowDensity(temperature: number, far: number, ratio: number): number;
}

function createThermo(gas: GasModel): Thermo {
  const r = gas.gasConstant;
  function temperatureAtEnthalpy(enthalpy: number, far: number, guess: number): number {
    let t = guess;
    for (let i = 0; i < 30; i += 1) {
      const step = (gas.enthalpy(t, far) - enthalpy) / gas.cp(t, far);
      t -= step;
      if (Math.abs(step) < 1e-10 * t) break;
    }
    return t;
  }
  function temperatureAtEntropy(entropy: number, far: number, guess: number): number {
    let t = guess;
    for (let i = 0; i < 30; i += 1) {
      const step = ((gas.entropy(t, far) - entropy) * t) / gas.cp(t, far);
      t -= step;
      if (Math.abs(step) < 1e-10 * t) break;
    }
    return t;
  }
  function staticAt(temperature: number, far: number, ratio: number): { temperature: number; velocity: number } {
    const target = gas.entropy(temperature, far) - r * Math.log(ratio);
    const t = temperatureAtEntropy(target, far, temperature / ratio ** 0.25);
    return { temperature: t, velocity: Math.sqrt(Math.max(0, 2 * (gas.enthalpy(temperature, far) - gas.enthalpy(t, far)))) };
  }
  function flowDensity(temperature: number, far: number, ratio: number): number {
    const s = staticAt(temperature, far, ratio);
    return s.velocity / (r * s.temperature) / ratio;
  }
  function solveCriticalRatio(temperature: number, far: number): number {
    // Sonic where V² = γRT; bisect on the static temperature.
    let low = 0.6 * temperature;
    let high = temperature;
    const h0 = gas.enthalpy(temperature, far);
    for (let i = 0; i < 50; i += 1) {
      const t = 0.5 * (low + high);
      const cp = gas.cp(t, far);
      const sound2 = (cp / (cp - r)) * r * t;
      if (2 * (h0 - gas.enthalpy(t, far)) > sound2) low = t;
      else high = t;
    }
    const t = 0.5 * (low + high);
    return Math.exp((gas.entropy(temperature, far) - gas.entropy(t, far)) / r);
  }
  // The sonic ratio varies slowly with temperature and fuel-air ratio: tabulate it once, interpolate after.
  const tableLow = 150;
  const tableStep = 10;
  const tableCount = 250;
  const farStep = 0.01;
  const farCount = 9;
  let sonic: Float64Array | undefined;
  function criticalRatio(temperature: number, far: number): number {
    const x = (temperature - tableLow) / tableStep;
    const y = far / farStep;
    if (x < 0 || x >= tableCount - 1 || y < 0 || y >= farCount - 1) return solveCriticalRatio(temperature, far);
    if (sonic === undefined) {
      sonic = new Float64Array(tableCount * farCount);
      for (let j = 0; j < farCount; j += 1) for (let i = 0; i < tableCount; i += 1) sonic[j * tableCount + i] = solveCriticalRatio(tableLow + i * tableStep, j * farStep);
    }
    const i = Math.floor(x);
    const j = Math.floor(y);
    const u = x - i;
    const v = y - j;
    const a = sonic[j * tableCount + i] ?? 0;
    const b = sonic[j * tableCount + i + 1] ?? 0;
    const cc = sonic[(j + 1) * tableCount + i] ?? 0;
    const d = sonic[(j + 1) * tableCount + i + 1] ?? 0;
    return (1 - v) * ((1 - u) * a + u * b) + v * ((1 - u) * cc + u * d);
  }
  return {
    temperatureAtEnthalpy,
    temperatureAtEntropy,
    compress(temperature, ratio, efficiency) {
      return temperatureAtEntropy(gas.entropy(temperature, 0) + (r * Math.log(ratio)) / efficiency, 0, temperature * ratio ** (0.286 / efficiency));
    },
    expand(temperature, far, ratio, efficiency) {
      return temperatureAtEntropy(gas.entropy(temperature, far) - efficiency * r * Math.log(ratio), far, temperature / ratio ** (0.25 * efficiency));
    },
    expansionRatio(inlet, exit, far, efficiency) {
      return Math.exp((gas.entropy(inlet, far) - gas.entropy(exit, far)) / (efficiency * r));
    },
    staticAt,
    criticalRatio,
    flowDensity,
  };
}

function farOf(stream: GasStream): number {
  return stream.air > 0 ? stream.fuel / stream.air : 0;
}

/**
 * Inlet total pressure recovery from shock losses alone: MIL-E-5007D's `1 − 0.075·(M − 1)^1.35` above Mach 1, or the
 * total pressure ratio across a normal shock for a fixed pitot inlet such as the F-16's.
 * @capability gas-turbine inlet shock recovery by flight Mach number
 */
export function inletShockRecovery(kind: InletKind, mach: number): number {
  if (mach <= 1) return 1;
  if (kind === "mil-e-5007d") return 1 - 0.075 * (mach - 1) ** 1.35;
  const g = 1.4;
  const m2 = mach * mach;
  const a = (((g + 1) * m2) / ((g - 1) * m2 + 2)) ** (g / (g - 1));
  const b = ((g + 1) / (2 * g * m2 - (g - 1))) ** (1 / (g - 1));
  return a * b;
}

interface Sizing {
  fanPressureRatio: number;
  highTurbineExpansion: number;
  lowTurbineExpansion: number;
  /** Throat areas of the turbine nozzles, core and fan nozzles (separate), and mixer inlets (mixed), m². */
  highTurbineArea: number;
  lowTurbineArea: number;
  coreNozzleArea: number;
  fanNozzleArea: number;
  mixerCoreArea: number;
  mixerBypassArea: number;
  /** Fan and high-pressure compressor specific work at design, J/kg, for the speed relation. */
  lowWork: number;
  highWork: number;
  /** Fan and compressor inlet total temperatures at design, K. */
  fanInlet: number;
  compressorInlet: number;
}

const ITERATIONS = 200;

/**
 * Sizes a two-spool gas turbine at its design point and returns a cycle that solves steady off-design points by
 * component matching in the manner of Mattingly's performance method (*Elements of Propulsion*, 2006, ch. 8), on real
 * gas properties: both turbine nozzles choked, so the high-pressure turbine runs at a near-fixed expansion ratio;
 * constant polytropic efficiencies; fan and compressor work from the spool power balances; bypass ratio from the fan
 * nozzle's flow (separate exhausts) or the mixer's static pressure match (mixed exhaust, whose variable nozzle holds the
 * low-pressure turbine ratio, as an augmented turbofan's control does). Spool speeds follow Euler's turbine relation,
 * work ∝ N². Turbine cooling air and power offtake are not modelled.
 * @capability gas-turbine component-level turbojet / turbofan cycle: design sizing and off-design steady points
 */
export function createGasTurbineCycle(design: GasTurbineDesign): GasTurbineCycle {
  const c = design.components;
  const gas = design.gas ?? WALSH_FLETCHER_GAS;
  const thermo = createThermo(gas);
  const heating = design.fuelHeatingValue ?? 43.1e6;
  const separate = design.exhaust === "separate";
  const hasBypass = design.bypassRatio > 0;
  const bleed = design.cooling?.bleed ?? 0;
  const nozzleCooling = design.cooling?.nozzle ?? 0;
  const rotorCooling = design.cooling?.rotor ?? 0;
  const burnerAir = 1 - bleed - nozzleCooling - rotorCooling;
  const designFlight: GasTurbineFlight = {
    mach: design.designMach ?? 0,
    temperature: design.designTemperature ?? 288.15,
    pressure: design.designPressure ?? SEA_LEVEL_PRESSURE,
  };

  /** `ṁ / (A·Pt)` of a choked throat at a total temperature and fuel-air ratio. */
  function chokedFlow(temperature: number, far: number): number {
    return thermo.flowDensity(temperature, far, thermo.criticalRatio(temperature, far));
  }

  function inlet(flight: GasTurbineFlight): { tt2: number; pt2: number; recovery: number; velocity: number } {
    const t0 = flight.temperature;
    const cp0 = gas.cp(t0, 0);
    const velocity = flight.mach * Math.sqrt((cp0 / (cp0 - gas.gasConstant)) * gas.gasConstant * t0);
    const tt2 = thermo.temperatureAtEnthalpy(gas.enthalpy(t0, 0) + 0.5 * velocity * velocity, 0, t0);
    const ram = Math.exp((gas.entropy(tt2, 0) - gas.entropy(t0, 0)) / gas.gasConstant);
    const recovery = c.inletRecovery * inletShockRecovery(design.inlet, flight.mach);
    return { tt2, pt2: flight.pressure * ram * recovery, recovery, velocity };
  }

  /** Enthalpy of combustion products per kg of fuel above that of the air it joined, at a temperature. */
  function productsIncrement(temperature: number): number {
    return gas.enthalpy(temperature, 1e12) - gas.enthalpy(temperature, 0);
  }

  function burnerFuelRatio(tt3: number, tt4: number): number {
    const ha4 = gas.enthalpy(tt4, 0);
    return Math.max(0, (ha4 - gas.enthalpy(tt3, 0)) / (c.burnerEfficiency * heating - ha4 - productsIncrement(tt4)));
  }

  /** Gross thrust of a stream through a nozzle, N, and its throat area, m². */
  function nozzle(stream: GasStream, ambient: number, kind: "convergent" | "ideal"): { gross: number; throat: number } {
    const flow = stream.air + stream.fuel;
    if (flow <= 0) return { gross: 0, throat: 0 };
    if (stream.pressure <= ambient) return { gross: 0, throat: Number.POSITIVE_INFINITY };
    const far = farOf(stream);
    const critical = thermo.criticalRatio(stream.temperature, far);
    const ratio = stream.pressure / ambient;
    const choked = ratio >= critical;
    const throat = flow / (stream.pressure * thermo.flowDensity(stream.temperature, far, choked ? critical : ratio));
    if (kind === "ideal" || !choked) return { gross: flow * thermo.staticAt(stream.temperature, far, ratio).velocity, throat };
    const exit = thermo.staticAt(stream.temperature, far, critical);
    return { gross: flow * exit.velocity + throat * (stream.pressure / critical - ambient), throat };
  }

  /** Total-to-static ratio of a subsonic stream passing `flowPerArea = ṁ / (A·Pt)`. */
  function subsonicRatio(temperature: number, far: number, flowPerArea: number): number {
    let low = 1 + 1e-12;
    let high = thermo.criticalRatio(temperature, far);
    for (let i = 0; i < 50; i += 1) {
      const mid = 0.5 * (low + high);
      if (thermo.flowDensity(temperature, far, mid) < flowPerArea) low = mid;
      else high = mid;
    }
    return 0.5 * (low + high);
  }

  /** Burner exit with the nozzle coolant mixed in, per kg of core air. */
  function burner(tt3: number, tt4: number): { f: number; fuel: number; air41: number; flow41: number; far41: number; tt41: number } {
    const f = burnerFuelRatio(tt3, tt4);
    const fuel = f * burnerAir;
    const air41 = burnerAir + nozzleCooling;
    const flow41 = air41 + fuel;
    const far41 = fuel / air41;
    const h41 = (burnerAir * (1 + f) * gas.enthalpy(tt4, f) + nozzleCooling * gas.enthalpy(tt3, 0)) / flow41;
    return { f, fuel, air41, flow41, far41, tt41: nozzleCooling > 0 ? thermo.temperatureAtEnthalpy(h41, far41, tt4) : tt4 };
  }

  /** HPT exit with the rotor coolant mixed in, per kg of core air. */
  function rotorMix(hot: { fuel: number; air41: number; flow41: number; far41: number }, tt3: number, tt44: number): { flow45: number; far45: number; tt45: number } {
    const air45 = hot.air41 + rotorCooling;
    const flow45 = air45 + hot.fuel;
    const far45 = hot.fuel / air45;
    if (rotorCooling <= 0) return { flow45, far45, tt45: tt44 };
    const h45 = (hot.flow41 * gas.enthalpy(tt44, hot.far41) + rotorCooling * gas.enthalpy(tt3, 0)) / flow45;
    return { flow45, far45, tt45: thermo.temperatureAtEnthalpy(h45, far45, tt44) };
  }

  function designFanPressureRatio(): number {
    if (design.fanPressureRatio !== undefined) return design.fanPressureRatio;
    if (separate || !hasBypass) return 1;
    let low = 1.01;
    let high = design.overallPressureRatio * 0.99;
    for (let i = 0; i < 50; i += 1) {
      const mid = 0.5 * (low + high);
      const sized = size(mid);
      if (sized.bypassTotal < sized.coreTotal) low = mid;
      else high = mid;
    }
    return 0.5 * (low + high);
  }

  function size(piF: number): { sizing: Sizing; coreTotal: number; bypassTotal: number } {
    const { tt2, pt2 } = inlet(designFlight);
    const alpha = design.bypassRatio;
    const piC = design.overallPressureRatio / piF;
    const tt4 = design.turbineInletTemperature;
    const tt13 = thermo.compress(tt2, piF, c.fan);
    const tt3 = thermo.compress(tt13, piC, c.compressor);
    const hot = burner(tt3, tt4);
    const f = hot.far41;
    const lowWork = gas.enthalpy(tt13, 0) - gas.enthalpy(tt2, 0);
    const highWork = gas.enthalpy(tt3, 0) - gas.enthalpy(tt13, 0);
    const tt44 = thermo.temperatureAtEnthalpy(gas.enthalpy(hot.tt41, f) - highWork / (c.mechanical * hot.flow41), f, hot.tt41 * 0.8);
    const { flow45, far45, tt45 } = rotorMix(hot, tt3, tt44);
    const tt5 = thermo.temperatureAtEnthalpy(gas.enthalpy(tt45, far45) - ((1 + alpha) * lowWork) / (c.mechanical * flow45), far45, tt45 * 0.8);
    const highTurbineExpansion = thermo.expansionRatio(hot.tt41, tt44, f, c.highTurbine);
    const lowTurbineExpansion = thermo.expansionRatio(tt45, tt5, far45, c.lowTurbine);
    const core = design.massFlow / (1 + alpha);
    const bypass = design.massFlow - core;
    const pt4 = pt2 * piF * piC * c.burnerPressure;
    const pt45 = pt4 / highTurbineExpansion;
    const pt5 = pt45 / lowTurbineExpansion;
    const gasFlow = core * flow45;
    const sizing: Sizing = {
      fanPressureRatio: piF,
      highTurbineExpansion,
      lowTurbineExpansion,
      highTurbineArea: (core * hot.flow41) / (pt4 * chokedFlow(hot.tt41, f)),
      lowTurbineArea: gasFlow / (pt45 * chokedFlow(tt45, far45)),
      coreNozzleArea: 0,
      fanNozzleArea: 0,
      mixerCoreArea: 0,
      mixerBypassArea: 0,
      lowWork,
      highWork,
      fanInlet: tt2,
      compressorInlet: tt13,
    };
    const pt16 = pt2 * piF * (separate ? c.fanNozzlePressure : c.bypassDuctPressure);
    if (separate) {
      sizing.coreNozzleArea = nozzle({ air: core * (1 - bleed), fuel: core * hot.fuel, temperature: tt5, pressure: pt5 * c.nozzlePressure }, designFlight.pressure, design.nozzle).throat;
      sizing.fanNozzleArea = bypass > 0 ? nozzle({ air: bypass, fuel: 0, temperature: tt13, pressure: pt16 }, designFlight.pressure, design.nozzle).throat : 0;
    } else {
      const m6 = design.mixerMach ?? 0.4;
      // Static state at the mixer Mach number: bisect the static temperature for V = M·a.
      const h5 = gas.enthalpy(tt5, far45);
      let low = 0.7 * tt5;
      let high = tt5;
      for (let i = 0; i < 50; i += 1) {
        const t = 0.5 * (low + high);
        const cp = gas.cp(t, far45);
        const sound2 = (cp / (cp - gas.gasConstant)) * gas.gasConstant * t;
        if (2 * (h5 - gas.enthalpy(t, far45)) > m6 * m6 * sound2) low = t;
        else high = t;
      }
      const ratio6 = Math.exp((gas.entropy(tt5, far45) - gas.entropy(0.5 * (low + high), far45)) / gas.gasConstant);
      sizing.mixerCoreArea = gasFlow / (pt5 * thermo.flowDensity(tt5, far45, ratio6));
      const p6 = pt5 / ratio6;
      if (bypass > 0 && pt16 > p6) sizing.mixerBypassArea = bypass / (pt16 * thermo.flowDensity(tt13, 0, pt16 / p6));
    }
    return { sizing, coreTotal: pt5, bypassTotal: pt16 };
  }

  const sizing = size(designFanPressureRatio()).sizing;

  /** The hot section at a compressor delivery and burner exit temperature: HPT expansion from the two choked nozzles. */
  function hotSection(tt3: number, tt4: number) {
    const hot = burner(tt3, tt4);
    const inletFlow = sizing.highTurbineArea * chokedFlow(hot.tt41, hot.far41);
    let expansion = sizing.highTurbineExpansion;
    let tt44 = thermo.expand(hot.tt41, hot.far41, expansion, c.highTurbine);
    let mixed = rotorMix(hot, tt3, tt44);
    for (let i = 0; i < 20; i += 1) {
      const next = (sizing.lowTurbineArea * chokedFlow(mixed.tt45, mixed.far45) * hot.flow41) / (inletFlow * mixed.flow45);
      tt44 = thermo.expand(hot.tt41, hot.far41, next, c.highTurbine);
      mixed = rotorMix(hot, tt3, tt44);
      const done = Math.abs(next - expansion) < 1e-12 * expansion;
      expansion = next;
      if (done) break;
    }
    return { ...hot, ...mixed, expansion, tt44, inletFlow };
  }

  /** LPT expansion ratio that passes the turbine flow through the fixed core nozzle (separate exhausts). */
  function lowTurbineExpansionAt(tt45: number, pt45: number, f: number, flow: number, ambient: number): number {
    const passes = (expansion: number): number => {
      const tt5 = thermo.expand(tt45, f, expansion, c.lowTurbine);
      const pt8 = (pt45 / expansion) * c.nozzlePressure;
      if (pt8 <= ambient) return 0;
      const ratio = Math.min(pt8 / ambient, thermo.criticalRatio(tt5, f));
      return sizing.coreNozzleArea * pt8 * thermo.flowDensity(tt5, f, ratio);
    };
    let low = 1.0001;
    let high = Math.max(1.0002, (pt45 * c.nozzlePressure) / ambient);
    if (passes(low) < flow) return low;
    for (let i = 0; i < 50; i += 1) {
      const mid = Math.sqrt(low * high);
      if (passes(mid) > flow) low = mid;
      else high = mid;
    }
    return Math.sqrt(low * high);
  }

  function afterburn(exhaust: GasStream, flight: GasTurbineFlight, temperature: number): { gross: number; fuelFlow: number } {
    if (design.afterburnerTemperature === undefined || temperature <= exhaust.temperature + 1e-6) {
      return { gross: nozzle({ ...exhaust, pressure: exhaust.pressure * c.afterburnerDryPressure * c.nozzlePressure }, flight.pressure, design.nozzle).gross, fuelFlow: 0 };
    }
    const total = exhaust.air + exhaust.fuel;
    const ha6 = gas.enthalpy(exhaust.temperature, 0);
    const ha7 = gas.enthalpy(temperature, 0);
    const hb7 = productsIncrement(temperature);
    const fuel = Math.max(0, (total * (ha7 - ha6) + exhaust.fuel * (hb7 - productsIncrement(exhaust.temperature))) / (c.afterburnerEfficiency * heating - ha7 - hb7));
    const burned: GasStream = { air: exhaust.air, fuel: exhaust.fuel + fuel, temperature, pressure: exhaust.pressure * c.afterburnerPressure * c.nozzlePressure };
    return { gross: nozzle(burned, flight.pressure, design.nozzle).gross, fuelFlow: fuel };
  }

  /** Constant-area mixing to fully mixed flow: mass, energy and impulse conserved; equal statics at the inlet planes. */
  function mix(core: GasStream, bypass: GasStream): GasStream {
    const r = gas.gasConstant;
    const fc = farOf(core);
    const coreFlow = core.air + core.fuel;
    const ratio6 = subsonicRatio(core.temperature, fc, coreFlow / (sizing.mixerCoreArea * core.pressure));
    const p6 = core.pressure / ratio6;
    const s6 = thermo.staticAt(core.temperature, fc, ratio6);
    const s16 = thermo.staticAt(bypass.temperature, 0, bypass.pressure / p6);
    const impulse = p6 * (sizing.mixerCoreArea + sizing.mixerBypassArea) + coreFlow * s6.velocity + bypass.air * s16.velocity;
    const air = core.air + bypass.air;
    const flow = air + core.fuel;
    const far = core.fuel / air;
    const total = coreFlow * gas.enthalpy(core.temperature, fc) + bypass.air * gas.enthalpy(bypass.temperature, 0);
    const tt = thermo.temperatureAtEnthalpy(total / flow, far, (core.temperature + bypass.temperature) / 2);
    const ht = total / flow;
    const area = sizing.mixerCoreArea + sizing.mixerBypassArea;
    // Impulse gives the static temperature for a velocity, T = (I − ṁV)·V/(ṁR); energy picks the subsonic root.
    const residual = (v: number): number => gas.enthalpy(((impulse - flow * v) * v) / (flow * r), far) + 0.5 * v * v - ht;
    let vLow = 1;
    let vHigh = (0.5 * impulse) / flow;
    for (let i = 0; i < 60; i += 1) {
      const mid = 0.5 * (vLow + vHigh);
      if (residual(mid) < 0) vLow = mid;
      else vHigh = mid;
    }
    const v = 0.5 * (vLow + vHigh);
    const t = ((impulse - flow * v) * v) / (flow * r);
    const p = (impulse - flow * v) / area;
    return { air, fuel: core.fuel, temperature: tt, pressure: p * Math.exp((gas.entropy(tt, far) - gas.entropy(t, far)) / r) * c.mixerPressure };
  }

  /**
   * A mixed-exhaust point: the variable nozzle holds the design LPT ratio until it is fully open (its full-afterburner
   * throat at design), then the open throat sets a smaller LPT expansion, as at idle.
   */
  function solve(flight: GasTurbineFlight, tt4: number, afterburnerTemperature?: number): GasTurbinePoint {
    const held = solveAt(flight, tt4, afterburnerTemperature, sizing.lowTurbineExpansion);
    if (separate || held.nozzleThroat <= maxThroat) return held;
    let low = 1.05;
    let high = sizing.lowTurbineExpansion;
    let point = held;
    let good: GasTurbinePoint | undefined;
    for (let i = 0; i < 14; i += 1) {
      const mid = Math.sqrt(low * high);
      point = solveAt(flight, tt4, afterburnerTemperature, mid);
      if (point.nozzleThroat > maxThroat) high = mid;
      else {
        low = mid;
        if (Number.isFinite(point.thrust)) good = point;
      }
    }
    return good ?? point;
  }

  function solveAt(flight: GasTurbineFlight, tt4: number, afterburnerTemperature: number | undefined, mixedLowExpansion: number): GasTurbinePoint {
    const { tt2, pt2, recovery, velocity } = inlet(flight);
    const h2 = gas.enthalpy(tt2, 0);
    let lowWork = sizing.lowWork * Math.min(1, tt4 / design.turbineInletTemperature);
    let alpha = design.bypassRatio;
    let hot = hotSection(tt2 * 2.5, tt4);
    let lowExpansion = mixedLowExpansion;
    let converged = false;
    let tt13 = tt2;
    let tt3 = tt2;
    let tt5 = tt4;
    let piF = 1;
    let piC = 1;
    for (let i = 0; i < ITERATIONS; i += 1) {
      tt13 = thermo.temperatureAtEnthalpy(h2 + lowWork, 0, tt2 + lowWork / 1004);
      piF = thermo.expansionRatio(tt13, tt2, 0, 1 / c.fan);
      const highWork = c.mechanical * hot.flow41 * (gas.enthalpy(hot.tt41, hot.far41) - gas.enthalpy(hot.tt44, hot.far41));
      tt3 = thermo.temperatureAtEnthalpy(gas.enthalpy(tt13, 0) + highWork, 0, tt13 * 2);
      piC = thermo.expansionRatio(tt3, tt13, 0, 1 / c.compressor);
      hot = hotSection(tt3, tt4);
      const f = hot.far45;
      const pt4 = pt2 * piF * piC * c.burnerPressure;
      const core = (hot.inletFlow * pt4) / hot.flow41;
      const gasFlow = core * hot.flow45;
      const pt45 = pt4 / hot.expansion;
      if (separate) lowExpansion = lowTurbineExpansionAt(hot.tt45, pt45, f, gasFlow, flight.pressure);
      tt5 = thermo.expand(hot.tt45, f, lowExpansion, c.lowTurbine);
      let nextAlpha = 0;
      if (hasBypass) {
        let bypass = 0;
        if (separate) {
          const pt18 = pt2 * piF * c.fanNozzlePressure;
          if (pt18 > flight.pressure) bypass = sizing.fanNozzleArea * pt18 * thermo.flowDensity(tt13, 0, Math.min(pt18 / flight.pressure, thermo.criticalRatio(tt13, 0)));
        } else {
          const pt5 = pt45 / lowExpansion;
          const p6 = pt5 / subsonicRatio(tt5, f, gasFlow / (sizing.mixerCoreArea * pt5));
          const pt16 = pt2 * piF * c.bypassDuctPressure;
          if (pt16 > p6) bypass = sizing.mixerBypassArea * pt16 * thermo.flowDensity(tt13, 0, Math.min(pt16 / p6, thermo.criticalRatio(tt13, 0)));
        }
        nextAlpha = bypass / core;
      }
      const turbineWork = gas.enthalpy(hot.tt45, f) - gas.enthalpy(tt5, f);
      const nextLowWork = hasBypass || sizing.fanPressureRatio > 1 ? (c.mechanical * hot.flow45 * turbineWork) / (1 + nextAlpha) : 0;
      const change = Math.abs(nextLowWork - lowWork) / Math.max(1, sizing.lowWork) + Math.abs(nextAlpha - alpha) * 1e-2;
      lowWork += 0.6 * (nextLowWork - lowWork);
      alpha += 0.6 * (nextAlpha - alpha);
      if (change < 1e-10) {
        converged = true;
        break;
      }
    }
    const pt3 = pt2 * piF * piC;
    const pt4 = pt3 * c.burnerPressure;
    const core = (hot.inletFlow * pt4) / hot.flow41;
    const bypass = alpha * core;
    const coreStream: GasStream = { air: core * (1 - bleed), fuel: core * hot.fuel, temperature: tt5, pressure: pt4 / hot.expansion / lowExpansion };
    let exhaust: GasStream;
    let fanGross = 0;
    if (separate) {
      exhaust = coreStream;
      if (bypass > 0) fanGross = nozzle({ air: bypass, fuel: 0, temperature: tt13, pressure: pt2 * piF * c.fanNozzlePressure }, flight.pressure, design.nozzle).gross;
    } else if (bypass <= 0) {
      exhaust = { ...coreStream, pressure: coreStream.pressure * c.mixerPressure };
    } else {
      exhaust = mix(coreStream, { air: bypass, fuel: 0, temperature: tt13, pressure: pt2 * piF * c.bypassDuctPressure });
    }
    const lit = design.afterburnerTemperature !== undefined && afterburnerTemperature !== undefined && afterburnerTemperature > exhaust.temperature;
    const exitTemperature = lit && afterburnerTemperature !== undefined ? afterburnerTemperature : exhaust.temperature;
    const burned = afterburn(exhaust, flight, exitTemperature);
    const throatStream: GasStream = {
      air: exhaust.air,
      fuel: exhaust.fuel + burned.fuelFlow,
      temperature: exitTemperature,
      pressure: exhaust.pressure * (lit ? c.afterburnerPressure : c.afterburnerDryPressure) * c.nozzlePressure,
    };
    const massFlow = core + bypass;
    const ramDrag = massFlow * velocity;
    const thrust = burned.gross + fanGross - ramDrag;
    const fuelFlow = hot.fuel * core + burned.fuelFlow;
    const fanWork = gas.enthalpy(tt13, 0) - h2;
    const compressorWork = gas.enthalpy(tt3, 0) - gas.enthalpy(tt13, 0);
    const lowSpeed = sizing.lowWork > 0 ? Math.sqrt(Math.max(0, fanWork) / sizing.lowWork) : 0;
    const highSpeed = Math.sqrt(Math.max(0, compressorWork) / sizing.highWork);
    return {
      flight,
      converged,
      thrust,
      fuelFlow,
      afterburnerFuelFlow: burned.fuelFlow,
      tsfc: thrust > 0 ? fuelFlow / thrust : Number.POSITIVE_INFINITY,
      massFlow,
      coreFlow: core,
      bypassRatio: alpha,
      fanPressureRatio: piF,
      overallPressureRatio: piF * piC,
      inletRecovery: recovery,
      fanInletTemperature: tt2,
      compressorTemperature: tt3,
      compressorPressure: pt3,
      turbineInletTemperature: tt4,
      fuelAirRatio: hot.f,
      afterburnerTemperature: exitTemperature,
      lowSpeed,
      highSpeed,
      correctedLowSpeed: lowSpeed / Math.sqrt(tt2 / sizing.fanInlet),
      correctedHighSpeed: highSpeed / Math.sqrt(tt13 / sizing.compressorInlet),
      fanPower: massFlow * fanWork,
      compressorPower: core * compressorWork,
      highTurbineExpansion: hot.expansion,
      lowTurbineExpansion: lowExpansion,
      ramDrag,
      exhaust,
      fanGross,
      nozzleThroat: nozzle(throatStream, flight.pressure, "convergent").throat,
    };
  }

  function withinLimits(point: GasTurbinePoint): boolean {
    const limits = design.limits;
    if (limits.overallPressureRatio !== undefined && point.overallPressureRatio > limits.overallPressureRatio) return false;
    if (limits.lowSpeed !== undefined && point.lowSpeed > limits.lowSpeed) return false;
    if (limits.highSpeed !== undefined && point.highSpeed > limits.highSpeed) return false;
    const cold = (limits.coldSpeedGain ?? 0) * Math.max(0, 1 - point.fanInletTemperature / sizing.fanInlet);
    if (limits.correctedLowSpeed !== undefined && point.correctedLowSpeed > limits.correctedLowSpeed + cold) return false;
    if (limits.correctedHighSpeed !== undefined && point.correctedHighSpeed > limits.correctedHighSpeed + cold) return false;
    return true;
  }

  function maxDry(flight: GasTurbineFlight): GasTurbinePoint {
    const ceiling = design.limits.turbineInletTemperature;
    const top = solve(flight, ceiling);
    if (withinLimits(top)) return top;
    let low = 0.35 * ceiling;
    let high = ceiling;
    for (let i = 0; i < 30; i += 1) {
      const mid = 0.5 * (low + high);
      if (withinLimits(solve(flight, mid))) low = mid;
      else high = mid;
    }
    return solve(flight, low);
  }

  const designAfterburner = design.afterburnerTemperature;
  const maxThroat = separate
    ? Number.POSITIVE_INFINITY
    : solveAt(designFlight, design.turbineInletTemperature, designAfterburner, sizing.lowTurbineExpansion).nozzleThroat * (designAfterburner === undefined ? 1.0000001 : 1);

  return {
    design,
    gas,
    reference: solve(designFlight, design.turbineInletTemperature),
    solve,
    maxDry,
    maxAfterburner(flight) {
      const dry = maxDry(flight);
      const temperature = design.afterburnerTemperature;
      return temperature === undefined ? dry : solve(flight, dry.turbineInletTemperature, temperature);
    },
    afterburn,
    turbinePowers(point, fuelFlow) {
      const tt3 = point.compressorTemperature;
      const f = Math.max(0, fuelFlow / (point.coreFlow * burnerAir));
      // (1 + f)·hA(T4) + f·hB(T4) = hA(T3) + η·f·LHV, solved for T4.
      const target = gas.enthalpy(tt3, 0) + c.burnerEfficiency * f * heating;
      const tt4 = thermo.temperatureAtEnthalpy(target / (1 + f), f, tt3 + (f * heating) / 1200);
      const hot = hotSection(tt3, tt4);
      const tt5 = thermo.expand(hot.tt45, hot.far45, point.lowTurbineExpansion, c.lowTurbine);
      return {
        high: c.mechanical * point.coreFlow * hot.flow41 * (gas.enthalpy(hot.tt41, hot.far41) - gas.enthalpy(hot.tt44, hot.far41)),
        low: c.mechanical * point.coreFlow * hot.flow45 * (gas.enthalpy(hot.tt45, hot.far45) - gas.enthalpy(tt5, hot.far45)),
      };
    },
  };
}
