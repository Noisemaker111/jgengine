import type { BuildupProc } from "./breakMeters";

export interface DotSpec {
  damagePerTick: number;
  /** Milliseconds between damage ticks; clamped to a positive minimum. */
  intervalMs: number;
  /** Total lifetime in milliseconds; the DoT expires once its age reaches this. */
  durationMs: number;
  /** Label echoed on each emitted tick (bleed, poison, burn); defaults to the apply key. */
  status?: string;
}

export interface DotTick {
  id: string;
  status: string;
  damage: number;
  expired: boolean;
}

/**
 * A pool of timed damage-over-time instances keyed by string (`bleed`, `poison`, `burn`) — the
 * recurring-damage counterpart to `breakMeters`' one-shot buildup procs (#536.4). `tick` advances
 * every active DoT and returns the damage due this frame, one entry per interval crossed, so the game
 * routes each through its own effect pipeline; a pure scheduler that never applies damage itself.
 */
export interface DotField {
  apply(id: string, spec: DotSpec): void;
  applyProc(id: string, proc: BuildupProc, damagePerTick: number, intervalMs: number): void;
  active(id: string): boolean;
  cancel(id: string): void;
  clear(): void;
  count(): number;
  tick(dtSeconds: number): DotTick[];
}

interface ActiveDot {
  status: string;
  damagePerTick: number;
  intervalMs: number;
  durationMs: number;
  ageMs: number;
  ticksEmitted: number;
}

/** @capability dot-field track stacking damage-over-time effects and drain damage each frame */
export function createDotField(): DotField {
  const dots = new Map<string, ActiveDot>();

  return {
    apply(id, spec) {
      dots.set(id, {
        status: spec.status ?? id,
        damagePerTick: spec.damagePerTick,
        intervalMs: Math.max(1, spec.intervalMs),
        durationMs: Math.max(0, spec.durationMs),
        ageMs: 0,
        ticksEmitted: 0,
      });
    },
    applyProc(id, proc, damagePerTick, intervalMs) {
      this.apply(id, { damagePerTick, intervalMs, durationMs: proc.durationMs, status: proc.status });
    },
    active: (id) => dots.has(id),
    cancel: (id) => void dots.delete(id),
    clear: () => dots.clear(),
    count: () => dots.size,
    tick(dtSeconds) {
      if (dtSeconds <= 0) return [];
      const dtMs = dtSeconds * 1000;
      const emitted: DotTick[] = [];
      for (const [id, dot] of dots) {
        dot.ageMs += dtMs;
        const activeMs = Math.min(dot.ageMs, dot.durationMs);
        const dueTicks = Math.floor(activeMs / dot.intervalMs);
        let last: DotTick | null = null;
        while (dot.ticksEmitted < dueTicks) {
          dot.ticksEmitted += 1;
          last = { id, status: dot.status, damage: dot.damagePerTick, expired: false };
          emitted.push(last);
        }
        if (dot.ageMs >= dot.durationMs) {
          dots.delete(id);
          if (last !== null) last.expired = true;
          else emitted.push({ id, status: dot.status, damage: 0, expired: true });
        }
      }
      return emitted;
    },
  };
}
