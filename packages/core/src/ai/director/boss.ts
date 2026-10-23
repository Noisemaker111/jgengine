import type { SquadRole } from "../../combat/squadTactics";

/** The role shape a boss fights with in one phase: the same dials a squad role uses. */
export type BossBehaviour = Omit<SquadRole, "id" | "count">;

/** The warning a boss gives while it changes phase, and how long the player has to read it. */
export interface BossTell {
  /** Game-owned id: an animation, a sound, a HUD banner. */
  id: string;
  /** Seconds the tell stays visible after the phase changes. Default `1.5`. */
  telegraphSeconds?: number;
}

/** One authored phase: the health it starts at, how the boss fights, and its tell. */
export interface BossPhase {
  id: string;
  /** Health fraction at or below which this phase is in effect, `0..1`. The opening phase is `1`. */
  atHealth: number;
  /** How the boss fights while this phase holds. */
  behaviour: BossBehaviour;
  /** Warning shown when the boss enters this phase. Omit for a silent phase. */
  tell?: BossTell;
}

/** Serializable boss state: which phase holds, how long it has held, and the tell still on screen. */
export interface BossState {
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

/** One step of the boss clock. */
export interface BossStep {
  state: BossState;
  /** The phase in effect after the step. */
  phase: BossPhase;
  /** True on the step the phase changed. */
  changed: boolean;
  /** The tell to fire now, or null. Only set on a change, so a caller never replays a tell. */
  tell: BossTell | null;
}

const DEFAULT_TELL_SECONDS = 1.5;

function validate(phases: readonly BossPhase[]): void {
  if (phases.length === 0) throw new Error("boss needs at least one phase");
  for (let index = 0; index < phases.length; index += 1) {
    const phase = phases[index]!;
    if (phase.id.length === 0) throw new Error(`boss phase ${index} has an empty id`);
    if (!Number.isFinite(phase.atHealth) || phase.atHealth < 0 || phase.atHealth > 1) {
      throw new Error(`boss phase "${phase.id}" atHealth must be between 0 and 1`);
    }
    const previous = phases[index - 1];
    if (previous !== undefined && phase.atHealth > previous.atHealth) {
      throw new Error(`boss phase "${phase.id}" atHealth must not exceed "${previous.id}" — phases run high to low`);
    }
  }
  if (phases[0]!.atHealth < 1) {
    throw new Error(`boss opening phase "${phases[0]!.id}" must start at atHealth 1`);
  }
}

/** The phase a boss fights with at a health fraction. Pure read for a HUD; never mutates. */
export function bossPhase(phases: readonly BossPhase[], health: number): BossPhase {
  validate(phases);
  const clamped = Math.max(0, Math.min(1, Number.isFinite(health) ? health : 1));
  let current = phases[0]!;
  for (const phase of phases) if (clamped <= phase.atHealth) current = phase;
  return current;
}

/**
 * Fresh boss state for a phase list, opening in phase 0 with no tell showing.
 *
 * @capability boss-phase-state fresh serializable boss phase state that opens in the first phase
 */
export function createBossState(phases: readonly BossPhase[]): BossState {
  validate(phases);
  return { phase: 0, phaseId: phases[0]!.id, ageSeconds: 0, tellId: null, tellRemaining: 0 };
}

/**
 * Advance the boss by `dt` at a health fraction and return the phase in effect.
 *
 * A phase changes when health reaches its threshold, and it changes *behaviour with it*: the phase
 * carries the same role dials squad combat executes, so a phase change is a different fight (range,
 * cover, discipline) and a tell the game shows while the player has time to react. Phase order is
 * monotone hand-written data, so a heal does not rewind the boss into an earlier phase and a caller
 * cannot stack tells by re-entering the same threshold. Deterministic in `dt` and health.
 *
 * @capability boss-phases data-authored boss phases that change behaviour and fire a tell at health thresholds
 */
export function advanceBoss(
  phases: readonly BossPhase[],
  state: BossState,
  health: number,
  dt: number,
): BossStep {
  validate(phases);
  const clamped = Math.max(0, Math.min(1, Number.isFinite(health) ? health : 1));
  const step = Number.isFinite(dt) && dt > 0 ? dt : 0;

  let phaseIndex = state.phase;
  let changed = false;
  for (let index = phaseIndex + 1; index < phases.length; index += 1) {
    if (clamped <= phases[index]!.atHealth) {
      phaseIndex = index;
      changed = true;
    }
  }
  const phase = phases[phaseIndex] ?? phases[0]!;
  let tellId = state.tellId;
  let tellRemaining = Math.max(0, state.tellRemaining - step);
  let tell: BossTell | null = null;

  if (changed) {
    tell = phase.tell ?? null;
    tellId = tell?.id ?? null;
    tellRemaining = tell === null ? 0 : Math.max(0, tell.telegraphSeconds ?? DEFAULT_TELL_SECONDS);
  } else if (tellRemaining <= 0) {
    tellId = null;
  }

  return {
    state: {
      phase: phaseIndex,
      phaseId: phase.id,
      ageSeconds: changed ? 0 : state.ageSeconds + step,
      tellId,
      tellRemaining,
    },
    phase,
    changed,
    tell,
  };
}
