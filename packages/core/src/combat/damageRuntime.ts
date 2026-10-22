import { devtools } from "../devtools/devtools";
import { resolveRng } from "../random/resolveRng";
import type { StatusApplicationOutcome, StatusInstance } from "./statusApplication";
import {
  assertDamageTable,
  readDamageTable,
  resolveTableDamage,
  type DamageTableDef,
  type DamageTableRow,
} from "./damageTable";
import {
  assertHitZoneTable,
  hitZoneMultiplier,
  resolveHitZone,
  type HitZoneResolution,
  type HitZoneTable,
} from "./hitZones";
import {
  createStatusRuntime,
  type StatusDamageTick,
  type StatusDef,
  type StatusRuntime,
  type StatusRuntimeState,
  type StatusTickEvent,
} from "./statusRuntime";

/** What a target presents to the table: one resistance class and its armor points. */
export interface TargetProfile {
  /** Resistance class (`"flesh"`, `"shield"`, `"armor"`) the target presents. */
  resistance: string;
  /** Armor points before any carried armor-shred statuses. Default `0`. */
  armor?: number;
}

/** One status a hit tries to apply, scaled against that status's own base chance and values. */
export interface DamageStatusRequest {
  id: string;
  chanceScale?: number;
  durationScale?: number;
  magnitudeScale?: number;
}

/** One incoming hit: what struck, how hard, where it landed, and what statuses it carries. */
export interface DamageRuntimeHitInput {
  target: string;
  type: string;
  /** Damage before the zone multiplier, the table, and armor. */
  base: number;
  /** Hit zone id; omitted uses the table's `defaultZone`. */
  zone?: string;
  source?: string;
  statuses?: readonly (string | DamageStatusRequest)[];
}

/** Every stage of one resolved hit, so a UI or a test can read why the final number is what it is. */
export interface DamageRuntimeResolution {
  target: string;
  type: string;
  base: number;
  zone: HitZoneResolution;
  /** Type × resistance multiplier before armor. */
  multiplier: number;
  /** Armor after carried shred statuses, never below zero. */
  armor: number;
  /** Fraction of the hit armor removes at `armor`. */
  mitigation: number;
  /** `base × zone.multiplier × multiplier × (1 − mitigation)`. */
  damage: number;
  statuses: StatusApplicationOutcome[];
}

/** A quoted time to kill for one fixed hit against one health pool. */
export interface TimeToKill {
  damagePerShot: number;
  /** Hits needed, or `Infinity` when the hit deals nothing. */
  shots: number;
  /** Seconds from the first hit to the last: `(shots - 1) × intervalSeconds`. */
  seconds: number;
  intervalSeconds: number;
}

/** Serialized model state: registered targets, carried statuses, and the probe counters. */
export interface DamageRuntimeState {
  targets: Array<{ id: string } & TargetProfile>;
  statuses: StatusRuntimeState;
  hits: number;
  crits: number;
  dealt: number;
  last: { type: string; base: number; damage: number; zone: string; crit: boolean } | null;
}

/** Everything the model reads: the table, the zones, the status definitions, and the RNG. */
export interface DamageRuntimeConfig {
  table: DamageTableDef;
  zones: HitZoneTable;
  statuses?: readonly StatusDef[];
  /** Stat id carried armor-shred statuses reduce. Default `"armor"`. */
  armorStat?: string;
  /** Injected `[0,1)` stream for crit rolls. Omitting it warns once and is not replayable. */
  rng?: () => number;
  /** Register a one-line devtools probe under this name. */
  devtoolsName?: string;
}

/** In-play dials, all retunable without discarding registered targets or carried statuses. */
export interface DamageRuntimeRetune {
  table?: DamageTableDef;
  zones?: HitZoneTable;
  statuses?: readonly StatusDef[];
  armorStat?: string;
}

/**
 * A damage model: registered targets, the table/zones/statuses they are hit with, and carried
 * status state. `hit` resolves a blow, `tick` runs status effects, `timeToKill` quotes a fight, and
 * `table` reads the whole chart. State is plain data, so a save, a replay, or a worker can move it.
 */
export interface DamageRuntime {
  /** Register or replace a target's resistance class and armor. */
  registerTarget(id: string, profile: TargetProfile): void;
  removeTarget(id: string): void;
  target(id: string): TargetProfile | null;
  /** Resolve one hit and apply any statuses it carries. */
  hit(input: DamageRuntimeHitInput): DamageRuntimeResolution;
  /** Apply one status directly (an ability, a hazard) without a damage hit. */
  applyStatus(target: string, statusId: string, options?: DamageStatusRequest & { source?: string }): StatusApplicationOutcome;
  /** Advance carried statuses; damage ticks are resolved through this model's table and armor. */
  tick(dtSeconds: number): StatusTickEvent[];
  /** Quote a fixed hit against a health pool; pass `crit` explicitly so the number never depends on a roll. */
  timeToKill(input: { target: string; type: string; base: number; hp: number; intervalSeconds: number; zone?: string; crit?: boolean }): TimeToKill;
  /** Read the whole table with armor mitigation, optionally at given armor values and base damage. */
  table(read?: Parameters<typeof readDamageTable>[1]): DamageTableRow[];
  retune(patch: DamageRuntimeRetune): void;
  snapshot(): DamageRuntimeState;
  restore(next: DamageRuntimeState): void;
  /** Carried statuses, for a HUD or a test. */
  statusesOf(targetId: string): readonly StatusInstance[];
  stats(): { targets: number; hits: number; crits: number; statusTicks: number; dealt: number };
  /** Drop the devtools probe registered by `devtoolsName`. Safe to call twice. */
  dispose(): void;
}

/** Raised when a hit names a target that was never registered — a wiring error, not a 0-damage hit.
 * @capability damage-target-unknown reject a hit on a target with no registered resistance or armor profile
 */
export class UnknownTargetProfileError extends Error {
  readonly target: string;

  constructor(target: string) {
    super(`No damage profile registered for target: ${target}`);
    this.name = "UnknownTargetProfileError";
    this.target = target;
  }
}

/**
 * Build a damage model from data. The number a hit lands is
 * `base × zone multiplier × type multiplier × (1 − armor mitigation)`; statuses tick through the
 * same table and armor, so a burn on an armored target is mitigated like a bullet.
 *
 * @capability damage-runtime resolve hits through a damage table, hit zones, and armor, and tick data-defined statuses with declared stacking
 */
export function createDamageRuntime(config: DamageRuntimeConfig): DamageRuntime {
  assertDamageTable(config.table);
  assertHitZoneTable(config.zones);
  const rng = resolveRng(config.rng, "createDamageRuntime");

  let table = config.table;
  let zones = config.zones;
  let armorStat = config.armorStat ?? "armor";
  const targets = new Map<string, TargetProfile>();
  let hits = 0;
  let crits = 0;
  let dealt = 0;
  let statusTicks = 0;
  let last: DamageRuntimeState["last"] = null;

  let statusRuntime: StatusRuntime;
  statusRuntime = createStatusRuntime({
    statuses: config.statuses ?? [],
    rng,
    maxTicksPerCall: 8,
    applyDamage: (tick) => resolveStatusDamage(tick),
  });

  function profileOf(targetId: string): TargetProfile {
    const profile = targets.get(targetId);
    if (profile === undefined) throw new UnknownTargetProfileError(targetId);
    return profile;
  }

  /** Base armor plus any carried shred, never negative. */
  function armorOf(targetId: string, profile: TargetProfile): number {
    return Math.max(0, (profile.armor ?? 0) + statusRuntime.statDelta(targetId, armorStat));
  }

  /** Resolve a raw amount through the type table and the target's effective armor. */
  function scaleAt(targetId: string, type: string, base: number): DamageTableRow & { armor: number } {
    const profile = profileOf(targetId);
    const armor = armorOf(targetId, profile);
    return { ...resolveTableDamage(table, { type, resistance: profile.resistance, armor, base }), armor };
  }

  function resolveStatusDamage(tick: StatusDamageTick): number {
    if (!targets.has(tick.target)) return tick.amount;
    return scaleAt(tick.target, tick.channel, tick.amount).damage ?? 0;
  }

  function probeLine(): string {
    const l = last;
    const tail = l === null
      ? "no hits"
      : `last ${l.type} ${l.base.toFixed(1)}→${l.damage.toFixed(1)} ${l.zone}${l.crit ? " crit" : ""}`;
    return `${targets.size} targets · ${hits} hits ${crits} crits · ${statusTicks} status ticks · ${dealt.toFixed(0)} dealt · ${tail}`;
  }

  const unregister = config.devtoolsName === undefined
    ? null
    : devtools.probes.register(config.devtoolsName, () => probeLine());

  return {
    registerTarget(id, profile) {
      targets.set(id, { resistance: profile.resistance, armor: Math.max(0, profile.armor ?? 0) });
    },
    removeTarget(id) {
      targets.delete(id);
      statusRuntime.clear(id);
    },
    target(id) {
      const profile = targets.get(id);
      return profile === undefined ? null : { ...profile };
    },
    hit(input) {
      const zone = resolveHitZone(zones, input.zone, rng);
      const row = scaleAt(input.target, input.type, input.base * zone.multiplier);
      const applied: StatusApplicationOutcome[] = [];
      for (const request of input.statuses ?? []) {
        const statusId = typeof request === "string" ? request : request.id;
        const options = typeof request === "string"
          ? {}
          : {
            ...(request.chanceScale !== undefined ? { chanceScale: request.chanceScale } : {}),
            ...(request.durationScale !== undefined ? { durationScale: request.durationScale } : {}),
            ...(request.magnitudeScale !== undefined ? { magnitudeScale: request.magnitudeScale } : {}),
          };
        applied.push(statusRuntime.apply(input.target, statusId, {
          ...options,
          ...(input.source !== undefined ? { source: input.source } : {}),
        }));
      }
      const damage = row.damage ?? 0;
      hits += 1;
      if (zone.crit) crits += 1;
      dealt += damage;
      last = { type: input.type, base: input.base, damage, zone: zone.zone, crit: zone.crit };
      return {
        target: input.target,
        type: input.type,
        base: input.base,
        zone,
        multiplier: row.multiplier,
        armor: row.armor,
        mitigation: row.mitigation,
        damage,
        statuses: applied,
      };
    },
    applyStatus(target, statusId, options) {
      return statusRuntime.apply(target, statusId, options === undefined ? {} : { ...options });
    },
    tick(dtSeconds) {
      const events = statusRuntime.tick(dtSeconds);
      for (const event of events) {
        if (event.kind === "damage") {
          statusTicks += 1;
          dealt += event.dealt;
        }
      }
      return events;
    },
    timeToKill(input) {
      const profile = profileOf(input.target);
      const zoneResolved = hitZoneMultiplier(zones, input.zone, input.crit === true);
      const row = resolveTableDamage(table, {
        type: input.type,
        resistance: profile.resistance,
        armor: armorOf(input.target, profile),
        base: input.base * zoneResolved.multiplier,
      });
      const damagePerShot = row.damage ?? 0;
      const intervalSeconds = Math.max(0, input.intervalSeconds);
      const shots = damagePerShot <= 0
        ? Number.POSITIVE_INFINITY
        // The epsilon keeps a hit that exactly empties the pool from reading as needing one more
        // because of floating-point noise in the product of four factors.
        : Math.ceil(Math.max(0, input.hp) / damagePerShot - 1e-9);
      return {
        damagePerShot,
        shots,
        seconds: Number.isFinite(shots) ? Math.max(0, shots - 1) * intervalSeconds : Number.POSITIVE_INFINITY,
        intervalSeconds,
      };
    },
    table(read) {
      return readDamageTable(table, read);
    },
    retune(patch) {
      if (patch.table !== undefined) {
        assertDamageTable(patch.table);
        table = patch.table;
      }
      if (patch.zones !== undefined) {
        assertHitZoneTable(patch.zones);
        zones = patch.zones;
      }
      if (patch.statuses !== undefined) statusRuntime.retune(patch.statuses);
      if (patch.armorStat !== undefined) armorStat = patch.armorStat;
    },
    snapshot() {
      return {
        targets: [...targets.entries()].map(([id, profile]) => ({
          id,
          resistance: profile.resistance,
          armor: profile.armor ?? 0,
        })),
        statuses: statusRuntime.snapshot(),
        hits,
        crits,
        dealt,
        last: last === null ? null : { ...last },
      };
    },
    restore(next) {
      targets.clear();
      for (const profile of next.targets) {
        targets.set(profile.id, { resistance: profile.resistance, armor: profile.armor });
      }
      statusRuntime.restore(next.statuses);
      hits = next.hits;
      crits = next.crits;
      dealt = next.dealt;
      last = next.last === null ? null : { ...next.last };
    },
    statusesOf: (targetId) => statusRuntime.statusesOf(targetId),
    stats: () => ({ targets: targets.size, hits, crits, statusTicks, dealt }),
    dispose() {
      statusRuntime.dispose();
      unregister?.();
    },
  };
}
