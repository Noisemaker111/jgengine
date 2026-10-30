import { tierAt, type ThresholdBoundary } from "../threshold/thresholds";

/** The warning a phase change gives, and how long it stays up. */
export interface PhaseTell {
  /** Game-owned id: an animation, a sound, a HUD banner. */
  id: string;
  /** Seconds the tell stays visible after the phase changes. */
  seconds: number;
}

/** One authored phase: the fraction its band starts at, whatever data the caller hangs on it, and its tell. */
export interface PhaseLike {
  /** Caller-owned id, monotone down the list. */
  id: string;
  /** Fraction at or below which this phase holds, `0..1`. The opening phase is `1`. Phases run high to low. */
  at: number;
  /** Warning shown when this phase begins. Omit for a silent phase. */
  tell?: PhaseTell;
}

/** Serializable phase clock: which phase holds, how long it has held, and the tell still on screen. */
export interface PhaseClockState {
  /** Index into the authored phase list. Monotone: it never goes back down. */
  phase: number;
  /** Id of the current phase, for a HUD read without the definition at hand. */
  phaseId: string;
  /** Seconds the current phase has held. */
  ageSeconds: number;
  /** Tell still showing, or null. */
  tellId: string | null;
  /** Seconds left on the showing tell. */
  tellRemaining: number;
}

/** One step of the phase clock. */
export interface PhaseStep<P extends PhaseLike> {
  state: PhaseClockState;
  /** The phase in effect after the step. */
  phase: P;
  /** True on the step the phase changed. */
  changed: boolean;
  /** The tell to fire now, or null. Only set on a change, so a caller never replays a tell. */
  tell: PhaseTell | null;
}

function validate(phases: readonly PhaseLike[]): void {
  if (phases.length === 0) throw new Error("a phase ladder needs at least one phase");
  for (let index = 0; index < phases.length; index += 1) {
    const phase = phases[index];
    if (phase === undefined) continue;
    if (phase.id.length === 0) throw new Error(`phase ${index} has an empty id`);
    if (!Number.isFinite(phase.at) || phase.at < 0 || phase.at > 1) {
      throw new Error(`phase "${phase.id}" at must be between 0 and 1`);
    }
    const previous = phases[index - 1];
    if (previous !== undefined && phase.at > previous.at) {
      throw new Error(`phase "${phase.id}" at must not exceed "${previous.id}" — phases run high to low`);
    }
  }
  const opening = phases[0];
  if (opening !== undefined && opening.at < 1) {
    throw new Error(`phase ladder opening phase "${opening.id}" must start at 1`);
  }
}

function clampFraction(fraction: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 1));
}

/**
 * The same ladder read as the share of the value already gone, so the threshold part's ascending
 * cut points fit a list authored high to low. Built once per phase list.
 */
const ladders = new WeakMap<readonly PhaseLike[], readonly ThresholdBoundary<string>[]>();

function spentLadder(phases: readonly PhaseLike[]): readonly ThresholdBoundary<string>[] {
  const cached = ladders.get(phases);
  if (cached !== undefined) return cached;
  const ladder = phases.map((phase) => ({ id: phase.id, at: 1 - phase.at }));
  ladders.set(phases, ladder);
  return ladder;
}

/** The index of the phase a fraction sits in, resolved through the threshold part's cut points. */
function phaseIndexAt(phases: readonly PhaseLike[], fraction: number): number {
  const ladder = spentLadder(phases);
  const band = tierAt(ladder, 1 - clampFraction(fraction));
  if (band === null) return phases.length - 1;
  const index = ladder.findIndex((entry) => entry.id === band.id);
  return index < 0 ? phases.length - 1 : index;
}

/**
 * Fresh phase clock for a phase list, opening in phase 0 with no tell showing.
 *
 * @capability phase-clock fresh serializable phase clock that opens in the first phase
 */
export function createPhaseClock(phases: readonly PhaseLike[]): PhaseClockState {
  validate(phases);
  const opening = phases[0];
  if (opening === undefined) throw new Error("a phase ladder needs at least one phase");
  return { phase: 0, phaseId: opening.id, ageSeconds: 0, tellId: null, tellRemaining: 0 };
}

/**
 * Advance the phase clock by `dt` at a fraction of the ladder's value and return the phase in effect.
 *
 * A phase changes when the fraction reaches its cut point, and it changes *what the game does with
 * it*: the phase carries the caller's own data, so a change is a different state of the fight and a
 * tell the game shows while the player has time to react. Order is monotone authored data, so a rise
 * does not rewind into an earlier phase and a caller cannot stack tells by re-entering the same cut
 * point. Deterministic in `dt` and the fraction; the cut points come from `threshold/thresholds`.
 *
 * @capability phase-ladder data-authored phases that change caller data and fire a tell at value cut points
 */
export function advancePhase<P extends PhaseLike>(
  phases: readonly P[],
  clock: PhaseClockState,
  fraction: number,
  dt: number,
): PhaseStep<P> {
  validate(phases);
  const targetIndex = phaseIndexAt(phases, fraction);
  const nextIndex = Math.max(clock.phase, targetIndex);
  const phaseIndex = Math.min(phases.length - 1, Math.max(0, nextIndex));
  const phase = phases[phaseIndex];
  if (phase === undefined) throw new Error("a phase ladder needs at least one phase");
  const changed = phaseIndex !== clock.phase;
  const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
  let tellId = clock.tellId;
  let tellRemaining = Math.max(0, clock.tellRemaining - step);
  let tell: PhaseTell | null = null;

  if (changed) {
    tell = phase.tell ?? null;
    tellId = tell === null ? null : tell.id;
    tellRemaining = tell === null ? 0 : Math.max(0, tell.seconds);
  } else if (tellRemaining <= 0) {
    tellId = null;
  }

  return {
    state: {
      phase: phaseIndex,
      phaseId: phase.id,
      ageSeconds: changed ? 0 : clock.ageSeconds + step,
      tellId,
      tellRemaining,
    },
    phase,
    changed,
    tell,
  };
}
