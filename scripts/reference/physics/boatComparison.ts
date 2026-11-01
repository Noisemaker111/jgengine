// @skill jgengine-world
import type { ComparisonTable } from "../flight/flightComparison";
import { createBoatDynamics, type BoatTuning } from "@jgengine/core/physics/boatDynamics";
import { prepareOpenWater, propellerPoint } from "@jgengine/core/physics/boatPropeller";
import { boatFromReference } from "@jgengine/core/physics/boatReferences";
import { regularWaveField } from "@jgengine/core/water/seaState";
import { bSeriesOpenWater, bSeriesShipOpenWater, type BSeriesPropeller } from "./marinePropeller";
import { wigleyHull } from "./hullForm";
import { planingEquilibrium, type PlaningHull } from "./planingHull";
import {
  KVLCC2_L7,
  KVLCC2_L7_PUBLISHED,
  KVLCC2_L7_SPEED,
  mmgTrialBoat,
  runTurningCircle,
  runZigZag,
  selfPropulsionRevs,
  type ManoeuvringTrialBoat,
  type MmgShip,
} from "./shipManoeuvring";
import { HOLTROP_MENNEN_EXAMPLE, holtropMennenResistance, holtropPropulsionFactors, type HoltropHull } from "./shipResistance";
import { heavePitchResponse, stripSections, type StripHull } from "./stripTheory";

const KNOT = 0.5144444;
const DEG = Math.PI / 180;
const G = 9.81;
const RHO = 1025;

/**
 * Surge added mass of a hull as the half of a prolate spheroid of the same length and twice its volume (the double-body
 * image across the still surface): Lamb's `k₁ = α₀/(2 − α₀)` times the displaced mass.
 * @capability boat-comparison surge added mass of a hull from Lamb's prolate-spheroid coefficient
 */
export function surgeAddedMass(massKg: number, length: number, density = RHO): number {
  const a = length / 2;
  const b = Math.sqrt((3 * (2 * massKg) / density) / (4 * Math.PI * a));
  if (b >= a) return 0.5 * massKg;
  const e = Math.sqrt(1 - (b / a) ** 2);
  const alpha = ((2 * (1 - e * e)) / e ** 3) * (0.5 * Math.log((1 + e) / (1 - e)) - e);
  return (alpha / (2 - alpha)) * massKg;
}

/** A real hull the game model is measured against: its calm-water resistance and surge inertia, SI units. */
export interface ReferenceBoat {
  name: string;
  massKg: number;
  /** Surge added mass, kg. */
  addedMass: number;
  /** Calm-water resistance at a forward speed, N. */
  resistance(speed: number): number;
  /** Running trim at a speed, rad (bow up), for hulls that plane. */
  trim?(speed: number): number;
  /** Porpoising limit trim at a speed, rad. */
  porpoisingTrim?(speed: number): number;
}

/** Net thrust along the hull at a forward speed and throttle, N. */
export type PropulsionLaw = (speed: number, throttle: number) => number;

/**
 * The game boat's own straight-line thrust: its `propeller` effect (wake, thrust deduction, engine) when on, else the
 * simple thrust law. A reference with no propeller of its own shares it, so the comparison isolates the hull.
 */
function gamePropulsion(tuning: BoatTuning): PropulsionLaw {
  const propeller = tuning.effects?.propeller;
  if (propeller !== undefined && (propeller.strength ?? 1) >= 1) {
    const curve = prepareOpenWater(propeller.openWater, propeller.diameter);
    const density = tuning.water?.density ?? RHO;
    return (u, throttle) => (1 - (propeller.thrustDeduction ?? 0)) * propellerPoint(propeller, curve, Math.max(0, u * (1 - (propeller.wake ?? 0))), throttle, 0, density).thrust;
  }
  return (u, throttle) => throttle * tuning.maxThrust * Math.max(0, 1 - Math.max(0, u) / Math.max(0.1, tuning.propSpeed));
}

/** Straight-line results of one model, SI units. */
interface StraightLine {
  topSpeed: number;
  timeTo90: number;
  coastDistance: number;
}

function referenceStraightLine(boat: ReferenceBoat, propulsion: PropulsionLaw, ceiling: number): StraightLine {
  const inertia = boat.massKg + boat.addedMass;
  const accel = (u: number, throttle: number) => ((throttle > 0 ? propulsion(u, throttle) : 0) - boat.resistance(u)) / inertia;
  let low = 0;
  let high = ceiling;
  for (let i = 0; i < 100; i += 1) {
    const mid = 0.5 * (low + high);
    if (accel(mid, 1) > 0) low = mid;
    else high = mid;
  }
  const topSpeed = 0.5 * (low + high);
  const step = (u: number, throttle: number, h: number) => {
    const k1 = accel(u, throttle);
    const k2 = accel(u + 0.5 * h * k1, throttle);
    const k3 = accel(u + 0.5 * h * k2, throttle);
    const k4 = accel(u + h * k3, throttle);
    return u + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
  };
  const h = 0.02;
  let u = 0;
  let t = 0;
  while (u < 0.9 * topSpeed && t < 7200) {
    u = step(u, 1, h);
    t += h;
  }
  const timeTo90 = t;
  u = topSpeed;
  let distance = 0;
  t = 0;
  while (u > 0.25 * topSpeed && t < 7200) {
    const next = step(u, 0, h);
    distance += 0.5 * (u + next) * h;
    u = next;
    t += h;
  }
  return { topSpeed, timeTo90, coastDistance: distance };
}

/** Resistance of a game boat held at a speed until its running trim settles, N. */
function gameResistance(tuning: BoatTuning, speed: number): number {
  const boat = createBoatDynamics(tuning);
  let resistance = 0;
  for (let i = 0; i < 200; i += 1) {
    boat.restore({ ...boat.snapshot(), vx: 0, vz: speed, heading: 0, yawRate: 0 });
    resistance = boat.tick(0.02, { throttle: 0, brake: 0, steer: 0, handbrake: 0 }).resistance;
  }
  return resistance;
}

function gameStraightLine(tuning: BoatTuning): StraightLine & { timeToPlane: number; trimAt: (speed: number) => number } {
  const idle = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };
  const full = { ...idle, throttle: 1 };
  const boat = createBoatDynamics(tuning);
  const dt = 0.05;
  let speed = 0;
  let t = 0;
  let timeToPlane = Number.NaN;
  let still = 0;
  while (t < 7200 && still < 200) {
    const step = boat.tick(dt, full);
    t += dt;
    if (Number.isNaN(timeToPlane) && step.planing >= 1) timeToPlane = t;
    still = Math.abs(step.forwardSpeed - speed) < 1e-5 ? still + 1 : 0;
    speed = step.forwardSpeed;
  }
  const topSpeed = speed;
  const climb = createBoatDynamics(tuning);
  let timeTo90 = 0;
  for (let u = 0; u < 0.9 * topSpeed && timeTo90 < 7200; timeTo90 += dt) u = climb.tick(dt, full).forwardSpeed;
  let distance = 0;
  let u = topSpeed;
  for (let i = 0; u > 0.25 * topSpeed && i < 144000; i += 1) {
    const before = boat.snapshot();
    const next = boat.tick(dt, idle).forwardSpeed;
    distance += Math.hypot(boat.snapshot().x - before.x, boat.snapshot().z - before.z);
    u = next;
  }
  const trimAt = (target: number) => {
    // Hold the speed for long enough to settle the body pitch, by re-imposing it each tick.
    const held = createBoatDynamics(tuning);
    let pitch = 0;
    for (let i = 0; i < 400; i += 1) {
      held.restore({ ...held.snapshot(), vx: 0, vz: target, heading: 0 });
      pitch = held.tick(dt, idle).bodyPitch;
    }
    return -pitch;
  };
  return { topSpeed, timeTo90, coastDistance: distance, timeToPlane, trimAt };
}

/** A reference boat with the game build of it and the published figures it carries. */
export interface BoatComparisonSubject {
  name: string;
  reference: ReferenceBoat;
  /** The boat as built on `createBoatDynamics`: `boatFromReference` for the built-in hulls, or a game's own tuning. */
  tuning: BoatTuning;
  /** The reference's own propulsion law; absent, it shares the game boat's. */
  propulsion?: PropulsionLaw;
  /** Speeds the resistance rows are read at, m/s. */
  speeds: readonly number[];
  /** Published resistance at a speed, N. */
  published?: { speed: number; resistance: number; label: string };
  /** Extra reference-only rows (propeller, porpoising). */
  extra?: readonly ComparisonRow[];
  /** An MMG model of the same ship, for turning-circle and zig-zag rows. */
  manoeuvring?: ManoeuvringSubject;
}

type ComparisonRow = { label: string; unit: string; game: number; reference: number; real: number | undefined };

/** Turning and zig-zag trials for a subject: its MMG ship, approach speed and the free-running results, if any. */
export interface ManoeuvringSubject {
  ship: MmgShip;
  speed: number;
  /** Measured advance and tactical diameter over `L` at full rudder to starboard and to port. */
  turning?: { starboard: { advance: number; tacticalDiameter: number }; port: { advance: number; tacticalDiameter: number } };
  /** Measured 10/10 first and second and 20/20 first overshoots, degrees. */
  zigZag?: { first10: number; second10: number; first20: number };
}

/** Fixed-throttle turning and zig-zag trials on the game boat and its MMG reference, from straight running at the approach speed. */
function manoeuvringRows(tuning: BoatTuning, subject: ManoeuvringSubject): ComparisonRow[] {
  const { ship, speed } = subject;
  const L = ship.length;
  const full = ship.maxSteer;
  const dt = 0.05;
  const maxTime = (400 * L) / speed;
  const game = () => gameTrialBoat(tuning, speed, full);
  const reference = () => mmgTrialBoat(ship, speed);
  const turn = (boat: () => ManoeuvringTrialBoat, rudder: number) => runTurningCircle(boat(), rudder, speed, dt, maxTime);
  const zig = (boat: () => ManoeuvringTrialBoat, rudder: number) => runZigZag(boat(), rudder, dt, maxTime, 2).overshoots.map((value) => value / DEG);
  const measured = subject.turning;
  const angle = Math.round(full / DEG);
  const rows: ComparisonRow[] = [];
  for (const [side, rudder, real] of [["starboard", full, measured?.starboard], ["port", -full, measured?.port]] as const) {
    const g = turn(game, rudder);
    const r = turn(reference, rudder);
    rows.push(
      { label: `advance, ${angle}° to ${side}`, unit: "L", game: g.advance / L, reference: r.advance / L, real: real?.advance },
      { label: `tactical diameter, ${angle}° to ${side}`, unit: "L", game: g.tacticalDiameter / L, reference: r.tacticalDiameter / L, real: real?.tacticalDiameter },
    );
  }
  const [g10, g20, r10, r20] = [zig(game, 10 * DEG), zig(game, 20 * DEG), zig(reference, 10 * DEG), zig(reference, 20 * DEG)];
  rows.push(
    { label: "10/10 zig-zag, 1st overshoot", unit: "deg", game: g10[0] ?? Number.NaN, reference: r10[0] ?? Number.NaN, real: subject.zigZag?.first10 },
    { label: "10/10 zig-zag, 2nd overshoot", unit: "deg", game: g10[1] ?? Number.NaN, reference: r10[1] ?? Number.NaN, real: subject.zigZag?.second10 },
    { label: "20/20 zig-zag, 1st overshoot", unit: "deg", game: g20[0] ?? Number.NaN, reference: r20[0] ?? Number.NaN, real: subject.zigZag?.first20 },
  );
  return rows;
}

/**
 * A Wigley hull (`C_B` 4/9) with a boat tuning's length, beam and mass, floating level with G on the waterline: the
 * seakeeping stand-in for a boat whose real lines are unknown.
 * @capability boat-comparison Wigley seakeeping stand-in for any game boat tuning
 */
export function wigleyStandIn(tuning: BoatTuning): StripHull {
  const draft = tuning.massKg / (RHO * (4 / 9) * tuning.length * tuning.beam);
  const offsets = wigleyHull({ length: tuning.length, beam: tuning.beam, draft, freeboard: 0.5 * draft, stations: 21, waterlines: 12 });
  return { offsets, draft, centreOfGravity: [tuning.length / 2, draft], pitchRadius: 0.25 * tuning.length, density: RHO };
}

/** Heave over A and pitch over kA of the game boat riding regular head waves at rest, by projection once settled. */
function gameHeavePitch(tuning: BoatTuning, wavelength: number, amplitude: number): { heave: number; pitch: number } {
  const k = (2 * Math.PI) / wavelength;
  const omega = Math.sqrt(G * k);
  // The boat faces +z; head waves travel toward −z.
  const boat = createBoatDynamics(tuning, { sea: regularWaveField(amplitude, (2 * Math.PI) / omega, -Math.PI / 2) });
  const period = (2 * Math.PI) / omega;
  const dt = period / 40;
  let heaveCos = 0, heaveSin = 0, pitchCos = 0, pitchSin = 0, samples = 0;
  for (let i = 0; i < 40 * 30; i += 1) {
    const step = boat.tick(dt, { throttle: 0, brake: 0, steer: 0, handbrake: 0 });
    if (i < 40 * 20) continue;
    const phase = omega * (i + 1) * dt;
    heaveCos += step.position[1] * Math.cos(phase);
    heaveSin += step.position[1] * Math.sin(phase);
    pitchCos += step.bodyPitch * Math.cos(phase);
    pitchSin += step.bodyPitch * Math.sin(phase);
    samples += 1;
  }
  return { heave: (2 * Math.hypot(heaveCos, heaveSin)) / samples / amplitude, pitch: (2 * Math.hypot(pitchCos, pitchSin)) / samples / (k * amplitude) };
}

/** Heave and pitch in regular head waves of one and two boat lengths: the game boat against strip theory on its Wigley stand-in. */
function seakeepingRows(tuning: BoatTuning): ComparisonRow[] {
  const hull = wigleyStandIn(tuning);
  const prepared = stripSections(hull.offsets, hull.draft);
  const rows: ComparisonRow[] = [];
  for (const ratio of [1, 2]) {
    const wavelength = ratio * tuning.length;
    const reference = heavePitchResponse(hull, Math.sqrt((2 * Math.PI * G) / wavelength), prepared);
    const game = gameHeavePitch(tuning, wavelength, 0.005 * wavelength);
    const label = ratio === 1 ? "λ = L" : `λ = ${ratio}L`;
    rows.push(
      { label: `heave RAO, head seas ${label}`, unit: "z/A", game: game.heave, reference: reference.heave, real: undefined },
      { label: `pitch RAO, head seas ${label}`, unit: "θ/kA", game: game.pitch, reference: reference.pitch, real: undefined },
    );
  }
  return rows;
}

/**
 * A game boat as a trial boat: started straight at `speed` with the throttle that holds it (full throttle if it
 * cannot), steered by the input that sets the rudder or outboard to the target angle over `maxAngle`.
 */
function gameTrialBoat(tuning: BoatTuning, speed: number, maxAngle: number): ManoeuvringTrialBoat {
  const trial: BoatTuning = { ...tuning, steering: { ...tuning.steering, maxAngle } };
  const boat = createBoatDynamics(trial);
  const start = { ...boat.snapshot(), vx: 0, vz: speed, heading: 0 };
  const surge = (throttle: number) => {
    boat.restore(start);
    return boat.tick(1e-3, { throttle, brake: 0, steer: 0, handbrake: 0 }).forwardSpeed - speed;
  };
  let throttle = 1;
  if (surge(1) > 0) {
    let low = 0;
    let high = 1;
    for (let i = 0; i < 50; i += 1) {
      const mid = 0.5 * (low + high);
      if (surge(mid) < 0) low = mid;
      else high = mid;
    }
    throttle = 0.5 * (low + high);
  }
  boat.restore(start);
  return {
    step(steerTarget, dt) {
      // Positive game steer turns to port; the game heading grows turning toward +x, which is starboard here.
      const step = boat.tick(dt, { throttle, brake: 0, steer: -steerTarget / maxAngle, handbrake: 0 });
      return { x: step.position[2], y: step.position[0], heading: step.heading, speed: Math.hypot(step.forwardSpeed, step.lateralSpeed) };
    },
  };
}

/** How far a metric may sit from its reference before the comparison fails, as a share of the reference. */
export const BOAT_TOLERANCES: readonly { prefix: string; allowed: number }[] = [
  { prefix: "resistance at", allowed: 0.1 },
  { prefix: "top speed", allowed: 0.1 },
  { prefix: "running trim", allowed: 0.1 },
  { prefix: "advance", allowed: 0.1 },
  { prefix: "tactical diameter", allowed: 0.1 },
  { prefix: "heave RAO", allowed: 0.2 },
  { prefix: "pitch RAO", allowed: 0.2 },
  { prefix: "10/10 zig-zag", allowed: 0.2 },
  { prefix: "20/20 zig-zag", allowed: 0.2 },
];

/** One toleranced metric: the game against the reference, the gap, what is allowed and whether it holds. */
export interface BoatMetricCheck {
  label: string;
  game: number;
  reference: number;
  /** `game / reference − 1`. */
  gap: number;
  allowed: number;
  pass: boolean;
}

/** A comparison table with its toleranced metrics checked. */
export interface BoatComparisonTable extends ComparisonTable {
  checks: readonly BoatMetricCheck[];
}

/**
 * Runs a game boat tuning and its reference hull through the same straight-line tests (calm-water resistance at set
 * speeds, top speed and time to 90% of it on the reference's propulsion, coast-down distance to a quarter of top speed,
 * and running trim for planing hulls), heave and pitch in regular head waves against strip theory on the boat's
 * {@link wigleyStandIn}, turning circles and zig-zags when the subject has an MMG model, lines them up beside published
 * figures, and checks every metric in {@link BOAT_TOLERANCES} (`allowed`, `pass`).
 * @capability boat-comparison compare a game boat with a reference hull and published figures, metric by metric, with tolerances
 */
export function compareBoat(subject: BoatComparisonSubject, gameName = `${subject.name} (game build)`): BoatComparisonTable {
  const { reference, tuning } = subject;
  const game = gameStraightLine(tuning);
  const ref = referenceStraightLine(reference, subject.propulsion ?? gamePropulsion(tuning), Math.max(4 * game.topSpeed, tuning.propSpeed));
  const fastest = Math.max(...subject.speeds);
  const [unit, scale] = reference.resistance(fastest) < 1000 ? ["N", 1] : ["kN", 1000];
  const rows: ComparisonRow[] = subject.speeds.map((speed) => {
    const published = subject.published !== undefined && Math.abs(subject.published.speed - speed) < 1e-6 ? subject.published.resistance / scale : undefined;
    return { label: `resistance at ${(speed / KNOT).toFixed(1)} kn`, unit, game: gameResistance(tuning, speed) / scale, reference: reference.resistance(speed) / scale, real: published };
  });
  rows.push(
    { label: "top speed", unit: "kn", game: game.topSpeed / KNOT, reference: ref.topSpeed / KNOT, real: undefined },
    { label: "time to 90% of top speed", unit: "s", game: game.timeTo90, reference: ref.timeTo90, real: undefined },
    { label: "coast from top speed to 25%", unit: "m", game: game.coastDistance, reference: ref.coastDistance, real: undefined },
  );
  if (reference.trim !== undefined) {
    const trim = reference.trim;
    for (const speed of subject.speeds.slice(-2)) {
      rows.push({ label: `running trim at ${(speed / KNOT).toFixed(1)} kn`, unit: "deg", game: game.trimAt(speed) / DEG, reference: trim(speed) / DEG, real: undefined });
    }
  }
  rows.push(...(subject.extra ?? []));
  if (subject.manoeuvring !== undefined) rows.push(...manoeuvringRows(tuning, subject.manoeuvring));
  rows.push(...seakeepingRows(tuning));
  const checks: BoatMetricCheck[] = [];
  for (const row of rows) {
    const rule = BOAT_TOLERANCES.find((entry) => row.label.startsWith(entry.prefix));
    if (rule === undefined) continue;
    const gap = row.game / row.reference - 1;
    checks.push({ label: row.label, game: row.game, reference: row.reference, gap, allowed: rule.allowed, pass: Number.isFinite(gap) && Math.abs(gap) <= rule.allowed });
  }
  return { aircraft: gameName, reference: reference.name, rows, checks };
}

/** Net thrust of a B-series screw at fixed revolutions behind a hull, its curve at model or full scale. */
function screwAtRevs(screw: BSeriesPropeller, revs: number, wake: number, deduction: number, fullScale: boolean, density = RHO): PropulsionLaw {
  const curve = fullScale ? bSeriesShipOpenWater : bSeriesOpenWater;
  return (u, throttle) => {
    const n = throttle * revs;
    return n <= 0 ? 0 : (1 - deduction) * density * n * n * screw.diameter ** 4 * curve(screw, (u * (1 - wake)) / (n * screw.diameter)).thrust;
  };
}

/**
 * Holtrop–Mennen's 1982 example ship as a reference boat, with its B-series propeller at the paper's revolutions, and
 * `boatFromReference("holtrop-mennen-1982")` as the game build.
 * @capability boat-comparison the Holtrop–Mennen example ship as a reference boat with a game build
 */
export function holtropExampleSubject(): BoatComparisonSubject {
  const { hull, propeller, speed, published } = HOLTROP_MENNEN_EXAMPLE;
  const design = holtropMennenResistance(hull, speed);
  const factors = holtropPropulsionFactors(hull, design, propeller);
  const advance = (speed * (1 - factors.wake)) / (published.revolutions * propeller.diameter);
  // The paper prints no pitch; take the one that gives its K_T at its advance ratio.
  let low = 0.5;
  let high = 1.4;
  const geometry = (pitchRatio: number): BSeriesPropeller => ({ diameter: propeller.diameter, blades: propeller.blades, areaRatio: published.bladeAreaRatio, pitchRatio });
  for (let i = 0; i < 80; i += 1) {
    const mid = 0.5 * (low + high);
    if (bSeriesShipOpenWater(geometry(mid), advance).thrust < published.thrustCoefficient) low = mid;
    else high = mid;
  }
  const screw = geometry(0.5 * (low + high));
  const propulsion = screwAtRevs(screw, published.revolutions, factors.wake, factors.thrustDeduction, true);
  const massKg = RHO * hull.volume;
  const tuning = boatFromReference("holtrop-mennen-1982");
  return {
    name: "Holtrop–Mennen 1982 example ship",
    reference: {
      name: "Holtrop–Mennen resistance, B-series propeller",
      massKg,
      addedMass: surgeAddedMass(massKg, hull.length),
      resistance: (u) => holtropMennenResistance(hull, u).total,
    },
    tuning,
    propulsion,
    speeds: [15 * KNOT, 20 * KNOT, speed],
    published: { speed, resistance: published.total, label: "Holtrop and Mennen (1982)" },
    extra: [{ label: "net bollard thrust", unit: "kN", game: gamePropulsion(tuning)(0, 1) / 1000, reference: propulsion(0, 1) / 1000, real: undefined }],
  };
}

/**
 * Savitsky resistance of a planing hull at any forward speed: his equilibrium from `C_V = 0.6`, the bottom of the range
 * his fits cover, and below it the `C_V = 0.6` value scaled with speed squared.
 */
function planingResistance(hull: PlaningHull): (speed: number) => number {
  const floor = 0.6 * Math.sqrt(G * hull.beam);
  const atFloor = planingEquilibrium(hull, floor).resistance;
  return (u) => (u <= 0 ? 0 : u < floor ? atFloor * (u / floor) ** 2 : planingEquilibrium(hull, u).resistance);
}

function planingReference(name: string, hull: PlaningHull, length: number): ReferenceBoat {
  return {
    name,
    massKg: hull.massKg,
    addedMass: surgeAddedMass(hull.massKg, length),
    resistance: planingResistance(hull),
    trim: (u) => planingEquilibrium(hull, u).trim,
    porpoisingTrim: (u) => planingEquilibrium(hull, u).porpoisingTrim,
  };
}

/**
 * The 6 m outboard speedboat as a reference boat: an 18° deadrise prismatic planing hull of the same beam and mass,
 * centre of gravity 38% of the length forward of the transom, run through Savitsky's equations, driven by the same
 * 100 kW outboard and 3-blade B-series screw solved on the reference's own open-water curve; the game build is
 * `boatFromReference("speedboat-6m")`.
 * @capability boat-comparison a 6 m outboard speedboat as a Savitsky reference boat with a game build
 */
export function speedboatSubject(): BoatComparisonSubject {
  const tuning = boatFromReference("speedboat-6m");
  const hull: PlaningHull = { massKg: tuning.massKg, beam: tuning.beam, deadrise: 18 * DEG, lcg: 0.38 * tuning.length, vcg: 0.45 };
  const screw: BSeriesPropeller = { diameter: 0.35, blades: 3, areaRatio: 0.6, pitchRatio: 1.3 };
  const [maxRevs, maxPower, wake, deduction] = [46.7, 100e3, 0.03, 0.05];
  const propulsion: PropulsionLaw = (u, throttle) => {
    const inflow = u * (1 - wake);
    const power = (n: number) => 2 * Math.PI * RHO * n ** 3 * screw.diameter ** 5 * bSeriesOpenWater(screw, inflow / (n * screw.diameter)).torque;
    const target = throttle * maxPower;
    let n = throttle * maxRevs;
    if (power(maxRevs) > target) {
      let low = 1e-6;
      let high = maxRevs;
      for (let i = 0; i < 80; i += 1) {
        const mid = 0.5 * (low + high);
        if (power(mid) < target) low = mid;
        else high = mid;
      }
      n = 0.5 * (low + high);
    } else n = maxRevs;
    return (1 - deduction) * RHO * n * n * screw.diameter ** 4 * bSeriesOpenWater(screw, inflow / (n * screw.diameter)).thrust;
  };
  return {
    name: "6 m outboard speedboat",
    reference: planingReference("18° deadrise prismatic hull (Savitsky)", hull, tuning.length),
    tuning,
    propulsion,
    speeds: [4, 8, 12, 16],
    extra: [
      { label: "porpoising limit trim at 31.1 kn", unit: "deg", game: Number.NaN, reference: planingEquilibrium(hull, 16).porpoisingTrim / DEG, real: undefined },
    ],
  };
}

/**
 * The KVLCC2 L7 tanker model as a reference boat: its MMG model for resistance and manoeuvring, its propeller at the
 * self-propulsion revolutions, MARIN's free-running turning and zig-zag results, and `boatFromReference("kvlcc2-l7")`
 * as the game build.
 * @capability boat-comparison the KVLCC2 L7 model as an MMG reference boat with a game build
 */
export function kvlcc2Subject(): BoatComparisonSubject {
  const ship = KVLCC2_L7;
  const speed = KVLCC2_L7_SPEED;
  const p = ship.propeller;
  const revs = selfPropulsionRevs(ship, speed);
  const [k0, k1, k2] = p.thrust;
  const massKg = ship.density * ship.displacement;
  const tuning = boatFromReference("kvlcc2-l7");
  const { turning, zigZag } = KVLCC2_L7_PUBLISHED;
  const half = 0.5 * ship.density * ship.length * ship.draft;
  const propulsion: PropulsionLaw = (u, throttle) => {
    const n = throttle * revs;
    if (n <= 0) return 0;
    const j = (u * (1 - p.wake)) / (n * p.diameter);
    return (1 - p.thrustDeduction) * ship.density * n * n * p.diameter ** 4 * (k0 + k1 * j + k2 * j * j);
  };
  return {
    name: "KVLCC2 L7 tanker model",
    reference: {
      name: "MMG standard method (Yasukawa & Yoshimura 2015)",
      massKg,
      addedMass: ship.addedMass.surge * half * ship.length,
      resistance: (u) => half * u * u * ship.resistance,
    },
    tuning,
    propulsion,
    speeds: [0.5 * speed, 0.75 * speed, speed],
    manoeuvring: {
      ship,
      speed,
      turning: {
        starboard: { advance: turning[0].advance.measured, tacticalDiameter: turning[0].tacticalDiameter.measured },
        port: { advance: turning[1].advance.measured, tacticalDiameter: turning[1].tacticalDiameter.measured },
      },
      zigZag: { first10: zigZag[0].overshoots.measured[0], second10: zigZag[0].overshoots.measured[1], first20: zigZag[1].overshoots.measured[0] },
    },
  };
}

/**
 * The reference boats every comparison run includes.
 * @capability boat-comparison every built-in reference boat with its game build
 */
export function referenceBoatSubjects(): BoatComparisonSubject[] {
  return [holtropExampleSubject(), speedboatSubject(), kvlcc2Subject()];
}

/**
 * Builds a reference boat for any game tuning: a planing hull (`planingSpeed` set) becomes an 18° deadrise prismatic hull
 * of its length, beam and mass; a displacement hull becomes a Holtrop–Mennen hull of its length, beam and mass with
 * workboat coefficients (`C_B 0.55`, `C_M 0.85`, `C_WP 0.75`, LCB 1.5% aft).
 * @capability boat-comparison reference hull for any game boat tuning
 */
export function referenceSubjectFor(name: string, tuning: BoatTuning): BoatComparisonSubject {
  const planingSpeed = tuning.planingSpeed;
  if (planingSpeed !== undefined) {
    const hull: PlaningHull = { massKg: tuning.massKg, beam: tuning.beam, deadrise: 18 * DEG, lcg: 0.38 * tuning.length, vcg: 0.2 * tuning.beam };
    return {
      name,
      tuning,
      speeds: [0.5, 1, 1.5, 2].map((share) => share * planingSpeed),
      reference: planingReference("18° deadrise prismatic hull of the same beam and mass (Savitsky)", hull, tuning.length),
    };
  }
  const volume = tuning.massKg / RHO;
  const draft = volume / (0.55 * tuning.length * tuning.beam);
  const hull: HoltropHull = {
    length: tuning.length,
    beam: tuning.beam,
    draftForward: draft,
    draftAft: draft,
    volume,
    lcb: -1.5,
    midshipCoefficient: 0.85,
    waterplaneCoefficient: 0.75,
  };
  const hullSpeed = Math.sqrt(G * tuning.length);
  return {
    name,
    tuning,
    speeds: [0.2, 0.3, 0.4].map((fn) => fn * hullSpeed),
    reference: {
      name: "Holtrop–Mennen workboat hull of the same length, beam and mass",
      massKg: tuning.massKg,
      addedMass: surgeAddedMass(tuning.massKg, tuning.length),
      resistance: (u) => holtropMennenResistance(hull, u).total,
    },
  };
}
