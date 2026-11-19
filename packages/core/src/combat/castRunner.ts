export interface CastConfig {
  abilityId: string;
  castTimeMs: number;
  /** Total movement distance tolerated before the cast auto-interrupts; default `0.04`. `Infinity` allows casting on the move. */
  moveTolerance?: number;
  /**
   * Per-tick movement at or below this is ignored rather than added to the running total — the
   * caster's noise floor. A 3D game's pose jitters every frame from terrain-following ground snap
   * and float drift; since `moveTolerance` accumulates, feeding those raw deltas straight in will
   * silently cancel casts the player never interrupted, and the failure is intermittent rather than
   * obvious. Only the game knows its own noise floor, so declare it once here instead of filtering
   * at every `tick` call site. Default `0` (count every reported movement).
   */
  moveDeadzone?: number;
}

export interface CastBarSnapshot {
  abilityId: string;
  castTimeMs: number;
  elapsedMs: number;
  remainingMs: number;
  /** Fill fraction in `[0, 1]` for the cast bar. */
  fraction: number;
  moveTolerance: number;
  moveDeadzone: number;
  movedTotal: number;
}

export type CastInterruptReason = "moved" | "cancelled" | "replaced";

export type CastEvent =
  | { kind: "completed"; abilityId: string }
  | { kind: "interrupted"; abilityId: string; reason: CastInterruptReason };

export interface CastRunner {
  begin(config: CastConfig): boolean;
  casting(): boolean;
  state(): CastBarSnapshot | null;
  restore(next: CastBarSnapshot | null): void;
  interrupt(reason?: CastInterruptReason): CastEvent | null;
  tick(dtSeconds: number, movedDistance?: number): CastEvent | null;
}

const DEFAULT_MOVE_TOLERANCE = 0.04;

interface ActiveCast {
  abilityId: string;
  castTimeMs: number;
  moveTolerance: number;
  moveDeadzone: number;
  elapsedMs: number;
  movedTotal: number;
}

/** @capability cast-bar run a channeled cast timer that movement or damage can interrupt */
export function createCastRunner(): CastRunner {
  let active: ActiveCast | null = null;

  function snapshot(): CastBarSnapshot | null {
    if (active === null) return null;
    const fraction = active.castTimeMs <= 0 ? 1 : Math.min(1, active.elapsedMs / active.castTimeMs);
    return {
      abilityId: active.abilityId,
      castTimeMs: active.castTimeMs,
      elapsedMs: active.elapsedMs,
      remainingMs: Math.max(0, active.castTimeMs - active.elapsedMs),
      fraction,
      moveTolerance: active.moveTolerance,
      moveDeadzone: active.moveDeadzone,
      movedTotal: active.movedTotal,
    };
  }

  return {
    begin(config) {
      if (active !== null) return false;
      active = {
        abilityId: config.abilityId,
        castTimeMs: Math.max(0, config.castTimeMs),
        moveTolerance: config.moveTolerance ?? DEFAULT_MOVE_TOLERANCE,
        moveDeadzone: Math.max(0, config.moveDeadzone ?? 0),
        elapsedMs: 0,
        movedTotal: 0,
      };
      return true;
    },
    casting: () => active !== null,
    state: snapshot,
    restore(next) {
      if (next === null) {
        active = null;
        return;
      }
      active = {
        abilityId: next.abilityId,
        castTimeMs: Math.max(0, next.castTimeMs),
        moveTolerance: next.moveTolerance,
        moveDeadzone: Math.max(0, next.moveDeadzone),
        elapsedMs: Math.max(0, next.elapsedMs),
        movedTotal: Math.max(0, next.movedTotal),
      };
    },
    interrupt(reason = "cancelled") {
      if (active === null) return null;
      const abilityId = active.abilityId;
      active = null;
      return { kind: "interrupted", abilityId, reason };
    },
    tick(dtSeconds, movedDistance = 0) {
      if (active === null) return null;
      const moved = Math.max(0, movedDistance);
      // Below the caster's noise floor this is jitter, not travel — do not accumulate it.
      if (moved > active.moveDeadzone) active.movedTotal += moved;
      if (active.movedTotal > active.moveTolerance) {
        const abilityId = active.abilityId;
        active = null;
        return { kind: "interrupted", abilityId, reason: "moved" };
      }
      active.elapsedMs += Math.max(0, dtSeconds) * 1000;
      if (active.elapsedMs >= active.castTimeMs) {
        const abilityId = active.abilityId;
        active = null;
        return { kind: "completed", abilityId };
      }
      return null;
    },
  };
}
