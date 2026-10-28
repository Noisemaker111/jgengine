/**
 * Whole-body limits of a runner on flat ground: the linear horizontal force–velocity profile of sprint acceleration
 * (P. Samozino et al., "A simple method for measuring power, force, velocity properties, and mechanical effectiveness
 * in sprint running", *Scand. J. Med. Sci. Sports* 26, 2016), air drag on the frontal area of C. Arsac and
 * E. Locatelli's model (*J. Appl. Physiol.* 92, 2002), and the largest braking deceleration.
 */
export interface SprintProfile {
  /** Theoretical horizontal force at zero speed per body mass, N/kg. */
  f0: number;
  /** Theoretical speed at zero horizontal force, m/s. */
  v0: number;
  /** Largest sustained braking deceleration, m/s². */
  braking: number;
  /** Shoe–ground friction coefficient, which also caps braking. */
  friction: number;
  /** Air-drag factor `½ρ·Cd·A/m`, 1/m. */
  drag: number;
}

/**
 * Drag factor `½ρ·Cd·A/m` of a runner of `mass` (kg) and `stature` (m): A = 0.266 × Du Bois body surface, Cd 0.9, ρ 1.204.
 * @internal
 */
export function runnerDragFactor(mass: number, stature: number): number {
  const frontal = 0.266 * 0.2025 * stature ** 0.725 * mass ** 0.425;
  return (0.5 * 1.204 * 0.9 * frontal) / mass;
}

/**
 * A physically active young man (80 kg, 1.80 m) who is not a trained sprinter: F0 7.5 N/kg sits in the team-sport and
 * recreational range of the force–velocity profiles in J.-B. Morin and P. Samozino, *Int. J. Sports Physiol. Perform.*
 * 11 (2016) (F0 6–9 N/kg), and V0 7.95 m/s puts top speed at the 7.7 m/s of the recreational sprinters of Chang and
 * Kram (2007) used by `maxCurveSpeed`; 30 m takes about 4.9 s. Braking at 6 m/s² is the average maximal
 * horizontal deceleration from a 20 m sprint of team-sport athletes (D. J. Harper et al., *Eur. J. Sport Sci.* 22,
 * 2022: about 5–6 m/s²).
 */
export const RECREATIONAL_SPRINT_PROFILE: SprintProfile = { f0: 7.5, v0: 7.95, braking: 6, friction: 0.8, drag: runnerDragFactor(80, 1.8) };

/**
 * Highest speed of the profile on flat ground, where horizontal force equals drag, m/s.
 * @capability sprint-top-speed top running speed of a force-velocity sprint profile with air drag
 */
export function sprintTopSpeed(profile: SprintProfile): number {
  const a = profile.drag;
  const b = profile.f0 / profile.v0;
  return a === 0 ? profile.v0 : (-b + Math.sqrt(b * b + 4 * a * profile.f0)) / (2 * a);
}

/** Speed and distance after a sprint. */
export interface SprintState {
  time: number;
  speed: number;
  distance: number;
}

/**
 * Sprint from `speed` (m/s) under the profile until `distance` (m) is covered or `time` (s) passes, whichever first.
 * Integrates `a = F0·(1 − v/V0)·min(1, μg/F0) − k·v²` at 1 ms.
 * @capability sprint-envelope published human sprint acceleration, top speed, braking and turnaround limits from a force-velocity profile
 */
export function sprint(profile: SprintProfile, limit: { distance?: number; time?: number }, speed = 0): SprintState {
  const dt = 0.001;
  const maxDistance = limit.distance ?? Number.POSITIVE_INFINITY;
  const maxTime = limit.time ?? 60;
  const grip = Math.min(profile.f0, profile.friction * 9.81);
  let v = speed;
  let x = 0;
  let t = 0;
  while (x < maxDistance && t < maxTime) {
    const a = grip * Math.max(0, 1 - v / profile.v0) - profile.drag * v * v;
    const next = v + a * dt;
    const step = 0.5 * (v + next) * dt;
    if (x + step >= maxDistance) {
      t += ((maxDistance - x) / Math.max(1e-9, step)) * dt;
      v = next;
      x = maxDistance;
      break;
    }
    x += step;
    v = next;
    t += dt;
  }
  return { time: t, speed: v, distance: x };
}

/**
 * Largest deceleration the runner holds, m/s²: the profile's braking, capped by friction.
 * @internal
 */
export function brakingDeceleration(profile: SprintProfile): number {
  return Math.min(profile.braking, profile.friction * 9.81);
}

/**
 * Distance to stop from `speed`, m, and the time it takes, s, at the largest deceleration.
 * @capability human-stopping-distance distance and time a runner needs to stop from a speed
 */
export function stoppingDistance(profile: SprintProfile, speed: number): { distance: number; time: number } {
  const a = brakingDeceleration(profile);
  return { distance: (speed * speed) / (2 * a), time: speed / a };
}

/**
 * Time to reverse from `speed` to the same speed the other way, s: brake to rest, then sprint back up.
 * @capability human-turnaround-time time a runner needs to reverse direction at a speed
 */
export function turnaroundTime(profile: SprintProfile, speed: number): number {
  const back = sprint(profile, { time: 30 }, 0);
  const target = Math.min(speed, back.speed * 0.999);
  let v = 0;
  let t = 0;
  const grip = Math.min(profile.f0, profile.friction * 9.81);
  while (v < target && t < 30) {
    v += (grip * Math.max(0, 1 - v / profile.v0) - profile.drag * v * v) * 0.001;
    t += 0.001;
  }
  return speed / brakingDeceleration(profile) + t;
}

/**
 * Time of the 505 change-of-direction test (E. Draper and M. Lancaster, 1985): the 5 m into a 180° turn and the 5 m
 * back, entered at the speed of a 10 m flying start, s.
 * @capability change-of-direction-505 simulated 505 change-of-direction test time of a sprint profile
 */
export function test505Time(profile: SprintProfile): number {
  const entry = sprint(profile, { distance: 10 });
  const a = brakingDeceleration(profile);
  // Run in at speed, then brake late enough to stop at the 5 m line.
  const brakeDistance = (entry.speed * entry.speed) / (2 * a);
  const cruise = Math.max(0, 5 - brakeDistance);
  const inbound = cruise / entry.speed + Math.min(entry.speed, Math.sqrt(2 * a * 5)) / a;
  return inbound + sprint(profile, { distance: 5 }).time;
}

/**
 * Net metabolic cost of transport on a gradient `grade` (rise over run, −0.45…0.45), J/(kg·m), from the polynomials of
 * A. E. Minetti et al., "Energy cost of walking and running at extreme uphill and downhill slopes", *J. Appl. Physiol.*
 * 93 (2002).
 * @capability slope-cost-of-transport metabolic cost of walking and running on a gradient (Minetti 2002)
 */
export function slopeCostOfTransport(gait: "walk" | "run", grade: number): number {
  const i = Math.max(-0.45, Math.min(0.45, grade));
  return gait === "walk"
    ? 280.5 * i ** 5 - 58.7 * i ** 4 - 76.8 * i ** 3 + 51.9 * i ** 2 + 19.6 * i + 2.5
    : 155.4 * i ** 5 - 30.4 * i ** 4 - 43.3 * i ** 3 + 46.3 * i ** 2 + 19.5 * i + 3.6;
}

/**
 * Speed on a gradient at the same metabolic power as `levelSpeed` on the flat (m/s), from
 * {@link slopeCostOfTransport}: how much a person slows uphill at a steady effort, and how much faster they could go
 * downhill. Capped at `cap` (default 1.5× the level speed) because steep downhill speed is limited by control, not
 * energy.
 * @capability slope-speed iso-metabolic human walking and running speed on a gradient (Minetti 2002)
 */
export function slopeSpeed(gait: "walk" | "run", levelSpeed: number, grade: number, cap = 1.5 * levelSpeed): number {
  const power = levelSpeed * slopeCostOfTransport(gait, 0);
  return Math.min(cap, power / Math.max(0.5, slopeCostOfTransport(gait, grade)));
}
