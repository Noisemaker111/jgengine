import type { FactionRelation } from "../faction/factions";

/**
 * A rank within a group's hierarchy. Higher `level` means more authority: a member can only
 * manage (kick, re-rank) members strictly below their own level, and cannot promote anyone to a
 * level at or above their own. `permissions` are opaque, genre-agnostic capability slugs the game
 * checks with {@link Tribe.can} (e.g. `"build"`, `"demolish"`, `"invite"`, `"kick"`, `"manage-ranks"`,
 * plus the {@link AssetAction} slugs `"inventory"`, `"use"`, `"command"` for group-owned assets).
 * A `bypass` rank (an admin) skips every permission check, exactly like the founder.
 */
export interface TribeRankDef {
  id: string;
  name: string;
  /** Higher = more authority. Determines who can manage/promote whom. */
  level: number;
  /** Capability slugs this rank grants; checked by {@link Tribe.can} and {@link Tribe.canAccess}. */
  permissions?: readonly string[];
  /** Admin rank — bypasses all permission and hierarchy checks (like the founder). */
  bypass?: boolean;
}

/** Per-asset action gated by rank on group-owned assets. */
export type AssetAction = "inventory" | "use" | "command";

/** Opaque reference to a shared thing (structure, creature, container) by kind + id. */
export interface AssetRef {
  kind: string;
  id: string;
}

/** Who inside the group owns an asset: the group as a whole, or a specific member personally. */
export type AssetOwnership = { scope: "group" } | { scope: "personal"; memberId: string };

export type TribeEventType =
  | "member-added"
  | "member-removed"
  | "member-left"
  | "rank-changed"
  | "founder-transferred"
  | "asset-registered"
  | "asset-unregistered"
  | "alliance-formed"
  | "alliance-broken";

/** One entry in a tribe's bounded event log. Optional fields present only when meaningful. */
export interface TribeEvent {
  seq: number;
  type: TribeEventType;
  at: number;
  /** Member who performed the action, when applicable. */
  actor?: string;
  /** Member the action targets (added/removed/re-ranked). */
  subject?: string;
  /** Other tribe id, for alliance events. */
  tribeId?: string;
  rankId?: string;
  assetKind?: string;
  assetId?: string;
}

export interface TribeMemberRecord {
  id: string;
  rankId: string;
  joinedAt: number;
}

export interface TribeAssetRecord {
  kind: string;
  id: string;
  /** `null` marks a group-owned asset; otherwise the member who owns it personally. */
  ownerId: string | null;
}

/** Full serializable state of one tribe — the save/replication baseline. */
export interface TribeSnapshot {
  id: string;
  founderId: string;
  ranks: TribeRankDef[];
  defaultRankId: string;
  founderRankId: string;
  logCap: number;
  members: TribeMemberRecord[];
  assets: TribeAssetRecord[];
  allies: string[];
  events: TribeEvent[];
  eventSeq: number;
}

export interface TribeConfig {
  id: string;
  founderId: string;
  /** At least one rank. */
  ranks: readonly TribeRankDef[];
  /** Rank new members receive; defaults to the lowest-level rank. */
  defaultRankId?: string;
  /** Rank the founder holds; defaults to the highest-level rank. */
  founderRankId?: string;
  /** Max events retained in the ring buffer (default 128). */
  logCap?: number;
  /** Injected clock for deterministic timestamps; defaults to `Date.now`. */
  now?: () => number;
}

/** Standard `{ reason }`-on-failure / `null`-on-success result for authorized mutations. */
export type TribeResult = { reason: string } | null;

const DEFAULT_LOG_CAP = 128;

/**
 * A shared-ownership group — a tribe, guild, clan, or company — as one first-class aggregate.
 * Unifies ranked membership, group-vs-personal asset ownership, mutual alliances, and a bounded
 * event log that otherwise have to be hand-assembled from parties, factions, build permissions,
 * and per-owner rosters.
 */
export interface Tribe {
  readonly id: string;
  founderId(): string;
  hasMember(memberId: string): boolean;
  memberIds(): readonly string[];
  rankOf(memberId: string): TribeRankDef | null;
  /** True if the member's rank grants `permission`, or they are the founder / an admin rank. */
  can(memberId: string, permission: string): boolean;
  /** Founder or a `bypass` rank — skips every permission check. */
  isAdmin(memberId: string): boolean;

  addMember(actorId: string, memberId: string, rankId?: string): TribeResult;
  removeMember(actorId: string, memberId: string): TribeResult;
  leave(memberId: string): TribeResult;
  setMemberRank(actorId: string, memberId: string, rankId: string): TribeResult;
  transferFounder(actorId: string, memberId: string): TribeResult;

  registerAsset(actorId: string, ref: AssetRef, ownership: AssetOwnership): TribeResult;
  unregisterAsset(actorId: string, ref: AssetRef): TribeResult;
  ownerOfAsset(ref: AssetRef): AssetOwnership | null;
  /** Personal assets a member holds inside this group (they keep these on leaving). */
  assetsOf(memberId: string): readonly AssetRef[];
  /** Resolve access to an asset: rank permission for group assets, ownership for personal ones. */
  canAccess(memberId: string, ref: AssetRef, action: AssetAction): boolean;

  addAlly(tribeId: string): void;
  removeAlly(tribeId: string): void;
  isAllied(tribeId: string): boolean;
  allyIds(): readonly string[];
  /** `"friendly"` for self and allies, else `"neutral"` — never hostile by default. */
  relationTo(tribeId: string): FactionRelation;

  events(): readonly TribeEvent[];
  snapshot(): TribeSnapshot;
  hydrate(snapshot: TribeSnapshot): void;
}

interface RankRuntime {
  id: string;
  name: string;
  level: number;
  permissions: Set<string>;
  bypass: boolean;
}

interface AssetRuntime {
  kind: string;
  id: string;
  ownerId: string | null;
}

function assetKey(kind: string, id: string): string {
  // Length-prefix the kind so the key is collision-free even when `kind` or `id`
  // contains the delimiter (e.g. kind "ab"+id "c" must not collide with "a"+"bc").
  return `${kind.length}:${kind}:${id}`;
}

function toRankRuntime(def: TribeRankDef): RankRuntime {
  return {
    id: def.id,
    name: def.name,
    level: def.level,
    permissions: new Set(def.permissions ?? []),
    bypass: def.bypass === true,
  };
}

function rankToDef(rank: RankRuntime): TribeRankDef {
  return {
    id: rank.id,
    name: rank.name,
    level: rank.level,
    ...(rank.permissions.size > 0 ? { permissions: [...rank.permissions] } : {}),
    ...(rank.bypass ? { bypass: true } : {}),
  };
}

/**
 * Create a shared-ownership group aggregate (tribe / guild / clan / company). Members hold a
 * {@link TribeRankDef rank} whose configurable permission slugs gate management actions and access
 * to group-owned assets, while personally-owned assets stay with their member — and follow them out
 * when they leave. Group↔group {@link Tribe.addAlly alliances} resolve allied tribes as friendly, and
 * every membership / ownership / alliance change lands in a bounded ring-buffer {@link Tribe.events log}.
 * All state is plain JSON via {@link Tribe.snapshot}/{@link Tribe.hydrate}; timestamps come from an
 * injected clock for determinism. Compose many tribes with {@link createTribeRegistry} for mutual
 * alliances and cross-member relation lookups.
 *
 * @capability tribe-group shared-ownership group (tribe/guild/clan) with ranked permissions, group vs personal assets, alliances, and a bounded event log
 */
export function createTribe(config: TribeConfig): Tribe {
  const now = config.now ?? Date.now;

  if (config.ranks.length === 0) throw new Error("tribe requires at least one rank");

  const ranks = new Map<string, RankRuntime>();
  let lowest: RankRuntime | undefined;
  let highest: RankRuntime | undefined;
  for (const def of config.ranks) {
    if (ranks.has(def.id)) throw new Error(`duplicate rank id "${def.id}"`);
    const rank = toRankRuntime(def);
    ranks.set(rank.id, rank);
    if (lowest === undefined || rank.level < lowest.level) lowest = rank;
    if (highest === undefined || rank.level > highest.level) highest = rank;
  }

  const resolveRankId = (id: string | undefined, fallback: RankRuntime): string => {
    if (id === undefined) return fallback.id;
    if (!ranks.has(id)) throw new Error(`unknown rank id "${id}"`);
    return id;
  };

  let defaultRankId = resolveRankId(config.defaultRankId, lowest!);
  let founderRankId = resolveRankId(config.founderRankId, highest!);
  let logCap = Math.max(1, Math.floor(config.logCap ?? DEFAULT_LOG_CAP));

  let founderId = config.founderId;
  const members = new Map<string, TribeMemberRecord>();
  const assets = new Map<string, AssetRuntime>();
  const allies = new Set<string>();
  const eventLog: TribeEvent[] = [];
  let eventSeq = 0;

  members.set(founderId, { id: founderId, rankId: founderRankId, joinedAt: now() });

  function rankRuntimeOf(memberId: string): RankRuntime | null {
    const member = members.get(memberId);
    if (member === undefined) return null;
    return ranks.get(member.rankId) ?? null;
  }

  function isAdmin(memberId: string): boolean {
    if (memberId === founderId && members.has(memberId)) return true;
    return rankRuntimeOf(memberId)?.bypass ?? false;
  }

  function can(memberId: string, permission: string): boolean {
    if (!members.has(memberId)) return false;
    if (isAdmin(memberId)) return true;
    return rankRuntimeOf(memberId)?.permissions.has(permission) ?? false;
  }

  function levelOf(memberId: string): number {
    if (isAdmin(memberId)) return Number.POSITIVE_INFINITY;
    return rankRuntimeOf(memberId)?.level ?? Number.NEGATIVE_INFINITY;
  }

  function log(type: TribeEventType, fields: Omit<TribeEvent, "seq" | "type" | "at">): void {
    eventSeq += 1;
    const event: TribeEvent = {
      seq: eventSeq,
      type,
      at: now(),
      ...(fields.actor === undefined ? {} : { actor: fields.actor }),
      ...(fields.subject === undefined ? {} : { subject: fields.subject }),
      ...(fields.tribeId === undefined ? {} : { tribeId: fields.tribeId }),
      ...(fields.rankId === undefined ? {} : { rankId: fields.rankId }),
      ...(fields.assetKind === undefined ? {} : { assetKind: fields.assetKind }),
      ...(fields.assetId === undefined ? {} : { assetId: fields.assetId }),
    };
    eventLog.push(event);
    if (eventLog.length > logCap) eventLog.shift();
  }

  function dropPersonalAssets(memberId: string): void {
    for (const [key, asset] of assets) {
      if (asset.ownerId === memberId) assets.delete(key);
    }
  }

  return {
    id: config.id,
    founderId: () => founderId,
    hasMember: (memberId) => members.has(memberId),
    memberIds: () => [...members.keys()],
    rankOf(memberId) {
      const rank = rankRuntimeOf(memberId);
      return rank === null ? null : rankToDef(rank);
    },
    can,
    isAdmin,

    addMember(actorId, memberId, rankId) {
      if (!members.has(actorId)) return { reason: "actor is not a member" };
      if (!can(actorId, "invite")) return { reason: "missing invite permission" };
      if (members.has(memberId)) return { reason: "already a member" };
      const targetRankId = rankId ?? defaultRankId;
      const targetRank = ranks.get(targetRankId);
      if (targetRank === undefined) return { reason: `unknown rank id "${targetRankId}"` };
      if (!isAdmin(actorId) && targetRank.level >= levelOf(actorId)) {
        return { reason: "cannot invite at or above your own rank" };
      }
      members.set(memberId, { id: memberId, rankId: targetRankId, joinedAt: now() });
      log("member-added", { actor: actorId, subject: memberId, rankId: targetRankId });
      return null;
    },

    removeMember(actorId, memberId) {
      if (!members.has(actorId)) return { reason: "actor is not a member" };
      if (actorId === memberId) return { reason: "use leave to remove yourself" };
      if (!members.has(memberId)) return { reason: "not a member" };
      if (memberId === founderId) return { reason: "cannot remove the founder" };
      if (!can(actorId, "kick")) return { reason: "missing kick permission" };
      if (levelOf(actorId) <= levelOf(memberId)) return { reason: "cannot manage an equal or higher rank" };
      members.delete(memberId);
      dropPersonalAssets(memberId);
      log("member-removed", { actor: actorId, subject: memberId });
      return null;
    },

    leave(memberId) {
      if (!members.has(memberId)) return { reason: "not a member" };
      if (memberId === founderId) return { reason: "founder must transfer leadership first" };
      members.delete(memberId);
      dropPersonalAssets(memberId);
      log("member-left", { subject: memberId });
      return null;
    },

    setMemberRank(actorId, memberId, rankId) {
      if (!members.has(actorId)) return { reason: "actor is not a member" };
      if (!members.has(memberId)) return { reason: "not a member" };
      if (memberId === founderId) return { reason: "cannot re-rank the founder" };
      if (!can(actorId, "manage-ranks")) return { reason: "missing manage-ranks permission" };
      const nextRank = ranks.get(rankId);
      if (nextRank === undefined) return { reason: `unknown rank id "${rankId}"` };
      if (!isAdmin(actorId)) {
        if (levelOf(actorId) <= levelOf(memberId)) return { reason: "cannot manage an equal or higher rank" };
        if (nextRank.level >= levelOf(actorId)) return { reason: "cannot assign a rank at or above your own" };
      }
      members.get(memberId)!.rankId = rankId;
      log("rank-changed", { actor: actorId, subject: memberId, rankId });
      return null;
    },

    transferFounder(actorId, memberId) {
      if (actorId !== founderId) return { reason: "only the founder can transfer leadership" };
      if (!members.has(memberId)) return { reason: "not a member" };
      if (memberId === founderId) return { reason: "already the founder" };
      members.get(memberId)!.rankId = founderRankId;
      founderId = memberId;
      log("founder-transferred", { actor: actorId, subject: memberId });
      return null;
    },

    registerAsset(actorId, ref, ownership) {
      if (!members.has(actorId)) return { reason: "actor is not a member" };
      const key = assetKey(ref.kind, ref.id);
      if (assets.has(key)) return { reason: "asset already registered" };
      let ownerId: string | null;
      if (ownership.scope === "group") {
        if (!can(actorId, "build")) return { reason: "missing build permission" };
        ownerId = null;
      } else {
        if (!members.has(ownership.memberId)) return { reason: "owner is not a member" };
        if (ownership.memberId !== actorId && !isAdmin(actorId)) {
          return { reason: "cannot register assets for another member" };
        }
        ownerId = ownership.memberId;
      }
      assets.set(key, { kind: ref.kind, id: ref.id, ownerId });
      log("asset-registered", { actor: actorId, assetKind: ref.kind, assetId: ref.id });
      return null;
    },

    unregisterAsset(actorId, ref) {
      if (!members.has(actorId)) return { reason: "actor is not a member" };
      const key = assetKey(ref.kind, ref.id);
      const asset = assets.get(key);
      if (asset === undefined) return { reason: "unknown asset" };
      if (asset.ownerId === null) {
        if (!can(actorId, "demolish")) return { reason: "missing demolish permission" };
      } else if (asset.ownerId !== actorId && !isAdmin(actorId)) {
        return { reason: "not the asset owner" };
      }
      assets.delete(key);
      log("asset-unregistered", { actor: actorId, assetKind: ref.kind, assetId: ref.id });
      return null;
    },

    ownerOfAsset(ref) {
      const asset = assets.get(assetKey(ref.kind, ref.id));
      if (asset === undefined) return null;
      return asset.ownerId === null ? { scope: "group" } : { scope: "personal", memberId: asset.ownerId };
    },

    assetsOf(memberId) {
      const out: AssetRef[] = [];
      for (const asset of assets.values()) {
        if (asset.ownerId === memberId) out.push({ kind: asset.kind, id: asset.id });
      }
      return out;
    },

    canAccess(memberId, ref, action) {
      if (!members.has(memberId)) return false;
      if (isAdmin(memberId)) return true;
      const asset = assets.get(assetKey(ref.kind, ref.id));
      if (asset === undefined) return false;
      if (asset.ownerId !== null) return asset.ownerId === memberId;
      return can(memberId, action);
    },

    addAlly(tribeId) {
      if (tribeId === config.id || allies.has(tribeId)) return;
      allies.add(tribeId);
      log("alliance-formed", { tribeId });
    },

    removeAlly(tribeId) {
      if (!allies.delete(tribeId)) return;
      log("alliance-broken", { tribeId });
    },

    isAllied: (tribeId) => allies.has(tribeId),
    allyIds: () => [...allies],
    relationTo(tribeId) {
      if (tribeId === config.id || allies.has(tribeId)) return "friendly";
      return "neutral";
    },

    events: () => eventLog.slice(),

    snapshot() {
      return {
        id: config.id,
        founderId,
        ranks: [...ranks.values()].map(rankToDef),
        defaultRankId,
        founderRankId,
        logCap,
        members: [...members.values()].map((m) => ({ ...m })),
        assets: [...assets.values()].map((a) => ({ kind: a.kind, id: a.id, ownerId: a.ownerId })),
        allies: [...allies],
        events: eventLog.map((e) => ({ ...e })),
        eventSeq,
      };
    },

    hydrate(snapshot) {
      ranks.clear();
      for (const def of snapshot.ranks) ranks.set(def.id, toRankRuntime(def));
      defaultRankId = snapshot.defaultRankId;
      founderRankId = snapshot.founderRankId;
      logCap = Math.max(1, Math.floor(snapshot.logCap));
      founderId = snapshot.founderId;
      members.clear();
      for (const m of snapshot.members) members.set(m.id, { ...m });
      assets.clear();
      for (const a of snapshot.assets) assets.set(assetKey(a.kind, a.id), { kind: a.kind, id: a.id, ownerId: a.ownerId });
      allies.clear();
      for (const t of snapshot.allies) allies.add(t);
      eventLog.length = 0;
      for (const e of snapshot.events) eventLog.push({ ...e });
      eventSeq = snapshot.eventSeq;
    },
  };
}

export interface TribeRegistryDeps {
  now?: () => number;
  defaultLogCap?: number;
}

/** Full serializable state of a tribe registry — every tribe's snapshot in one payload. */
export interface TribeRegistrySnapshot {
  tribes: TribeSnapshot[];
}

/**
 * A collection of {@link Tribe tribes} with mutual alliance management and cross-member relation
 * lookups. Alliances are kept symmetric here (both sides updated together), and member-to-member
 * relations resolve through tribe membership + alliances, mirroring the `faction` graph vocabulary.
 */
export interface TribeRegistry {
  create(config: TribeConfig): Tribe;
  get(id: string): Tribe | null;
  all(): readonly Tribe[];
  remove(id: string): void;
  /** Form a mutual alliance, updating and logging both tribes. */
  formAlliance(tribeA: string, tribeB: string): TribeResult;
  /** Break a mutual alliance on both sides. */
  breakAlliance(tribeA: string, tribeB: string): void;
  areAllied(tribeA: string, tribeB: string): boolean;
  relationBetweenTribes(tribeA: string, tribeB: string): FactionRelation;
  tribeOfMember(memberId: string): Tribe | null;
  relationBetweenMembers(memberA: string, memberB: string): FactionRelation;
  isFriendly(memberA: string, memberB: string): boolean;
  snapshot(): TribeRegistrySnapshot;
  hydrate(snapshot: TribeRegistrySnapshot): void;
}

/**
 * Create a registry that owns many tribes, keeps alliances mutual, and resolves member relations.
 *
 * @capability tribe-registry registry of tribes with mutual alliances and cross-tribe relation lookup
 */
export function createTribeRegistry(deps: TribeRegistryDeps = {}): TribeRegistry {
  const tribes = new Map<string, Tribe>();

  const build = (config: TribeConfig): Tribe => {
    const merged: TribeConfig = {
      ...config,
      ...(config.now === undefined && deps.now !== undefined ? { now: deps.now } : {}),
      ...(config.logCap === undefined && deps.defaultLogCap !== undefined ? { logCap: deps.defaultLogCap } : {}),
    };
    return createTribe(merged);
  };

  function relationBetweenTribes(tribeA: string, tribeB: string): FactionRelation {
    if (tribeA === tribeB) return "friendly";
    const a = tribes.get(tribeA);
    if (a === undefined || !tribes.has(tribeB)) return "neutral";
    return a.isAllied(tribeB) ? "friendly" : "neutral";
  }

  function tribeOfMember(memberId: string): Tribe | null {
    for (const tribe of tribes.values()) {
      if (tribe.hasMember(memberId)) return tribe;
    }
    return null;
  }

  function relationBetweenMembers(memberA: string, memberB: string): FactionRelation {
    const a = tribeOfMember(memberA);
    const b = tribeOfMember(memberB);
    if (a === null || b === null) return "neutral";
    if (a.id === b.id) return "friendly";
    return relationBetweenTribes(a.id, b.id);
  }

  return {
    create(config) {
      if (tribes.has(config.id)) throw new Error(`duplicate tribe id "${config.id}"`);
      const tribe = build(config);
      tribes.set(config.id, tribe);
      return tribe;
    },
    get: (id) => tribes.get(id) ?? null,
    all: () => [...tribes.values()],
    remove(id) {
      if (!tribes.delete(id)) return;
      for (const tribe of tribes.values()) tribe.removeAlly(id);
    },
    formAlliance(tribeA, tribeB) {
      if (tribeA === tribeB) return { reason: "a tribe cannot ally with itself" };
      const a = tribes.get(tribeA);
      const b = tribes.get(tribeB);
      if (a === undefined || b === undefined) return { reason: "unknown tribe" };
      a.addAlly(tribeB);
      b.addAlly(tribeA);
      return null;
    },
    breakAlliance(tribeA, tribeB) {
      tribes.get(tribeA)?.removeAlly(tribeB);
      tribes.get(tribeB)?.removeAlly(tribeA);
    },
    areAllied(tribeA, tribeB) {
      const a = tribes.get(tribeA);
      const b = tribes.get(tribeB);
      return a !== undefined && b !== undefined && a.isAllied(tribeB) && b.isAllied(tribeA);
    },
    relationBetweenTribes,
    tribeOfMember,
    relationBetweenMembers,
    isFriendly: (memberA, memberB) => relationBetweenMembers(memberA, memberB) === "friendly",
    snapshot: () => ({ tribes: [...tribes.values()].map((tribe) => tribe.snapshot()) }),
    hydrate(snapshot) {
      tribes.clear();
      for (const tribeSnap of snapshot.tribes) {
        const config: TribeConfig = {
          id: tribeSnap.id,
          founderId: tribeSnap.founderId,
          ranks: tribeSnap.ranks,
          defaultRankId: tribeSnap.defaultRankId,
          founderRankId: tribeSnap.founderRankId,
          logCap: tribeSnap.logCap,
          ...(deps.now === undefined ? {} : { now: deps.now }),
        };
        const tribe = createTribe(config);
        tribe.hydrate(tribeSnap);
        tribes.set(tribe.id, tribe);
      }
    },
  };
}
