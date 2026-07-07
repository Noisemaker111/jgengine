export type MoodleSeverity = "good" | "neutral" | "warning" | "critical";

export type MoodleSource = "meter" | "ailment" | "buff";

export interface Moodle {
  id: string;
  label: string;
  severity: MoodleSeverity;
  source: MoodleSource;
  stacks: number;
  icon?: string;
  /** 0..1 progress ring — remaining buff time, wound treatment, meter fill. Absent = no ring. */
  fraction?: number;
  /** Free-form note surfaced under the label (e.g. "-3°C", "needs bandage"). */
  note?: string;
}

export const MOODLE_SEVERITY_ORDER: Record<MoodleSeverity, number> = {
  critical: 0,
  warning: 1,
  neutral: 2,
  good: 3,
};

function mergeStack(into: Map<string, Moodle>, moodle: Moodle): void {
  const existing = into.get(moodle.id);
  if (existing === undefined) {
    into.set(moodle.id, { ...moodle });
    return;
  }
  into.set(moodle.id, {
    ...existing,
    stacks: existing.stacks + moodle.stacks,
    severity:
      MOODLE_SEVERITY_ORDER[moodle.severity] < MOODLE_SEVERITY_ORDER[existing.severity]
        ? moodle.severity
        : existing.severity,
  });
}

/**
 * Merge any number of moodle groups into one stack — meters, ailments, and buffs
 * share this display. Same-id moodles fold together (stacks add, worst severity wins);
 * the result is ordered worst-first so the HUD reads critical statuses at a glance.
 */
export function stackMoodles(...groups: readonly (readonly Moodle[])[]): Moodle[] {
  const merged = new Map<string, Moodle>();
  for (const group of groups) for (const moodle of group) mergeStack(merged, moodle);
  return [...merged.values()].sort(
    (a, b) => MOODLE_SEVERITY_ORDER[a.severity] - MOODLE_SEVERITY_ORDER[b.severity],
  );
}

export interface TimedMoodleInput {
  id: string;
  label: string;
  severity?: MoodleSeverity;
  icon?: string;
  note?: string;
  stacks?: number;
  /** Game-seconds until the moodle drops. Omit for a moodle that stays until removed. */
  duration?: number;
}

interface TimedMoodleState {
  label: string;
  severity: MoodleSeverity;
  stacks: number;
  icon?: string;
  note?: string;
  remaining: number | null;
  total: number | null;
}

export interface MoodleStack {
  /** Add or refresh a timed moodle (Valheim food buff, a temporary shelter status). */
  add(input: TimedMoodleInput): void;
  remove(id: string): void;
  has(id: string): boolean;
  /** Advance timers by a game-time delta; drops expired moodles. */
  tick(dt: number): void;
  /** The live timed moodles (buffs, temporary statuses). */
  list(): Moodle[];
  clear(): void;
}

/**
 * A stateful holder for timed status moodles (food buffs, temporary shelter, warmth).
 * Meters and multi-region health derive their own moodles on read; combine all three
 * through `stackMoodles(stack.list(), meterMoodles, ailmentMoodles)` for one display.
 */
export function createMoodleStack(): MoodleStack {
  const moodles = new Map<string, TimedMoodleState>();
  return {
    add(input) {
      moodles.set(input.id, {
        label: input.label,
        severity: input.severity ?? "good",
        stacks: input.stacks ?? 1,
        ...(input.icon === undefined ? {} : { icon: input.icon }),
        ...(input.note === undefined ? {} : { note: input.note }),
        remaining: input.duration ?? null,
        total: input.duration ?? null,
      });
    },
    remove(id) {
      moodles.delete(id);
    },
    has(id) {
      return moodles.has(id);
    },
    tick(dt) {
      if (dt <= 0) return;
      for (const [id, state] of moodles) {
        if (state.remaining === null) continue;
        state.remaining -= dt;
        if (state.remaining <= 0) moodles.delete(id);
      }
    },
    list() {
      const out: Moodle[] = [];
      for (const [id, state] of moodles) {
        out.push({
          id,
          label: state.label,
          severity: state.severity,
          source: "buff",
          stacks: state.stacks,
          ...(state.icon === undefined ? {} : { icon: state.icon }),
          ...(state.note === undefined ? {} : { note: state.note }),
          ...(state.remaining !== null && state.total !== null && state.total > 0
            ? { fraction: Math.max(0, Math.min(1, state.remaining / state.total)) }
            : {}),
        });
      }
      return out;
    },
    clear() {
      moodles.clear();
    },
  };
}
