import type { AxisInput } from "../input/axisInput";
import type { CollisionObstacle } from "../movement/movementModel";
import { createVehicleObstacleClamp, type VehicleImpact, type VehicleMoveClamp } from "./vehicleObstacles";
import { sampleGripCurve, type GripCurve } from "./gripCurve";
import { clamp, clamp01 } from "../math/scalar";

/**
 * One axle's tire, in physical terms. Lateral force follows a simplified Pacejka curve
 * `μ·Fz·sin(C·atan(B·α))` whose `B`/`C` are solved from `peakSlipAngle` and `slideGrip`, so the three
 * numbers read the way a driver feels them: how much grip, how early it peaks, how much is left sliding.
 */
export interface VehicleTireTuning {
  /** Peak lateral friction coefficient μ on an ideal surface (0.7 worn street … 1.1 sport … 1.6 slick/arcade). */
  peakGrip: number;
  /** Slip angle in radians where lateral force peaks (0.07 stiff race tire … 0.2 soft, forgiving tire). */
  peakSlipAngle: number;
  /** Fraction of peak force left at a full 90° slide, `0..1` (0.6 snappy … 0.95 drift-friendly). */
  slideGrip: number;
  /** Peak longitudinal friction μ for drive and braking (default `peakGrip`; a road tyre's is about 15% higher). */
  longitudinalGrip?: number;
  /**
   * Cornering stiffness per unit load, 1/rad: lateral force per radian of slip at small slip over wheel load (a road
   * tyre ~`15`, a race slick ~`25`). Omit for the stiffness `peakSlipAngle` and `slideGrip` imply on their own.
   */
  corneringStiffness?: number;
}

/** Engine and gearbox. Drive force at the wheels = torque · curve(rpm) · gear · finalDrive · efficiency / wheelRadius. */
export interface VehicleGearboxTuning {
  kind: "gearbox";
  /** Peak engine torque, N·m. */
  peakTorque: number;
  /** Torque multiplier by normalized rpm (`0` = idle, `1` = redline); same shape as a grip curve. */
  torqueCurve: GripCurve;
  idleRpm: number;
  redlineRpm: number;
  shiftUpRpm: number;
  shiftDownRpm: number;
  /** Seconds of reduced drive during a shift. */
  shiftSeconds: number;
  gears: readonly number[];
  reverseGear: number;
  finalDrive: number;
  /** Driven wheel radius, m. */
  wheelRadius: number;
  /** Driveline efficiency `0..1` (default `0.85`). */
  efficiency?: number;
  /** Engine-braking torque at the crank with the throttle closed, N·m (default `0.12 · peakTorque`; `0` switches engine braking off). */
  engineBrakeTorque?: number;
  /** Extra throttle-off drag at the wheels on top of engine braking, N (default `0`). */
  coastForce?: number;
  /** Clutch-slip rpm the engine holds while launching from rest (default halfway between idle and peak). */
  launchRpm?: number;
}

/** Single-speed drive (electric, kart, arcade ball-car): force capped by power, so top speed comes out of drag. */
export interface VehicleDirectDriveTuning {
  kind: "direct";
  /** Maximum tractive force at the wheels, N. */
  maxForce: number;
  /** Maximum power, W; force falls off as `power / speed` above the crossover. */
  maxPower: number;
  /** Reverse force as a fraction of `maxForce` (default `0.5`). */
  reverseScale?: number;
  /** Throttle-off drag force at the wheels, N (default `0.08 · maxForce`). */
  coastForce?: number;
}

/** Steering rack: lock and rack speed. Speed-sensitive lock and caster self-alignment are effects of their own. */
export interface VehicleSteeringTuning {
  /** Front-wheel lock, rad. */
  maxAngle: number;
  /** Rack speed toward the requested angle, rad/s — a keyboard tap and a stick flick both pass through this. */
  rate: number;
  /** Rack speed back to centre when the request is released or reversed, rad/s (default `rate`). */
  returnRate?: number;
}

/** Friction ellipse: drive and brake force use up the same tyre's cornering grip. Omit for tyres that corner at full grip whatever the pedals do. */
export interface VehicleCombinedSlipEffect {
  /**
   * Exponent of the friction limit `|Fx/Fx,max|^n + |Fy/Fy,max|^n ≤ 1` (default `2`, the ellipse). Higher keeps
   * more cornering grip under light pedal, lower trades it away sooner.
   */
  exponent?: number;
}

/** A wheel that locks under braking or spins under drive slides, and a sliding tyre grips less than its peak. */
export interface VehicleWheelSlideEffect {
  /** Longitudinal force left at a full lock or spin as a share of peak (default the tyre's `slideGrip`). */
  slideGrip?: number;
}

/** Load moves forward under braking and back under drive, by `m·a·comHeight / wheelbase`. */
export interface VehicleLongitudinalLoadTransferEffect {
  /** Share of the rigid-body transfer that reaches the tyres, `0..1` (default `1`; anti-dive/anti-squat geometry lowers it). */
  share?: number;
}

/** Load moves to the outside wheels in a corner, by `m·a·comHeight / trackWidth`. */
export interface VehicleLateralLoadTransferEffect {
  /**
   * Share of the transfer taken by the front axle, `0..1` (default `0.5`). The classic balance knob: more front →
   * the front saturates first (understeer), less → the rear does (oversteer). Needs `loadSensitivity` to change grip.
   */
  frontShare?: number;
}

/**
 * Tyre load sensitivity: a tyre grips less per newton the harder it is pressed, so an axle with load moved
 * across it holds less in total. Each wheel is evaluated at its own load.
 */
export interface VehicleLoadSensitivityEffect {
  /** Peak-grip loss per unit of load above nominal: `μ = peakGrip·(1 − grip·(Fz/Fz₀ − 1))` (default `0.05`; a road tyre ~`0.08`). */
  grip?: number;
  /** Cornering-stiffness loss per unit of load above nominal (default `0`; a road tyre ~`0.3`). Moves the peak to larger slip on the loaded wheel. */
  stiffness?: number;
  /**
   * Load per wheel where the tyre has exactly `peakGrip`, N. Omit to use each axle's current mean wheel load, so only
   * the split across an axle costs grip; set it (usually the static wheel load) for grip that also falls with downforce
   * and longitudinal transfer.
   */
  nominalLoad?: number;
}

/** Tyre relaxation: the carcass has to roll a distance before the slip angle builds, so lateral force lags steering. */
export interface VehicleTireRelaxationEffect {
  /** Relaxation length, m (0.3 typical road tyre, 0.15 stiff race tyre). */
  length: number;
}

/** Camber thrust: a tyre leaning into the turn pushes harder, one leaning out pushes less. */
export interface VehicleCamberEffect {
  /** Static camber, rad; negative tops the wheel inboard, which helps the loaded outside wheel (default `0`). */
  static?: number;
  /** Share of body roll the wheels lean with, `0..1` (default `0.7`; `1` a beam axle rolling with the body, `0` wheels that stay upright). */
  rollFollow?: number;
  /** Lateral force per rad of camber, as a share of wheel load (default `0.8`). */
  thrust?: number;
}

/** Steer from bushing and steering-system compliance: the wheels give way under cornering force. */
export interface VehicleComplianceSteerEffect {
  /** Front steer per newton of front-axle lateral force, rad/N; positive steers away from the force (understeer). */
  front?: number;
  /** Rear steer per newton of rear-axle lateral force, rad/N; positive steers away (oversteer), negative toward (stable). */
  rear?: number;
}

/** Steer from suspension geometry as the body rolls. */
export interface VehicleRollSteerEffect {
  /** Front steer per rad of body roll; positive steers out of the turn (understeer). */
  front?: number;
  /** Rear steer per rad of body roll; positive steers out of the turn (oversteer), negative into it (stable). */
  rear?: number;
}

/** Aerodynamic drag `½·ρ·CdA·v²`, air density 1.225 kg/m³. */
export interface VehicleAeroDragEffect {
  /** Drag coefficient × frontal area, m² (0.6 sports car … 1.0 SUV). */
  area: number;
}

/** Aerodynamic downforce `½·ρ·ClA·v²`, pressing the tyres harder as speed rises. */
export interface VehicleDownforceEffect {
  /** Lift coefficient × area producing downforce, m² (0 road car … 3 race car). */
  area: number;
  /** Share on the front axle, `0..1` (default `0.45`). */
  frontShare?: number;
}

/** Tyre rolling resistance, `Crr · load`. */
export interface VehicleRollingResistanceEffect {
  /** Rolling-resistance coefficient (default `0.015`; a modern road tyre ~`0.01`). */
  coefficient?: number;
}

/** Spinning parts take part of every speed change: the car behaves heavier than its mass, most in low gears. */
export interface VehicleRotatingInertiaEffect {
  /** Engine, flywheel and clutch at the crank, kg·m² (0.1–0.2 for a road car); reflected through the gear in use. Gearbox only. */
  engine?: number;
  /** All wheels, tyres, hubs and brake rotors together, kg·m² (about 4 for a road car). Unlike the engine, they stay coupled under hard braking. */
  wheels?: number;
}

/** The driven axle's differential: how drive is shared between its left and right wheels. */
export type VehicleDifferentialEffect =
  /** Equal torque both sides: the unloaded inside wheel spins first and caps the axle at twice its grip. */
  | { kind: "open" }
  /** Torque may differ by up to `bias` times between sides (Torsen, clutch LSD). */
  | { kind: "limitedSlip"; bias: number }
  /**
   * Both wheels turn together: every bit of grip drives, but the axle fights the car's yaw (spool understeer).
   * `slipStiffness` is each tyre's longitudinal force per unit slip as a multiple of its load (default `20`).
   */
  | { kind: "locked"; slipStiffness?: number };

/** Brake hydraulics: pressure follows the pedal with a lag. */
export interface VehicleBrakeLagEffect {
  /** Time constant, s (0.03 road car). */
  seconds: number;
}

/** Caster self-alignment: the front wheels steer into a slide on their own. */
export interface VehicleSelfAlignEffect {
  /** Share of the car's sideslip the wheels steer into, `0..1` (`~0.3` a street car, `0.8+` catches slides for the player). */
  strength: number;
}

/** Speed-sensitive lock: full lock is cut back as speed rises so a full input at speed stays near the grip limit. */
export interface VehicleSpeedSensitiveSteeringEffect {
  /** Lock at and above `at`, rad. */
  angle: number;
  /** Speed where lock reaches `angle`, m/s. */
  at: number;
}

/** Anti-lock brakes: brake force held below the tyre's remaining grip so the front keeps steering. */
export interface VehicleAbsEffect {
  /** How firmly excess brake is removed, `0..1` (default `1`). */
  strength?: number;
  /** Share of the available grip ABS brakes up to (default `1 − 0.2·strength`; a modern system ~`0.97`). */
  holds?: number;
}

/** Traction control: drive force capped below the driven axle's remaining grip. */
export interface VehicleTractionControlEffect {
  /** `0..1` (default `1`). */
  strength?: number;
}

/** Stability (yaw) control: a corrective yaw torque once sideslip passes `maxSideslip`. */
export interface VehicleStabilityEffect {
  /** `0..1` (default `1`; real ESC is subtle at `~0.3`, an arcade car that can't spin sits near `1`). */
  strength?: number;
  /** Sideslip in rad allowed before it intervenes (default `0.2`, ≈11°). */
  maxSideslip?: number;
}

/** Anti-wheelie: drive capped below the acceleration that lifts the front (`g·b/h`); reports as `tractionLimited`. */
export interface VehicleAntiWheelieEffect {
  /** `0..1` (default `1`). */
  strength?: number;
}

/** Anti-stoppie: braking capped below the deceleration that lifts the rear (`g·a/h`); reports as `absActive`. */
export interface VehicleAntiStoppieEffect {
  /** `0..1` (default `1`). */
  strength?: number;
}

/**
 * Every physical effect and driver aid the car model can run, each its own term. An omitted effect is off: a game
 * composes the car it wants by listing effects and setting their numbers, so a drift car can drop `combinedSlip`, a
 * kart can ignore `aeroDrag`, and a sim car can add `tireRelaxation` and `complianceSteer`.
 */
export interface VehicleEffects {
  combinedSlip?: VehicleCombinedSlipEffect;
  wheelSlide?: VehicleWheelSlideEffect;
  longitudinalLoadTransfer?: VehicleLongitudinalLoadTransferEffect;
  lateralLoadTransfer?: VehicleLateralLoadTransferEffect;
  loadSensitivity?: VehicleLoadSensitivityEffect;
  tireRelaxation?: VehicleTireRelaxationEffect;
  camber?: VehicleCamberEffect;
  complianceSteer?: VehicleComplianceSteerEffect;
  rollSteer?: VehicleRollSteerEffect;
  aeroDrag?: VehicleAeroDragEffect;
  downforce?: VehicleDownforceEffect;
  rollingResistance?: VehicleRollingResistanceEffect;
  rotatingInertia?: VehicleRotatingInertiaEffect;
  differential?: VehicleDifferentialEffect;
  brakeLag?: VehicleBrakeLagEffect;
  selfAlign?: VehicleSelfAlignEffect;
  speedSensitiveSteering?: VehicleSpeedSensitiveSteeringEffect;
  abs?: VehicleAbsEffect;
  tractionControl?: VehicleTractionControlEffect;
  stability?: VehicleStabilityEffect;
  antiWheelie?: VehicleAntiWheelieEffect;
  antiStoppie?: VehicleAntiStoppieEffect;
}

/** The name of one {@link VehicleEffects} term. */
export type VehicleEffectName = keyof VehicleEffects;

/**
 * Four sprung corners. With this block the chassis heaves, pitches and rolls on real springs, axle loads come
 * from spring forces instead of a filtered estimate, slopes pull the car downhill, and the car can leave
 * the ground and land. Omit it for the flat-ground model.
 */
export interface VehicleSuspensionTuning {
  /** Spring rate per wheel, N/m (20 000 soft road car … 60 000 race car; monster trucks go lower with more travel). */
  springRate: number;
  /** Damper rate per wheel in compression, N·s/m (roughly 2·√(k·m/4)·0.3 for a comfortable car, higher for a racer). */
  damperRate: number;
  /** Damper rate per wheel in extension, N·s/m (default `1.5 · damperRate`); higher keeps a landing from bouncing. */
  reboundRate?: number;
  /** Compression available before the bump stop, m (0.08 race car … 0.6 monster truck). */
  travel: number;
  /** Centre-of-mass height above level ground at static rest, m. */
  rideHeight: number;
  /** Total anti-roll bar stiffness, N·m/rad, split between axles by `antiRollFront` (default `0`). */
  antiRoll?: number;
  /** Share of `antiRoll` on the front axle, `0..1` (default `0.5`). */
  antiRollFront?: number;
  /** Pitch inertia as a multiple of `m·a·b` (default `0.9`). */
  pitchInertiaIndex?: number;
}

/** Control of the body while airborne (needs `suspension`, the only way to leave the ground). */
export interface VehicleAirTuning {
  /** Angular acceleration at full input, rad/s², per axis. */
  pitchAccel: number;
  yawAccel: number;
  rollAccel: number;
  /** Angular damping while airborne, 1/s (default `1.5`); higher stops rotation when input is released. */
  damping?: number;
  /** Largest angular rate input can build, rad/s (default `5.5`). */
  maxRate?: number;
}

/**
 * Single-track lean for motorcycles, bicycles and scooters. Steer input asks for a lean angle; the front wheel
 * then takes whatever angle a balanced turn at that lean needs (curvature = g·tan(lean) / v²), with a brief
 * countersteer as the lean starts. Tire grip still limits the turn, so over-leaning on a low-grip surface slides.
 */
export interface VehicleLeanTuning {
  /** Largest lean the rider asks for at full steer, rad (0.7 ≈ 40° road bike … 0.95 ≈ 55° race bike). */
  maxLean: number;
  /** How fast the bike can change lean, rad/s (2 heavy tourer … 5 light sport bike). */
  leanRate: number;
  /** Seconds of opposite bar per rad/s of lean change — the countersteer that starts a lean (default `0.012`, about 3° of bar on a quick sport bike). */
  countersteer?: number;
  /** Below this speed the bar steers directly, like walking a bike (default `3` m/s). */
  directSteerBelow?: number;
}

/** Jumps from the ground and in the air. */
export interface VehicleJumpTuning {
  /** Upward velocity a jump adds, m/s. */
  speed: number;
  /** Jumps allowed per flight, counting the first from the ground (default `1`; `2` = double jump). */
  count?: number;
  /** Seconds after leaving the ground during which later jumps are allowed (default `Infinity`). */
  window?: number;
  /**
   * Downward pull on a hop without `suspension`, m/s² (default `9.81`). Without springs the car hops on a
   * flat air layer above the ground: a kart's short snappy hop wants more than real gravity.
   */
  gravity?: number;
}

/**
 * Tuning for {@link createVehicleDynamics}. Every number is a physical quantity in SI units (kg, m, N,
 * N·m, rad, s). The body, tyres, powertrain, brakes and rack are always there; every other physical effect
 * and aid is a separate term in `effects`, off unless listed.
 */
export interface VehicleDynamicsTuning {
  /** Total mass, kg. */
  massKg: number;
  /** Axle-to-axle distance, m. */
  wheelbase: number;
  /** Share of static weight on the front axle, `0..1` (0.6 front-engined FWD … 0.45 mid-engine). */
  frontWeight: number;
  /** Centre-of-mass height, m; sizes load transfer and body attitude. */
  comHeight: number;
  /** Track width, m. */
  trackWidth: number;
  /** Yaw inertia as a dynamic index `Iz / (m·a·b)` (default `1`; `<1` rotates eagerly, `>1` lazily). */
  yawInertiaIndex?: number;
  front: VehicleTireTuning;
  /** Rear tire; defaults to `front`. */
  rear?: VehicleTireTuning;
  /** Share of drive force to the front axle, `0..1` (`0` RWD, `1` FWD, `0.35` rear-biased AWD). */
  driveFront: number;
  powertrain: VehicleGearboxTuning | VehicleDirectDriveTuning;
  /** Peak service-brake force across all wheels, N. */
  brakeForce: number;
  /** Share of brake force on the front axle, `0..1` (default `0.65`). */
  brakeFront?: number;
  /** Rear lateral grip multiplier while the handbrake is fully on (default `0.35`). */
  handbrakeGrip?: number;
  steering: VehicleSteeringTuning;
  /** The physical effects and aids this car runs; each omitted term is off. */
  effects?: VehicleEffects;
  /**
   * Drive governor, m/s: drive force fades out over the last 0.5 m/s below it (arcade caps, electronic
   * limiters). Thrust, slopes and impulses can still carry the car past it. Omit to let power and drag decide.
   */
  speedLimit?: number;
  /** Reverse speed cap, m/s (default `8`). */
  reverseSpeed?: number;
  /** Body roll stiffness, N·m/rad, for the flat model's lean (default derived for ~3° at 1 g). */
  rollStiffness?: number;
  /** Body pitch stiffness, N·m/rad, for the flat model's dive and squat (default derived for ~2° at 1 g). */
  pitchStiffness?: number;
  /** Flat-model settle rate for load transfer and body attitude, 1/s (default `8`). */
  suspensionResponse?: number;
  /** Largest integration substep, s (default `1/240`); ticks are split so the result does not depend on frame rate. */
  maxSubstep?: number;
  /** Brake held near standstill drives in reverse (default `true`). Set `false` for a separate reverse action. */
  reverseOnBrake?: boolean;
  /** Sprung corners, slopes and air; omit for the flat-ground model. */
  suspension?: VehicleSuspensionTuning;
  /** Air control; needs `suspension`. Input comes from `modifiers.air`, else throttle−brake pitches and steer yaws. */
  air?: VehicleAirTuning;
  /** Enables {@link VehicleDynamics.jump}; needs `suspension`. */
  jump?: VehicleJumpTuning;
  /** Single-track lean (motorcycle); omit for a four-wheeled car. `trackWidth` then only sets the render width. */
  lean?: VehicleLeanTuning;
}

/**
 * The same tuning with some effects switched off, replaced or retuned: `false` removes a term, an object replaces it.
 * Pure, so a settings toggle or a pickup can `retune(withVehicleEffects(base, { aeroDrag: false }))` mid-drive.
 * @capability vehicle-effects switch a car's physical effects and aids off, swap or retune them one at a time
 */
export function withVehicleEffects(
  tuning: VehicleDynamicsTuning,
  changes: { [Name in VehicleEffectName]?: VehicleEffects[Name] | false },
): VehicleDynamicsTuning {
  const effects: VehicleEffects = { ...tuning.effects };
  for (const key of Object.keys(changes)) if (isEffectName(changes, key)) setEffect(effects, key, changes[key]);
  return { ...tuning, effects };
}

function isEffectName(changes: { [Name in VehicleEffectName]?: unknown }, key: string): key is VehicleEffectName {
  return Object.hasOwn(changes, key);
}

function setEffect<Name extends VehicleEffectName>(effects: VehicleEffects, name: Name, value: VehicleEffects[Name] | false | undefined): void {
  if (value === false) delete effects[name];
  else if (value !== undefined) effects[name] = value;
}

/** Air-control input, each `-1..1`: `pitch > 0` noses down, `yaw > 0` turns like `steer > 0`, `roll > 0` drops the left side. */
export interface VehicleAirInput {
  pitch: number;
  yaw: number;
  roll: number;
}

/** Per-tick overrides layered over tuning: boost, grip zones, damage. Each scale defaults to `1`. */
export interface VehicleDynamicsModifiers {
  driveScale?: number;
  brakeScale?: number;
  gripScale?: number;
  steerScale?: number;
  /** Scale `speedLimit` this tick (nitro, a slow zone, an off-road penalty); ignored without a `speedLimit`. */
  speedLimitScale?: number;
  /** Thrust along the heading that bypasses the tires, N — boost, a rocket, a tow. */
  thrust?: number;
  /** Air-control input this tick; omitted, throttle−brake pitches and steer yaws while airborne. */
  air?: VehicleAirInput;
}

/** World hooks for one vehicle instance. */
export interface VehicleDynamicsOptions {
  position?: readonly [number, number, number];
  heading?: number;
  /** Grip multiplier by world position (gravel, ice, wet paint); default `1`. */
  surfaceFriction?: (x: number, z: number) => number;
  /** Clamp a planar move; optional result `motion` separates permitted displacement from position recovery. Called once per physics substep. */
  clampMove?: VehicleMoveClamp;
  /**
   * World solids near the car, sampled once per tick (buildings, props, other cars). The car slides along
   * them instead of driving through, after any `clampMove`, and the hardest hit shows up as the step's
   * `impact`. Hand back an already-filtered nearby set; the call is per tick, not per substep.
   */
  obstacles?: () => readonly CollisionObstacle[];
  /** Body radius the `obstacles` footprints are inflated by, m (default `1.2`). */
  bodyRadius?: number;
  /** Extra velocity damping per second by world position (mud, sand, deep grass); default `0`. */
  dragAt?: (x: number, z: number) => number;
  /** Terrain height under a point; read per wheel when `suspension` is set (ramps, hills, ledges). Default flat at the spawn height. */
  groundHeight?: (x: number, z: number) => number;
}

/** Serializable integrator state: everything {@link VehicleDynamics.restore} needs to resume bit-for-bit. */
export interface VehicleDynamicsState {
  x: number;
  y: number;
  z: number;
  heading: number;
  vx: number;
  vz: number;
  yawRate: number;
  steerAngle: number;
  gearIndex: number;
  reversing: boolean;
  shiftRemaining: number;
  rpm: number;
  longitudinalAccel: number;
  lateralAccel: number;
  bodyPitch: number;
  bodyRoll: number;
  /** Vertical velocity of the chassis, m/s (suspension only). */
  vy: number;
  pitchRate: number;
  rollRate: number;
  /** Per-corner spring compression, m, in order front-left, front-right, rear-left, rear-right. */
  compression: [number, number, number, number];
  airborne: boolean;
  /** The lean the rider is asking for, rad, positive right; it sets the turn the bar steers for. */
  lean: number;
  /** The rider's bar correction on top of the balanced-turn angle, rad. */
  leanTrim: number;
  /** Jumps used since last on the ground. */
  jumpsUsed: number;
  /** Seconds since leaving the ground (`0` while grounded). */
  airTime: number;
  /** Height above the ground from a hop without `suspension`, m. */
  hopHeight: number;
  /** Relaxed slip angles the tyres carry, rad (`tireRelaxation`). */
  slipFront: number;
  slipRear: number;
  /** Last substep's axle lateral forces, N, for compliance steer. */
  forceFront: number;
  forceRear: number;
  /** Brake pressure share following the pedal (`brakeLag`). */
  brakeLevel: number;
}

/** Result of one {@link VehicleDynamics.tick}: pose plus the telemetry camera, audio, haptics and HUD read. */
export interface VehicleDynamicsStep {
  position: readonly [number, number, number];
  heading: number;
  /** Signed speed along the heading, m/s. */
  forwardSpeed: number;
  /** Lateral speed, m/s, positive toward the car's right. */
  lateralSpeed: number;
  yawRate: number;
  /** Front-wheel angle the rack asks for, rad; positive steers the heading down, like `AxisInput.steer`. */
  steerAngle: number;
  /** Front-wheel angle the wheels reach after compliance and roll steer, rad, same sign. */
  roadWheelAngle: number;
  /** Body sideslip β, rad: angle between heading and velocity. */
  sideslip: number;
  slipAngleFront: number;
  slipAngleRear: number;
  /** Share of each axle's friction budget in use, `0..1+`; `≥1` means that axle is sliding. Squeal, rumble and HUD key off it. */
  frontSaturation: number;
  rearSaturation: number;
  /** Lateral acceleration, m/s²; positive toward the car's right, the way `steer > 0` turns. */
  lateralAccel: number;
  longitudinalAccel: number;
  frontLoad: number;
  rearLoad: number;
  /** Surface multiplier sampled this tick. */
  surface: number;
  /** One-based forward gear; `-1` in reverse. */
  gear: number;
  rpm: number;
  /** Throttle `0..1` actually applied after traction control and the rev limiter — engine audio load. */
  engineLoad: number;
  wheelspin: boolean;
  wheelLock: boolean;
  absActive: boolean;
  tractionLimited: boolean;
  stabilityActive: boolean;
  bodyPitch: number;
  bodyRoll: number;
  /** Height of the car's base above the terrain under it, m; `0` on the ground and always `0` without `suspension`. */
  airOffset: number;
  /** No wheel touches the ground. */
  airborne: boolean;
  /** Vertical speed at the moment of touchdown this tick, m/s (`0` otherwise) — landing shake, thud, rumble. */
  landingSpeed: number;
  /** Per-corner tyre load, N (front-left, front-right, rear-left, rear-right): spring loads with `suspension`, else axle loads split by lateral transfer. */
  wheelLoads: readonly [number, number, number, number];
  /** Balance lean the bike actually shows, `atan(lateral g)`, rad, positive leaning right; `0` without a `lean` block. */
  lean: number;
  /** Acceleration has taken all the load off the front axle. */
  wheelie: boolean;
  /** Braking has taken all the load off the rear axle. */
  stoppie: boolean;
  /**
   * How hard the tires are sliding, `0..1`: sideways slide (`1` at about 30° of sideslip), tires pushed past
   * their peak (a plowing front), wheelspin and locked wheels. Squeal, tire smoke, skid marks and drift scoring key off it.
   */
  slip: number;
  /** The hardest hit on an `obstacles` solid this tick, or `null`. */
  impact: VehicleImpact | null;
}

/**
 * Force-based planar car: a two-axle ("bicycle") model where yaw comes from tire forces rather than being
 * commanded, so understeer, oversteer, lift-off rotation, trail-braking, power slides and handbrake turns
 * emerge from the numbers instead of from special cases. Deterministic for a given `dt` sequence; ticks are
 * split into fixed substeps. Pairs with `tickDrivableVehicle` for the entity pose and `measureHandling`
 * for asserting feel.
 */
export interface VehicleDynamics {
  tick(dt: number, input: AxisInput, modifiers?: VehicleDynamicsModifiers): VehicleDynamicsStep;
  pose(): { position: readonly [number, number, number]; heading: number };
  /** World velocity on the ground plane, `[vx, vz]`, m/s. */
  velocity(): readonly [number, number];
  /** Scale planar velocity and yaw rate (crash, boost pad). */
  scaleVelocity(factor: number): void;
  /** Add a world-space velocity change, m/s (impacts, knockback, a jump pad's `dvy` with `suspension`). */
  applyImpulse(dvx: number, dvz: number, dvy?: number): void;
  /**
   * Jump if the tuning's `jump` block allows it now: from the ground, or in the air while jumps remain inside
   * the window. Returns `false` and changes nothing otherwise, so a held key cannot stack jumps. `speed`
   * overrides the tuning's takeoff speed for this jump (a spring upgrade, a ramp). Without `suspension` the
   * car hops on a flat air layer, pulled down by `jump.gravity`.
   */
  jump(speed?: number): boolean;
  /** Add angular velocity to the body, rad/s: `pitch > 0` noses down, `yaw` in heading sense, `roll > 0` drops the left side (dodges, flips, hits). */
  applyAngularImpulse(pitch: number, yaw: number, roll: number): void;
  /** Swap tuning in place (upgrades, damage, a live tuning panel, an effect switched off) without losing momentum. */
  retune(next: VehicleDynamicsTuning): void;
  tuning(): VehicleDynamicsTuning;
  snapshot(): VehicleDynamicsState;
  restore(state: VehicleDynamicsState): void;
  resetTo(position: readonly [number, number, number], heading: number): void;
}

const GRAVITY = 9.81;
const AIR_DENSITY = 1.225;
/** Below this speed slip angles use it as the longitudinal reference, avoiding the atan singularity at rest. */
const SLIP_REFERENCE_SPEED = 2;
const DEFAULT_SUBSTEP = 1 / 240;
const NO_EFFECTS: VehicleEffects = {};

/** Simplified Pacejka `sin(C·atan(Bα − E·(Bα − atan Bα)))`; `peakX` is `Bα` at the peak. */
interface CurveShape {
  b: number;
  c: number;
  e: number;
  peakX: number;
}

function tireShape(tire: VehicleTireTuning): CurveShape {
  const slide = Math.min(0.999, Math.max(0.01, tire.slideGrip));
  const c = 1 + (2 / Math.PI) * Math.acos(slide);
  const peakSlip = Math.max(0.005, tire.peakSlipAngle);
  const crest = Math.tan(Math.PI / (2 * c));
  if (tire.corneringStiffness === undefined) return { b: crest / peakSlip, c, e: 0, peakX: crest };
  // Stiffness sets B; the curvature E then puts the peak back at `peakSlipAngle` (E < 1 keeps the curve single-peaked).
  const b = Math.max(1e-3, tire.corneringStiffness) / (Math.max(1e-3, tire.peakGrip) * c);
  const peakX = b * peakSlip;
  const e = Math.min(0.95, (peakX - crest) / Math.max(1e-6, peakX - Math.atan(peakX)));
  return { b, c, e, peakX };
}

function lateralCurve(b: number, shape: CurveShape, alpha: number): number {
  const x = b * alpha;
  return Math.sin(shape.c * Math.atan(x - shape.e * (x - Math.atan(x))));
}

/** One axle's two tyres at their own loads, after load sensitivity: their summed grip and the curve each runs. */
interface AxleGrip {
  /** Lateral and longitudinal force capacity, N. */
  capY: number;
  capX: number;
  /** Per-wheel lateral capacity (outside wheel first) and curve stiffness `B`. */
  capOuter: number;
  capInner: number;
  bOuter: number;
  bInner: number;
  /** Longitudinal capacity of the inside wheel, N (open and limited-slip differentials). */
  capXInner: number;
  capXOuter: number;
}

/**
 * Creates a {@link VehicleDynamics}.
 * @capability vehicle-dynamics force-based car handling built from separate effects — tyres, load transfer, drivetrain, aero, compliance, aids — each switchable and tuned with physical numbers
 */
export function createVehicleDynamics(
  initialTuning: VehicleDynamicsTuning,
  options: VehicleDynamicsOptions = {},
): VehicleDynamics {
  let tuning = initialTuning;
  let frontShape = tireShape(tuning.front);
  let rearShape = tireShape(tuning.rear ?? tuning.front);
  const surfaceFriction = options.surfaceFriction ?? (() => 1);
  const obstacleFrame = { list: [] as readonly CollisionObstacle[], dt: 0 };
  const obstacleClamp =
    options.obstacles === undefined
      ? null
      : createVehicleObstacleClamp({ obstacles: () => obstacleFrame.list, dt: () => obstacleFrame.dt, radius: options.bodyRadius ?? 1.2 });
  const userClamp = options.clampMove;
  const clampMove: VehicleMoveClamp | undefined =
    obstacleClamp === null
      ? userClamp
      : userClamp === undefined
        ? obstacleClamp.clampMove
        : (from, to) => obstacleClamp.clampMove(from, userClamp(from, to));
  const dragAt = options.dragAt;
  const spawnGround = options.position?.[1] ?? 0;
  const groundAt = options.groundHeight ?? (() => spawnGround);

  const state: VehicleDynamicsState = freshState(tuning, options.position ?? [0, 0, 0], options.heading ?? 0);
  settleOnGround();

  /** Spawn resting on the terrain: pitch, roll and height fitted to the ground under the four wheels. */
  function settleOnGround(): void {
    const suspension = tuning.suspension;
    if (suspension === undefined) return;
    const L = Math.max(0.5, tuning.wheelbase);
    const a = L * (1 - clamp01(tuning.frontWeight));
    const b = L - a;
    const half = Math.max(0.15, tuning.trackWidth / 2);
    const [fx, fz] = forwardOf(state.heading);
    const ground = (along: number, lat: number) => groundAt(state.x + fx * along - fz * lat, state.z + fz * along + fx * lat);
    const fl = ground(a, -half);
    const fr = ground(a, half);
    const rl = ground(-b, -half);
    const rr = ground(-b, half);
    const front = (fl + fr) / 2;
    const rear = (rl + rr) / 2;
    state.bodyPitch = -Math.atan2(front - rear, L);
    state.bodyRoll = Math.atan2((fr + rr) / 2 - (fl + rl) / 2, 2 * half);
    state.y = rear + (front - rear) * (b / L) + suspension.rideHeight;
    state.vy = 0;
    state.pitchRate = 0;
    state.rollRate = 0;
    state.compression = staticSags(tuning, suspension);
  }

  function baseHeight(): number {
    return tuning.suspension === undefined ? state.y : state.y - tuning.suspension.rideHeight;
  }

  function tick(dt: number, input: AxisInput, modifiers?: VehicleDynamicsModifiers): VehicleDynamicsStep {
    const maxSub = Math.max(1 / 2000, tuning.maxSubstep ?? DEFAULT_SUBSTEP);
    const steps = dt > 0 ? Math.max(1, Math.ceil(dt / maxSub - 1e-9)) : 0;
    const h = steps > 0 ? dt / steps : 0;
    const telemetry = emptyTelemetry();
    const surface = surfaceFriction(state.x, state.z);
    const drag = dragAt === undefined ? 0 : Math.max(0, dragAt(state.x, state.z));
    telemetry.airborne = state.airborne;
    if (obstacleClamp !== null && options.obstacles !== undefined) {
      obstacleFrame.list = options.obstacles();
      obstacleFrame.dt = h;
    }
    let impact: VehicleImpact | null = null;
    for (let i = 0; i < steps; i += 1) {
      substep(h, input, modifiers, surface, drag, telemetry);
      const hit = obstacleClamp?.takeImpact() ?? null;
      if (hit !== null && (impact === null || hit.closingSpeed > impact.closingSpeed)) impact = hit;
    }
    if (steps === 0) substep(0, input, modifiers, surface, drag, telemetry);
    const [fx, fz] = forwardOf(state.heading);
    const forwardSpeed = state.vx * fx + state.vz * fz;
    const lateralSpeed = -state.vx * fz + state.vz * fx;
    const planar = Math.hypot(forwardSpeed, lateralSpeed);
    const slide = planar < 2 ? 0 : Math.abs(lateralSpeed) / planar;
    const slip = state.airborne
      ? 0
      : clamp01(
          Math.max(
            slide * 2,
            planar > 3 ? (Math.max(telemetry.satFront, telemetry.satRear) - 1) * 0.5 : 0,
            telemetry.wheelspin && planar > 1 ? 0.6 : 0,
            telemetry.wheelLock && planar > 3 ? 0.8 : 0,
          ),
        );
    return {
      position: [state.x, baseHeight(), state.z],
      heading: state.heading,
      forwardSpeed,
      lateralSpeed,
      yawRate: state.yawRate,
      steerAngle: -state.steerAngle,
      roadWheelAngle: -telemetry.roadWheel,
      sideslip: telemetry.sideslip,
      slipAngleFront: telemetry.slipFront,
      slipAngleRear: telemetry.slipRear,
      frontSaturation: telemetry.satFront,
      rearSaturation: telemetry.satRear,
      lateralAccel: state.lateralAccel,
      longitudinalAccel: state.longitudinalAccel,
      frontLoad: telemetry.loadFront,
      rearLoad: telemetry.loadRear,
      surface,
      gear: state.reversing ? -1 : state.gearIndex + 1,
      rpm: state.rpm,
      engineLoad: telemetry.engineLoad,
      wheelspin: telemetry.wheelspin,
      wheelLock: telemetry.wheelLock,
      absActive: telemetry.abs,
      tractionLimited: telemetry.traction,
      stabilityActive: telemetry.stability,
      bodyPitch: state.bodyPitch,
      bodyRoll: state.bodyRoll,
      airOffset: tuning.suspension === undefined ? state.hopHeight : Math.max(0, baseHeight() - groundAt(state.x, state.z)),
      airborne: state.airborne,
      landingSpeed: telemetry.landingSpeed,
      wheelLoads: telemetry.wheelLoads,
      lean: tuning.lean === undefined ? 0 : balanceLean(state.lateralAccel),
      wheelie: telemetry.wheelie,
      stoppie: telemetry.stoppie,
      slip,
      impact,
    };
  }

  /** Both tyres of one axle at their own loads, after load sensitivity. */
  function axleGrip(
    tire: VehicleTireTuning,
    shape: CurveShape,
    load: number,
    transfer: number,
    gripScale: number,
    sensitivity: VehicleLoadSensitivityEffect | undefined,
  ): AxleGrip {
    const half = load / 2;
    const shift = Math.min(half, Math.max(0, transfer));
    const outer = half + shift;
    const inner = half - shift;
    const muY = tire.peakGrip * gripScale;
    const muX = (tire.longitudinalGrip ?? tire.peakGrip) * gripScale;
    if (sensitivity === undefined) {
      return { capY: muY * load, capX: muX * load, capOuter: muY * outer, capInner: muY * inner, bOuter: shape.b, bInner: shape.b, capXInner: muX * inner, capXOuter: muX * outer };
    }
    const nominal = Math.max(1, sensitivity.nominalLoad ?? half);
    const gripLoss = sensitivity.grip ?? 0.05;
    const stiffLoss = sensitivity.stiffness ?? 0;
    const gripAt = (fz: number) => Math.max(0.3, 1 - gripLoss * (fz / nominal - 1));
    const stiffAt = (fz: number) => Math.max(0.2, 1 - stiffLoss * (fz / nominal - 1));
    const gOuter = gripAt(outer);
    const gInner = gripAt(inner);
    const capOuter = muY * gOuter * outer;
    const capInner = muY * gInner * inner;
    const capXOuter = muX * gOuter * outer;
    const capXInner = muX * gInner * inner;
    return {
      capY: capOuter + capInner,
      capX: capXOuter + capXInner,
      capOuter,
      capInner,
      bOuter: shape.b * stiffAt(outer),
      bInner: shape.b * stiffAt(inner),
      capXInner,
      capXOuter,
    };
  }

  /** Lateral force of an axle's two tyres at slip `alpha`, as a share of the axle's lateral capacity (signed like the curve). */
  function axleCurve(grip: AxleGrip, shape: CurveShape, alpha: number): number {
    if (grip.capY <= 0) return 0;
    return (grip.capOuter * lateralCurve(grip.bOuter, shape, alpha) + grip.capInner * lateralCurve(grip.bInner, shape, alpha)) / grip.capY;
  }

  function substep(
    h: number,
    input: AxisInput,
    modifiers: VehicleDynamicsModifiers | undefined,
    surface: number,
    groundDrag: number,
    out: Telemetry,
  ): void {
    const t = tuning;
    const fx_ = t.effects ?? NO_EFFECTS;
    const m = t.massKg;
    const L = Math.max(0.5, t.wheelbase);
    const a = L * (1 - clamp01(t.frontWeight));
    const b = L - a;
    const iz = Math.max(1, (t.yawInertiaIndex ?? 1) * m * a * b);
    const heading = state.heading;
    const [fx, fz] = forwardOf(heading);
    const u = state.vx * fx + state.vz * fz;
    const v = -state.vx * fz + state.vz * fx;
    const r = state.yawRate;
    const speed = Math.hypot(state.vx, state.vz);

    const throttle = clamp01(input.throttle);
    const brakePedal = clamp01(input.brake);
    const handbrake = clamp01(input.handbrake);
    const steerInput = Math.max(-1, Math.min(1, input.steer)) * (modifiers?.steerScale ?? 1);

    if (t.reverseOnBrake ?? true) {
      if (!state.reversing && brakePedal > 0.1 && throttle <= 0.05 && u < 0.5) state.reversing = true;
      else if (state.reversing && (throttle > 0.1 || u > 0.5)) state.reversing = false;
    }
    const wantReverseDrive = state.reversing && brakePedal > 0;
    const brakeLag = fx_.brakeLag;
    if (brakeLag === undefined || h <= 0) state.brakeLevel = brakePedal;
    else state.brakeLevel += (brakePedal - state.brakeLevel) * (1 - Math.exp(-h / Math.max(1e-3, brakeLag.seconds)));
    const brakeInput = brakeLag === undefined ? brakePedal : state.brakeLevel;

    // Rack: requested angle is in "heading-positive" sign, the opposite of AxisInput.steer.
    const steering = t.steering;
    const speedLock = fx_.speedSensitiveSteering;
    const lockBlend = speedLock === undefined ? 0 : Math.min(1, Math.abs(u) / Math.max(0.1, speedLock.at));
    const lock = speedLock === undefined ? steering.maxAngle : steering.maxAngle + (speedLock.angle - steering.maxAngle) * lockBlend;
    const sideslipNow = Math.abs(u) > 1 ? Math.atan2(v, Math.abs(u)) : 0;
    // Caster: the wheels trail the velocity, so at `selfAlign` they steer into a slide by that share of β.
    const align = (fx_.selfAlign?.strength ?? 0) * -sideslipNow * Math.sign(u || 1);
    let target = Math.max(-steering.maxAngle, Math.min(steering.maxAngle, -steerInput * lock + align));
    const leanTuning = t.lean;
    if (leanTuning !== undefined) {
      // A rider cannot hold more lean than the tires can balance: tan(lean) is the lateral g it needs.
      const gripLean = Math.atan(t.front.peakGrip * surface * (modifiers?.gripScale ?? 1));
      const wanted = steerInput * Math.min(leanTuning.maxLean, gripLean);
      const leanStep = Math.max(0, leanTuning.leanRate) * h;
      const leanChange = Math.max(-leanStep, Math.min(leanStep, wanted - state.lean));
      state.lean += leanChange;
      const speed = Math.abs(u);
      const direct = leanTuning.directSteerBelow ?? 3;
      // Balanced turn: the lean sets the yaw rate the bike should hold (g·tan(lean)/v). The bar is that turn's
      // geometric angle plus a trim the rider feeds back from the yaw error, which covers the tire slip.
      const wantedYaw = (-GRAVITY * Math.tan(state.lean)) / Math.max(speed, 1) * Math.sign(u || 1);
      if (speed >= direct) state.leanTrim += (wantedYaw - r) * 3 * h;
      else state.leanTrim = 0;
      const trimLimit = Math.min(steering.maxAngle, t.front.peakSlipAngle * 1.5);
      state.leanTrim = Math.max(-trimLimit, Math.min(trimLimit, state.leanTrim));
      const geometric = Math.atan((L * wantedYaw) / Math.max(speed, 1));
      const counter = h > 0 ? ((leanTuning.countersteer ?? 0.012) * leanChange) / h : 0;
      const blend = Math.min(1, speed / Math.max(0.1, direct));
      target = Math.max(-steering.maxAngle, Math.min(steering.maxAngle, (geometric + state.leanTrim + counter) * blend + -steerInput * steering.maxAngle * (1 - blend) + align));
    }
    const toward = target - state.steerAngle;
    const returning = Math.sign(toward) !== Math.sign(state.steerAngle) && state.steerAngle !== 0;
    const rate = returning ? (steering.returnRate ?? steering.rate) : steering.rate;
    const maxMove = Math.max(0, rate) * h;
    state.steerAngle += Math.max(-maxMove, Math.min(maxMove, toward));
    // Compliance and roll steer move the wheels away from the rack: each steers away from the axle's own force.
    const compliance = fx_.complianceSteer;
    const rollSteer = fx_.rollSteer;
    const cornerSign = Math.sign(state.lateralAccel);
    const rollMagnitude = Math.abs(state.bodyRoll);
    const frontGive = (compliance?.front ?? 0) * state.forceFront + (rollSteer?.front ?? 0) * rollMagnitude * cornerSign;
    const rearGive = (compliance?.rear ?? 0) * state.forceRear + (rollSteer?.rear ?? 0) * rollMagnitude * cornerSign;
    const delta = state.steerAngle + frontGive;
    const deltaRear = rearGive;
    out.roadWheel = delta;

    const downforceEffect = fx_.downforce;
    const q = 0.5 * AIR_DENSITY * u * u;
    const downforce = q * (downforceEffect?.area ?? 0);
    const downFront = downforceEffect?.frontShare ?? 0.45;
    const weight = m * GRAVITY;
    const longTransfer = fx_.longitudinalLoadTransfer;
    const latTransfer = fx_.lateralLoadTransfer;
    const rsf = latTransfer?.frontShare ?? 0.5;
    const suspension = t.suspension;
    let loadFront: number;
    let loadRear: number;
    let transferFront: number;
    let transferRear: number;
    let grounded = true;
    let slopeLong = 0;
    let slopeLat = 0;
    if (suspension === undefined) {
      if (state.hopHeight > 0 || state.vy > 0) {
        // A hop without springs: a flat air layer over the ground, with no tire contact until it lands.
        state.vy -= (t.jump?.gravity ?? GRAVITY) * h;
        state.hopHeight += state.vy * h;
        state.airTime += h;
        if (state.hopHeight <= 0) {
          out.landingSpeed = Math.max(out.landingSpeed, -state.vy);
          state.hopHeight = 0;
          state.vy = 0;
          state.jumpsUsed = 0;
          state.airTime = 0;
        }
      }
      grounded = state.hopHeight <= 0;
      state.airborne = !grounded;
      const transferLong = longTransfer === undefined ? 0 : ((longTransfer.share ?? 1) * m * state.longitudinalAccel * t.comHeight) / L;
      const rawFront = weight * (b / L) - transferLong + downforce * downFront;
      const rawRear = weight * (a / L) + transferLong + downforce * (1 - downFront);
      // Pitch-over is geometry, not a tyre effect: report it even when the tyres ignore longitudinal transfer.
      const pitchOver = (m * state.longitudinalAccel * t.comHeight) / L;
      if (weight * (b / L) - pitchOver + downforce * downFront <= 0) out.wheelie = true;
      if (weight * (a / L) + pitchOver + downforce * (1 - downFront) <= 0) out.stoppie = true;
      loadFront = grounded ? Math.max(0, rawFront) : 0;
      loadRear = grounded ? Math.max(0, rawRear) : 0;
      // A single-track vehicle leans instead of shifting load across an axle.
      const transferLat =
        t.lean !== undefined || latTransfer === undefined ? 0 : (m * Math.abs(state.lateralAccel) * t.comHeight) / Math.max(0.3, t.trackWidth);
      transferFront = transferLat * rsf;
      transferRear = transferLat * (1 - rsf);
      const side = state.lateralAccel >= 0 ? 1 : -1;
      out.wheelLoads = [
        Math.max(0, loadFront / 2 + side * transferFront),
        Math.max(0, loadFront / 2 - side * transferFront),
        Math.max(0, loadRear / 2 + side * transferRear),
        Math.max(0, loadRear / 2 - side * transferRear),
      ];
    } else {
      const wheel = springForces(suspension, a, b, h);
      loadFront = wheel[0] + wheel[1];
      loadRear = wheel[2] + wheel[3];
      transferFront = Math.abs(wheel[0] - wheel[1]) / 2;
      transferRear = Math.abs(wheel[2] - wheel[3]) / 2;
      grounded = loadFront + loadRear > 0;
      out.wheelLoads = [wheel[0], wheel[1], wheel[2], wheel[3]];
      if (grounded) {
        // Gravity along the terrain: the tires hold the car to the surface, so the downhill share acts in-plane.
        const e = 0.5;
        const gx = (groundAt(state.x + e, state.z) - groundAt(state.x - e, state.z)) / (2 * e);
        const gz = (groundAt(state.x, state.z + e) - groundAt(state.x, state.z - e)) / (2 * e);
        const norm = Math.sqrt(1 + gx * gx + gz * gz);
        const worldX = (-weight * gx) / norm;
        const worldZ = (-weight * gz) / norm;
        slopeLong = worldX * fx + worldZ * fz;
        slopeLat = -worldX * fz + worldZ * fx;
      }
    }
    const gripScale = surface * (modifiers?.gripScale ?? 1);
    const rearTire = t.rear ?? t.front;
    const sensitivity = fx_.loadSensitivity;
    const gripFront = axleGrip(t.front, frontShape, loadFront, transferFront, gripScale, sensitivity);
    const gripRear = axleGrip(rearTire, rearShape, loadRear, transferRear, gripScale, sensitivity);
    const hbGrip = 1 - handbrake * (1 - (t.handbrakeGrip ?? 0.35));

    // Axle-point velocities in the car frame: front sits `a` ahead, rear `b` behind.
    const uF = u;
    const vF = v - a * r;
    const vR = v + b * r;
    const cosD = Math.cos(delta);
    const sinD = Math.sin(delta);
    const wheelLong = uF * cosD - vF * sinD;
    const wheelLat = uF * sinD + vF * cosD;
    const cosR = Math.cos(deltaRear);
    const sinR = Math.sin(deltaRear);
    const rearLong = u * cosR - vR * sinR;
    const rearLat = u * sinR + vR * cosR;
    const steadyFront = Math.atan2(wheelLat, Math.max(SLIP_REFERENCE_SPEED, Math.abs(wheelLong)));
    const steadyRear = Math.atan2(rearLat, Math.max(SLIP_REFERENCE_SPEED, Math.abs(rearLong)));
    const relaxation = fx_.tireRelaxation;
    let slipFront = steadyFront;
    let slipRear = steadyRear;
    if (relaxation !== undefined && h > 0) {
      // The contact patch catches up with the wheel over the relaxation length: a first-order lag in distance.
      const sigma = Math.max(0.01, relaxation.length);
      const travel = Math.max(SLIP_REFERENCE_SPEED, Math.abs(u)) * h;
      const follow = 1 - Math.exp(-travel / sigma);
      state.slipFront += (steadyFront - state.slipFront) * follow;
      state.slipRear += (steadyRear - state.slipRear) * follow;
      slipFront = state.slipFront;
      slipRear = state.slipRear;
    } else {
      state.slipFront = steadyFront;
      state.slipRear = steadyRear;
    }

    let drive = driveForce(throttle, wantReverseDrive ? brakeInput : 0, u, h, out) * (modifiers?.driveScale ?? 1);
    // A governor cuts drive like a limiter: forcing speed down after the fact would leave full drive
    // consuming the tire budget, and a car pinned at its cap could not turn.
    if (t.speedLimit !== undefined && drive > 0) drive *= clamp01((t.speedLimit * (modifiers?.speedLimitScale ?? 1) - u) / 0.5);
    let brakeTotal = 0;
    if (!wantReverseDrive && brakeInput > 0 && Math.abs(u) > 0.05) brakeTotal = brakeInput * t.brakeForce * (modifiers?.brakeScale ?? 1);
    const brakeFrontShare = t.brakeFront ?? 0.65;
    const driveFrontShare = clamp01(t.driveFront);

    let longFront = drive * driveFrontShare;
    let longRear = drive * (1 - driveFrontShare);
    let brakeF = brakeTotal * brakeFrontShare;
    let brakeR = brakeTotal * (1 - brakeFrontShare);
    // ABS, TC and the differential act on combined slip like the real systems: the longitudinal limit is what the
    // friction ellipse leaves after the cornering force the axle is already asking for.
    const combined = fx_.combinedSlip;
    const exponent = Math.max(1, combined?.exponent ?? 2);
    const frontLatUse = Math.min(1, Math.abs(axleCurve(gripFront, frontShape, slipFront)));
    const rearLatUse = Math.min(1, Math.abs(axleCurve(gripRear, rearShape, slipRear)) * hbGrip);
    const room = (latUse: number) => (combined === undefined ? 1 : Math.pow(Math.max(0, 1 - Math.pow(latUse, exponent)), 1 / exponent));
    const longRoomFront = gripFront.capX * room(frontLatUse);
    const longRoomRear = gripRear.capX * room(rearLatUse);
    const abs = fx_.abs;
    if (abs !== undefined) {
      const strength = abs.strength ?? 1;
      const holds = abs.holds ?? 1 - 0.2 * strength;
      const limitFront = longRoomFront * holds;
      const limitRear = longRoomRear * holds;
      if (brakeF > limitFront) {
        brakeF = limitFront + (brakeF - limitFront) * (1 - strength);
        out.abs = true;
      }
      if (brakeR > limitRear) {
        brakeR = limitRear + (brakeR - limitRear) * (1 - strength);
        out.abs = true;
      }
      // Engine-drag control: engine braking is trimmed to what the brakes leave, so it cannot lock the driven wheels.
      const moving = Math.sign(u) || 1;
      const dragFront = Math.max(0, -moving * longFront);
      const dragRear = Math.max(0, -moving * longRear);
      const roomFront = Math.max(0, longRoomFront - brakeF);
      const roomRear = Math.max(0, longRoomRear - brakeR);
      if (dragFront > roomFront) longFront = -moving * (roomFront + (dragFront - roomFront) * (1 - strength));
      if (dragRear > roomRear) longRear = -moving * (roomRear + (dragRear - roomRear) * (1 - strength));
    }
    const differential = fx_.differential;
    if (differential !== undefined && differential.kind !== "locked") {
      // The inside wheel's grip caps what the axle can put down once it starts to spin.
      const bias = differential.kind === "open" ? 1 : Math.max(1, differential.bias);
      const capFrontDiff = gripFront.capXInner * room(frontLatUse) * (1 + bias);
      const capRearDiff = gripRear.capXInner * room(rearLatUse) * (1 + bias);
      if (longFront > capFrontDiff && longFront > 0) {
        longFront = Math.min(longFront, capFrontDiff);
        out.wheelspin = true;
      }
      if (longRear > capRearDiff && longRear > 0) {
        longRear = Math.min(longRear, capRearDiff);
        out.wheelspin = true;
      }
    }
    const tc = fx_.tractionControl;
    if (tc !== undefined) {
      const strength = tc.strength ?? 1;
      const limitFront = longRoomFront * (1 - 0.35 * strength);
      const limitRear = longRoomRear * (1 - 0.35 * strength);
      if (Math.abs(longFront) > limitFront) {
        longFront = Math.sign(longFront) * (limitFront + (Math.abs(longFront) - limitFront) * (1 - strength));
        out.traction = true;
      }
      if (Math.abs(longRear) > limitRear) {
        longRear = Math.sign(longRear) * (limitRear + (Math.abs(longRear) - limitRear) * (1 - strength));
        out.traction = true;
      }
    }
    // Pitch-over limits: the front lifts once m·ax·h exceeds its static moment (weight·b plus aero), the rear
    // under braking once it exceeds weight·a. Springs overshoot that static limit as the body pitches, so a
    // sprung vehicle also backs off in proportion to how light the axle already is.
    const antiWheelie = fx_.antiWheelie;
    const driveSum = longFront + longRear;
    if (antiWheelie !== undefined && driveSum > 0 && u >= 0) {
      const strength = antiWheelie.strength ?? 1;
      const lightFront = suspension === undefined ? 1 : clamp01(loadFront / (0.3 * weight * (b / L)));
      const liftDrive = ((weight * b + downforce * downFront * L) / t.comHeight) * (1 - 0.15 * strength) * lightFront;
      if (driveSum > liftDrive) {
        const scale = (liftDrive + (driveSum - liftDrive) * (1 - strength)) / driveSum;
        longFront *= scale;
        longRear *= scale;
        out.traction = true;
      }
    }
    const antiStoppie = fx_.antiStoppie;
    const brakeSum = brakeF + brakeR;
    if (antiStoppie !== undefined && brakeSum > 0) {
      const strength = antiStoppie.strength ?? 1;
      const lightRear = suspension === undefined ? 1 : clamp01(loadRear / (0.3 * weight * (a / L)));
      const liftBrake = ((weight * a + downforce * (1 - downFront) * L) / t.comHeight) * (1 - 0.15 * strength) * lightRear;
      if (brakeSum > liftBrake) {
        const scale = (liftBrake + (brakeSum - liftBrake) * (1 - strength)) / brakeSum;
        brakeF *= scale;
        brakeR *= scale;
        out.abs = true;
      }
    }
    const direction = Math.sign(u) || 1;
    // A locked rear (handbrake) drags at sliding friction and gives up most of its cornering force.
    const hbDrag = handbrake * gripRear.capX * rearTire.slideGrip * 0.9;
    let fxFront = longFront - direction * brakeF;
    let fxRear = longRear - direction * (brakeR + hbDrag);

    const slideEffect = fx_.wheelSlide;
    const front = combine(fxFront, gripFront, frontShape, slipFront, 1, combined, exponent, slideEffect?.slideGrip ?? t.front.slideGrip, slideEffect !== undefined, out, "front", Math.abs(longFront) > 0, axleCurve);
    const rear = combine(fxRear, gripRear, rearShape, slipRear, hbGrip, combined, exponent, slideEffect?.slideGrip ?? rearTire.slideGrip, slideEffect !== undefined, out, "rear", Math.abs(longRear) > 0, axleCurve);
    fxFront = front.fx;
    fxRear = rear.fx;
    let fyFront = front.fy;
    let fyRear = rear.fy;

    const camber = fx_.camber;
    if (camber !== undefined && t.lean === undefined) {
      // Outside wheel: static negative camber leans it into the turn; roll leans both wheels out of it.
      const thrust = camber.thrust ?? 0.8;
      const lean = (camber.rollFollow ?? 0.7) * rollMagnitude;
      const stat = -(camber.static ?? 0);
      const toward = Math.sign(fyFront || fyRear);
      const camberFront = thrust * (gripFront.capOuter / Math.max(1e-6, t.front.peakGrip * gripScale) * (stat - lean) + gripFront.capInner / Math.max(1e-6, t.front.peakGrip * gripScale) * (-stat - lean));
      const camberRear = thrust * (gripRear.capOuter / Math.max(1e-6, rearTire.peakGrip * gripScale) * (stat - lean) + gripRear.capInner / Math.max(1e-6, rearTire.peakGrip * gripScale) * (-stat - lean));
      fyFront += toward * camberFront * (1 - Math.min(1, Math.abs(fxFront) / Math.max(1, gripFront.capX)));
      fyRear += toward * camberRear * (1 - Math.min(1, Math.abs(fxRear) / Math.max(1, gripRear.capX)));
    }

    // Cap lateral forces so one substep cannot push an axle's slip velocity past zero at low speed.
    if (h > 0) {
      const mFront = m * (b / L);
      const mRear = m * (a / L);
      const maxFront = (mFront * Math.abs(wheelLat)) / h;
      const maxRear = (mRear * Math.abs(rearLat)) / h;
      if (Math.abs(fyFront) > maxFront) fyFront = Math.sign(fyFront) * maxFront;
      if (Math.abs(fyRear) > maxRear) fyRear = Math.sign(fyRear) * maxRear;
    }
    state.forceFront = fyFront;
    state.forceRear = fyRear;

    // Car-frame forces (x forward, y along the lateral axis used by `v`).
    const frontLat = fyFront * cosD - fxFront * sinD;
    const rearLatForce = fyRear * cosR - fxRear * sinR;
    let forceLong = fxFront * cosD + fyFront * sinD + fxRear * cosR + fyRear * sinR + (modifiers?.thrust ?? 0) + slopeLong;
    const forceLat = frontLat + rearLatForce + slopeLat;
    const drag = q * (fx_.aeroDrag?.area ?? 0) * Math.sign(u);
    const rollingLoad = suspension === undefined ? (grounded ? weight : 0) : loadFront + loadRear;
    const rollingCoefficient = fx_.rollingResistance === undefined ? 0 : (fx_.rollingResistance.coefficient ?? 0.015);
    const rolling = rollingCoefficient * rollingLoad * Math.sign(u) * Math.min(1, Math.abs(u) / 0.5);
    forceLong -= drag + rolling;
    // Lateral force ahead of the CG yaws the heading negative in this frame, force behind it positive.
    let yawMoment = -a * frontLat + b * rearLatForce;

    if (differential?.kind === "locked" && grounded && Math.abs(u) > 1) {
      // A spool drags the inside and outside wheels at one speed: their slip difference is a yaw-resisting moment.
      const stiffness = differential.slipStiffness ?? 20;
      const half = Math.max(0.15, t.trackWidth / 2);
      const spool = (axleLoad: number, capX: number, share: number) => {
        if (share <= 0) return 0;
        const force = Math.min(capX / 2, stiffness * (axleLoad / 2) * ((half * Math.abs(r)) / Math.abs(u)));
        return force * 2 * half;
      };
      const moment = spool(loadFront, gripFront.capX, driveFrontShare) + spool(loadRear, gripRear.capX, 1 - driveFrontShare);
      yawMoment -= Math.sign(r) * moment;
    }

    const stabilityEffect = fx_.stability;
    if (stabilityEffect !== undefined && grounded && Math.abs(u) > 3) {
      const stab = stabilityEffect.strength ?? 1;
      const allowed = stabilityEffect.maxSideslip ?? 0.2;
      const excess = Math.abs(sideslipNow) - allowed;
      if (excess > 0 && stab > 0) {
        yawMoment += -Math.sign(sideslipNow) * Math.sign(u) * stab * excess * 4 * iz * Math.max(1, Math.abs(r) + 1);
        yawMoment += -stab * r * iz * 0.6 * Math.min(1, excess * 4);
        out.stability = true;
      }
    }

    const longMass = m + reflectedMass(fx_.rotatingInertia, grounded, brakeInput);
    let du = forceLong / longMass - r * v;
    const dv = forceLat / m + r * u;
    // Brakes and rolling resistance cannot reverse the car inside one substep (a slope can).
    if (h > 0 && throttle <= 0 && !wantReverseDrive && (modifiers?.thrust ?? 0) === 0 && slopeLong === 0) {
      const next = u + du * h;
      if (Math.sign(next) !== Math.sign(u) && u !== 0) du = -u / h;
    }
    const dr = yawMoment / iz;

    let nu = u + du * h;
    let nv = v + dv * h;
    let nr = r + dr * h;
    if (groundDrag > 0 && h > 0) {
      const keep = Math.max(0, 1 - groundDrag * h);
      nu *= keep;
      nv *= keep;
    }
    const slopePull = Math.hypot(slopeLong, slopeLat);
    // A parked car's static friction holds it on a gentle slope (3% of its weight).
    const holds = slopePull <= 0.03 * weight || brakeInput > 0 || handbrake > 0;
    if (h > 0 && grounded && holds && speed < 0.3 && throttle <= 0 && brakeInput <= 0 && Math.abs(modifiers?.thrust ?? 0) === 0) {
      nu *= Math.max(0, 1 - 6 * h);
      nv *= Math.max(0, 1 - 6 * h);
      nr *= Math.max(0, 1 - 6 * h);
      // Rest snap: a parked car settles to exactly zero instead of creeping on an endless decay.
      if (Math.hypot(nu, nv) < 0.02 && Math.abs(nr) < 0.02) {
        nu = 0;
        nv = 0;
        nr = 0;
      }
    }
    // Near rest, held brakes grip statically: they cancel motion up to what the braked axles can hold,
    // so a car parks on a slope instead of creeping at whatever speed a damped slide settles to.
    if (h > 0 && grounded && Math.abs(nu) < 0.5 && !wantReverseDrive && throttle <= 0) {
      const holdForce = handbrake * gripRear.capX * rearTire.slideGrip + brakeInput * Math.min(t.brakeForce, gripFront.capX + gripRear.capX);
      const hold = (holdForce / m) * h;
      if (hold > 0) nu = Math.abs(nu) <= hold ? 0 : nu - Math.sign(nu) * hold;
    }
    const reverseCap = t.reverseSpeed ?? 8;
    if (nu < -reverseCap) nu = -reverseCap;

    state.heading = heading + nr * h;
    const [nfx, nfz] = forwardOf(state.heading);
    let nvx = nfx * nu - nfz * nv;
    let nvz = nfz * nu + nfx * nv;
    const toX = state.x + nvx * h;
    const toZ = state.z + nvz * h;
    if (clampMove !== undefined && h > 0) {
      const allowed = clampMove([state.x, state.z], [toX, toZ]);
      const wanted = Math.hypot(nvx, nvz);
      nvx = (allowed.motion?.[0] ?? allowed[0] - state.x) / h;
      nvz = (allowed.motion?.[1] ?? allowed[1] - state.z) / h;
      // A clamp that pushes the car back onto the road moves it, but never hands it speed it did not have.
      const kept = Math.hypot(nvx, nvz);
      if (kept > wanted && kept > 0) {
        nvx *= wanted / kept;
        nvz *= wanted / kept;
      }
      state.x = allowed[0];
      state.z = allowed[1];
    } else {
      state.x = toX;
      state.z = toZ;
    }
    state.vx = nvx;
    state.vz = nvz;
    state.yawRate = nr;

    const response = suspension === undefined ? 1 - Math.exp(-(t.suspensionResponse ?? 8) * h) : 1;
    const accelLong = h > 0 ? du + r * v : 0;
    const accelLat = h > 0 ? dv - r * u : 0;
    state.longitudinalAccel += (accelLong - state.longitudinalAccel) * response;
    // The rider's lean is the displayed roll, so it keeps the roll lag springs would otherwise supply.
    const responseLat = t.lean !== undefined ? 1 - Math.exp(-(t.suspensionResponse ?? 8) * h) : response;
    state.lateralAccel += (accelLat - state.lateralAccel) * responseLat;
    if (suspension === undefined) {
      const rollK = t.rollStiffness ?? (m * GRAVITY * t.comHeight) / 0.05;
      const pitchK = t.pitchStiffness ?? (m * GRAVITY * t.comHeight) / 0.035;
      state.bodyRoll = t.lean !== undefined ? -balanceLean(state.lateralAccel) : (m * state.lateralAccel * t.comHeight) / rollK;
      state.bodyPitch = (-m * state.longitudinalAccel * t.comHeight) / pitchK;
    } else {
      if (!grounded && t.air !== undefined) steerInAir(t.air, input, modifiers?.air, h);
      integrateBody(suspension, a, b, h, downforce, grounded, out);
    }

    out.sideslip = Math.abs(nu) > 1 ? Math.atan2(nv, Math.abs(nu)) : 0;
    out.slipFront = slipFront;
    out.slipRear = slipRear;
    out.loadFront = loadFront;
    out.loadRear = loadRear;
  }

  /** Mass the spinning parts add to a speed change: `(I_wheels + I_engine·G²·η) / r²`, the engine only while coupled. */
  function reflectedMass(inertia: VehicleRotatingInertiaEffect | undefined, grounded: boolean, brakeInput: number): number {
    if (inertia === undefined || !grounded) return 0;
    const pt = tuning.powertrain;
    const radius = pt.kind === "gearbox" ? Math.max(0.05, pt.wheelRadius) : 0.33;
    let reflected = Math.max(0, inertia.wheels ?? 0);
    // The driver declutches on a hard stop, so the engine stops slowing with the wheels.
    if (pt.kind === "gearbox" && state.shiftRemaining <= 0 && brakeInput < 0.5) {
      const ratio = (state.reversing ? pt.reverseGear : (pt.gears[state.gearIndex] ?? 1)) * pt.finalDrive;
      reflected += Math.max(0, inertia.engine ?? 0) * ratio * ratio * (pt.efficiency ?? 0.85);
    }
    return reflected / (radius * radius);
  }

  const corner: Corners = [0, 0, 0, 0];

  /** Spring + damper + anti-roll force at each corner from the current body pose; updates stored compression. */
  function springForces(suspension: VehicleSuspensionTuning, a: number, b: number, h: number): Corners {
    const t = tuning;
    const half = Math.max(0.15, t.trackWidth / 2);
    const [fx, fz] = forwardOf(state.heading);
    const sags = staticSags(t, suspension);
    // A leaning single-track vehicle rolls about its tire contacts, so its lean never compresses one side's springs.
    const roll = t.lean !== undefined ? 0 : state.bodyRoll;
    for (const i of CORNERS) {
      const along = i < 2 ? a : -b;
      const lat = i % 2 === 0 ? -half : half;
      const px = state.x + fx * along - fz * lat;
      const pz = state.z + fz * along + fx * lat;
      const attach = state.y - Math.sin(state.bodyPitch) * along + Math.sin(roll) * lat;
      const c = groundAt(px, pz) + suspension.rideHeight + sags[i] - attach;
      const rate = h > 0 ? (c - state.compression[i]) / h : 0;
      state.compression[i] = c;
      let force = 0;
      if (c > 0) {
        const damping = rate >= 0 ? suspension.damperRate : (suspension.reboundRate ?? suspension.damperRate * 1.5);
        force = suspension.springRate * c + damping * rate;
        // The bump stop is stiff and lossy: it stops the travel without handing the landing back as a bounce.
        if (c > suspension.travel) force += suspension.springRate * 20 * (c - suspension.travel) + Math.max(0, rate) * suspension.damperRate * 6;
      }
      corner[i] = Math.max(0, force);
    }
    const antiRoll = t.lean !== undefined ? 0 : (suspension.antiRoll ?? 0);
    if (antiRoll > 0) {
      const frontShare = suspension.antiRollFront ?? 0.5;
      for (const [left, right] of AXLES) {
        if (corner[left] <= 0 || corner[right] <= 0) continue;
        const share = left === 0 ? frontShare : 1 - frontShare;
        const shift = (antiRoll * share * state.bodyRoll) / (2 * half);
        corner[left] = Math.max(0, corner[left] + shift);
        corner[right] = Math.max(0, corner[right] - shift);
      }
    }
    return corner;
  }

  function steerInAir(air: VehicleAirTuning, input: AxisInput, explicit: VehicleAirInput | undefined, h: number): void {
    const pitch = clamp(explicit?.pitch ?? clamp01(input.throttle) - clamp01(input.brake), -1, 1);
    const yaw = clamp(explicit?.yaw ?? input.steer, -1, 1);
    const roll = clamp(explicit?.roll ?? 0, -1, 1);
    const damping = air.damping ?? 1.5;
    const maxRate = air.maxRate ?? 5.5;
    state.pitchRate = driveRate(state.pitchRate, pitch * air.pitchAccel, damping, maxRate, h);
    state.yawRate = driveRate(state.yawRate, -yaw * air.yawAccel, damping, maxRate, h);
    state.rollRate = driveRate(state.rollRate, roll * air.rollAccel, damping, maxRate, h);
  }

  /** Heave, pitch and roll from the corner forces found this substep plus the tires' inertial moments. */
  function integrateBody(
    suspension: VehicleSuspensionTuning,
    a: number,
    b: number,
    h: number,
    downforce: number,
    grounded: boolean,
    out: Telemetry,
  ): void {
    const t = tuning;
    const m = t.massKg;
    const half = Math.max(0.15, t.trackWidth / 2);
    const effects = t.effects ?? NO_EFFECTS;
    let lift = 0;
    let pitchMoment = 0;
    let rollMoment = 0;
    for (const i of CORNERS) {
      const along = i < 2 ? a : -b;
      const lat = i % 2 === 0 ? -half : half;
      lift += corner[i];
      pitchMoment -= corner[i] * along;
      rollMoment += corner[i] * lat;
    }
    if (grounded) {
      // The tyres' forces act at the ground, below the centre of mass: those moments are the load transfer.
      if (effects.longitudinalLoadTransfer !== undefined) pitchMoment -= (effects.longitudinalLoadTransfer.share ?? 1) * m * state.longitudinalAccel * t.comHeight;
      if (effects.lateralLoadTransfer !== undefined) rollMoment += m * state.lateralAccel * t.comHeight;
    }
    const pitchInertia = Math.max(1, (suspension.pitchInertiaIndex ?? 0.9) * m * a * b);
    const rollInertia = Math.max(1, 0.6 * m * half * half);
    state.vy += ((lift - downforce) / m - GRAVITY) * h;
    state.y += state.vy * h;
    state.pitchRate += (pitchMoment / pitchInertia) * h;
    state.rollRate += (rollMoment / rollInertia) * h;
    state.bodyPitch += state.pitchRate * h;
    state.bodyRoll += state.rollRate * h;
    if (t.lean !== undefined) {
      state.bodyRoll = -balanceLean(state.lateralAccel);
      state.rollRate = 0;
    }
    if (state.airborne && grounded) out.landingSpeed = Math.max(out.landingSpeed, -state.vy);
    state.airborne = !grounded;
    if (!grounded) state.airTime += h;
    else if (state.vy <= 0.5) {
      // Still-compressed springs right after a jump read as ground contact; only a settled car has landed.
      state.jumpsUsed = 0;
      state.airTime = 0;
    }
  }

  function driveForce(throttle: number, reverse: number, u: number, h: number, out: Telemetry): number {
    const pt = tuning.powertrain;
    if (pt.kind === "direct") {
      out.engineLoad = Math.max(throttle, reverse);
      if (reverse > 0) return -reverse * pt.maxForce * (pt.reverseScale ?? 0.5);
      if (throttle <= 0) return Math.abs(u) > 0.2 ? -Math.sign(u) * (pt.coastForce ?? pt.maxForce * 0.08) : 0;
      const powerLimited = pt.maxPower / Math.max(1, Math.abs(u));
      return throttle * Math.min(pt.maxForce, powerLimited);
    }
    state.shiftRemaining = Math.max(0, state.shiftRemaining - h);
    const eff = pt.efficiency ?? 0.85;
    const ratio = state.reversing ? pt.reverseGear : (pt.gears[state.gearIndex] ?? 1);
    const wheelRpm = (Math.abs(u) / Math.max(0.05, pt.wheelRadius)) * (60 / (2 * Math.PI));
    const coupled = wheelRpm * ratio * pt.finalDrive;
    const pedal = Math.max(throttle, reverse);
    const launch = pt.launchRpm ?? pt.idleRpm + (pt.redlineRpm - pt.idleRpm) * 0.35;
    const slipRpm = pt.idleRpm + (launch - pt.idleRpm) * pedal;
    const targetRpm = Math.min(pt.redlineRpm, Math.max(coupled, slipRpm, pt.idleRpm));
    const rpmResponse = 1 - Math.exp(-18 * h);
    state.rpm += (targetRpm - state.rpm) * rpmResponse;
    if (!state.reversing && state.shiftRemaining <= 0) {
      if (coupled >= pt.shiftUpRpm && state.gearIndex < pt.gears.length - 1 && pedal > 0) {
        state.gearIndex += 1;
        state.shiftRemaining = pt.shiftSeconds;
      } else if (coupled <= pt.shiftDownRpm && state.gearIndex > 0) {
        state.gearIndex -= 1;
        state.shiftRemaining = pt.shiftSeconds;
      }
    }
    const normalized = (state.rpm - pt.idleRpm) / Math.max(1, pt.redlineRpm - pt.idleRpm);
    const limiter = coupled >= pt.redlineRpm ? 0 : 1;
    const shifting = state.shiftRemaining > 0 ? 0.2 : 1;
    const toWheel = (ratio * pt.finalDrive * eff) / Math.max(0.05, pt.wheelRadius);
    out.engineLoad = pedal * limiter * shifting;
    if (pedal > 0) {
      const torque = pt.peakTorque * sampleGripCurve(pt.torqueCurve, normalized) * pedal * limiter * shifting;
      return (reverse > 0 ? -1 : 1) * torque * toWheel;
    }
    if (Math.abs(u) < 0.5) return 0;
    return -Math.sign(u) * ((pt.engineBrakeTorque ?? pt.peakTorque * 0.12) * toWheel + (pt.coastForce ?? 0));
  }

  return {
    tick,
    pose: () => ({ position: [state.x, baseHeight(), state.z], heading: state.heading }),
    velocity: () => [state.vx, state.vz],
    scaleVelocity(factor) {
      state.vx *= factor;
      state.vz *= factor;
      state.yawRate *= factor;
    },
    jump(speed) {
      const jump = tuning.jump;
      if (jump === undefined) return false;
      const takeoff = speed ?? jump.speed;
      if (!(takeoff > 0)) return false;
      if (!state.airborne && state.jumpsUsed === 0) {
        state.vy = Math.max(state.vy, 0) + takeoff;
        state.jumpsUsed = 1;
        if (tuning.suspension === undefined) {
          state.hopHeight = Math.max(state.hopHeight, 1e-6);
          state.airborne = true;
        }
        return true;
      }
      const count = jump.count ?? 1;
      const inWindow = state.airTime <= (jump.window ?? Number.POSITIVE_INFINITY);
      if (state.jumpsUsed >= count || !inWindow) return false;
      // An air jump always takes off from a first jump (or a ledge) and counts as one used either way.
      state.jumpsUsed = Math.max(state.jumpsUsed, 1) + 1;
      state.vy = Math.max(state.vy, 0) + takeoff;
      return true;
    },
    applyAngularImpulse(pitch, yaw, roll) {
      state.pitchRate += pitch;
      state.yawRate += yaw;
      state.rollRate += roll;
    },
    applyImpulse(dvx, dvz, dvy = 0) {
      state.vx += dvx;
      state.vz += dvz;
      if (tuning.suspension !== undefined) state.vy += dvy;
    },
    retune(next) {
      tuning = next;
      frontShape = tireShape(next.front);
      rearShape = tireShape(next.rear ?? next.front);
      if (next.powertrain.kind === "gearbox") {
        state.gearIndex = Math.min(state.gearIndex, next.powertrain.gears.length - 1);
      }
    },
    tuning: () => tuning,
    snapshot: () => ({ ...state, compression: [...state.compression] }),
    restore(next) {
      Object.assign(state, next, { compression: [...next.compression] });
    },
    resetTo(position, heading) {
      Object.assign(state, freshState(tuning, position, heading));
      settleOnGround();
    },
  };
}

interface Telemetry {
  sideslip: number;
  slipFront: number;
  slipRear: number;
  satFront: number;
  satRear: number;
  loadFront: number;
  loadRear: number;
  engineLoad: number;
  wheelspin: boolean;
  wheelLock: boolean;
  abs: boolean;
  traction: boolean;
  stability: boolean;
  airborne: boolean;
  landingSpeed: number;
  wheelLoads: readonly [number, number, number, number];
  wheelie: boolean;
  stoppie: boolean;
  roadWheel: number;
}

function emptyTelemetry(): Telemetry {
  return {
    sideslip: 0,
    slipFront: 0,
    slipRear: 0,
    satFront: 0,
    satRear: 0,
    loadFront: 0,
    loadRear: 0,
    engineLoad: 0,
    wheelspin: false,
    wheelLock: false,
    abs: false,
    traction: false,
    stability: false,
    airborne: false,
    landingSpeed: 0,
    wheelLoads: [0, 0, 0, 0],
    wheelie: false,
    stoppie: false,
    roadWheel: 0,
  };
}

/** One number per wheel: front-left, front-right, rear-left, rear-right. */
type Corners = [number, number, number, number];
type Corner = 0 | 1 | 2 | 3;
const CORNERS: readonly Corner[] = [0, 1, 2, 3];
const AXLES: readonly (readonly [Corner, Corner])[] = [[0, 1], [2, 3]];

/** Static spring compression at each corner that holds the car level at `rideHeight`. */
function staticSags(tuning: VehicleDynamicsTuning, suspension: VehicleSuspensionTuning): Corners {
  const front = clamp01(tuning.frontWeight);
  const perFront = (tuning.massKg * GRAVITY * front) / 2 / Math.max(1, suspension.springRate);
  const perRear = (tuning.massKg * GRAVITY * (1 - front)) / 2 / Math.max(1, suspension.springRate);
  return [perFront, perFront, perRear, perRear];
}

/**
 * Friction limit for one axle: longitudinal demand is clamped to the budget first, then lateral force gets
 * what `combinedSlip` leaves. Driving or braking hard therefore costs cornering grip on that axle, which is what
 * turns throttle into power oversteer on a RWD car and brake into rotation on corner entry. A wheel pushed past
 * its longitudinal limit locks or spins: with `wheelSlide` it then drags at sliding friction.
 */
function combine(
  demandX: number,
  grip: AxleGrip,
  shape: CurveShape,
  slip: number,
  lateralScale: number,
  combined: VehicleCombinedSlipEffect | undefined,
  exponent: number,
  slideShare: number,
  slides: boolean,
  out: Telemetry,
  axle: "front" | "rear",
  driven: boolean,
  curve: (grip: AxleGrip, shape: CurveShape, alpha: number) => number,
): { fx: number; fy: number } {
  const capX = grip.capX;
  const capY = grip.capY;
  if (capX <= 0 && capY <= 0) return { fx: 0, fy: 0 };
  let fx = demandX;
  let saturated = false;
  if (Math.abs(fx) > capX) {
    saturated = true;
    fx = Math.sign(fx) * capX * (slides ? clamp01(slideShare) : 1);
    if (driven && demandX > 0) out.wheelspin = true;
    else out.wheelLock = true;
  }
  const used = capX > 0 ? Math.min(1, Math.abs(fx) / capX) : 1;
  const remaining = combined === undefined ? 1 : saturated ? 0 : Math.pow(Math.max(0, 1 - Math.pow(used, exponent)), 1 / exponent);
  const fy = -capY * lateralScale * remaining * curve(grip, shape, slip);
  const saturation = Math.max(Math.hypot(fx / Math.max(capX, 1e-6), fy / Math.max(capY, 1e-6)), Math.abs(slip) / peakAngle(shape));
  if (axle === "front") out.satFront = Math.max(out.satFront, saturation);
  else out.satRear = Math.max(out.satRear, saturation);
  return { fx, fy };
}

function peakAngle(shape: CurveShape): number {
  return shape.peakX / shape.b;
}

function forwardOf(heading: number): readonly [number, number] {
  return [Math.sin(heading), Math.cos(heading)];
}

function freshState(
  tuning: VehicleDynamicsTuning,
  position: readonly [number, number, number],
  heading: number,
): VehicleDynamicsState {
  return {
    x: position[0],
    y: position[1],
    z: position[2],
    heading,
    vx: 0,
    vz: 0,
    yawRate: 0,
    steerAngle: 0,
    gearIndex: 0,
    reversing: false,
    shiftRemaining: 0,
    rpm: tuning.powertrain.kind === "gearbox" ? tuning.powertrain.idleRpm : 0,
    longitudinalAccel: 0,
    lateralAccel: 0,
    bodyPitch: 0,
    bodyRoll: 0,
    vy: 0,
    pitchRate: 0,
    rollRate: 0,
    compression: [0, 0, 0, 0],
    airborne: false,
    lean: 0,
    leanTrim: 0,
    jumpsUsed: 0,
    airTime: 0,
    hopHeight: 0,
    slipFront: 0,
    slipRear: 0,
    forceFront: 0,
    forceRear: 0,
    brakeLevel: 0,
  };
}

/** The lean that balances a lateral acceleration: a bike leans until gravity's moment matches the corner's. */
function balanceLean(lateralAccel: number): number {
  return Math.atan(lateralAccel / GRAVITY);
}


/** Angular rate driven by input acceleration and slowed by damping, capped at `maxRate` only while input pushes past it. */
function driveRate(rate: number, accel: number, damping: number, maxRate: number, h: number): number {
  let next = rate + (accel - damping * rate) * h;
  if (Math.abs(next) > maxRate && Math.sign(accel) === Math.sign(next) && Math.abs(next) > Math.abs(rate)) {
    next = Math.sign(next) * Math.max(maxRate, Math.abs(rate));
  }
  return next;
}
