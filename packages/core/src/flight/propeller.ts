// @skill jgengine-world
import { SEA_LEVEL_AIR } from "./atmosphere";

/**
 * The propeller effect: a piston engine turns a fixed-pitch propeller whose thrust and power coefficients follow the
 * advance ratio `J = V/nD` and tip Mach number, so static thrust is high and falls off with airspeed, and the shaft
 * speed settles where engine torque meets propeller torque. Engine torque lapses with air density (Gagg–Ferrar); the
 * shaft's torque reaction rolls the airframe and its spin adds gyroscopic moments.
 */
export interface AircraftPropeller {
  /**
   * Multiplier on the effect: `0` off (the tuning's `maxThrust` times spool, the simple model), `1` as measured
   * (default), past `1` the propeller's thrust scales with the strength; sane over `0..4`.
   */
  strength?: number;
  /** Propeller diameter, m (default `1.905`, the Cessna 172's McCauley 1C160). */
  diameter?: number;
  /** Engine power at rated speed, sea level, full throttle, W (default 160 hp, the Lycoming O-320-H2AD). */
  ratedPower?: number;
  /** Rated shaft speed, rev/min (default `2700`). */
  ratedRpm?: number;
  /** Crankshaft plus propeller polar inertia, kg·m² (default `1.9`). */
  inertia?: number;
  /** Advance ratio breakpoints (default `0` to `1.2` every `0.1`). */
  advanceRatios?: readonly number[];
  /** Tip Mach breakpoints (default `0.5`, `0.65`, `0.8`, `0.95`). */
  tipMachs?: readonly number[];
  /** Thrust coefficient `T/ρn²D⁴`, row-major by advance ratio then tip Mach (default the 1C160 blade-element map). */
  thrust?: readonly number[];
  /** Power coefficient `P/ρn³D⁵`, same grid (default the 1C160 blade-element map). */
  power?: readonly number[];
  /** Gagg–Ferrar power lapse `P/P0 = a·σ − (a − 1)` (default `1.132`). */
  densityLapse?: number;
  /** Manifold pressure share at closed throttle (default `0.08`). */
  idleManifold?: number;
  /** Pumping loss at closed throttle, share of rated torque at rated speed (default `0.1`). */
  pumpingLoss?: number;
  /** Which way the propeller turns seen from the cockpit (default `1`, clockwise: the torque reaction rolls the airframe left). */
  rotation?: 1 | -1;
}

/** McCauley 1C160/DTM7553 thrust coefficients from the reference blade-element solver, by advance ratio then tip Mach. */
export const C172_PROPELLER_THRUST: readonly number[] = [
  0.11814, 0.11358, 0.10058, 0.09301, 0.1226, 0.12408, 0.11929, 0.1088, 0.12079, 0.12437, 0.12874, 0.12672, 0.11352, 0.11754, 0.12281, 0.12602, 0.10087,
  0.10466, 0.10965, 0.11302, 0.08193, 0.08512, 0.08929, 0.09202, 0.06164, 0.06418, 0.06743, 0.06948, 0.04009, 0.04188, 0.04412, 0.04542, 0.01735, 0.01827,
  0.01938, 0.01987, -0.00657, -0.00662, -0.00678, -0.00716, -0.03161, -0.03281, -0.03436, -0.03569, -0.05779, -0.06031, -0.06339, -0.06573, -0.08511,
  -0.08915, -0.09391, -0.09732,
];

/** McCauley 1C160/DTM7553 power coefficients, same grid. */
export const C172_PROPELLER_POWER: readonly number[] = [
  0.05694, 0.05721, 0.05508, 0.05561, 0.06021, 0.06253, 0.06223, 0.05972, 0.06228, 0.06531, 0.06922, 0.06938, 0.06273, 0.06585, 0.07001, 0.07283, 0.06083,
  0.06375, 0.06764, 0.07047, 0.05466, 0.05719, 0.06051, 0.06297, 0.04562, 0.04768, 0.05033, 0.05238, 0.03338, 0.03487, 0.03673, 0.03832, 0.01759, 0.01839,
  0.01934, 0.02042, -0.002, -0.00204, -0.00217, -0.00164, -0.02564, -0.02672, -0.02809, -0.02814, -0.05357, -0.0559, -0.05871, -0.05935, -0.08598,
  -0.08982, -0.09429, -0.09549,
];

const ADVANCE = Array.from({ length: 13 }, (_, i) => i / 10);
const TIP_MACH = [0.5, 0.65, 0.8, 0.95];
const HP = 745.699872;

function bracket(points: readonly number[], x: number, extend: boolean): { index: number; t: number } {
  let index = 0;
  while (index < points.length - 2 && x >= (points[index + 1] ?? 0)) index += 1;
  const x0 = points[index] ?? 0;
  const x1 = points[index + 1] ?? x0;
  const t = x1 > x0 ? (x - x0) / (x1 - x0) : 0;
  return { index, t: extend ? t : Math.max(0, Math.min(1, t)) };
}

function coefficient(effect: AircraftPropeller, table: readonly number[], advance: number, tipMach: number): number {
  const advanceRatios = effect.advanceRatios ?? ADVANCE;
  const tipMachs = effect.tipMachs ?? TIP_MACH;
  const j = bracket(advanceRatios, advance, true);
  const m = bracket(tipMachs, tipMach, false);
  const columns = tipMachs.length;
  const at = (row: number, column: number) => table[row * columns + column] ?? 0;
  const low = at(j.index, m.index) + (at(j.index, m.index + 1) - at(j.index, m.index)) * m.t;
  const high = at(j.index + 1, m.index) + (at(j.index + 1, m.index + 1) - at(j.index + 1, m.index)) * m.t;
  return low + (high - low) * j.t;
}

/** What the propeller does at one shaft speed. */
export interface PropellerLoads {
  /** Thrust along the shaft, N. */
  thrust: number;
  /** Torque the propeller takes from the shaft, N·m. */
  torque: number;
  /** Torque the engine gives, N·m. */
  engineTorque: number;
}

/**
 * Propeller thrust and torque and engine torque at a shaft speed, rad/s, axial airspeed, m/s, throttle `0..1` and air.
 * @capability aircraft-propeller fixed-pitch propeller thrust from advance ratio and piston engine torque with altitude lapse
 */
export function propellerLoads(effect: AircraftPropeller, omega: number, axial: number, throttle: number, density: number, speedOfSound: number, out: PropellerLoads): PropellerLoads {
  const diameter = effect.diameter ?? 1.905;
  const n = Math.max(1e-3, omega / (2 * Math.PI));
  const advance = axial / (n * diameter);
  const tipMach = Math.hypot(Math.PI * n * diameter, axial) / speedOfSound;
  const ct = coefficient(effect, effect.thrust ?? C172_PROPELLER_THRUST, advance, tipMach);
  const cp = coefficient(effect, effect.power ?? C172_PROPELLER_POWER, advance, tipMach);
  out.thrust = ct * density * n * n * diameter ** 4;
  out.torque = (cp * density * n * n * diameter ** 5) / (2 * Math.PI);
  const ratedSpeed = ((effect.ratedRpm ?? 2700) * 2 * Math.PI) / 60;
  const ratedTorque = (effect.ratedPower ?? 160 * HP) / ratedSpeed;
  const lapse = effect.densityLapse ?? 1.132;
  const sigma = density / SEA_LEVEL_AIR.density;
  const idle = effect.idleManifold ?? 0.08;
  const manifold = idle + (1 - idle) * Math.max(0, Math.min(1, throttle));
  out.engineTorque = ratedTorque * ((lapse * sigma - (lapse - 1)) * manifold - (effect.pumpingLoss ?? 0.1) * (1 - manifold) * (omega / ratedSpeed));
  return out;
}

/**
 * The shaft speed, rad/s, where engine torque meets propeller torque at a throttle, axial airspeed and air.
 * @capability aircraft-propeller settle a propeller's shaft speed for a throttle and airspeed
 */
export function settledShaftSpeed(effect: AircraftPropeller, axial: number, throttle: number, density: number, speedOfSound: number): number {
  const loads: PropellerLoads = { thrust: 0, torque: 0, engineTorque: 0 };
  let low = 20;
  let high = 3 * (((effect.ratedRpm ?? 2700) * 2 * Math.PI) / 60);
  for (let i = 0; i < 60; i += 1) {
    const mid = 0.5 * (low + high);
    propellerLoads(effect, mid, axial, throttle, density, speedOfSound, loads);
    if (loads.engineTorque > loads.torque) low = mid;
    else high = mid;
  }
  return 0.5 * (low + high);
}
