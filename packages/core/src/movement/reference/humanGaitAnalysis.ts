import type { HumanBody, HumanSide } from "./humanBody";
import type { ReflexWalker } from "./reflexWalker";

/** Vertical ground force of one foot over one stance, in body weights. */
export interface StanceForce {
  /** Highest force in the first 10% of stance: the heel-strike transient. */
  impactPeak: number;
  /** Highest force in 10–50% of stance (loading) and in 50–95% (push-off). */
  firstPeak: number;
  secondPeak: number;
  /** Lowest force between the two peaks. */
  valley: number;
  /** 2 when the valley dips under both peaks (a walking double hump), else 1. */
  humps: number;
  /** Contact time, s. */
  contactTime: number;
}

/** Steady-state gait measures of the reference human. */
export interface GaitReport {
  fell: boolean;
  /** Seconds before the fall, or the full run. */
  survived: number;
  /** Mean forward speed of the centre of mass over the measured window, m/s. */
  speed: number;
  /** Strides (two steps) per second. */
  strideFrequency: number;
  /** Mean stride length (two steps), m. */
  strideLength: number;
  /** Share of a stride a foot is on the ground. */
  dutyFactor: number;
  /** Share of the measured time with neither foot on the ground. */
  flightShare: number;
  /** Coefficient of variation of step times. */
  stepVariation: number;
  /** Mean vertical ground force shape over the measured stances. */
  force: StanceForce;
  /** Gross metabolic cost of transport (resting included), J/(kg·m). */
  grossCost: number;
  /** Net metabolic cost of transport (resting excluded), J/(kg·m). */
  netCost: number;
  /** Mechanical cost of transport: positive actuator work per weight and distance (dimensionless). */
  mechanicalCost: number;
}

function stanceShape(samples: readonly number[], dt: number): StanceForce {
  // Smooth over 10 ms so contact chatter does not read as extra humps, then read the gait-lab windows: the impact
  // transient in the first 10% of stance, the loading peak in 10–50%, the push-off peak in 50–95%, the valley between.
  const window = Math.max(1, Math.round(0.01 / dt));
  const smooth: number[] = [];
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] ?? 0;
    if (i >= window) sum -= samples[i - window] ?? 0;
    smooth.push(sum / Math.min(i + 1, window));
  }
  const n = smooth.length;
  const argmax = (from: number, to: number) => {
    let best = Math.max(0, Math.floor(from));
    for (let i = best; i < Math.min(n, Math.ceil(to)); i++) if ((smooth[i] ?? 0) > (smooth[best] ?? 0)) best = i;
    return best;
  };
  const impactAt = argmax(0, 0.1 * n);
  const firstAt = argmax(0.1 * n, 0.5 * n);
  const secondAt = argmax(0.5 * n, 0.95 * n);
  let valley = smooth[firstAt] ?? 0;
  for (let i = firstAt; i <= secondAt; i++) valley = Math.min(valley, smooth[i] ?? 0);
  const firstPeak = smooth[firstAt] ?? 0;
  const secondPeak = smooth[secondAt] ?? 0;
  // Two humps when the valley dips at least 5% of body weight under both peaks.
  const humps = valley < Math.min(firstPeak, secondPeak) - 0.05 ? 2 : 1;
  return { impactPeak: smooth[impactAt] ?? 0, firstPeak, secondPeak, valley, humps, contactTime: n * dt };
}

/** A controller driving a {@link HumanBody} one step at a time, as {@link analyzeLocomotion} needs it. */
export interface LocomotionDriver {
  readonly body: HumanBody;
  /** Advance the controller and the body by one body step. */
  step(): void;
  /** Metabolic energy spent by the actuators so far, J (resting excluded). */
  metabolicEnergy(): number;
  /** Touchdown listener. */
  onStrike?: ((side: HumanSide, time: number) => void) | undefined;
}

/**
 * A {@link LocomotionDriver} for the muscle-reflex walker.
 * @internal
 */
export function reflexDriver(body: HumanBody, walker: ReflexWalker): LocomotionDriver {
  const driver: LocomotionDriver = { body, step: () => walker.step(), metabolicEnergy: () => walker.metabolicEnergy() };
  walker.onStrike = (side, time) => driver.onStrike?.(side, time);
  return driver;
}

/**
 * Whether the body has fallen: hips sunk under 55% of leg length above the lower ankle, or the trunk past 1.2 rad.
 * @internal
 */
export function hasFallen(body: HumanBody): boolean {
  const com = body.centerOfMass();
  const groundY = Math.min(body.footPoint("right", "ankle")[1] ?? 0, body.footPoint("left", "ankle")[1] ?? 0);
  return (com[1] ?? 0) - groundY < 0.55 * body.geometry.legLength || Math.abs(body.q[2] ?? 0) > 1.2;
}

/**
 * Step a driver for `seconds`, calling `each` after every step; stops early on a fall. Returns whether it fell.
 * @internal
 */
export function runDriver(driver: LocomotionDriver, seconds: number, each?: () => void): boolean {
  const steps = Math.round(seconds / driver.body.dt);
  for (let i = 0; i < steps; i++) {
    driver.step();
    if (hasFallen(driver.body)) return true;
    each?.();
  }
  return false;
}

/**
 * Measure a driver's steady gait: run `settle` seconds, then `measure` seconds of speed, stride, duty factor, flight,
 * per-stance vertical ground force shape and metabolic cost of transport.
 * @capability gait-analysis measure the reference human's steady gait — stride, duty factor, ground-force humps, cost of transport
 */
export function analyzeLocomotion(driver: LocomotionDriver, settle = 4, measure = 6): GaitReport {
  const body = driver.body;
  const weight = body.geometry.mass * body.gravity;
  const empty: GaitReport = {
    fell: true,
    survived: 0,
    speed: 0,
    strideFrequency: 0,
    strideLength: 0,
    dutyFactor: 0,
    flightShare: 0,
    stepVariation: 1,
    force: { impactPeak: 0, firstPeak: 0, secondPeak: 0, valley: 0, humps: 0, contactTime: 0 },
    grossCost: Number.POSITIVE_INFINITY,
    netCost: Number.POSITIVE_INFINITY,
    mechanicalCost: Number.POSITIVE_INFINITY,
  };
  if (runDriver(driver, settle)) return { ...empty, survived: body.time };
  const strikes: { side: HumanSide; time: number }[] = [];
  driver.onStrike = (side, time) => strikes.push({ side, time });
  const startX = body.centerOfMass()[0] ?? 0;
  const startTime = body.time;
  const startEnergy = driver.metabolicEnergy();
  const startWork = body.positiveWork;
  let contactSteps = 0;
  let flightSteps = 0;
  let total = 0;
  const stances: StanceForce[] = [];
  let current: number[] = [];
  const fell = runDriver(driver, measure, () => {
    total += 1;
    const right = (body.feet.right[1] ?? 0) / weight;
    const left = (body.feet.left[1] ?? 0) / weight;
    if (right > 0.02) contactSteps += 1;
    if (right <= 0.02 && left <= 0.02) flightSteps += 1;
    if (right > 0.02) current.push(right);
    else if (current.length > 0) {
      if (current.length * body.dt > 0.08) stances.push(stanceShape(current, body.dt));
      current = [];
    }
  });
  driver.onStrike = undefined;
  if (fell) return { ...empty, survived: body.time };
  const elapsed = body.time - startTime;
  const distance = (body.centerOfMass()[0] ?? 0) - startX;
  const speed = distance / elapsed;
  const steps = strikes.slice(1).map((s, i) => s.time - (strikes[i]?.time ?? 0));
  const meanStep = steps.reduce((a, b) => a + b, 0) / Math.max(1, steps.length);
  const variance = steps.reduce((a, b) => a + (b - meanStep) ** 2, 0) / Math.max(1, steps.length);
  const strideFrequency = meanStep > 0 ? 1 / (2 * meanStep) : 0;
  const measured = stances.slice(1);
  const mean = (pick: (s: StanceForce) => number) => measured.reduce((a, s) => a + pick(s), 0) / Math.max(1, measured.length);
  const mass = body.geometry.mass;
  const net = driver.metabolicEnergy() - startEnergy;
  const gross = net + body.basalMetabolism * mass * elapsed;
  return {
    fell: false,
    survived: body.time,
    speed,
    strideFrequency,
    strideLength: strideFrequency > 0 ? speed / strideFrequency : 0,
    dutyFactor: contactSteps / Math.max(1, total),
    flightShare: flightSteps / Math.max(1, total),
    stepVariation: meanStep > 0 ? Math.sqrt(variance) / meanStep : 1,
    force: {
      impactPeak: mean((s) => s.impactPeak),
      firstPeak: mean((s) => s.firstPeak),
      secondPeak: mean((s) => s.secondPeak),
      valley: mean((s) => s.valley),
      humps: mean((s) => s.humps),
      contactTime: mean((s) => s.contactTime),
    },
    grossCost: distance > 0 ? gross / (mass * distance) : Number.POSITIVE_INFINITY,
    netCost: distance > 0 ? net / (mass * distance) : Number.POSITIVE_INFINITY,
    mechanicalCost: distance > 0 ? (body.positiveWork - startWork) / (mass * body.gravity * distance) : Number.POSITIVE_INFINITY,
  };
}
