import { CAR_REFERENCE_VEHICLE_IDS, carFromReference } from "@jgengine/core/physics/carReferences";
import { measureCourse, measureHandling, type CourseSubject } from "@jgengine/core/physics/handlingProbe";
import { createVehicleDynamics, type VehicleDynamicsTuning } from "@jgengine/core/physics/vehicleDynamics";
import { REAL_CARS, type RealCar, type RealCarTestData } from "./realCars";
import { createReferenceCar } from "./referenceCar";
import { measureBikeHandling, type BikeHandlingMetrics, type BikeScenario } from "./motorcycleManeuvers";
import { createRiddenMotorcycle } from "./motorcycleRider";
import { REAL_MOTORCYCLES, type PublishedMotorcyclePerformance, type RealMotorcycle } from "./realMotorcycles";
import { measureStandardManeuvers } from "./standardManeuvers";

/** The metrics {@link compareVehicleTuning} puts side by side; each is comparable across any `CourseSubject`. */
export interface ComparableHandlingMetrics {
  /** Standing start to 100 km/h, s. */
  zeroTo100: number;
  /** 100 km/h to rest under full brake, m. */
  brake100To0: number;
  /** Speed after 40 s of full throttle, km/h. */
  topSpeed: number;
  /** Highest lateral acceleration held on a circle of the real car's skidpad radius, g. */
  skidpadG: number;
  /** ISO 4138 understeer gradient, degrees of road-wheel angle per g. */
  understeerGradient: number;
  /** ISO 4138 highest lateral acceleration held on a 40 m circle, g. */
  steadyStateMaxG: number;
  /** ISO 7401 yaw-rate response time at 80 km/h and 4 m/s², s. */
  stepResponseTime: number;
  /** ISO 7401 yaw-rate overshoot, peak over steady. */
  stepOvershoot: number;
  /** ISO 3888-1 double lane change (speed held), highest clean entry speed, km/h. */
  laneChangeSpeed: number;
}

/** Scenario settings for {@link measureComparableHandling}. */
export interface ComparableHandlingOptions {
  /** Wheelbase of the vehicle under test, m. */
  wheelbase: number;
  /** Skidpad radius, m (default `30`). */
  skidpadRadius?: number;
  /** Fixed tick, s (default `1/60`). */
  dt?: number;
}

/**
 * Drives fresh vehicles from `create` through every comparison scenario: launch, top speed and braking from
 * `measureHandling`, the skidpad from `measureCourse`, and the ISO tests from `measureStandardManeuvers`.
 * @capability handling-compare measure any vehicle sim on every comparison scenario (0-100, braking, skidpad, ISO tests)
 */
export function measureComparableHandling(create: () => CourseSubject, options: ComparableHandlingOptions): ComparableHandlingMetrics {
  const dt = options.dt ?? 1 / 60;
  const handling = measureHandling(create, { dt });
  const course = measureCourse(create, { wheelbase: options.wheelbase, dt, skidpadRadius: options.skidpadRadius ?? 30 });
  const iso = measureStandardManeuvers(create, { wheelbase: options.wheelbase, dt });
  return {
    zeroTo100: handling.zeroTo100,
    brake100To0: handling.brake100To0,
    topSpeed: handling.topSpeed * 3.6,
    skidpadG: course.skidpadG,
    understeerGradient: iso.steadyStateUndersteer,
    steadyStateMaxG: iso.steadyStateMaxG,
    stepResponseTime: iso.stepResponseTime,
    stepOvershoot: iso.stepOvershoot,
    laneChangeSpeed: iso.laneChangeSpeed * 3.6,
  };
}

/** One metric across the game model, the reference vehicle and the real vehicle's published number. */
export interface HandlingComparisonRow<Metric extends string = keyof ComparableHandlingMetrics> {
  metric: Metric;
  label: string;
  unit: string;
  game: number;
  reference: number;
  /** The real car's published value, or `null` when none was published. */
  real: number | null;
  /** `game − reference`. */
  delta: number;
  /** `delta / |reference|`; `NaN` when the reference is `0` or not finite. */
  deltaShare: number;
}

const ROWS: readonly { metric: keyof ComparableHandlingMetrics; label: string; unit: string; real?: keyof RealCarTestData }[] = [
  { metric: "zeroTo100", label: "0-100 km/h", unit: "s", real: "zeroTo100" },
  { metric: "brake100To0", label: "100-0 km/h braking", unit: "m", real: "brake100To0" },
  { metric: "topSpeed", label: "top speed (40 s)", unit: "km/h" },
  { metric: "skidpadG", label: "skidpad", unit: "g", real: "skidpadG" },
  { metric: "understeerGradient", label: "understeer gradient (ISO 4138)", unit: "deg/g" },
  { metric: "steadyStateMaxG", label: "max steady lateral (ISO 4138)", unit: "g" },
  { metric: "stepResponseTime", label: "yaw response time (ISO 7401)", unit: "s" },
  { metric: "stepOvershoot", label: "yaw overshoot (ISO 7401)", unit: "x" },
  { metric: "laneChangeSpeed", label: "lane change (ISO 3888-1)", unit: "km/h" },
];

/**
 * Line up two measured metric sets and, optionally, a real car's published numbers.
 * @capability handling-compare line up two vehicles' measured handling metrics with deltas per metric
 */
export function compareHandlingMetrics(
  game: ComparableHandlingMetrics,
  reference: ComparableHandlingMetrics,
  real?: RealCarTestData,
): HandlingComparisonRow[] {
  return ROWS.map((row) => {
    const g = game[row.metric];
    const r = reference[row.metric];
    const published = row.real === undefined || real === undefined ? null : real[row.real];
    const delta = g - r;
    return {
      metric: row.metric,
      label: row.label,
      unit: row.unit,
      game: g,
      reference: r,
      real: typeof published === "number" ? published : null,
      delta,
      deltaShare: Number.isFinite(r) && r !== 0 ? delta / Math.abs(r) : Number.NaN,
    };
  });
}

/** Result of {@link compareVehicleTuning}. */
export interface VehicleHandlingComparison {
  car: RealCar;
  game: ComparableHandlingMetrics;
  reference: ComparableHandlingMetrics;
  rows: HandlingComparisonRow[];
}

/** Measure a real car's reference model; pass the result to {@link compareVehicleTuning} to reuse it across many game cars. */
export function measureReferenceCar(car: RealCar, dt?: number): ComparableHandlingMetrics {
  return measureComparableHandling(() => createReferenceCar(car.spec), {
    wheelbase: car.spec.wheelbase,
    skidpadRadius: car.tested.skidpadRadius,
    ...(dt === undefined ? {} : { dt }),
  });
}

/**
 * Score a game's `VehicleDynamics` tuning against real physics: run the same scenarios on the game model and on
 * the multi-body reference model of `car`, and line up game / reference / real per metric. A bad feel becomes a
 * named number ("the game pulls 1.4 g on the skidpad where the reference and the real car pull 0.9 g").
 * @capability handling-compare score a game car tuning against a real-physics reference car and real published test numbers, per metric
 */
export function compareVehicleTuning(tuning: VehicleDynamicsTuning, car: RealCar, reference?: ComparableHandlingMetrics): VehicleHandlingComparison {
  const game = measureComparableHandling(() => createVehicleDynamics(tuning), { wheelbase: tuning.wheelbase, skidpadRadius: car.tested.skidpadRadius });
  const ref = reference ?? measureReferenceCar(car);
  return { car, game, reference: ref, rows: compareHandlingMetrics(game, ref, car.tested) };
}

function cell(value: number | null, digits: number): string {
  if (value === null) return "-";
  if (!Number.isFinite(value)) return Number.isNaN(value) ? "n/a" : "never";
  return value.toFixed(digits);
}

/** Plain-text table of comparison rows: metric, unit, game, reference, real, and game − reference. */
export function formatHandlingComparison(title: string, rows: readonly HandlingComparisonRow<string>[]): string {
  const header = ["metric", "unit", "game", "reference", "real", "game - ref"];
  const lines = rows.map((row) => {
    const digits = row.unit === "km/h" || row.unit === "m" ? 1 : 2;
    const share = Number.isFinite(row.deltaShare) ? ` (${row.deltaShare >= 0 ? "+" : ""}${Math.round(row.deltaShare * 100)}%)` : "";
    const delta = Number.isFinite(row.delta) ? `${row.delta >= 0 ? "+" : ""}${row.delta.toFixed(digits)}${share}` : "n/a";
    return [row.label, row.unit, cell(row.game, digits), cell(row.reference, digits), cell(row.real, digits), delta];
  });
  const widths = header.map((name, column) => Math.max(name.length, ...lines.map((line) => (line[column] ?? "").length)));
  const render = (cells: readonly string[]) => cells.map((text, column) => text.padEnd(widths[column] ?? 0)).join("  ").trimEnd();
  return [title, render(header), render(widths.map((width) => "-".repeat(width))), ...lines.map(render)].join("\n");
}

/**
 * How close the reference car must land to each published number: 0–100 km/h and 100–0 km/h braking within 5%,
 * skidpad within 0.03 g.
 */
export const PUBLISHED_TOLERANCES = { zeroTo100: 0.05, brake100To0: 0.05, skidpadG: 0.03 } as const;

/** One published number checked against the reference car by {@link checkReferenceAgainstPublished}. */
export interface PublishedCheck {
  metric: keyof typeof PUBLISHED_TOLERANCES;
  reference: number;
  published: number;
  /** Relative gap for times and distances, absolute gap in g for the skidpad. */
  gap: number;
  allowed: number;
  pass: boolean;
}

/**
 * Check a real car's measured reference metrics against its published test numbers within {@link PUBLISHED_TOLERANCES}.
 * @capability reference-validation check the reference car model against a real car's published 0-100, braking and skidpad numbers
 */
export function checkReferenceAgainstPublished(car: RealCar, reference: ComparableHandlingMetrics): PublishedCheck[] {
  return (["zeroTo100", "brake100To0", "skidpadG"] as const).map((metric) => {
    const published = car.tested[metric];
    const measured = reference[metric];
    const gap = metric === "skidpadG" ? measured - published : (measured - published) / published;
    const allowed = PUBLISHED_TOLERANCES[metric];
    return { metric, reference: measured, published, gap, allowed, pass: Math.abs(gap) <= allowed };
  });
}

/**
 * Measure every real car's reference model and check it against the published numbers: the full validation
 * behind `bun run games:capabilities handling --validate`.
 * @capability reference-validation measure every real car's reference model and check it against published tests
 */
export function validateReferenceCars(cars: readonly RealCar[] = REAL_CARS): { car: RealCar; metrics: ComparableHandlingMetrics; checks: PublishedCheck[] }[] {
  return cars.map((car) => {
    const metrics = measureReferenceCar(car);
    return { car, metrics, checks: checkReferenceAgainstPublished(car, metrics) };
  });
}

const BIKE_ROWS: readonly { metric: keyof BikeHandlingMetrics; label: string; unit: string; real?: "zeroTo100" | "zeroTo200" | "brake100" }[] = [
  { metric: "zeroTo100", label: "0-100 km/h", unit: "s", real: "zeroTo100" },
  { metric: "zeroTo200", label: "0-200 km/h", unit: "s", real: "zeroTo200" },
  { metric: "brake100To0", label: "100-0 km/h braking", unit: "m", real: "brake100" },
  { metric: "steadyLeanDeg", label: "lean at full steer (20 m/s)", unit: "deg" },
  { metric: "steadyLateralG", label: "lateral g at that lean", unit: "g" },
  { metric: "timeToLean", label: "time to 90% lean", unit: "s" },
  { metric: "counterSteerDeg", label: "countersteer (bar the wrong way)", unit: "deg" },
  { metric: "counterLeanDeg", label: "lean the wrong way first", unit: "deg" },
  { metric: "laneChangeSpeed", label: "lane change (ISO 3888-1 lanes)", unit: "km/h" },
  { metric: "slalomSpeed", label: "slalom (18 m cones)", unit: "km/h" },
];

/**
 * Line up a game bike's and the reference motorcycle's measured bike metrics and, optionally, the real bike's
 * published numbers.
 * @capability handling-compare line up two bikes' measured metrics with deltas per metric
 */
export function compareBikeMetrics(
  game: BikeHandlingMetrics,
  reference: BikeHandlingMetrics,
  real?: PublishedMotorcyclePerformance,
): HandlingComparisonRow<keyof BikeHandlingMetrics>[] {
  return BIKE_ROWS.map((row) => {
    const g = game[row.metric];
    const r = reference[row.metric];
    const delta = g - r;
    return {
      metric: row.metric,
      label: row.label,
      unit: row.unit,
      game: g,
      reference: r,
      real: row.real === undefined || real === undefined ? null : real[row.real],
      delta,
      deltaShare: Number.isFinite(r) && r !== 0 ? delta / Math.abs(r) : Number.NaN,
    };
  });
}

/** Measure a real motorcycle's reference model with its rider; pass the result to {@link compareBikeTuning} to reuse it. */
export function measureReferenceMotorcycle(bike: RealMotorcycle, options: { dt?: number; tests?: readonly BikeScenario[] } = {}): BikeHandlingMetrics {
  return measureBikeHandling((speed) => createRiddenMotorcycle(bike.spec, { speed }), { maxLean: 0.785, ...options });
}

/** Result of {@link compareBikeTuning}. */
export interface BikeHandlingComparison {
  bike: RealMotorcycle;
  game: BikeHandlingMetrics;
  reference: BikeHandlingMetrics;
  rows: HandlingComparisonRow<keyof BikeHandlingMetrics>[];
}

/**
 * Score a game's single-track `VehicleDynamics` tuning (one with a `lean` block) against the multibody reference
 * motorcycle ridden by its steering-torque rider and the real bike's published tests: launch, braking, lean,
 * countersteer, lane change and slalom, game / reference / real per metric.
 * @capability handling-compare score a game bike tuning against a multibody reference motorcycle and real published tests
 */
export function compareBikeTuning(tuning: VehicleDynamicsTuning, bike: RealMotorcycle, reference?: BikeHandlingMetrics): BikeHandlingComparison {
  const maxLean = tuning.lean?.maxLean;
  if (maxLean === undefined) throw new Error("compareBikeTuning: the tuning has no lean block");
  const game = measureBikeHandling(() => createVehicleDynamics(tuning), { maxLean });
  const ref = reference ?? measureReferenceMotorcycle(bike);
  return { bike, game, reference: ref, rows: compareBikeMetrics(game, ref, bike.published) };
}

/**
 * How close the reference motorcycle must land to each published number: braking within 5%, 0-100 and 0-200 km/h
 * within 12% (the torque curve between the engine's published peaks and its inertia are estimates).
 */
export const MOTORCYCLE_PUBLISHED_TOLERANCES = { zeroTo100: 0.12, zeroTo200: 0.12, brake100: 0.05 } as const;

/** One published number checked against the reference motorcycle. */
export interface MotorcyclePublishedCheck {
  metric: keyof typeof MOTORCYCLE_PUBLISHED_TOLERANCES;
  reference: number;
  published: number;
  /** Relative gap. */
  gap: number;
  allowed: number;
  pass: boolean;
}

/**
 * Check a real motorcycle's measured reference metrics against its published tests within
 * {@link MOTORCYCLE_PUBLISHED_TOLERANCES}.
 * @capability reference-validation check the reference motorcycle against a real bike's published 0-100, 0-200 and braking
 */
export function checkReferenceMotorcycle(bike: RealMotorcycle, reference: BikeHandlingMetrics): MotorcyclePublishedCheck[] {
  const measured = { zeroTo100: reference.zeroTo100, zeroTo200: reference.zeroTo200, brake100: reference.brake100To0 };
  return (["zeroTo100", "zeroTo200", "brake100"] as const).map((metric) => {
    const published = bike.published[metric];
    const gap = (measured[metric] - published) / published;
    const allowed = MOTORCYCLE_PUBLISHED_TOLERANCES[metric];
    return { metric, reference: measured[metric], published, gap, allowed, pass: Math.abs(gap) <= allowed };
  });
}

/**
 * Measure every real motorcycle's reference model and check it against its published tests: the bike half of
 * `bun run games:capabilities handling --validate`.
 * @capability reference-validation measure every real motorcycle's reference model and check it against published tests
 */
export function validateReferenceMotorcycles(
  bikes: readonly RealMotorcycle[] = REAL_MOTORCYCLES,
): { bike: RealMotorcycle; metrics: BikeHandlingMetrics; checks: MotorcyclePublishedCheck[] }[] {
  return bikes.map((bike) => {
    const metrics = measureReferenceMotorcycle(bike);
    return { bike, metrics, checks: checkReferenceMotorcycle(bike, metrics) };
  });
}

/**
 * How close the runtime car from `carFromReference` must land to its reference sim on every compared metric: 5%, or
 * an absolute `0.25` in the metric's unit where the reference measures exactly zero (a bike that never leans the wrong way).
 */
export const RUNTIME_TOLERANCE = { share: 0.05, nearZero: 0.25 } as const;

/** One metric of the runtime car checked against its reference sim by {@link checkRuntimeAgainstReference}. */
export interface RuntimeCheck {
  metric: string;
  label: string;
  game: number;
  reference: number;
  /** Relative gap, or the absolute gap where the reference is zero. */
  gap: number;
  allowed: number;
  pass: boolean;
}

/**
 * Check comparison rows (game = the runtime car with every effect at 1) against {@link RUNTIME_TOLERANCE}.
 * @capability reference-validation check the runtime car from carFromReference against its reference sim on every metric
 */
export function checkRuntimeAgainstReference(rows: readonly HandlingComparisonRow<string>[]): RuntimeCheck[] {
  return rows.map((row) => {
    const absolute = Math.abs(row.reference) < 1e-9;
    const gap = absolute ? row.game - row.reference : row.deltaShare;
    const allowed = absolute ? RUNTIME_TOLERANCE.nearZero : RUNTIME_TOLERANCE.share;
    return { metric: row.metric, label: row.label, game: row.game, reference: row.reference, gap, allowed, pass: Number.isFinite(gap) && Math.abs(gap) <= allowed };
  });
}

/**
 * Run `carFromReference(id)` (every effect at 1) and the reference sim of the same real car through every comparison
 * scenario and check each metric: the proof that the runtime car reproduces the reference.
 * @capability handling-compare score the runtime car from carFromReference against its multibody reference, per metric, with tolerances
 */
export function compareRuntimeCar(car: RealCar, reference?: ComparableHandlingMetrics): { comparison: VehicleHandlingComparison; checks: RuntimeCheck[] } {
  const id = CAR_REFERENCE_VEHICLE_IDS.find((known) => known === car.id);
  if (id === undefined) throw new Error(`compareRuntimeCar: carFromReference has no ${car.id}`);
  const comparison = compareVehicleTuning(carFromReference(id), car, reference);
  return { comparison, checks: checkRuntimeAgainstReference(comparison.rows) };
}

/**
 * The runtime GSX-R1000 from `carFromReference` against the multibody reference motorcycle and its rider.
 * @capability handling-compare score the runtime bike from carFromReference against the multibody reference motorcycle, per metric, with tolerances
 */
export function compareRuntimeBike(bike: RealMotorcycle, reference?: BikeHandlingMetrics): { comparison: BikeHandlingComparison; checks: RuntimeCheck[] } {
  const comparison = compareBikeTuning(carFromReference("suzuki-gsxr1000-k1"), bike, reference);
  return { comparison, checks: checkRuntimeAgainstReference(comparison.rows) };
}
