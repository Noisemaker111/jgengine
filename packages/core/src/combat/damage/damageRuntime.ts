import { devtools } from "../../devtools/devtools";
import type { DamageAppliedEvent, GameEvents } from "../../game/events";
import { resolveRng } from "../../random/resolveRng";
import type { StatusApplicationOutcome, StatusInstance } from "../statusApplication";
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
} from "../hitZones";
import {
  createStatusRuntime,
  type StatusDamageTick,
  type StatusDef,
  type StatusRuntime,
  type StatusRuntimeState,
  type StatusTickEvent,
} from "../statusRuntime";

const RECENT_DAMAGE_LIMIT = 8;
const RECENT_DAMAGE_PROBE_LINES = 3;

export interface TargetProfile {
  resistance: string;
  armor?: number | undefined;
}

export interface DamageStatusRequest {
  id: string;
  chanceScale?: number;
  durationScale?: number;
  magnitudeScale?: number;
}

export interface DamageRuntimeHitInput {
  target: string;
  type: string;
  /** Damage before the zone multiplier, the table, and armor. */
  base: number;
  zone?: string;
  source?: string;
  statuses?: readonly (string | DamageStatusRequest)[];
  position?: readonly [number, number, number];
}

/** Every stage of one resolved hit, so a UI or a test can read why the final number is what it is. */
export interface DamageRuntimeResolution {
  target: string;
  type: string;
  base: number;
  zone: HitZoneResolution;
  multiplier: number;
  /** Armor after carried shred statuses, never below zero. */
  armor: number;
  mitigation: number;
  damage: number;
  statuses: StatusApplicationOutcome[];
}

export interface TimeToKill {
  damagePerShot: number;
  shots: number;
  /** Seconds from the first hit to the last: `(shots - 1) × intervalSeconds`. */
  seconds: number;
  intervalSeconds: number;
}

export interface DamageRuntimeState {
  targets: Array<{ id: string } & TargetProfile>;
  statuses: StatusRuntimeState;
  hits: number;
  crits: number;
  dealt: number;
  last: { type: string; base: number; damage: number; zone: string; crit: boolean } | null;
}

export interface DamageRuntimeConfig {
  table: DamageTableDef;
  zones: HitZoneTable;
  statuses?: readonly StatusDef[];
  armorStat?: string;
  rng?: () => number;
  events?: GameEvents;
  /**
   * A target's live health, read once per application before the caller applies it. The event's
   * `remaining` is that value minus the damage dealt, and `lethal` is `remaining <= 0`; omit the
   * reader and every event reports `remaining: null` and `lethal: false`.
   */
  healthOf?: (targetId: string) => number | null;
  /**
   * Where a target stands, read once per application. Gives the event a `position` so a cue pans
   * and attenuates, including status ticks and hits whose input named none; omit it and the event
   * carries no position and feedback stays centred.
   */
  positionOf?: (targetId: string) => readonly [number, number, number] | null | undefined;
  devtoolsName?: string;
}

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
  registerTarget(id: string, profile: TargetProfile): void;
  removeTarget(id: string): void;
  target(id: string): TargetProfile | null;
  hit(input: DamageRuntimeHitInput): DamageRuntimeResolution;
  applyStatus(target: string, statusId: string, options?: DamageStatusRequest & { source?: string }): StatusApplicationOutcome;
  tick(dtSeconds: number): StatusTickEvent[];
  /** Quote a fixed hit against a health pool; pass `crit` explicitly so the number never depends on a roll. */
  timeToKill(input: { target: string; type: string; base: number; hp: number; intervalSeconds: number; zone?: string; crit?: boolean }): TimeToKill;
  table(read?: Parameters<typeof readDamageTable>[1]): DamageTableRow[];
  retune(patch: DamageRuntimeRetune): void;
  snapshot(): DamageRuntimeState;
  restore(next: DamageRuntimeState): void;
  statusesOf(targetId: string): readonly StatusInstance[];
  recentDamage(limit?: number): readonly DamageAppliedEvent[];
  stats(): { targets: number; hits: number; crits: number; statusTicks: number; dealt: number };
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
 * same table and armor, so a burn on an armored target is mitigated like a bullet. Every application
 * — a hit or a status tick — is announced as `combat.damage` carrying the target, source, type,
 * amount, absorbed, remaining health, a lethal flag and, when `positionOf` or the hit names one,
 * where the blow landed, so a HUD names the blow and a cue pans instead of guessing.
 *
 * @capability damage-runtime resolve hits through a damage table, hit zones, and armor, and tick data-defined statuses with declared stacking
 */
export function createDamageRuntime(config: DamageRuntimeConfig): DamageRuntime {
  assertDamageTable(config.table);
  assertHitZoneTable(config.zones);
  const rng = resolveRng(config.rng, "createDamageRuntime");
  const bus = config.events;
  const healthOf = config.healthOf;
  const positionOf = config.positionOf;

  let table = config.table;
  let zones = config.zones;
  let armorStat = config.armorStat ?? "armor";
  const targets = new Map<string, TargetProfile>();
  let hits = 0;
  let crits = 0;
  let dealt = 0;
  let statusTicks = 0;
  let last: DamageRuntimeState["last"] = null;
  const recent: DamageAppliedEvent[] = [];

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

  function scaleAt(targetId: string, type: string, base: number): DamageTableRow & { armor: number } {
    const profile = profileOf(targetId);
    const armor = armorOf(targetId, profile);
    return { ...resolveTableDamage(table, { type, resistance: profile.resistance, armor, base }), armor };
  }

  function resolveStatusDamage(tick: StatusDamageTick): number {
    if (!targets.has(tick.target)) return tick.amount;
    const dealt = scaleAt(tick.target, tick.channel, tick.amount).damage ?? 0;
    announce({
      target: tick.target,
      type: tick.channel,
      incoming: tick.amount,
      dealt,
      ...(tick.source !== undefined ? { source: tick.source } : {}),
      status: tick.status,
      ...(positionOf === undefined ? {} : { position: positionOf(tick.target) ?? undefined }),
    });
    return dealt;
  }

  function announce(input: {
    target: string;
    type: string;
    incoming: number;
    dealt: number;
    source?: string;
    status?: string;
    crit?: boolean;
    position?: readonly [number, number, number] | undefined;
  }): void {
    const health = healthOf?.(input.target) ?? null;
    const remaining = health === null ? null : Math.max(0, health - input.dealt);
    const event: DamageAppliedEvent = {
      target: input.target,
      ...(input.source !== undefined ? { source: input.source } : {}),
      type: input.type,
      amount: input.dealt,
      absorbed: Math.max(0, input.incoming - input.dealt),
      remaining,
      lethal: remaining !== null && remaining <= 0,
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.crit === true ? { crit: true } : {}),
      ...(input.position === undefined ? {} : { position: input.position }),
    };
    recent.push(event);
    if (recent.length > RECENT_DAMAGE_LIMIT) recent.shift();
    bus?.emit("combat.damage", event);
  }

  function describe(event: DamageAppliedEvent): string {
    const source = event.source === undefined ? "" : ` from ${event.source}`;
    const status = event.status === undefined ? "" : ` ${event.status}`;
    const left = event.remaining === null ? "" : ` → ${event.remaining.toFixed(0)}`;
    return `${event.target} -${event.amount.toFixed(0)}${source}${status}${left}${event.lethal ? " LETHAL" : ""}`;
  }

  function probeLine(): string {
    const l = last;
    const tail = l === null
      ? "no hits"
      : `last ${l.type} ${l.base.toFixed(1)}→${l.damage.toFixed(1)} ${l.zone}${l.crit ? " crit" : ""}`;
    const events = recent.length === 0
      ? ""
      : ` · events ${recent.slice(-RECENT_DAMAGE_PROBE_LINES).map(describe).join(" | ")}`;
    return `${targets.size} targets · ${hits} hits ${crits} crits · ${statusTicks} status ticks · ${dealt.toFixed(0)} dealt · ${tail}${events}`;
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
      const incoming = input.base * zone.multiplier;
      const row = scaleAt(input.target, input.type, incoming);
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
      announce({
        target: input.target,
        type: input.type,
        incoming,
        dealt: damage,
        ...(input.source !== undefined ? { source: input.source } : {}),
        ...(zone.crit ? { crit: true } : {}),
        ...(input.position !== undefined
          ? { position: input.position }
          : positionOf === undefined ? {} : { position: positionOf(input.target) ?? undefined }),
      });
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
      recent.length = 0;
    },
    statusesOf: (targetId) => statusRuntime.statusesOf(targetId),
    recentDamage(limit) {
      const count = limit === undefined ? recent.length : Math.max(0, Math.min(recent.length, Math.floor(limit)));
      return recent.slice(recent.length - count);
    },
    stats: () => ({ targets: targets.size, hits, crits, statusTicks, dealt }),
    dispose() {
      statusRuntime.dispose();
      unregister?.();
    },
  };
}
