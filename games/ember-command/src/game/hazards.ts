import { distanceToSegment, inShade, type YardLayout, type YardPoint } from "./yard";

/**
 * The backyard is not neutral ground. Four clocks run over every battle and one boss walks the last:
 *
 * - the **sprinkler** on the hose's end wakes on a cycle and sweeps its jet back and forth: ants in the
 *   jet are slowed and battered, and every pheromone cell it lands on is washed out;
 * - the **lawnmower** crosses its lane every few minutes after a warning: anything under the deck dies;
 * - **rain storms** roll through: everyone wades slower and scent fades six times as fast;
 * - **nightfall** comes once a day: the red colony's antennae reach barely half as far;
 * - **the Kid with the Magnifying Glass** (the finale) focuses a burning spot that hunts the densest
 *   knot of red ants out of the shade, and cooks anything it rests on, black ants included.
 *
 * Pure, serializable data and arithmetic: `systems.ts` applies the damage and the slows, the HUD reads
 * the warnings, and `world/YardHazards.draw.ts` draws the jet, the mower and the beam.
 */

export interface HazardToggles {
  sprinkler: boolean;
  mower: boolean;
  rain: boolean;
  night: boolean;
  beam: boolean;
}

export const NO_HAZARDS: HazardToggles = { sprinkler: false, mower: false, rain: false, night: false, beam: false };
/** The free skirmish runs every clock but the boss. */
export const SKIRMISH_HAZARDS: HazardToggles = { sprinkler: true, mower: true, rain: true, night: true, beam: false };

/** Sprinkler: a cycle of rest then spray, with the jet swinging across its arc while it sprays. */
export const SPRINKLER_CYCLE = 46;
export const SPRINKLER_ON = 18;
export const SPRINKLER_SWEEP_PERIOD = 9;
/** Seconds before the spray when the head spins up and dribbles: the tell. */
export const SPRINKLER_WARMUP = 4;
/** Half-angle of the jet's wedge, in radians, and what it does to an ant caught in it. */
export const SPRINKLER_JET_HALF_ANGLE = 0.16;
export const SPRINKLER_DPS = 6;
export const SPRINKLER_SLOW = 0.45;

/** Lawnmower: first pass, then one every interval; a warning before it starts; its speed and deck. */
export const MOWER_FIRST = 75;
export const MOWER_INTERVAL = 150;
export const MOWER_WARNING = 9;
export const MOWER_SPEED = 15;
export const MOWER_DECK_HALF_LENGTH = 4.5;
/** Damage under the deck: lethal for any ant, a heavy gouge out of a chamber. */
export const MOWER_UNIT_DAMAGE = 9999;
export const MOWER_BUILDING_DAMAGE = 260;

/** Rain: first storm, interval between storm starts, how long it pours, and the wading slow. */
export const RAIN_FIRST = 130;
export const RAIN_INTERVAL = 210;
export const RAIN_DURATION = 38;
export const RAIN_SLOW = 0.8;

/** Night: one day is this long; darkness ramps in and out around the night window. */
export const DAY_LENGTH = 240;
export const NIGHT_FROM = 165;
export const NIGHT_TO = 230;
export const NIGHT_RAMP = 10;
/** At full dark the colony senses this fraction of its daylight radius. */
export const NIGHT_SIGHT = 0.6;

/** The beam: how fast the lens drags the spot, how wide it burns, how hard, and its focus rhythm. */
export const BEAM_SPEED = 4.6;
export const BEAM_RADIUS = 4.2;
export const BEAM_UNIT_DPS = 42;
export const BEAM_BUILDING_DPS = 18;
export const BEAM_RETARGET = 5;
/** Every cycle the kid's hand wobbles: the beam goes out of focus (harmless) for a few seconds. */
export const BEAM_CYCLE = 15;
export const BEAM_BLUR = 3.5;
/** Seconds of warm-up before the beam first focuses. */
export const BEAM_GRACE = 6;
/** Seconds over which the kid's impatience doubles the beam's drag speed. */
export const BEAM_IMPATIENCE = 240;

/** How fast the lens drags the spot at battle second `t`. */
export function beamSpeedAt(t: number): number {
  return BEAM_SPEED * (1 + Math.min(1, Math.max(0, t) / BEAM_IMPATIENCE));
}

export type MowerPhase = "idle" | "warning" | "crossing";

export interface HazardState {
  toggles: HazardToggles;
  /** Seconds of battle the clocks have run. */
  t: number;
  sprinkler: { on: boolean; angle: number };
  mower: { phase: MowerPhase; nextAt: number; progress: number; direction: 1 | -1 };
  rain: { on: boolean };
  /** 0 in daylight, 1 at full dark. */
  dark: number;
  beam: { active: boolean; focused: boolean; x: number; z: number; tx: number; tz: number; retarget: number };
}

export type HazardEvent =
  | { kind: "sprinkler"; on: boolean }
  | { kind: "mowerWarning" }
  | { kind: "mowerStart" }
  | { kind: "mowerDone" }
  | { kind: "rain"; on: boolean }
  | { kind: "night"; on: boolean }
  | { kind: "beamFocus"; on: boolean };

export function createHazardState(toggles: HazardToggles, start: YardPoint = { x: 0, z: 0 }): HazardState {
  return {
    toggles: { ...toggles },
    t: 0,
    sprinkler: { on: false, angle: 0 },
    mower: { phase: "idle", nextAt: MOWER_FIRST, progress: 0, direction: 1 },
    rain: { on: false },
    dark: 0,
    beam: { active: toggles.beam, focused: false, x: start.x, z: start.z, tx: start.x, tz: start.z, retarget: 0 },
  };
}

/** Darkness at battle second `t`: a smooth ramp into and out of the night window, repeating daily. */
export function darknessAt(t: number): number {
  const day = ((t % DAY_LENGTH) + DAY_LENGTH) % DAY_LENGTH;
  if (day < NIGHT_FROM - NIGHT_RAMP || day > NIGHT_TO + NIGHT_RAMP) return 0;
  if (day < NIGHT_FROM) return (day - (NIGHT_FROM - NIGHT_RAMP)) / NIGHT_RAMP;
  if (day > NIGHT_TO) return 1 - (day - NIGHT_TO) / NIGHT_RAMP;
  return 1;
}

/** Whether a storm is pouring at battle second `t`. */
export function rainingAt(t: number): boolean {
  if (t < RAIN_FIRST) return false;
  return (t - RAIN_FIRST) % RAIN_INTERVAL < RAIN_DURATION;
}

/** The sprinkler's jet heading at battle second `t` (and whether it sprays), across its authored arc. */
export function sprinklerAt(layout: YardLayout, t: number): { on: boolean; angle: number } {
  const s = layout.sprinkler;
  if (s === null) return { on: false, angle: 0 };
  const phase = t % SPRINKLER_CYCLE;
  const on = phase >= SPRINKLER_CYCLE - SPRINKLER_ON;
  const swing = 0.5 - 0.5 * Math.cos((phase / SPRINKLER_SWEEP_PERIOD) * Math.PI * 2);
  return { on, angle: s.arcFrom + (s.arcTo - s.arcFrom) * swing };
}

/** Where the mower deck is along its lane right now, or null when it is not crossing. */
export function mowerPosition(state: HazardState, layout: YardLayout): YardPoint | null {
  const lane = layout.mowerLane;
  if (lane === null || state.mower.phase !== "crossing") return null;
  const t = state.mower.direction === 1 ? state.mower.progress : 1 - state.mower.progress;
  return { x: lane.from.x + (lane.to.x - lane.from.x) * t, z: lane.from.z + (lane.to.z - lane.from.z) * t };
}

function laneLength(layout: YardLayout): number {
  const lane = layout.mowerLane;
  return lane === null ? 0 : Math.hypot(lane.to.x - lane.from.x, lane.to.z - lane.from.z);
}

/**
 * Advance every clock by `dt`. `beamTarget` is where the kid wants the spot (the densest red knot in
 * the open); the spot drags toward it at the lens's speed. Returns the beats the HUD announces.
 */
export function advanceHazards(state: HazardState, layout: YardLayout, dt: number, beamTarget: YardPoint | null = null): HazardEvent[] {
  const events: HazardEvent[] = [];
  state.t += dt;
  const t = state.t;
  const { toggles } = state;

  if (toggles.sprinkler && layout.sprinkler !== null) {
    const next = sprinklerAt(layout, t);
    if (next.on !== state.sprinkler.on) events.push({ kind: "sprinkler", on: next.on });
    state.sprinkler = next;
  }

  if (toggles.mower && layout.mowerLane !== null) {
    const mower = state.mower;
    if (mower.phase === "idle" && t >= mower.nextAt - MOWER_WARNING) {
      mower.phase = "warning";
      events.push({ kind: "mowerWarning" });
    }
    if (mower.phase === "warning" && t >= mower.nextAt) {
      mower.phase = "crossing";
      mower.progress = 0;
      events.push({ kind: "mowerStart" });
    }
    if (mower.phase === "crossing") {
      const length = laneLength(layout);
      mower.progress += length > 0 ? (dt * MOWER_SPEED) / length : 1;
      if (mower.progress >= 1) {
        mower.phase = "idle";
        mower.progress = 0;
        mower.direction = mower.direction === 1 ? -1 : 1;
        mower.nextAt = t + MOWER_INTERVAL;
        events.push({ kind: "mowerDone" });
      }
    }
  }

  if (toggles.rain) {
    const on = rainingAt(t);
    if (on !== state.rain.on) events.push({ kind: "rain", on });
    state.rain.on = on;
  }

  if (toggles.night) {
    const dark = darknessAt(t);
    if (dark >= 0.5 && state.dark < 0.5) events.push({ kind: "night", on: true });
    if (dark < 0.5 && state.dark >= 0.5) events.push({ kind: "night", on: false });
    state.dark = dark;
  }

  if (toggles.beam) {
    const beam = state.beam;
    beam.retarget -= dt;
    if (beamTarget !== null && beam.retarget <= 0) {
      beam.tx = beamTarget.x;
      beam.tz = beamTarget.z;
      beam.retarget = BEAM_RETARGET;
    }
    const dx = beam.tx - beam.x;
    const dz = beam.tz - beam.z;
    const gap = Math.hypot(dx, dz);
    // The kid gets impatient: the spot drags faster the longer the battle runs (up to double).
    const step = Math.min(gap, beamSpeedAt(t) * dt);
    if (gap > 0) {
      beam.x += (dx / gap) * step;
      beam.z += (dz / gap) * step;
    }
    const focused = t >= BEAM_GRACE && ((t - BEAM_GRACE) % BEAM_CYCLE) < BEAM_CYCLE - BEAM_BLUR;
    if (focused !== beam.focused) events.push({ kind: "beamFocus", on: focused });
    beam.focused = focused;
  }

  return events;
}

/** True in the few seconds before the sprinkler sprays: the head hisses and dribbles. */
export function sprinklerWarming(state: HazardState, layout: YardLayout): boolean {
  if (!state.toggles.sprinkler || layout.sprinkler === null || state.sprinkler.on) return false;
  const phase = state.t % SPRINKLER_CYCLE;
  const start = SPRINKLER_CYCLE - SPRINKLER_ON;
  return phase >= start - SPRINKLER_WARMUP && phase < start;
}

/**
 * Where a black ant standing in the mower lane runs to when the engine roars: straight out of the
 * lane on its own side, two body lengths past the edge. Null when the point is not in the lane.
 */
export function laneEscape(layout: YardLayout, x: number, z: number): YardPoint | null {
  const lane = layout.mowerLane;
  if (lane === null || distanceToSegment(x, z, lane.from, lane.to) > lane.halfWidth + 0.5) return null;
  const dx = lane.to.x - lane.from.x;
  const dz = lane.to.z - lane.from.z;
  const length = Math.hypot(dx, dz) || 1;
  const nx = -dz / length;
  const nz = dx / length;
  const side = (x - lane.from.x) * nx + (z - lane.from.z) * nz >= 0 ? 1 : -1;
  const t = Math.max(0, Math.min(1, ((x - lane.from.x) * dx + (z - lane.from.z) * dz) / (length * length)));
  const px = lane.from.x + dx * t;
  const pz = lane.from.z + dz * t;
  const out = lane.halfWidth + 3;
  return { x: px + nx * side * out, z: pz + nz * side * out };
}

/** True when a point is inside the sprinkler's spraying jet. */
export function inSprinklerJet(state: HazardState, layout: YardLayout, x: number, z: number): boolean {
  const s = layout.sprinkler;
  if (!state.toggles.sprinkler || s === null || !state.sprinkler.on) return false;
  const dx = x - s.x;
  const dz = z - s.z;
  const d = Math.hypot(dx, dz);
  if (d > s.reach || d < 0.5) return false;
  let diff = Math.atan2(dx, dz) - state.sprinkler.angle;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  // The wedge widens a little with range, as a real jet fans out.
  return Math.abs(diff) <= SPRINKLER_JET_HALF_ANGLE * (0.6 + 0.6 * (d / s.reach));
}

/** True when a point is under the mower deck right now. */
export function underMower(state: HazardState, layout: YardLayout, x: number, z: number): boolean {
  const lane = layout.mowerLane;
  const deck = mowerPosition(state, layout);
  if (lane === null || deck === null) return false;
  if (distanceToSegment(x, z, lane.from, lane.to) > lane.halfWidth) return false;
  const length = laneLength(layout);
  const ux = (lane.to.x - lane.from.x) / length;
  const uz = (lane.to.z - lane.from.z) / length;
  const along = (x - deck.x) * ux + (z - deck.z) * uz;
  return Math.abs(along) <= MOWER_DECK_HALF_LENGTH;
}

/** True when a point is inside the mower lane (where the HUD and the ground stripe warn). */
export function inMowerLane(layout: YardLayout, x: number, z: number): boolean {
  const lane = layout.mowerLane;
  return lane !== null && distanceToSegment(x, z, lane.from, lane.to) <= lane.halfWidth;
}

/**
 * Seconds until the blurred beam snaps back into focus (0 while focused, or with no beam). The overlay
 * shrinks the spot over the last second as the tell: when it tightens, get out from under it.
 */
export function beamRefocusIn(state: HazardState): number {
  if (!state.toggles.beam || state.beam.focused) return 0;
  if (state.t < BEAM_GRACE) return BEAM_GRACE - state.t;
  const phase = (state.t - BEAM_GRACE) % BEAM_CYCLE;
  return Math.max(0, BEAM_CYCLE - phase);
}

/** True when the focused beam is burning a point (shade blocks it). */
export function underBeam(state: HazardState, layout: YardLayout, x: number, z: number): boolean {
  if (!state.toggles.beam || !state.beam.focused) return false;
  if (Math.hypot(x - state.beam.x, z - state.beam.z) > BEAM_RADIUS) return false;
  return !inShade(layout, x, z);
}

/** How fast an ant moves through the weather and the water at a point (1 = unhindered). */
export function hazardSpeedFactor(state: HazardState, layout: YardLayout, x: number, z: number): number {
  let factor = 1;
  if (state.rain.on) factor *= RAIN_SLOW;
  if (inSprinklerJet(state, layout, x, z)) factor *= SPRINKLER_SLOW;
  return factor;
}

/** What darkness does to the colony's sensing radius. */
export function nightSightFactor(state: HazardState): number {
  return 1 - (1 - NIGHT_SIGHT) * state.dark;
}

/** Seconds until the next mower pass starts (0 while it crosses), or null when no mower runs. */
export function mowerEta(state: HazardState, layout: YardLayout): number | null {
  if (!state.toggles.mower || layout.mowerLane === null) return null;
  if (state.mower.phase === "crossing") return 0;
  return Math.max(0, state.mower.nextAt - state.t);
}

/** Pick the beam's prey: the open-ground point with the most red ants within `radius` of it. */
export function densestKnot(points: readonly YardPoint[], layout: YardLayout, radius = 6): YardPoint | null {
  let best: YardPoint | null = null;
  let bestCount = 0;
  for (const p of points) {
    if (inShade(layout, p.x, p.z)) continue;
    let count = 0;
    for (const q of points) if (Math.hypot(p.x - q.x, p.z - q.z) <= radius) count += 1;
    if (count > bestCount) {
      bestCount = count;
      best = p;
    }
  }
  return best;
}
