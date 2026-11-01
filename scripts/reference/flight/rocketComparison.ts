// @skill jgengine-world
import { createRigidAircraft, type RigidAircraftTuning } from "@jgengine/core/flight/aircraftDynamics";
import { withTolerance, type ComparisonTable } from "./flightComparison";
import { createRocket, gravityTurnTarget, steerRocket, type GravityTurnProgram } from "./rocket";
import { F1_ENGINE, SATURN_V_AS506, SATURN_V_AS506_ASCENT, SATURN_V_AS506_EVENTS, SATURN_V_AS506_LAUNCH } from "./saturnV";
import { standardAtmosphere, STANDARD_GRAVITY } from "./standardAtmosphere";

const DEG = Math.PI / 180;

/** What one ascent reached, SI units except where the row says. */
interface AscentEvents {
  idealDeltaV: number;
  mach1: number;
  maxQ: number;
  maxQTime: number;
  cecoAltitude: number;
  cecoVelocity: number;
  burnoutTime: number;
  burnoutAltitude: number;
  burnoutVelocity: number;
  burnoutFlightPath: number;
  burnoutRange: number;
  peakAcceleration: number;
}

const S_IC = SATURN_V_AS506.stages[0];
const CECO = SATURN_V_AS506_EVENTS.centerEngineCutoff.time;
const LIFTOFF_THRUST = 34.0e6;
const STAGE_FLOW = (5 * (F1_ENGINE.thrust[0]?.[1] ?? 0)) / (F1_ENGINE.specificImpulse * STANDARD_GRAVITY);

/**
 * The AS-506 S-IC flight as a game author would build it on {@link createRigidAircraft}'s `motor`: the published 34 MN
 * liftoff thrust held to centre engine cutoff, then four fifths of it; the report's propellant and stage flow; the
 * stage and upper stack as dry mass; the subsonic axial-force coefficient times the reference area as drag area.
 * @capability rocket-comparison the Saturn V S-IC flight built as a game rigid-body rocket
 */
export function saturnVGameTuning(): RigidAircraftTuning {
  const dry = (S_IC?.dryMass ?? 0) + SATURN_V_AS506.payload.mass;
  const burn = CECO - (SATURN_V_AS506_LAUNCH.time ?? 0);
  return {
    massKg: dry,
    inertia: { pitch: 7.0e8, yaw: 7.0e8, roll: 8.8e6 },
    surfaces: [],
    motor: {
      thrustCurve: [
        [0, LIFTOFF_THRUST],
        [burn, LIFTOFF_THRUST],
        [burn + 0.01, 0.8 * LIFTOFF_THRUST],
        [400, 0.8 * LIFTOFF_THRUST],
      ],
      propellantKg: S_IC?.propellant ?? 0,
      massFlow: STAGE_FLOW,
      at: [0, 0, -62],
      gimbal: S_IC?.gimbal ?? 0,
    },
    dragArea: (S_IC?.aero.axialForce[0]?.[1] ?? 0) * (S_IC?.aero.area ?? 0),
  };
}

function gameAscent(tuning: RigidAircraftTuning, program: GravityTurnProgram): AscentEvents {
  const half = Math.SQRT1_2;
  const aircraft = createRigidAircraft(tuning, { position: [0, 0, 0], orientation: [-half, 0, 0, half], airDensity: (height) => standardAtmosphere(Math.max(0, height)).density });
  const start = SATURN_V_AS506_LAUNCH.time ?? 0;
  const motor = tuning.motor;
  const exhaust = motor === undefined ? 0 : Math.max(...motor.thrustCurve.map((point) => point[1])) / motor.massFlow;
  const events: AscentEvents = {
    idealDeltaV: exhaust * Math.log((tuning.massKg + (motor?.propellantKg ?? 0)) / tuning.massKg),
    mach1: Number.NaN,
    maxQ: 0,
    maxQTime: Number.NaN,
    cecoAltitude: Number.NaN,
    cecoVelocity: Number.NaN,
    burnoutTime: Number.NaN,
    burnoutAltitude: Number.NaN,
    burnoutVelocity: Number.NaN,
    burnoutFlightPath: Number.NaN,
    burnoutRange: Number.NaN,
    peakAcceleration: 0,
  };
  const dt = 0.1;
  let input = 0;
  const dot = (a: readonly number[], b: readonly number[]) => (a[0] ?? 0) * (b[0] ?? 0) + (a[1] ?? 0) * (b[1] ?? 0) + (a[2] ?? 0) * (b[2] ?? 0);
  for (let time = start; time < start + 400; time += dt) {
    const step = aircraft.tick(dt, { throttle: 1, pitch: input, roll: 0, yaw: 0 });
    const now = time + dt;
    const [x, y, z] = step.position;
    const velocity = step.velocity;
    // A rotating-Earth build reports its own altitude, local vertical and space-fixed velocity; a flat one has only y and its velocity.
    const planet = step.planet;
    const up = planet?.up ?? [0, 1, 0];
    const altitude = planet?.altitude ?? y;
    const inertial = planet?.inertialVelocity ?? velocity;
    const speed = Math.hypot(...inertial);
    const airspeed = Math.hypot(...velocity);
    const air = standardAtmosphere(Math.max(0, altitude));
    const q = 0.5 * air.density * airspeed * airspeed;
    if (Number.isNaN(events.mach1) && airspeed >= air.speedOfSound) events.mach1 = now;
    if (q > events.maxQ) {
      events.maxQ = q;
      events.maxQTime = now;
    }
    if (Number.isNaN(events.cecoAltitude) && now >= CECO) {
      events.cecoAltitude = altitude;
      events.cecoVelocity = speed;
    }
    if (step.motor?.burnedOut === true || step.thrust <= 0) {
      events.burnoutTime = now;
      break;
    }
    events.peakAcceleration = Math.max(events.peakAcceleration, step.thrust / step.massKg);
    events.burnoutAltitude = altitude;
    events.burnoutVelocity = speed;
    events.burnoutFlightPath = Math.asin(Math.max(-1, Math.min(1, dot(inertial, up) / Math.max(1e-9, speed))));
    events.burnoutRange = planet?.surfaceRange ?? Math.hypot(x, z);
    // The same gravity turn: pitch-up input tilts the nose toward −z, so tilt is measured from the local vertical toward downrange.
    const [qx, qy, qz, qw] = step.orientation;
    // Body +z (the nose) in world axes.
    const nose = [2 * (qx * qz + qw * qy), 2 * (qy * qz - qw * qx), 1 - 2 * (qx * qx + qy * qy)];
    const along = -(up[2] ?? 0);
    const downrange = [-(up[0] ?? 0) * along, -(up[1] ?? 0) * along, -1 - (up[2] ?? 0) * along];
    const tilt = Math.atan2(dot(nose, downrange), dot(nose, up));
    const target =
      now < program.verticalRise
        ? 0
        : now < program.verticalRise + program.kickDuration
          ? (program.kick * (now - program.verticalRise)) / program.kickDuration
          : Math.atan2(dot(velocity, downrange), dot(velocity, up));
    input = Math.max(-1, Math.min(1, 8 * (target - tilt) - 4 * step.pitchRate));
  }
  return events;
}

let reference: AscentEvents | undefined;

function referenceAscent(): AscentEvents {
  if (reference !== undefined) return reference;
  const rocket = createRocket(SATURN_V_AS506, SATURN_V_AS506_LAUNCH);
  let sample = rocket.sample();
  const engine = F1_ENGINE;
  const m0 = sample.mass;
  const events: AscentEvents = {
    idealDeltaV: engine.specificImpulse * STANDARD_GRAVITY * Math.log(m0 / (m0 - (S_IC?.propellant ?? 0))),
    mach1: Number.NaN,
    maxQ: 0,
    maxQTime: Number.NaN,
    cecoAltitude: Number.NaN,
    cecoVelocity: Number.NaN,
    burnoutTime: Number.NaN,
    burnoutAltitude: Number.NaN,
    burnoutVelocity: Number.NaN,
    burnoutFlightPath: Number.NaN,
    burnoutRange: Number.NaN,
    peakAcceleration: 0,
  };
  while (sample.time < 400) {
    const next = rocket.step(0.1, steerRocket(sample, gravityTurnTarget(sample, SATURN_V_AS506_ASCENT), { attitude: 8, rate: 4 }));
    if (next.thrust <= 0) break;
    sample = next;
    if (Number.isNaN(events.mach1) && sample.mach >= 1) events.mach1 = sample.time;
    if (sample.dynamicPressure > events.maxQ) {
      events.maxQ = sample.dynamicPressure;
      events.maxQTime = sample.time;
    }
    if (Number.isNaN(events.cecoAltitude) && sample.time >= CECO) {
      events.cecoAltitude = sample.altitude;
      events.cecoVelocity = sample.inertialSpeed;
    }
    events.peakAcceleration = Math.max(events.peakAcceleration, sample.sensedAcceleration);
  }
  events.burnoutTime = sample.time;
  events.burnoutAltitude = sample.altitude;
  events.burnoutVelocity = sample.inertialSpeed;
  events.burnoutFlightPath = sample.inertialFlightPathAngle;
  events.burnoutRange = sample.surfaceRange;
  reference = events;
  return events;
}

/**
 * Flies the Saturn V AS-506 S-IC ascent three ways and lines them up: the game's rigid-body `motor` model built from the
 * published numbers ({@link saturnVGameTuning}), the reference rocket ({@link createRocket}), and the flight evaluation
 * report. Both models fly the same gravity turn. The game model has a flat, non-rotating Earth, constant gravity, thrust
 * that ignores ambient pressure and a drag area that ignores Mach, so its velocities are Earth-relative and it falls
 * short of the real ascent; the rows show by how much.
 * @capability rocket-comparison compare a game rocket's ascent with a reference 6-DOF rocket and the Apollo 11 Saturn V
 */
export function compareRocketAscent(tuning: RigidAircraftTuning = saturnVGameTuning(), name = "Saturn V S-IC (game motor build)", tolerance?: number): ComparisonTable {
  const game = gameAscent(tuning, SATURN_V_AS506_ASCENT);
  const ref = referenceAscent();
  const real = SATURN_V_AS506_EVENTS;
  const judge = (row: ComparisonTable["rows"][number]) => withTolerance(row, tolerance);
  const rows: ComparisonTable["rows"] = [
    { label: "ideal Δv, vacuum (Tsiolkovsky)", unit: "m/s", game: game.idealDeltaV, reference: ref.idealDeltaV, real: undefined },
    { label: "Mach 1", unit: "s", game: game.mach1, reference: ref.mach1, real: real.mach1.time },
    judge({ label: "max dynamic pressure", unit: "kPa", game: game.maxQ / 1000, reference: ref.maxQ / 1000, real: real.maxDynamicPressure.pressure / 1000 }),
    { label: "max dynamic pressure time", unit: "s", game: game.maxQTime, reference: ref.maxQTime, real: real.maxDynamicPressure.time },
    judge({ label: "centre engine cutoff altitude", unit: "km", game: game.cecoAltitude / 1000, reference: ref.cecoAltitude / 1000, real: real.centerEngineCutoff.altitude / 1000 }),
    judge({ label: "centre engine cutoff velocity", unit: "m/s", game: game.cecoVelocity, reference: ref.cecoVelocity, real: real.centerEngineCutoff.velocity }),
    { label: "burnout time", unit: "s", game: game.burnoutTime, reference: ref.burnoutTime, real: real.outboardEngineCutoff.time },
    judge({ label: "burnout altitude", unit: "km", game: game.burnoutAltitude / 1000, reference: ref.burnoutAltitude / 1000, real: real.outboardEngineCutoff.altitude / 1000 }),
    judge({ label: "burnout velocity (space-fixed; game: its only frame)", unit: "m/s", game: game.burnoutVelocity, reference: ref.burnoutVelocity, real: real.outboardEngineCutoff.velocity }),
    { label: "burnout flight path angle", unit: "deg", game: game.burnoutFlightPath / DEG, reference: ref.burnoutFlightPath / DEG, real: real.outboardEngineCutoff.flightPathAngle / DEG },
    { label: "burnout surface range", unit: "km", game: game.burnoutRange / 1000, reference: ref.burnoutRange / 1000, real: real.outboardEngineCutoff.surfaceRange / 1000 },
    { label: "peak acceleration", unit: "m/s²", game: game.peakAcceleration, reference: ref.peakAcceleration, real: real.maxAcceleration },
  ];
  return { aircraft: name, reference: "reference rocket (6-DOF, rotating Earth)", rows };
}
