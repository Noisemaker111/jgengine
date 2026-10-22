import { devtools } from "../devtools/devtools";
import { resolveRng } from "../random/resolveRng";
import {
  resolveStatusApplication,
  type StatusApplicationOutcome,
  type StatusApplicationSpec,
  type StatusInstance,
  type StatusStackPolicy,
} from "./statusApplication";

/**
 * What a status does on each tick. Damage ticks are reported with the channel the caller's damage
 * pipeline resolves, so a burn still meets resistances and armor; stat ticks are a per-stack delta
 * summed by {@link StatusRuntime.statDelta} (`slow` → move speed, `corrode` → armor).
 */
export type StatusEffect =
  | { kind: "damage"; channel: string }
  | { kind: "stat"; stat: string };

/**
 * One status the runtime can apply: how a fresh application folds into a live one
 * ({@link StatusStackPolicy}), how long it lives, how often and how hard it ticks, and what a tick
 * does. The stack rule is the *only* thing that changes stacks — per-tick magnitude is
 * `magnitude × stacks`, never `magnitude ^ applications`.
 */
export interface StatusDef {
  /** Caller-owned id (`"burn"`, `"shock"`, `"slow"`, `"corrode"`) — the runtime never branches on it. */
  id: string;
  /** Behaviour when the target already carries this status. */
  stack: StatusStackPolicy;
  /** Base lifetime in milliseconds. */
  durationMs: number;
  /** Milliseconds between ticks; defaults to `durationMs` (one tick as it expires). */
  intervalMs?: number;
  /** Per-stack effect size: damage per tick, or a stat delta per stack. */
  magnitude?: number;
  /** What each tick does. Omitted means a status with no periodic effect (HUD/predicate only). */
  effect?: StatusEffect;
  /** Landing chance in `[0,1]` before any application scale; default `1`. */
  chance?: number;
}

/** A damage tick, already routed through the caller's `applyDamage` when one was supplied. */
export interface StatusDamageTick {
  kind: "damage";
  target: string;
  status: string;
  stacks: number;
  channel: string;
  /** Raw `magnitude × stacks` before the caller's resistances and armor. */
  amount: number;
  /** What the caller's pipeline reported as dealt; equals `amount` when no pipeline was supplied. */
  dealt: number;
}

/** A stat tick: a per-stack delta the caller reads while the status lives. */
export interface StatusStatTick {
  kind: "stat";
  target: string;
  status: string;
  stacks: number;
  stat: string;
  delta: number;
}

/** A status ended: remove its HUD row and any stat delta it was contributing. */
export interface StatusExpiredTick {
  kind: "expired";
  target: string;
  status: string;
  stacks: number;
}

/** Everything one `tick` call produced, in target-then-status order. */
export type StatusTickEvent = StatusDamageTick | StatusStatTick | StatusExpiredTick;

/** Options for one application; scales compose with the definition's own base values. */
export interface StatusApplyOptions {
  source?: string;
  chanceScale?: number;
  durationScale?: number;
  magnitudeScale?: number;
}

/** One live status plus its tick timer, as saved and restored. */
export interface StatusRuntimeEntry {
  instance: StatusInstance;
  untilTickMs: number;
}

/** Serializable runtime state: carried statuses, tick timers, and the counters a probe reports. */
export interface StatusRuntimeState {
  targets: Array<{ id: string; entries: StatusRuntimeEntry[] }>;
  ticks: number;
  applied: number;
  expired: number;
}

/** Tunables a game can adjust at runtime without discarding carried statuses. */
export interface StatusRuntimeOptions {
  /** Status definitions; re-supply through {@link StatusRuntime.retune} when they change. */
  statuses: readonly StatusDef[];
  /** Injected `[0,1)` stream for landing rolls. Omitting it falls back to `Math.random` and warns once. */
  rng?: () => number;
  /** Route a damage tick through the caller's resistances/armor and return what it dealt. */
  applyDamage?: (tick: StatusDamageTick) => number;
  /** Most ticks one status emits per call; the remainder carries to the next call, never dropped. Default `8`. */
  maxTicksPerCall?: number;
  /** Register a one-line devtools probe under this name. */
  devtoolsName?: string;
}

/** A pool of per-target statuses that applies stack rules, ticks effects, and hands its state out. */
export interface StatusRuntime {
  /** Try to apply one status to a target, folding into an existing instance per its declared stack rule. */
  apply(targetId: string, statusId: string, options?: StatusApplyOptions): StatusApplicationOutcome;
  statusesOf(targetId: string): readonly StatusInstance[];
  has(targetId: string, statusId: string): boolean;
  /** Sum of `magnitude × stacks` for every live status whose effect is this stat. */
  statDelta(targetId: string, stat: string): number;
  /** Advance every live status; returns each tick's effect and each expiry. */
  tick(dtSeconds: number): StatusTickEvent[];
  /** Drop one status, or every status, from a target. */
  clear(targetId: string, statusId?: string): void;
  snapshot(): StatusRuntimeState;
  restore(next: StatusRuntimeState): void;
  /** Swap the definitions (hot reload, tuning) while carried statuses keep running. */
  retune(statuses: readonly StatusDef[]): void;
  /** Counters for a probe or a test. */
  stats(): { targets: number; active: number; ticks: number; applied: number; expired: number };
  /** Drop the devtools probe registered by `devtoolsName`. Safe to call twice. */
  dispose(): void;
}

/** Raised when a caller names a status id the runtime has no definition for.
 * @capability status-unknown reject a status id the runtime has no definition for
 */
export class UnknownStatusError extends Error {
  readonly status: string;

  constructor(status: string) {
    super(`Unknown status: ${status}`);
    this.name = "UnknownStatusError";
    this.status = status;
  }
}

function intervalOf(def: StatusDef): number {
  return Math.max(1, Math.round(def.intervalMs ?? def.durationMs));
}

function tickCountOf(def: StatusDef): number {
  if (def.durationMs <= 0) return 0;
  return Math.max(1, Math.round(def.durationMs / intervalOf(def)));
}

function specOf(def: StatusDef): StatusApplicationSpec {
  const spec: StatusApplicationSpec = {
    status: def.id,
    chance: def.chance ?? 1,
    durationMs: Math.max(0, def.durationMs),
    ticks: tickCountOf(def),
    magnitude: def.magnitude ?? 0,
    stack: def.stack,
  };
  return spec;
}

/**
 * Build a status runtime over serializable definitions. Applications reuse
 * {@link resolveStatusApplication} for chance and stacking, so a refresh/stack-to-N/ignore rule has
 * exactly one implementation; `tick` then applies each status's declared effect per stack.
 *
 * @capability status-runtime tick data-defined statuses (burn, shock, slow, corrode) with declared stacking rules and per-tick effects
 */
export function createStatusRuntime(options: StatusRuntimeOptions): StatusRuntime {
  const rng = resolveRng(options.rng, "statusRuntime");
  const maxTicksPerCall = Math.max(1, Math.round(options.maxTicksPerCall ?? 8));
  let defs = new Map<string, StatusDef>();
  const targets = new Map<string, Map<string, StatusRuntimeEntry>>();
  let ticks = 0;
  let applied = 0;
  let expired = 0;

  function retune(statuses: readonly StatusDef[]): void {
    defs = new Map(statuses.map((def) => [def.id, def]));
  }
  retune(options.statuses);

  function defOf(statusId: string): StatusDef {
    const def = defs.get(statusId);
    if (def === undefined) throw new UnknownStatusError(statusId);
    return def;
  }

  function targetOf(targetId: string): Map<string, StatusRuntimeEntry> {
    let byId = targets.get(targetId);
    if (byId === undefined) {
      byId = new Map();
      targets.set(targetId, byId);
    }
    return byId;
  }

  function effectEvent(targetId: string, def: StatusDef, instance: StatusInstance): StatusTickEvent[] {
    const effect = def.effect;
    if (effect === undefined) return [];
    const amount = (def.magnitude ?? 0) * instance.stacks;
    if (effect.kind === "stat") {
      return [{
        kind: "stat",
        target: targetId,
        status: def.id,
        stacks: instance.stacks,
        stat: effect.stat,
        delta: amount,
      }];
    }
    const tick: StatusDamageTick = {
      kind: "damage",
      target: targetId,
      status: def.id,
      stacks: instance.stacks,
      channel: effect.channel,
      amount,
      dealt: amount,
    };
    if (options.applyDamage !== undefined) tick.dealt = options.applyDamage(tick);
    return [tick];
  }

  function apply(targetId: string, statusId: string, applyOptions?: StatusApplyOptions): StatusApplicationOutcome {
    const def = defOf(statusId);
    const byId = targetOf(targetId);
    const current = byId.get(statusId)?.instance ?? null;
    const outcome = resolveStatusApplication({
      spec: specOf(def),
      scale: {
        ...(applyOptions?.chanceScale !== undefined ? { applyChance: applyOptions.chanceScale } : {}),
        ...(applyOptions?.durationScale !== undefined ? { duration: applyOptions.durationScale } : {}),
        ...(applyOptions?.magnitudeScale !== undefined ? { magnitude: applyOptions.magnitudeScale } : {}),
      },
      current,
      ...(applyOptions?.source !== undefined ? { source: applyOptions.source } : {}),
      rng,
    });
    if (outcome.instance === null) return outcome;
    if (outcome.kind === "ignored" || outcome.kind === "missed" || outcome.kind === "immune") return outcome;
    // A fresh application restarts the tick clock, so stacking cannot bank a burst of instant ticks.
    byId.set(statusId, { instance: outcome.instance, untilTickMs: intervalOf(def) });
    if (outcome.kind === "applied") applied += 1;
    return outcome;
  }

  function stats() {
    let active = 0;
    for (const byId of targets.values()) active += byId.size;
    return { targets: targets.size, active, ticks, applied, expired };
  }

  function probeLine(): string {
    const counts = stats();
    return `${counts.targets} targets ${counts.active} statuses · ${counts.applied} applied ${counts.expired} expired · ${counts.ticks} ticks`;
  }

  const unregister = options.devtoolsName === undefined
    ? null
    : devtools.probes.register(options.devtoolsName, () => probeLine());

  return {
    apply,
    statusesOf(targetId) {
      const byId = targets.get(targetId);
      if (byId === undefined) return [];
      return [...byId.values()].map((entry) => entry.instance);
    },
    has(targetId, statusId) {
      return targets.get(targetId)?.has(statusId) === true;
    },
    statDelta(targetId, stat) {
      const byId = targets.get(targetId);
      if (byId === undefined) return 0;
      let total = 0;
      for (const [statusId, entry] of byId) {
        const def = defs.get(statusId);
        if (def?.effect?.kind !== "stat" || def.effect.stat !== stat) continue;
        total += (def.magnitude ?? 0) * entry.instance.stacks;
      }
      return total;
    },
    tick(dtSeconds) {
      const events: StatusTickEvent[] = [];
      if (!(dtSeconds > 0)) return events;
      const stepMs = dtSeconds * 1000;
      ticks += 1;
      for (const [targetId, byId] of targets) {
        for (const [statusId, entry] of byId) {
          const def = defs.get(statusId);
          // Time past the status's own lifetime must not buy extra ticks, so a long frame neither
          // over-ticks nor skips the tick that falls due on the last frame of the status.
          const livedMs = Math.min(stepMs, Math.max(0, entry.instance.remainingMs));
          if (def !== undefined) {
            const intervalMs = intervalOf(def);
            entry.untilTickMs -= livedMs;
            let emitted = 0;
            while (entry.untilTickMs <= 0 && emitted < maxTicksPerCall) {
              entry.untilTickMs += intervalMs;
              emitted += 1;
              entry.instance.ticks = Math.max(0, entry.instance.ticks - 1);
              for (const event of effectEvent(targetId, def, entry.instance)) events.push(event);
            }
          }
          entry.instance.remainingMs -= livedMs;
          if (entry.instance.remainingMs <= 0) {
            entry.instance.remainingMs = 0;
            byId.delete(statusId);
            expired += 1;
            events.push({ kind: "expired", target: targetId, status: statusId, stacks: 0 });
          }
        }
        if (byId.size === 0) targets.delete(targetId);
      }
      return events;
    },
    clear(targetId, statusId) {
      const byId = targets.get(targetId);
      if (byId === undefined) return;
      if (statusId === undefined) targets.delete(targetId);
      else byId.delete(statusId);
    },
    snapshot() {
      return {
        targets: [...targets.entries()].map(([id, byId]) => ({
          id,
          entries: [...byId.values()].map((entry) => ({
            instance: { ...entry.instance },
            untilTickMs: entry.untilTickMs,
          })),
        })),
        ticks,
        applied,
        expired,
      };
    },
    restore(next) {
      targets.clear();
      ticks = next.ticks;
      applied = next.applied;
      expired = next.expired;
      for (const saved of next.targets) {
        const byId = new Map<string, StatusRuntimeEntry>();
        for (const entry of saved.entries) {
          byId.set(entry.instance.status, { instance: { ...entry.instance }, untilTickMs: entry.untilTickMs });
        }
        targets.set(saved.id, byId);
      }
    },
    retune,
    stats,
    dispose() {
      unregister?.();
    },
  };
}
