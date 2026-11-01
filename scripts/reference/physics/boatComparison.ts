// @skill jgengine-world
import type { ComparisonTable } from "../flight/flightComparison";
import { createBoatDynamics, type BoatTuning } from "@jgengine/core/physics/boatDynamics";
import { bSeriesShipOpenWater, type BSeriesPropeller } from "./marinePropeller";
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

/** The game's straight-line thrust law, shared by both models so the comparison isolates the hull. */
function gameThrust(tuning: BoatTuning, speed: number): number {
  return tuning.maxThrust * Math.max(0, 1 - Math.max(0, speed) / Math.max(0.1, tuning.propSpeed));
}

/** Straight-line results of one model, SI units. */
interface StraightLine {
  topSpeed: number;
  timeTo90: number;
  coastDistance: number;
}

function referenceStraightLine(boat: ReferenceBoat, tuning: BoatTuning): StraightLine {
  const inertia = boat.massKg + boat.addedMass;
  const accel = (u: number, throttle: number) => (throttle * gameThrust(tuning, u) - boat.resistance(u)) / inertia;
  let low = 0;
  let high = tuning.propSpeed;
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

/** Resistance of a game boat at a speed: the deceleration of one tiny coasting step from that speed. */
function gameResistance(tuning: BoatTuning, speed: number): number {
  const boat = createBoatDynamics(tuning);
  boat.restore({ ...boat.snapshot(), vx: 0, vz: speed });
  const dt = 1e-3;
  const step = boat.tick(dt, { throttle: 0, brake: 0, steer: 0, handbrake: 0 });
  return (-tuning.massKg * (step.motion.forwardSpeed - speed)) / dt;
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
    if (Number.isNaN(timeToPlane) && step.hull.planing >= 1) timeToPlane = t;
    still = Math.abs(step.motion.forwardSpeed - speed) < 1e-5 ? still + 1 : 0;
    speed = step.motion.forwardSpeed;
  }
  const topSpeed = speed;
  const climb = createBoatDynamics(tuning);
  let timeTo90 = 0;
  for (let u = 0; u < 0.9 * topSpeed && timeTo90 < 7200; timeTo90 += dt) u = climb.tick(dt, full).motion.forwardSpeed;
  let distance = 0;
  let u = topSpeed;
  for (let i = 0; u > 0.25 * topSpeed && i < 144000; i += 1) {
    const before = boat.snapshot();
    const next = boat.tick(dt, idle).motion.forwardSpeed;
    distance += Math.hypot(boat.snapshot().x - before.x, boat.snapshot().z - before.z);
    u = next;
  }
  const trimAt = (target: number) => {
    // Hold the speed for long enough to settle the body pitch, by re-imposing it each tick.
    const held = createBoatDynamics(tuning);
    let pitch = 0;
    for (let i = 0; i < 400; i += 1) {
      held.restore({ ...held.snapshot(), vx: 0, vz: target, heading: 0 });
      pitch = held.tick(dt, idle).body.bodyPitch;
    }
    return -pitch;
  };
  return { topSpeed, timeTo90, coastDistance: distance, timeToPlane, trimAt };
}

/** A reference boat with the game build of it and the published figures it carries. */
export interface BoatComparisonSubject {
  name: string;
  reference: ReferenceBoat;
  /** The boat as a game author would build it on `createBoatDynamics`. */
  tuning: BoatTuning;
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
  const boat = createBoatDynamics(tuning, { waterHeight: (_x, z, t) => amplitude * Math.cos(k * z + omega * t) });
  const period = (2 * Math.PI) / omega;
  const dt = period / 40;
  let heaveCos = 0, heaveSin = 0, pitchCos = 0, pitchSin = 0, samples = 0;
  for (let i = 0; i < 40 * 30; i += 1) {
    const step = boat.tick(dt, { throttle: 0, brake: 0, steer: 0, handbrake: 0 });
    if (i < 40 * 20) continue;
    const phase = omega * (i + 1) * dt;
    heaveCos += step.motion.position[1] * Math.cos(phase);
    heaveSin += step.motion.position[1] * Math.sin(phase);
    pitchCos += step.body.bodyPitch * Math.cos(phase);
    pitchSin += step.body.bodyPitch * Math.sin(phase);
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
  const drag = gameResistance(trial, speed);
  const thrust = gameThrust(trial, speed);
  const throttle = thrust > drag ? drag / thrust : 1;
  const boat = createBoatDynamics(trial);
  boat.restore({ ...boat.snapshot(), vx: 0, vz: speed, heading: 0 });
  return {
    step(steerTarget, dt) {
      // Positive game steer turns to port; the game heading grows turning toward +x, which is starboard here.
      const step = boat.tick(dt, { throttle, brake: 0, steer: -steerTarget / maxAngle, handbrake: 0 });
      return { x: step.motion.position[2], y: step.motion.position[0], heading: step.motion.heading, speed: Math.hypot(step.motion.forwardSpeed, step.motion.lateralSpeed) };
    },
  };
}

/**
 * Runs a game boat tuning and its reference hull through the same straight-line tests (calm-water resistance at set
 * speeds, top speed and time to 90% of it on the game's own thrust law, coast-down distance to a quarter of top speed,
 * and running trim for planing hulls), heave and pitch in regular head waves against strip theory on the boat's
 * {@link wigleyStandIn}, turning circles and zig-zags when the subject has an MMG model, and lines them up beside
 * published figures.
 * @capability boat-comparison compare a game boat with a reference hull and published figures, metric by metric
 */
export function compareBoat(subject: BoatComparisonSubject, gameName = `${subject.name} (game build)`): ComparisonTable {
  const { reference, tuning } = subject;
  const game = gameStraightLine(tuning);
  const ref = referenceStraightLine(reference, tuning);
  const fastest = Math.max(...subject.speeds);
  const [unit, scale] = reference.resistance(fastest) < 1000 ? ["N", 1] : ["kN", 1000];
  const rows: ComparisonRow[] = subject.speeds.map((speed) => {
    const published = subject.published !== undefined && Math.abs(subject.published.speed - speed) < 1e-6 ? subject.published.resistance / scale : undefined;
    return { label: `resistance at ${(speed / KNOT).toFixed(1)} kn`, unit, game: gameResistance(tuning, speed) / scale, reference: reference.resistance(speed) / scale, real: published };
  });
  rows.push(
    { label: "top speed (game thrust law)", unit: "kn", game: game.topSpeed / KNOT, reference: ref.topSpeed / KNOT, real: undefined },
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
  return { aircraft: gameName, reference: reference.name, rows };
}

/**
 * Holtrop–Mennen's 1982 example ship as a reference boat, with its B-series propeller and a game build of it.
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
  const n = published.revolutions;
  const D = propeller.diameter;
  const bollard = RHO * n * n * D ** 4 * bSeriesShipOpenWater(screw, 0).thrust * (1 - factors.thrustDeduction);
  let zeroAdvance = 0.5;
  while (bSeriesShipOpenWater(screw, zeroAdvance).thrust > 0) zeroAdvance += 0.001;
  const massKg = RHO * hull.volume;
  const tuning: BoatTuning = {
    massKg,
    length: hull.length,
    beam: hull.beam,
    maxThrust: bollard,
    propSpeed: (zeroAdvance * n * D) / (1 - factors.wake),
    steering: { kind: "rudder", area: 0.016 * hull.length * hull.draftAft },
  };
  return {
    name: "Holtrop–Mennen 1982 example ship",
    reference: {
      name: "Holtrop–Mennen resistance, B-series propeller",
      massKg,
      addedMass: surgeAddedMass(massKg, hull.length),
      resistance: (u) => holtropMennenResistance(hull, u).total,
    },
    tuning,
    speeds: [15 * KNOT, 20 * KNOT, speed],
    published: { speed, resistance: published.total, label: "Holtrop and Mennen (1982)" },
    extra: [{ label: "net bollard thrust", unit: "kN", game: tuning.maxThrust / 1000, reference: bollard / 1000, real: undefined }],
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
 * The 6 m outboard speedboat of the `boatDynamics` docs as a reference boat: an 18° deadrise prismatic planing hull of
 * the same beam and mass, centre of gravity 38% of the length forward of the transom, run through Savitsky's equations.
 * @capability boat-comparison a 6 m outboard speedboat as a Savitsky reference boat with a game build
 */
export function speedboatSubject(): BoatComparisonSubject {
  const tuning: BoatTuning = { massKg: 900, length: 6, beam: 2.3, maxThrust: 7000, propSpeed: 30, planingSpeed: 8, steering: { kind: "outboard" } };
  const hull: PlaningHull = { massKg: tuning.massKg, beam: tuning.beam, deadrise: 18 * DEG, lcg: 0.38 * tuning.length, vcg: 0.45 };
  return {
    name: "6 m outboard speedboat",
    reference: planingReference("18° deadrise prismatic hull (Savitsky)", hull, tuning.length),
    tuning,
    speeds: [4, 8, 12, 16],
    extra: [
      { label: "porpoising limit trim at 31.1 kn", unit: "deg", game: Number.NaN, reference: planingEquilibrium(hull, 16).porpoisingTrim / DEG, real: undefined },
    ],
  };
}

/**
 * The KVLCC2 L7 tanker model as a reference boat: its MMG model for resistance and manoeuvring, a game build with the
 * same mass, rudder, steering rate and propeller (bollard thrust and zero-thrust speed at the self-propulsion
 * revolutions), and MARIN's free-running turning and zig-zag results.
 * @capability boat-comparison the KVLCC2 L7 model as an MMG reference boat with a game build
 */
export function kvlcc2Subject(): BoatComparisonSubject {
  const ship = KVLCC2_L7;
  const speed = KVLCC2_L7_SPEED;
  const p = ship.propeller;
  const revs = selfPropulsionRevs(ship, speed);
  const [k0, k1, k2] = p.thrust;
  const zeroThrust = (-k1 - Math.sqrt(k1 * k1 - 4 * k2 * k0)) / (2 * k2);
  const massKg = ship.density * ship.displacement;
  const tuning: BoatTuning = {
    massKg,
    length: ship.length,
    beam: ship.beam,
    maxThrust: (1 - p.thrustDeduction) * ship.density * revs * revs * p.diameter ** 4 * k0,
    propSpeed: (zeroThrust * revs * p.diameter) / (1 - p.wake),
    steering: { kind: "rudder", area: ship.rudder?.area ?? 0, maxAngle: ship.maxSteer },
    steerRate: ship.steerRate,
  };
  const { turning, zigZag } = KVLCC2_L7_PUBLISHED;
  const half = 0.5 * ship.density * ship.length * ship.draft;
  return {
    name: "KVLCC2 L7 tanker model",
    reference: {
      name: "MMG standard method (Yasukawa & Yoshimura 2015)",
      massKg,
      addedMass: ship.addedMass.surge * half * ship.length,
      resistance: (u) => half * u * u * ship.resistance,
    },
    tuning,
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
