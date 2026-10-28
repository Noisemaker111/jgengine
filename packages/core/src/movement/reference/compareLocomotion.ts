import { advancePlayerMotion, createEmptyMovementKeys, createPlayerMotionState, resolveMovementIntent } from "../movementModel";
import { measureMovement, type MovementProbeOptions, type MovementProbeSubject } from "../movementProbe";
import { resolvePlayerMovementTuning } from "../playerMovement";
import { minTurnRadius, RECREATIONAL_SPRINTER, type SprintMechanics } from "./curveRunning";
import { brakingDeceleration, RECREATIONAL_SPRINT_PROFILE, slopeSpeed, sprintTopSpeed, timeToSpeed, type SprintProfile } from "./humanEnvelope";
import { simulateJump, type JumpReport } from "./humanJump";

/** Locomotion feel as numbers, comparable between a game character and the reference human. */
export interface LocomotionMetrics {
  /** Steady ground speed, m/s. */
  topSpeed: number;
  /** Standing start to 90% of `topSpeed`, s. */
  startTime: number;
  /** Distance to stop from `topSpeed`, m. */
  stopDistance: number;
  /** Reversing at `topSpeed` until 90% of it the other way, s. */
  turnAroundTime: number;
  /** Tightest path radius while turning 90° at `topSpeed`, m. */
  turnRadius: number;
  /** Standing jump rise, m. */
  jumpHeight: number;
  /** Standing jump takeoff to touchdown, s. */
  airTime: number;
  /** Vertical speed at touchdown after the standing jump, m/s. */
  landingSpeed: number;
  /** Ground speed on an uphill grade over ground speed on the flat at the same effort. */
  uphillSpeedRatio: number;
}

/** Settings for {@link measureLocomotion} and {@link compareLocomotion}. */
export interface LocomotionProbeOptions extends MovementProbeOptions {
  /** Uphill grade for `uphillSpeedRatio`, rise over run (default `0.1`). */
  grade?: number;
}

const ARRIVED = 0.9;

/** Tightest radius of the velocity path, m, when the heading swings 90° while the character runs at `topSpeed`. */
function gameTurnRadius(subject: MovementProbeSubject, topSpeed: number, dt: number, sprinting: boolean): number {
  const tuning = resolvePlayerMovementTuning({
    ...(subject.movement === undefined ? {} : { movement: subject.movement }),
    ...(subject.physics === undefined ? {} : { physics: subject.physics }),
  }).physics;
  const motion = createPlayerMotionState();
  const intent = resolveMovementIntent({ ...createEmptyMovementKeys(), w: true, shift: sprinting }, true);
  const walk = subject.walkSpeed ?? 2;
  for (let i = 0; i < Math.ceil(5 / dt); i++) advancePlayerMotion(motion, intent, 0, 1, walk, dt, tuning);
  let tightest = Number.POSITIVE_INFINITY;
  let vx = motion.horizontalVelocityX;
  let vz = motion.horizontalVelocityZ;
  for (let i = 0; i < Math.ceil(3 / dt); i++) {
    advancePlayerMotion(motion, intent, 1, 0, walk, dt, tuning);
    const nx = motion.horizontalVelocityX;
    const nz = motion.horizontalVelocityZ;
    const speed = Math.hypot(nx, nz);
    const turn = Math.abs(Math.atan2(vx * nz - vz * nx, vx * nx + vz * nz));
    if (speed >= ARRIVED * topSpeed && turn > 1e-9) tightest = Math.min(tightest, (speed * dt) / turn);
    vx = nx;
    vz = nz;
  }
  // A heading change that drops speed below 90% has no radius at speed; the velocity swings through near zero.
  return Number.isFinite(tightest) ? tightest : 0;
}

/**
 * Measure a game character with the scenarios the reference human runs: {@link measureMovement}'s start, stop, reversal
 * and jump, a 90° heading change at top speed, and uphill speed. The movement model keeps horizontal speed on any grade
 * it lets the character climb, so `uphillSpeedRatio` is 1 up to `maxClimbGrade` and 0 above it.
 * @capability locomotion-metrics measure a game character's start, stop, turn radius, reversal, jump, landing speed and uphill speed for comparison with real people
 */
export function measureLocomotion(subject: MovementProbeSubject = {}, options: LocomotionProbeOptions = {}): LocomotionMetrics {
  const dt = options.dt ?? 1 / 60;
  const report = measureMovement(subject, options);
  const grade = options.grade ?? 0.1;
  const gravity = Math.abs(subject.physics?.gravity ?? -24);
  const limit = subject.movement?.maxClimbGrade;
  return {
    topSpeed: report.topSpeed,
    startTime: report.timeToTopSpeed,
    stopDistance: report.stopDistance,
    turnAroundTime: report.turnAroundTime,
    turnRadius: gameTurnRadius(subject, report.topSpeed, dt, options.sprint === true),
    jumpHeight: report.jumpHeight,
    airTime: report.airTime,
    landingSpeed: Math.sqrt(2 * gravity * report.jumpHeight),
    uphillSpeedRatio: limit !== undefined && grade > limit ? 0 : 1,
  };
}

/** The human models {@link referenceLocomotion} draws on. */
export interface HumanLocomotionReference {
  sprint: SprintProfile;
  curve: SprintMechanics;
  jump: JumpReport;
}

let defaultJump: JumpReport | undefined;

/**
 * The recreational 80 kg, 1.80 m reference: sprint profile, curve mechanics and simulated countermovement jump.
 * @capability human-locomotion-reference the default real-person sprint, turn and jump models locomotion comparisons use
 */
export function defaultHumanReference(): HumanLocomotionReference {
  defaultJump ??= simulateJump();
  return { sprint: RECREATIONAL_SPRINT_PROFILE, curve: RECREATIONAL_SPRINTER, jump: defaultJump };
}

/** Time for a quarter stride before a planted foot can brake or push, s (stride frequency 0.9 Hz walking, 1.4 Hz running). */
function stepLatency(speed: number): number {
  return 0.25 / (speed < 2 ? 0.9 : 1.4);
}

/**
 * What a real person does at `topSpeed`, capped at 95% of the human's own top speed (at top speed a runner has no
 * force left to turn or speed up): start (an anticipatory postural
 * adjustment of about 0.35 s, P. Crenna and C. Frigo, *J. Physiol.* 437, 1991, then the sprint profile), stop and
 * reverse (a quarter stride to plant the braking foot, then the braking limit), the tightest turn leg force and
 * friction allow, the countermovement jump, and the iso-metabolic uphill speed (Minetti 2002).
 * @capability locomotion-reference what a real person achieves at a game character's speed: start, stop, turn radius, reversal, jump and uphill speed
 */
export function referenceLocomotion(topSpeed: number, options: { grade?: number; human?: HumanLocomotionReference } = {}): LocomotionMetrics {
  const human = options.human ?? defaultHumanReference();
  const speed = Math.min(topSpeed, sprintTopSpeed(human.sprint) * 0.95);
  const brake = brakingDeceleration(human.sprint);
  const latency = stepLatency(speed);
  const rise = timeToSpeed(human.sprint, ARRIVED * speed);
  return {
    topSpeed: speed,
    startTime: 0.35 + rise,
    stopDistance: speed * latency + (speed * speed) / (2 * brake),
    turnAroundTime: latency + speed / brake + rise,
    turnRadius: minTurnRadius(human.curve, speed),
    jumpHeight: human.jump.height,
    airTime: human.jump.airTime,
    landingSpeed: human.jump.landingSpeed,
    uphillSpeedRatio: slopeSpeed(speed < 2 ? "walk" : "run", speed, options.grade ?? 0.1) / speed,
  };
}

/** One row of {@link compareLocomotion}. */
export interface LocomotionComparisonRow {
  metric: keyof LocomotionMetrics;
  label: string;
  unit: string;
  game: number;
  reference: number;
  /** `game / reference`. */
  ratio: number;
}

const ROWS: readonly { metric: keyof LocomotionMetrics; label: string; unit: string }[] = [
  { metric: "topSpeed", label: "Top speed", unit: "m/s" },
  { metric: "startTime", label: "Start to 90% speed", unit: "s" },
  { metric: "stopDistance", label: "Stop distance", unit: "m" },
  { metric: "turnAroundTime", label: "Reverse to 90% speed", unit: "s" },
  { metric: "turnRadius", label: "Tightest turn at speed", unit: "m" },
  { metric: "jumpHeight", label: "Jump height", unit: "m" },
  { metric: "airTime", label: "Jump airtime", unit: "s" },
  { metric: "landingSpeed", label: "Landing speed", unit: "m/s" },
  { metric: "uphillSpeedRatio", label: "Speed on a 10% climb", unit: "×" },
];

/**
 * Measure a game character and compare it, metric by metric, with what a real person does at its top speed.
 * @capability locomotion-compare score a game character's movement against human biomechanics: start, stop, turn, jump, landing and slope
 */
export function compareLocomotion(subject: MovementProbeSubject = {}, options: LocomotionProbeOptions & { human?: HumanLocomotionReference } = {}): LocomotionComparisonRow[] {
  const game = measureLocomotion(subject, options);
  const reference = referenceLocomotion(game.topSpeed, {
    ...(options.grade === undefined ? {} : { grade: options.grade }),
    ...(options.human === undefined ? {} : { human: options.human }),
  });
  return ROWS.map(({ metric, label, unit }) => ({ metric, label, unit, game: game[metric], reference: reference[metric], ratio: game[metric] / reference[metric] }));
}

/**
 * Markdown table of {@link compareLocomotion} rows.
 * @capability locomotion-compare-table markdown table of a game character's movement against the human reference
 */
export function formatLocomotionComparison(rows: readonly LocomotionComparisonRow[]): string {
  const fmt = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : "never");
  const lines = ["| Metric | Game | Human | Game ÷ human |", "| --- | --- | --- | --- |"];
  for (const r of rows) lines.push(`| ${r.label} (${r.unit}) | ${fmt(r.game)} | ${fmt(r.reference)} | ${Number.isFinite(r.ratio) ? r.ratio.toFixed(2) : "—"} |`);
  return lines.join("\n");
}
