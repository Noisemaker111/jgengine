// @skill jgengine-world
import type { GasStream, GasTurbineCycle, GasTurbineFlight } from "./gasTurbine";
import type { ReferenceAirData, ReferencePropulsion } from "./referenceAircraft";
import { SEA_LEVEL_PRESSURE } from "./standardAtmosphere";

/** Rotor dynamics and fuel control of a {@link GasTurbineEngine}. */
export interface GasTurbineEngineOptions {
  /** Polar moment of inertia of each spool, kg·m². */
  lowInertia: number;
  highInertia: number;
  /** Design (100%) speed of each spool, rev/min. */
  lowRpm: number;
  highRpm: number;
  /** Ground idle: physical high-spool speed, share of design. */
  idleSpeed: number;
  /** Fuel control acceleration limit: burner fuel flow over the steady flow at the current speed (default `1.5`). */
  accelerationLimit?: number;
  /** Fuel control deceleration limit (default `0.5`). */
  decelerationLimit?: number;
  /** Speed governor: fuel flow change, as a share of steady flow, per unit high-spool speed error (default `12`). */
  governorGain?: number;
  /** Afterburner light-up and modulation rate, share of full afterburner per second (default `1`). */
  afterburnerRate?: number;
  /** Installed over uninstalled thrust, for inlet, nozzle and bleed losses the cycle leaves out (default `1`). */
  installation?: number;
  /** Highest flight Mach number the operating-line tables cover (default `2`). */
  maxMach?: number;
}

/** Power lever split: `dry` runs idle to maximum dry thrust, `afterburner` adds afterburning on top. */
export interface GasTurbineCommand {
  /** `0..1`, linear in steady thrust between idle and maximum dry. */
  dry: number;
  /** `0..1`; lights only at maximum dry. */
  afterburner: number;
}

/** What {@link GasTurbineEngine.evaluate} writes. */
export interface GasTurbineEngineOutput {
  /** Installed net thrust, N. */
  thrust: number;
  /** Burner plus afterburner fuel flow, kg/s. */
  fuelFlow: number;
  /** d(low rpm)/dt, d(high rpm)/dt, d(afterburner share)/dt. */
  rates: [number, number, number];
  /** Spool angular momentum about the engine axis, kg·m²/s. */
  angularMomentum: number;
  /** Burner exit temperature, K. */
  turbineInletTemperature: number;
}

/** A gas turbine with spool dynamics, flying a {@link GasTurbineCycle}'s operating line. */
export interface GasTurbineEngine {
  readonly cycle: GasTurbineCycle;
  readonly options: Readonly<GasTurbineEngineOptions>;
  /** `[low rpm, high rpm, afterburner share]`. */
  readonly stateNames: readonly ["lowSpool", "highSpool", "afterburner"];
  /** The steady state for a command in a flight condition. */
  steady(flight: GasTurbineFlight, command: GasTurbineCommand): [number, number, number];
  evaluate(state: readonly number[], command: GasTurbineCommand, flight: GasTurbineFlight, out: GasTurbineEngineOutput): void;
}

const NODES = 16;
const MACH_STEP = 0.1;
const TEMPERATURE_LOW = 180;
const TEMPERATURE_STEP = 25;
const TEMPERATURES = 7;

/** One operating line at one flight condition, idle to maximum dry, at sea-level static pressure. */
interface Column {
  highSpeed: Float64Array;
  lowSpeed: Float64Array;
  thrust: Float64Array;
  fuelFlow: Float64Array;
  fanPower: Float64Array;
  turbineInlet: Float64Array;
  /** d(HPT shaft power)/d(fuel flow) and the same for the LPT, W per kg/s. */
  highPowerPerFuel: Float64Array;
  lowPowerPerFuel: Float64Array;
  exhaustAir: Float64Array;
  exhaustFuel: Float64Array;
  exhaustTemperature: Float64Array;
  /** Exhaust total pressure over free-stream static. */
  exhaustPressure: Float64Array;
}

function lerp(array: Float64Array, s: number): number {
  const i = Math.max(0, Math.min(NODES - 2, Math.floor(s)));
  const u = s - i;
  return (array[i] ?? 0) * (1 - u) + (array[i + 1] ?? 0) * u;
}

/**
 * Creates a {@link GasTurbineEngine}: two spools with real inertia flying the cycle's steady operating line, in the
 * quasi-steady manner of simplified engine transient models. Each spool speeds up by its shaft power surplus over its
 * inertia, `J·ω·dω/dt = P_turbine − P_compressor`: the compressor works on its steady line at the current speed, and
 * burner fuel above the steady flow at that speed heats the turbines (linearised about the line). A fuel control meters
 * fuel by a speed governor inside acceleration and deceleration limits, as real controls guard surge and flame-out. The
 * throttle is linear in steady thrust from idle to maximum dry; the afterburner lights at maximum dry and modulates its
 * exit temperature at a rate. Steady performance comes from tables of cycle solutions over flight Mach and ambient
 * temperature, built on first use of each flight condition; thrust and fuel scale with ambient pressure.
 * @capability gas-turbine turbofan / turbojet with spool inertia, fuel control and afterburner on a cycle's operating line
 */
// stateless: the only closure state is a memo of steady-line tables, a pure function of the cycle; the spool state is the caller's array
export function createGasTurbineEngine(cycle: GasTurbineCycle, options: GasTurbineEngineOptions): GasTurbineEngine {
  const accelerationLimit = options.accelerationLimit ?? 1.5;
  const decelerationLimit = options.decelerationLimit ?? 0.5;
  const gain = options.governorGain ?? 12;
  const afterburnerRate = options.afterburnerRate ?? 1;
  const installation = options.installation ?? 1;
  const machCount = Math.round((options.maxMach ?? 2) / MACH_STEP) + 1;
  const columns = new Map<number, Column>();
  const hasAfterburner = cycle.design.afterburnerTemperature !== undefined;

  function build(machIndex: number, temperatureIndex: number): Column {
    const flight: GasTurbineFlight = { mach: machIndex * MACH_STEP, temperature: TEMPERATURE_LOW + temperatureIndex * TEMPERATURE_STEP, pressure: SEA_LEVEL_PRESSURE };
    const top = cycle.maxDry(flight);
    // Idle by secant on the turbine inlet temperature: high-spool speed is smooth and nearly linear in it.
    let idle = top.turbineInletTemperature;
    if (top.highSpeed > options.idleSpeed) {
      let x0 = top.turbineInletTemperature;
      let y0 = top.highSpeed - options.idleSpeed;
      let x1 = 0.6 * x0;
      let y1 = cycle.solve(flight, x1).highSpeed - options.idleSpeed;
      for (let i = 0; i < 12 && Math.abs(y1) > 1e-6; i += 1) {
        const x2 = Math.max(0.3 * top.turbineInletTemperature, x1 - (y1 * (x1 - x0)) / (y1 - y0));
        x0 = x1;
        y0 = y1;
        x1 = x2;
        y1 = cycle.solve(flight, x1).highSpeed - options.idleSpeed;
      }
      idle = x1;
    }
    const column: Column = {
      highSpeed: new Float64Array(NODES),
      lowSpeed: new Float64Array(NODES),
      thrust: new Float64Array(NODES),
      fuelFlow: new Float64Array(NODES),
      fanPower: new Float64Array(NODES),
      turbineInlet: new Float64Array(NODES),
      highPowerPerFuel: new Float64Array(NODES),
      lowPowerPerFuel: new Float64Array(NODES),
      exhaustAir: new Float64Array(NODES),
      exhaustFuel: new Float64Array(NODES),
      exhaustTemperature: new Float64Array(NODES),
      exhaustPressure: new Float64Array(NODES),
    };
    let previousHigh = 0;
    let previousLow = 0;
    for (let k = 0; k < NODES; k += 1) {
      const tt4 = idle + ((top.turbineInletTemperature - idle) * k) / (NODES - 1);
      const point = k === NODES - 1 ? top : cycle.solve(flight, tt4);
      // Keep the speed columns strictly rising so they invert.
      const highSpeed = Math.max(point.highSpeed, previousHigh + 1e-6);
      const lowSpeed = Math.max(point.lowSpeed, previousLow + 1e-6);
      previousHigh = highSpeed;
      previousLow = lowSpeed;
      const df = 0.02 * point.fuelFlow;
      const plus = cycle.turbinePowers(point, point.fuelFlow - point.afterburnerFuelFlow + df);
      const minus = cycle.turbinePowers(point, point.fuelFlow - point.afterburnerFuelFlow - df);
      column.highSpeed[k] = highSpeed;
      column.lowSpeed[k] = lowSpeed;
      column.thrust[k] = point.thrust;
      column.fuelFlow[k] = point.fuelFlow;
      column.fanPower[k] = point.fanPower;
      column.turbineInlet[k] = point.turbineInletTemperature;
      column.highPowerPerFuel[k] = (plus.high - minus.high) / (2 * df);
      column.lowPowerPerFuel[k] = (plus.low - minus.low) / (2 * df);
      column.exhaustAir[k] = point.exhaust.air;
      column.exhaustFuel[k] = point.exhaust.fuel;
      column.exhaustTemperature[k] = point.exhaust.temperature;
      column.exhaustPressure[k] = point.exhaust.pressure / flight.pressure;
    }
    return column;
  }

  function column(machIndex: number, temperatureIndex: number): Column {
    const key = machIndex * 64 + temperatureIndex;
    let found = columns.get(key);
    if (found === undefined) {
      found = build(machIndex, temperatureIndex);
      columns.set(key, found);
    }
    return found;
  }

  // The four columns around a flight condition and their bilinear weights.
  const around: Column[] = [];
  const weights = [0, 0, 0, 0];
  function locate(flight: GasTurbineFlight): void {
    const x = Math.max(0, Math.min(machCount - 1 - 1e-9, flight.mach / MACH_STEP));
    const y = Math.max(0, Math.min(TEMPERATURES - 1 - 1e-9, (flight.temperature - TEMPERATURE_LOW) / TEMPERATURE_STEP));
    const i = Math.floor(x);
    const j = Math.floor(y);
    const u = x - i;
    const v = y - j;
    around[0] = column(i, j);
    around[1] = column(i + 1, j);
    around[2] = column(i, j + 1);
    around[3] = column(i + 1, j + 1);
    weights[0] = (1 - u) * (1 - v);
    weights[1] = u * (1 - v);
    weights[2] = (1 - u) * v;
    weights[3] = u * v;
  }

  function blendNode(field: keyof Column, k: number): number {
    let sum = 0;
    for (let n = 0; n < 4; n += 1) sum += (weights[n] ?? 0) * (around[n]?.[field][k] ?? 0);
    return sum;
  }

  function blendAt(field: keyof Column, s: number): number {
    let sum = 0;
    for (let n = 0; n < 4; n += 1) {
      const array = around[n]?.[field];
      if (array !== undefined) sum += (weights[n] ?? 0) * lerp(array, s);
    }
    return sum;
  }

  /** Fractional node index where a blended rising column reaches a value, clamped to the line. */
  function invert(field: keyof Column, value: number): number {
    let previous = blendNode(field, 0);
    if (value <= previous) return 0;
    for (let k = 1; k < NODES; k += 1) {
      const next = blendNode(field, k);
      if (value <= next) return k - 1 + (value - previous) / Math.max(1e-12, next - previous);
      previous = next;
    }
    return NODES - 1;
  }

  function dryTarget(dry: number): number {
    const idle = blendNode("thrust", 0);
    const top = blendNode("thrust", NODES - 1);
    return invert("thrust", idle + Math.max(0, Math.min(1, dry)) * (top - idle));
  }

  const exhaust: GasStream = { air: 0, fuel: 0, temperature: 0, pressure: 0 };

  return {
    cycle,
    options,
    stateNames: ["lowSpool", "highSpool", "afterburner"],
    steady(flight, command) {
      locate(flight);
      const s = dryTarget(command.dry);
      const lit = hasAfterburner && command.dry >= 1 ? Math.max(0, Math.min(1, command.afterburner)) : 0;
      return [blendAt("lowSpeed", s) * options.lowRpm, blendAt("highSpeed", s) * options.highRpm, lit];
    },
    evaluate(state, command, flight, out) {
      locate(flight);
      const delta = flight.pressure / SEA_LEVEL_PRESSURE;
      const lowRpm = Math.max(1, state[0] ?? 0);
      const highRpm = Math.max(1, state[1] ?? 0);
      const afterburner = Math.max(0, Math.min(1, state[2] ?? 0));
      const sHigh = invert("highSpeed", highRpm / options.highRpm);
      const sLow = invert("lowSpeed", lowRpm / options.lowRpm);
      const target = blendAt("highSpeed", dryTarget(command.dry));
      const steadyFuel = blendAt("fuelFlow", sHigh) * delta;
      const demand = 1 + gain * (target - highRpm / options.highRpm);
      const fuel = steadyFuel * Math.max(decelerationLimit, Math.min(accelerationLimit, demand));
      const excessFuel = fuel - steadyFuel;
      const highSurplus = blendAt("highPowerPerFuel", sHigh) * excessFuel;
      const lowSurplus = blendAt("lowPowerPerFuel", sHigh) * excessFuel + (blendAt("fanPower", sHigh) - blendAt("fanPower", sLow)) * delta;
      const highOmegaNow = (highRpm * Math.PI) / 30;
      const lowOmegaNow = (lowRpm * Math.PI) / 30;
      const toRpm = 30 / Math.PI;
      out.rates[0] = (lowSurplus / (options.lowInertia * lowOmegaNow)) * toRpm;
      out.rates[1] = (highSurplus / (options.highInertia * highOmegaNow)) * toRpm;
      const lightable = hasAfterburner && command.dry >= 1 && sLow >= NODES - 1.5;
      const afterburnerTarget = lightable ? Math.max(0, Math.min(1, command.afterburner)) : 0;
      out.rates[2] = Math.max(-afterburnerRate, Math.min(afterburnerRate, 20 * (afterburnerTarget - afterburner)));
      let thrust = blendAt("thrust", sLow) * delta;
      let afterburnerFuel = 0;
      if (afterburner > 1e-6 && hasAfterburner) {
        exhaust.air = blendAt("exhaustAir", sLow) * delta;
        exhaust.fuel = blendAt("exhaustFuel", sLow) * delta;
        exhaust.temperature = blendAt("exhaustTemperature", sLow);
        exhaust.pressure = blendAt("exhaustPressure", sLow) * flight.pressure;
        const maxTemperature = cycle.design.afterburnerTemperature ?? exhaust.temperature;
        const dry = cycle.afterburn(exhaust, flight, exhaust.temperature);
        const lit = cycle.afterburn(exhaust, flight, exhaust.temperature + afterburner * (maxTemperature - exhaust.temperature));
        thrust += lit.gross - dry.gross;
        afterburnerFuel = lit.fuelFlow;
      }
      out.thrust = thrust * installation;
      out.fuelFlow = fuel + afterburnerFuel;
      out.angularMomentum = options.lowInertia * lowOmegaNow + options.highInertia * highOmegaNow;
      out.turbineInletTemperature = blendAt("turbineInlet", sHigh);
    },
  };
}

/**
 * A {@link ReferencePropulsion} driving a {@link GasTurbineEngine} along body x: thrust, fuel-burning spool states and
 * the spools' gyroscopic momentum. `command` maps the pilot's throttle to the engine's power lever.
 * @capability gas-turbine plug a cycle-based jet engine into a reference aircraft
 */
export function gasTurbinePropulsion(engine: GasTurbineEngine, command: (throttle: number) => GasTurbineCommand): ReferencePropulsion {
  const out: GasTurbineEngineOutput = { thrust: 0, fuelFlow: 0, rates: [0, 0, 0], angularMomentum: 0, turbineInletTemperature: 0 };
  const flight: GasTurbineFlight = { mach: 0, temperature: 288.15, pressure: SEA_LEVEL_PRESSURE };
  const fill = (air: ReferenceAirData): GasTurbineFlight => {
    flight.mach = air.mach;
    flight.temperature = air.air.temperature;
    flight.pressure = air.air.pressure;
    return flight;
  };
  return {
    stateNames: engine.stateNames,
    settle(throttle, air, state) {
      const steady = engine.steady(fill(air), command(throttle));
      for (let i = 0; i < steady.length; i += 1) state[i] = steady[i] ?? 0;
    },
    evaluate(state, throttle, air, result) {
      engine.evaluate(state, command(throttle), fill(air), out);
      result.force[0] = out.thrust;
      result.force[1] = 0;
      result.force[2] = 0;
      result.moment[0] = 0;
      result.moment[1] = 0;
      result.moment[2] = 0;
      result.angularMomentum[0] = out.angularMomentum;
      result.angularMomentum[1] = 0;
      result.angularMomentum[2] = 0;
      for (let i = 0; i < 3; i += 1) result.rates[i] = out.rates[i] ?? 0;
      result.thrust = out.thrust;
      result.shaftPower = 0;
      result.rpm = state[0] ?? 0;
    },
  };
}
