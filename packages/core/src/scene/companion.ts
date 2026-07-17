import type { MobVec3 } from "../ai/mobBrain";
import type { RosterEntry } from "./roster";
import { seedStatValues, setStatValue } from "./entityStats";
import type { StatCatalog, StatValue, StatValueMap } from "./entityStats";

/**
 * A tamed companion's standing order. Genre-agnostic aggression + posture preset:
 * - `follow` — heel to the owner and assist whatever the owner is fighting.
 * - `stay` — hold at `home` and assist the owner's target from there.
 * - `passive` — heel to the owner and never engage (a pacifist escort).
 * - `neutral` — heel to the owner and only fight back nearby threats (defensive).
 * - `aggressive` — heel to the owner and proactively engage nearby threats and the owner's target.
 */
export type CompanionCommand = "follow" | "stay" | "passive" | "neutral" | "aggressive";

/**
 * Serializable per-companion state: who owns it, its standing order, where it holds, its
 * leash radius, and its levelled stat pool. Plain data — JSON round-trips without loss.
 */
export interface CompanionRecord {
  id: string;
  /** Owning user/entity id — the roster ownership tie. */
  ownerId: string;
  /** The {@link RosterEntry.id} this companion was tamed from, or `null` when free-standing. */
  sourceId: string | null;
  command: CompanionCommand;
  /** Hold/return anchor used by `stay`; `null` until the owner parks it somewhere. */
  home: MobVec3 | null;
  /** Radius the game keeps the companion within of its resolved anchor (feeds a brain's leash distance). */
  leash: number;
  level: number;
  /** Stat points earned from levels and not yet spent via {@link CompanionRoster.spend}. */
  unspentPoints: number;
  /** Levelled stat pool, composed over `scene/entityStats`. */
  stats: StatValueMap;
}

/** Per-tick world context the game supplies so a command resolves into a concrete intent. */
export interface CompanionIntentContext {
  /** Owner's current world position — the anchor for every non-`stay` mode; `null` when absent. */
  ownerPosition?: MobVec3 | null;
  /** The owner's current attack target — the companion assists/aggros it per its command. */
  ownerTargetId?: string | null;
  /** Threat ids near the companion the game offers as engage candidates (already proximity-filtered upstream). */
  threats?: readonly string[];
}

/**
 * The companion's decision for one tick, shaped for `ai/mobBrain`: feed `candidates` into
 * `MobBrainDeps.candidates()`, treat `leashTo` as the brain's `home`, and pass `leashDistance`
 * as `leashDistance`. `kind` summarises the posture for HUD/animation.
 */
export interface CompanionIntent {
  /** `follow`/`hold` when idle at the anchor; `engage` a fresh threat; `assist` the owner's target. */
  kind: "follow" | "hold" | "engage" | "assist";
  /** Whether the companion leashes to the owner (follow modes) or its `home` (stay). */
  anchor: "owner" | "home";
  /** Resolved anchor world point — owner position or `home`; `null` when that point is unknown. */
  leashTo: MobVec3 | null;
  /** Leash radius (copied from the record) the game passes to the brain / clamps movement against. */
  leashDistance: number;
  /** Threat ids to expose as `MobBrainDeps.candidates()`; empty when the command forbids engaging. */
  candidates: readonly string[];
  /** The primary threat to engage/assist this tick — `candidates[0]`; `null` while following/holding. */
  targetId: string | null;
}

/** Rule for turning one spent level-point into a stat gain. Absent from config ⇒ the stat can't be upgraded. */
export interface CompanionStatUpgrade {
  /** Amount a single point adds to the stat's `max` (and heals into `current`). */
  increment: number;
  /** Hard ceiling for the stat's `max`; spends that would exceed it are rejected. */
  maxCap?: number;
}

/** Outcome of {@link CompanionRoster.spend}: the updated record + stat, or a rejection reason. */
export type CompanionSpendResult =
  | { status: "ok"; record: CompanionRecord; stat: StatValue }
  | { status: "rejected"; reason: string };

/** Per-companion configuration shared by every companion the roster mints. */
export interface CompanionConfig {
  /** Stat catalog seeded into each new companion's pool (via `entityStats.seedStatValues`). */
  stats?: StatCatalog;
  /** Per-stat upgrade rules consulted by {@link CompanionRoster.spend}. */
  upgrades?: Record<string, CompanionStatUpgrade>;
  /** Points granted on reaching a given level; default `1` per level. Inject `game/progression` curves here. */
  pointsPerLevel?: (level: number) => number;
  /** Level ceiling; `levelUp` past it is a no-op. Default `Infinity`. */
  maxLevel?: number;
  /** Level every companion starts at; default `1`. */
  startLevel?: number;
  /** Default leash radius for new companions; default `12`. */
  leash?: number;
}

/** Options for {@link CompanionRoster.adopt}. */
export interface CompanionAdoptOptions {
  id?: string;
  /** The {@link RosterEntry.id} this companion springs from — the ownership/catalog tie. */
  sourceId?: string;
  command?: CompanionCommand;
  home?: MobVec3 | null;
  leash?: number;
  level?: number;
  /** Override the config stat catalog for this one companion. */
  stats?: StatCatalog;
}

/**
 * A set of tamed companions keyed by companion id, scoped to owners. Wraps allegiance/command
 * state, per-companion levelled stats, and intent resolution behind create/command/level/
 * snapshot/hydrate — the counterpart of `scene/roster` for creatures that fight beside you.
 */
export interface CompanionRoster {
  /** Mint a companion for an owner (optionally tied to a {@link RosterEntry}). */
  adopt(ownerId: string, options?: CompanionAdoptOptions): CompanionRecord;
  release(companionId: string): boolean;
  get(companionId: string): CompanionRecord | null;
  ownerOf(companionId: string): string | null;
  list(ownerId: string): readonly CompanionRecord[];
  /** Set a companion's standing order; `null` if the id is unknown. */
  command(companionId: string, command: CompanionCommand): CompanionRecord | null;
  /** Park/clear a companion's `stay` anchor. */
  setHome(companionId: string, home: MobVec3 | null): CompanionRecord | null;
  setLeash(companionId: string, leash: number): CompanionRecord | null;
  /** Gain `levels` levels (bounded by `maxLevel`), accruing points from `pointsPerLevel`. */
  levelUp(companionId: string, levels?: number): CompanionRecord | null;
  /** Spend one earned point into a stat per its {@link CompanionStatUpgrade} rule. */
  spend(companionId: string, statId: string): CompanionSpendResult;
  /** Resolve the companion's per-tick {@link CompanionIntent}; `null` if the id is unknown. */
  resolveIntent(companionId: string, context: CompanionIntentContext): CompanionIntent | null;
  /** Whole-store serializable copy — the save/replication seam. */
  snapshot(): Record<string, CompanionRecord>;
  hydrate(data: Record<string, CompanionRecord>): void;
}

function dedupePush(out: string[], id: string): void {
  if (!out.includes(id)) out.push(id);
}

function candidatesFor(
  command: CompanionCommand,
  ownerTargetId: string | null,
  threats: readonly string[],
): string[] {
  switch (command) {
    case "passive":
      return [];
    case "follow":
    case "stay":
      return ownerTargetId === null ? [] : [ownerTargetId];
    case "neutral":
      return [...threats];
    case "aggressive": {
      const out: string[] = [];
      for (const threat of threats) dedupePush(out, threat);
      if (ownerTargetId !== null) dedupePush(out, ownerTargetId);
      return out;
    }
  }
}

/**
 * Pure command → intent resolver. Maps a companion's standing order plus this tick's owner
 * position, owner target, and nearby threats into the {@link CompanionIntent} a game feeds into
 * `ai/mobBrain` (or executes directly). Deterministic and allocation-light — no import of the
 * `@internal` brain factory; the two interoperate purely by shape.
 *
 * @capability companion-intent resolve a companion's command + threat context into a per-tick follow/hold/engage/assist intent
 */
export function resolveCompanionIntent(
  record: CompanionRecord,
  context: CompanionIntentContext,
): CompanionIntent {
  const ownerTargetId = context.ownerTargetId ?? null;
  const threats = context.threats ?? [];
  const anchor: "owner" | "home" = record.command === "stay" ? "home" : "owner";
  const leashTo = anchor === "home" ? record.home : (context.ownerPosition ?? null);

  const candidates = candidatesFor(record.command, ownerTargetId, threats);
  const targetId = candidates.length > 0 ? candidates[0]! : null;

  let kind: CompanionIntent["kind"];
  if (targetId === null) {
    kind = anchor === "home" ? "hold" : "follow";
  } else if (targetId === ownerTargetId) {
    kind = "assist";
  } else {
    kind = "engage";
  }

  return { kind, anchor, leashTo, leashDistance: record.leash, candidates, targetId };
}

function cloneStats(stats: StatValueMap): StatValueMap {
  const out: StatValueMap = {};
  for (const [statId, value] of Object.entries(stats)) out[statId] = { ...value };
  return out;
}

function cloneRecord(record: CompanionRecord): CompanionRecord {
  return {
    id: record.id,
    ownerId: record.ownerId,
    sourceId: record.sourceId,
    command: record.command,
    home: record.home === null ? null : [record.home[0], record.home[1], record.home[2]],
    leash: record.leash,
    level: record.level,
    unspentPoints: record.unspentPoints,
    stats: cloneStats(record.stats),
  };
}

/**
 * Build a {@link CompanionRoster}. Composes `scene/roster` ownership (via `ownerId`/`sourceId`),
 * `scene/entityStats` for the per-companion stat pool, and {@link resolveCompanionIntent} for
 * `ai/mobBrain`-shaped behavior — turning a captured creature into a loyal, levelling ally.
 *
 * @capability companion-roster manage tamed companions — allegiance, commands, per-companion stats/leveling, and mobBrain-shaped intent
 */
export function createCompanionRoster(config: CompanionConfig = {}): CompanionRoster {
  const records = new Map<string, CompanionRecord>();
  const pointsPerLevel = config.pointsPerLevel ?? (() => 1);
  const maxLevel = config.maxLevel ?? Number.POSITIVE_INFINITY;
  const startLevel = config.startLevel ?? 1;
  const defaultLeash = config.leash ?? 12;
  let counter = 0;

  const write = (record: CompanionRecord): CompanionRecord => {
    records.set(record.id, record);
    return record;
  };

  const patch = (
    companionId: string,
    fn: (record: CompanionRecord) => CompanionRecord,
  ): CompanionRecord | null => {
    const record = records.get(companionId);
    if (record === undefined) return null;
    return write(fn(record));
  };

  return {
    adopt(ownerId, options = {}) {
      counter += 1;
      const id = options.id ?? `companion_${counter}`;
      const seed = options.stats ?? config.stats ?? {};
      const record: CompanionRecord = {
        id,
        ownerId,
        sourceId: options.sourceId ?? null,
        command: options.command ?? "follow",
        home: options.home ?? null,
        leash: options.leash ?? defaultLeash,
        level: options.level ?? startLevel,
        unspentPoints: 0,
        stats: seedStatValues(seed),
      };
      return write(record);
    },
    release(companionId) {
      return records.delete(companionId);
    },
    get(companionId) {
      return records.get(companionId) ?? null;
    },
    ownerOf(companionId) {
      return records.get(companionId)?.ownerId ?? null;
    },
    list(ownerId) {
      const out: CompanionRecord[] = [];
      for (const record of records.values()) if (record.ownerId === ownerId) out.push(record);
      return out;
    },
    command(companionId, command) {
      return patch(companionId, (record) => ({ ...record, command }));
    },
    setHome(companionId, home) {
      return patch(companionId, (record) => ({
        ...record,
        home: home === null ? null : [home[0], home[1], home[2]],
      }));
    },
    setLeash(companionId, leash) {
      return patch(companionId, (record) => ({ ...record, leash }));
    },
    levelUp(companionId, levels = 1) {
      return patch(companionId, (record) => {
        let level = record.level;
        let points = record.unspentPoints;
        for (let i = 0; i < levels && level < maxLevel; i += 1) {
          level += 1;
          points += pointsPerLevel(level);
        }
        return { ...record, level, unspentPoints: points };
      });
    },
    spend(companionId, statId) {
      const record = records.get(companionId);
      if (record === undefined) return { status: "rejected", reason: `unknown companion "${companionId}"` };
      if (record.unspentPoints <= 0) return { status: "rejected", reason: "no unspent points" };
      const upgrade = config.upgrades?.[statId];
      if (upgrade === undefined) return { status: "rejected", reason: `stat "${statId}" is not upgradable` };
      const existing = record.stats[statId];
      if (existing === undefined) return { status: "rejected", reason: `unknown stat "${statId}"` };
      const nextMax = existing.max + upgrade.increment;
      if (upgrade.maxCap !== undefined && nextMax > upgrade.maxCap) {
        return { status: "rejected", reason: `stat "${statId}" is at its cap` };
      }
      const stats = setStatValue(record.stats, statId, {
        max: nextMax,
        current: existing.current + upgrade.increment,
      });
      const updated = write({ ...record, unspentPoints: record.unspentPoints - 1, stats });
      return { status: "ok", record: updated, stat: updated.stats[statId]! };
    },
    resolveIntent(companionId, context) {
      const record = records.get(companionId);
      if (record === undefined) return null;
      return resolveCompanionIntent(record, context);
    },
    snapshot() {
      const out: Record<string, CompanionRecord> = {};
      for (const [id, record] of records) out[id] = cloneRecord(record);
      return out;
    },
    hydrate(data) {
      records.clear();
      for (const [id, record] of Object.entries(data)) records.set(id, cloneRecord(record));
    },
  };
}
