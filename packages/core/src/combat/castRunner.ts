export interface CastConfig {
  abilityId: string;
  castTimeMs: number;
  /** Total movement distance tolerated before the cast auto-interrupts; default `0.04`. `Infinity` allows casting on the move. */
  moveTolerance?: number;
}

export interface CastBarSnapshot {
  abilityId: string;
  castTimeMs: number;
  elapsedMs: number;
  remainingMs: number;
  /** Fill fraction in `[0, 1]` for the cast bar. */
  fraction: number;
}

export type CastInterruptReason = "moved" | "cancelled" | "replaced";

export type CastEvent =
  | { kind: "completed"; abilityId: string }
  | { kind: "interrupted"; abilityId: string; reason: CastInterruptReason };

/**
 * Per-entity cast-time state machine — begin, tick with game-time `dt` plus how far the caster
 * moved, and act on the returned event. The runner owns timing and move-interruption only; the
 * caller spends resources, starts cooldowns, and executes the ability when `completed` fires
 * (compose with `abilityKit` — check readiness before `begin`, `cast` on completion).
 */
export interface CastRunner {
  /** Start a cast; `false` while one is already in flight (interrupt or let it finish first). */
  begin(config: CastConfig): boolean;
  casting(): boolean;
  state(): CastBarSnapshot | null;
  /** Interrupt the in-flight cast now; returns the interruption event, or `null` when idle. */
  interrupt(reason?: CastInterruptReason): CastEvent | null;
  /** Advance by `dtSeconds`; `movedDistance` accumulates toward the config's `moveTolerance`. */
  tick(dtSeconds: number, movedDistance?: number): CastEvent | null;
}

const DEFAULT_MOVE_TOLERANCE = 0.04;

interface ActiveCast {
  abilityId: string;
  castTimeMs: number;
  moveTolerance: number;
  elapsedMs: number;
  movedTotal: number;
}

/**
 * Run a channeled cast/charge timer that movement or damage can interrupt — the spell cast bar.
 *
 * @capability cast-bar run a channeled cast timer that movement or damage can interrupt
 */
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
    };
  }

  return {
    begin(config) {
      if (active !== null) return false;
      active = {
        abilityId: config.abilityId,
        castTimeMs: Math.max(0, config.castTimeMs),
        moveTolerance: config.moveTolerance ?? DEFAULT_MOVE_TOLERANCE,
        elapsedMs: 0,
        movedTotal: 0,
      };
      return true;
    },
    casting: () => active !== null,
    state: snapshot,
    interrupt(reason = "cancelled") {
      if (active === null) return null;
      const abilityId = active.abilityId;
      active = null;
      return { kind: "interrupted", abilityId, reason };
    },
    tick(dtSeconds, movedDistance = 0) {
      if (active === null) return null;
      active.movedTotal += Math.max(0, movedDistance);
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
