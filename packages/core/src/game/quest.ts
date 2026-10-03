import type { GameEvents } from "./events";
import { clamp } from "../math/scalar";

export interface QuestObjective {
  id: string;
  kind: "kill" | "collect" | string;
  target?: string;
  item?: string;
  count: number;
  partyShare?: { radius: number; credit: "all" | "tagger" };
}

export interface QuestRewards {
  xp?: { amount: number };
  economy?: Record<string, number>;
  items?: { item: string; count: number; inventory: string }[];
  unlocks?: string[];
  quests?: string[];
}

export interface QuestDef {
  id: string;
  title: string;
  description?: string;
  giver?: string;
  turnIn?: string;
  requires?: string[];
  objectives: QuestObjective[];
  rewards?: QuestRewards;
}

export type QuestStatus = "active" | "completed";

export interface QuestObjectiveProgress {
  id: string;
  kind: string;
  count: number;
  progress: number;
  complete: boolean;
}

export interface QuestInstance {
  questId: string;
  status: QuestStatus;
  objectives: QuestObjectiveProgress[];
}

export type QuestSnapshotEntry = {
  questId: string;
  status: QuestStatus;
  progress: Record<string, number>;
};

export interface QuestJournalDeps {
  events: GameEvents;
  rewards: {
    grantXp(userId: string, amount: number): void;
    grantEconomy(userId: string, currencyId: string, amount: number): void;
    grantItem(userId: string, inventoryId: string, itemId: string, count: number): { reason: string } | null;
    /** Grant the whole item batch, or reject without granting any items. Required for multiple item rewards. */
    grantItems?(userId: string, items: Readonly<NonNullable<QuestRewards["items"]>>): { reason: string } | null;
    grantUnlock(userId: string, unlockId: string): void;
  };
  hasUnlock?(userId: string, id: string): boolean;
  partyMembersNear?(userId: string, radius: number): string[];
}

export interface QuestJournal {
  /** Add or replace definitions and refresh active credit indexes; re-register after editing objectives. */
  register(catalog: readonly QuestDef[] | Record<string, QuestDef>): void;
  has(questId: string): boolean;
  canAccept(userId: string, questId: string): { reason: string } | null;
  accept(userId: string, questId: string): { reason: string } | null;
  abandon(userId: string, questId: string): void;
  progress(userId: string, questId: string, objectiveId: string, delta: number): void;
  canTurnIn(userId: string, questId: string): { reason: string } | null;
  turnIn(userId: string, questId: string): { reason: string } | null;
  grant(userId: string, questId: string, options?: { completed?: boolean }): void;
  revoke(userId: string, questId: string): void;
  list(userId: string): QuestInstance[];
  /** Credit objectives active at event start in catalog order; quests activated during credit join the next event. */
  bind(action: "entity.died" | "inventory.added"): () => void;
  snapshot(userId: string): QuestSnapshotEntry[];
  hydrate(userId: string, data: QuestSnapshotEntry[]): void;
  /** Whole-store capture across every user — the world-save/replication seam (per-user `snapshot` can't enumerate users). */
  snapshotAll(): Record<string, QuestSnapshotEntry[]>;
  hydrateAll(data: Record<string, QuestSnapshotEntry[]>): void;
}

interface QuestState {
  status: QuestStatus;
  progress: Map<string, number>;
}

/**
 * Track accepted quests and their per-objective progress, granting rewards on completion.
 *
 * @capability quest-log track accepted quests and their per-objective progress
 */
export function createQuestJournal(deps: QuestJournalDeps): QuestJournal {
  const catalog = new Map<string, QuestDef>();
  const users = new Map<string, Map<string, QuestState>>();
  const turningIn = new Set<QuestState>();
  type Credit = {
    questId: string;
    objective: QuestObjective;
    order: number;
    index: number;
    kind: "kill" | "collect";
    key: string;
    shared: boolean;
  };
  type CreditIndex = Map<string, Credit[]>;
  const credits = new Map<string, Credit[]>();
  const activeUsers = new Map<string, Set<string>>();
  const userKills = new Map<string, CreditIndex>();
  const userCollects = new Map<string, CreditIndex>();
  const sharedKills: CreditIndex = new Map();
  const catalogOrder = new Map<string, number>();

  function compareCredit(a: Credit, b: Credit): number {
    return a.order - b.order || a.index - b.index;
  }

  function updateIndex(index: CreditIndex, key: string, credit: Credit, add: boolean): void {
    const bucket = index.get(key);
    if (!add) {
      if (!bucket) return;
      const position = bucket.indexOf(credit);
      if (position !== -1) bucket.splice(position, 1);
      if (bucket.length === 0) index.delete(key);
      return;
    }
    if (!bucket) {
      index.set(key, [credit]);
      return;
    }
    let low = 0;
    let high = bucket.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (compareCredit(bucket[middle]!, credit) < 0) low = middle + 1;
      else high = middle;
    }
    bucket.splice(low, 0, credit);
  }

  function updateUserIndex(userId: string, questId: string, add: boolean): void {
    for (const credit of credits.get(questId) ?? []) {
      const indexes = credit.kind === "kill" ? userKills : userCollects;
      let index = indexes.get(userId);
      if (!index) {
        if (!add) continue;
        index = new Map();
        indexes.set(userId, index);
      }
      updateIndex(index, credit.key, credit, add);
      if (index.size === 0) indexes.delete(userId);
    }
  }

  function updateSharedIndex(questId: string, add: boolean): void {
    for (const credit of credits.get(questId) ?? []) {
      if (credit.kind === "kill" && credit.shared) {
        updateIndex(sharedKills, credit.key, credit, add);
      }
    }
  }

  function setActive(userId: string, questId: string, active: boolean): void {
    const members = activeUsers.get(questId);
    if (active) {
      if (members?.has(userId)) return;
      if (members) members.add(userId);
      else {
        activeUsers.set(questId, new Set([userId]));
        updateSharedIndex(questId, true);
      }
      updateUserIndex(userId, questId, true);
    } else if (members?.delete(userId)) {
      updateUserIndex(userId, questId, false);
      if (members.size === 0) {
        activeUsers.delete(questId);
        updateSharedIndex(questId, false);
      }
    }
  }

  function hydrate(userId: string, data: QuestSnapshotEntry[]): void {
    for (const [questId, state] of users.get(userId) ?? []) {
      if (state.status === "active") setActive(userId, questId, false);
    }
    const quests = new Map<string, QuestState>();
    for (const entry of data) {
      quests.set(entry.questId, {
        status: entry.status,
        progress: new Map(Object.entries(entry.progress)),
      });
    }
    users.set(userId, quests);
    for (const [questId, state] of quests) {
      if (state.status === "active") setActive(userId, questId, true);
    }
  }

  function requireUserQuests(userId: string): Map<string, QuestState> {
    let quests = users.get(userId);
    if (!quests) {
      quests = new Map();
      users.set(userId, quests);
    }
    return quests;
  }

  function requirementMet(userId: string, requirementId: string): boolean {
    if (users.get(userId)?.get(requirementId)?.status === "completed") return true;
    return deps.hasUnlock?.(userId, requirementId) ?? false;
  }

  function canAccept(userId: string, questId: string): { reason: string } | null {
    const def = catalog.get(questId);
    if (def === undefined) return { reason: `unknown quest "${questId}"` };
    const state = users.get(userId)?.get(questId);
    if (state?.status === "active") return { reason: `quest "${questId}" already active` };
    if (state?.status === "completed") return { reason: `quest "${questId}" already completed` };
    for (const requirementId of def.requires ?? []) {
      if (!requirementMet(userId, requirementId)) {
        return { reason: `quest "${questId}" requires "${requirementId}"` };
      }
    }
    return null;
  }

  function accept(userId: string, questId: string): { reason: string } | null {
    const denied = canAccept(userId, questId);
    if (denied !== null) return denied;
    requireUserQuests(userId).set(questId, { status: "active", progress: new Map() });
    setActive(userId, questId, true);
    deps.events.emit("quest.accepted", { userId, questId });
    return null;
  }

  function progress(userId: string, questId: string, objectiveId: string, delta: number): void {
    const def = catalog.get(questId);
    const state = users.get(userId)?.get(questId);
    if (def === undefined || state === undefined || state.status !== "active") return;
    const objective = def.objectives.find((candidate) => candidate.id === objectiveId);
    if (objective === undefined) return;
    const previous = state.progress.get(objectiveId) ?? 0;
    const next = clamp(previous + delta, 0, objective.count);
    if (next === previous) return;
    state.progress.set(objectiveId, next);
    deps.events.emit("quest.updated", { userId, questId, objectiveId, progress: next });
  }

  function canTurnIn(userId: string, questId: string): { reason: string } | null {
    const def = catalog.get(questId);
    if (def === undefined) return { reason: `unknown quest "${questId}"` };
    const state = users.get(userId)?.get(questId);
    if (state === undefined || state.status !== "active") {
      return { reason: `quest "${questId}" is not active` };
    }
    if (turningIn.has(state)) return { reason: `quest "${questId}" is already turning in` };
    for (const objective of def.objectives) {
      if ((state.progress.get(objective.id) ?? 0) < objective.count) {
        return { reason: `objective "${objective.id}" incomplete` };
      }
    }
    return null;
  }

  function applyRewards(userId: string, rewards: QuestRewards): { reason: string } | null {
    return applyQuestRewards(rewards, {
      grantItem: (inventoryId, itemId, count) => deps.rewards.grantItem(userId, inventoryId, itemId, count),
      grantItems: deps.rewards.grantItems === undefined
        ? undefined
        : (items) => deps.rewards.grantItems!(userId, items),
      grantXp: (amount) => deps.rewards.grantXp(userId, amount),
      grantEconomy: (currencyId, amount) => deps.rewards.grantEconomy(userId, currencyId, amount),
      grantUnlock: (unlockId) => deps.rewards.grantUnlock(userId, unlockId),
    });
  }

  function turnIn(userId: string, questId: string): { reason: string } | null {
    const denied = canTurnIn(userId, questId);
    if (denied !== null) return denied;
    const def = catalog.get(questId)!;
    const state = users.get(userId)!.get(questId)!;
    turningIn.add(state);
    try {
      if (def.rewards) {
        const fail = applyRewards(userId, def.rewards);
        if (fail !== null) return fail;
      }
      state.status = "completed";
      setActive(userId, questId, false);
      deps.events.emit("quest.completed", { userId, questId });
      for (const nextQuestId of def.rewards?.quests ?? []) {
        if (canAccept(userId, nextQuestId) === null) accept(userId, nextQuestId);
      }
      return null;
    } finally {
      turningIn.delete(state);
    }
  }

  function creditKill(killerUserId: string, catalogId: string): void {
    const direct = userKills.get(killerUserId)?.get(catalogId) ?? [];
    const shared = deps.partyMembersNear ? sharedKills.get(catalogId) ?? [] : [];
    const candidates: Credit[] = [];
    let a = 0;
    let b = 0;
    while (a < direct.length || b < shared.length) {
      const left = direct[a];
      const right = shared[b];
      if (left && right && left === right) {
        candidates.push(left);
        a++;
        b++;
      } else if (left && (!right || compareCredit(left, right) < 0)) {
        candidates.push(left);
        a++;
      } else {
        candidates.push(right!);
        b++;
      }
    }
    for (const { questId, objective } of candidates) {
      const recipients = new Set([killerUserId]);
      if (objective.partyShare?.credit === "all" && deps.partyMembersNear) {
        for (const member of deps.partyMembersNear(killerUserId, objective.partyShare.radius)) {
          recipients.add(member);
        }
      }
      for (const userId of recipients) progress(userId, questId, objective.id, 1);
    }
  }

  function creditCollect(userId: string, itemId: string, count: number): void {
    const candidates = userCollects.get(userId)?.get(itemId)?.slice() ?? [];
    for (const { questId, objective } of candidates) {
      progress(userId, questId, objective.id, count);
    }
  }

  return {
    register(defs) {
      const entries: readonly QuestDef[] = Array.isArray(defs) ? defs : Object.values(defs);
      for (const def of entries) {
        const members = activeUsers.get(def.id);
        if (members) {
          for (const userId of members) updateUserIndex(userId, def.id, false);
          updateSharedIndex(def.id, false);
        }
        if (!catalogOrder.has(def.id)) catalogOrder.set(def.id, catalogOrder.size);
        catalog.set(def.id, def);
        credits.set(def.id, def.objectives.flatMap((objective, index) => {
          const kind = objective.kind;
          if (kind !== "kill" && kind !== "collect") return [];
          const key = kind === "kill" ? objective.target : objective.item;
          if (key === undefined) return [];
          return [{ questId: def.id, objective, order: catalogOrder.get(def.id)!, index,
            kind, key, shared: objective.partyShare?.credit === "all" }];
        }));
        if (members) {
          for (const userId of members) updateUserIndex(userId, def.id, true);
          updateSharedIndex(def.id, true);
        }
      }
    },
    has(questId) {
      return catalog.has(questId);
    },
    canAccept,
    accept,
    abandon(userId, questId) {
      const quests = users.get(userId);
      if (quests?.get(questId)?.status === "active") {
        quests.delete(questId);
        setActive(userId, questId, false);
      }
    },
    progress,
    canTurnIn,
    turnIn,
    grant(userId, questId, options) {
      const def = catalog.get(questId);
      if (def === undefined) return;
      const completed = options?.completed ?? false;
      const progressMap = new Map<string, number>();
      if (completed) {
        for (const objective of def.objectives) progressMap.set(objective.id, objective.count);
      }
      requireUserQuests(userId).set(questId, {
        status: completed ? "completed" : "active",
        progress: progressMap,
      });
      setActive(userId, questId, !completed);
      if (completed) deps.events.emit("quest.completed", { userId, questId });
      else deps.events.emit("quest.accepted", { userId, questId });
    },
    revoke(userId, questId) {
      users.get(userId)?.delete(questId);
      setActive(userId, questId, false);
    },
    list(userId) {
      const quests = users.get(userId);
      if (!quests) return [];
      const instances: QuestInstance[] = [];
      for (const [questId, state] of quests) {
        const def = catalog.get(questId);
        if (def === undefined) continue;
        instances.push({
          questId,
          status: state.status,
          objectives: def.objectives.map((objective) => {
            const current = state.progress.get(objective.id) ?? 0;
            return {
              id: objective.id,
              kind: objective.kind,
              count: objective.count,
              progress: current,
              complete: current >= objective.count,
            };
          }),
        });
      }
      return instances;
    },
    bind(action) {
      if (action === "entity.died") {
        return deps.events.on("entity.died", (event) => {
          if (event.reason.kind !== "player_kill") return;
          creditKill(event.reason.killerUserId, event.catalogId);
        });
      }
      return deps.events.on("inventory.added", (event) => {
        creditCollect(event.userId, event.item, event.count);
      });
    },
    snapshot(userId) {
      const quests = users.get(userId);
      if (!quests) return [];
      return Array.from(quests, ([questId, state]) => ({
        questId,
        status: state.status,
        progress: Object.fromEntries(state.progress),
      }));
    },
    hydrate,
    snapshotAll() {
      const out: Record<string, QuestSnapshotEntry[]> = {};
      for (const [userId, quests] of users) {
        out[userId] = Array.from(quests, ([questId, state]) => ({
          questId,
          status: state.status,
          progress: Object.fromEntries(state.progress),
        }));
      }
      return out;
    },
    hydrateAll(data) {
      users.clear();
      activeUsers.clear();
      userKills.clear();
      userCollects.clear();
      sharedKills.clear();
      for (const [userId, entries] of Object.entries(data)) {
        hydrate(userId, entries);
      }
    },
  };
}

/** One objective as a tracker/HUD reads it — label + progress toward its count. */
export interface TrackedObjectiveView {
  id: string;
  /** Human label (e.g. "Defeat 3 wraiths"); falls back to the objective id. */
  label: string;
  count: number;
  progress: number;
  complete: boolean;
}

/** A quest as a tracker/HUD reads it — title, status, and per-objective progress. */
export interface TrackedQuestView {
  id: string;
  title: string;
  status: QuestStatus;
  objectives: TrackedObjectiveView[];
}

/** Default objective label: a readable "verb count noun" from a {@link QuestObjective}. */
export function defaultObjectiveLabel(objective: QuestObjective): string {
  const noun = objective.target ?? objective.item ?? objective.id;
  const verb = objective.kind === "kill" ? "Defeat" : objective.kind === "collect" ? "Collect" : objective.kind;
  return `${verb} ${objective.count} ${noun}`;
}

/**
 * Join a quest's static {@link QuestDef} with a player's live {@link QuestInstance}
 * into a flat, renderer-free view a HUD tracker draws (title, status, labelled
 * objective progress). Pass `label` to override the derived objective text.
 *
 * @capability quest-tracker-view join a QuestDef + live QuestInstance into a flat labelled view for a quest/objective HUD tracker
 */
export function describeTrackedQuest(
  def: QuestDef,
  instance: QuestInstance,
  label: (objective: QuestObjective) => string = defaultObjectiveLabel,
): TrackedQuestView {
  const defs = new Map(def.objectives.map((objective) => [objective.id, objective]));
  return {
    id: def.id,
    title: def.title,
    status: instance.status,
    objectives: instance.objectives.map((progress) => {
      const source = defs.get(progress.id);
      return {
        id: progress.id,
        label: source === undefined ? progress.id : label(source),
        count: progress.count,
        progress: progress.progress,
        complete: progress.complete,
      };
    }),
  };
}

export interface QuestAcceptOptions {
  hasUnlock?(id: string): boolean;
}

export interface QuestTurnIn {
  state: QuestSnapshotEntry[];
  rewards: QuestRewards | null;
}

export interface QuestEvaluator {
  has(questId: string): boolean;
  get(questId: string): QuestDef | null;
  canAccept(
    state: readonly QuestSnapshotEntry[],
    questId: string,
    options?: QuestAcceptOptions,
  ): { reason: string } | null;
  accept(
    state: readonly QuestSnapshotEntry[],
    questId: string,
    options?: QuestAcceptOptions,
  ): QuestSnapshotEntry[] | { reason: string };
  abandon(state: readonly QuestSnapshotEntry[], questId: string): QuestSnapshotEntry[];
  progress(
    state: readonly QuestSnapshotEntry[],
    questId: string,
    objectiveId: string,
    delta: number,
  ): QuestSnapshotEntry[];
  canTurnIn(state: readonly QuestSnapshotEntry[], questId: string): { reason: string } | null;
  turnIn(state: readonly QuestSnapshotEntry[], questId: string): QuestTurnIn | { reason: string };
  grant(
    state: readonly QuestSnapshotEntry[],
    questId: string,
    options?: { completed?: boolean },
  ): QuestSnapshotEntry[];
  revoke(state: readonly QuestSnapshotEntry[], questId: string): QuestSnapshotEntry[];
  creditKill(state: readonly QuestSnapshotEntry[], targetCatalogId: string): QuestSnapshotEntry[];
  creditCollect(
    state: readonly QuestSnapshotEntry[],
    itemId: string,
    count: number,
  ): QuestSnapshotEntry[];
  list(state: readonly QuestSnapshotEntry[]): QuestInstance[];
}

/**
 * Apply items before XP, currency, and unlocks. Multiple items require an all-or-reject `grantItems`
 * callback; legacy single-item appliers remain supported. Rejected callbacks must make no writes.
 * Arbitrary callback side effects or thrown exceptions cannot be rolled back by this helper.
 */
export function applyQuestRewards(
  rewards: QuestRewards,
  appliers: {
    grantXp?(amount: number): void;
    grantEconomy?(currencyId: string, amount: number): void;
    grantItem?(inventoryId: string, itemId: string, count: number): { reason: string } | null | void;
    /** Grant every item, or reject without writes. Takes precedence over `grantItem`. */
    grantItems?(items: Readonly<NonNullable<QuestRewards["items"]>>): { reason: string } | null | void;
    grantUnlock?(unlockId: string): void;
  },
): { reason: string } | null {
  const items = rewards.items ?? [];
  if (items.length > 1 && appliers.grantItems === undefined) {
    return { reason: "multiple quest item rewards require grantItems" };
  }
  if (items.length > 0) {
    const entry = items[0]!;
    const fail = appliers.grantItems !== undefined
      ? appliers.grantItems(items)
      : appliers.grantItem?.(entry.inventory, entry.item, entry.count);
    if (fail != null && typeof fail === "object" && "reason" in fail) return fail;
  }
  if (rewards.xp) appliers.grantXp?.(rewards.xp.amount);
  for (const [currencyId, amount] of Object.entries(rewards.economy ?? {})) {
    appliers.grantEconomy?.(currencyId, amount);
  }
  for (const unlockId of rewards.unlocks ?? []) {
    appliers.grantUnlock?.(unlockId);
  }
  return null;
}

type WorkingQuests = Map<string, { status: QuestStatus; progress: Map<string, number> }>;

function toWorking(state: readonly QuestSnapshotEntry[]): WorkingQuests {
  const working: WorkingQuests = new Map();
  for (const entry of state) {
    working.set(entry.questId, {
      status: entry.status,
      progress: new Map(Object.entries(entry.progress)),
    });
  }
  return working;
}

function toSnapshot(working: WorkingQuests): QuestSnapshotEntry[] {
  return Array.from(working, ([questId, state]) => ({
    questId,
    status: state.status,
    progress: Object.fromEntries(state.progress),
  }));
}

export function createQuestEvaluator(
  defs: QuestDef[] | Record<string, QuestDef>,
): QuestEvaluator {
  const catalog = new Map<string, QuestDef>();
  for (const def of Array.isArray(defs) ? defs : Object.values(defs)) catalog.set(def.id, def);

  function canAcceptWorking(
    working: WorkingQuests,
    questId: string,
    options?: QuestAcceptOptions,
  ): { reason: string } | null {
    const def = catalog.get(questId);
    if (def === undefined) return { reason: `unknown quest "${questId}"` };
    const state = working.get(questId);
    if (state?.status === "active") return { reason: `quest "${questId}" already active` };
    if (state?.status === "completed") return { reason: `quest "${questId}" already completed` };
    for (const requirementId of def.requires ?? []) {
      const met =
        working.get(requirementId)?.status === "completed" ||
        (options?.hasUnlock?.(requirementId) ?? false);
      if (!met) return { reason: `quest "${questId}" requires "${requirementId}"` };
    }
    return null;
  }

  function progressWorking(
    working: WorkingQuests,
    questId: string,
    objectiveId: string,
    delta: number,
  ): void {
    const def = catalog.get(questId);
    const state = working.get(questId);
    if (def === undefined || state === undefined || state.status !== "active") return;
    const objective = def.objectives.find((candidate) => candidate.id === objectiveId);
    if (objective === undefined) return;
    const previous = state.progress.get(objectiveId) ?? 0;
    const next = clamp(previous + delta, 0, objective.count);
    if (next !== previous) state.progress.set(objectiveId, next);
  }

  function creditWorking(
    working: WorkingQuests,
    predicate: (objective: QuestObjective) => boolean,
    delta: number,
  ): void {
    for (const [questId, state] of working) {
      if (state.status !== "active") continue;
      const def = catalog.get(questId);
      if (def === undefined) continue;
      for (const objective of def.objectives) {
        if (predicate(objective)) progressWorking(working, questId, objective.id, delta);
      }
    }
  }

  function canTurnInWorking(working: WorkingQuests, questId: string): { reason: string } | null {
    const def = catalog.get(questId);
    if (def === undefined) return { reason: `unknown quest "${questId}"` };
    const state = working.get(questId);
    if (state === undefined || state.status !== "active") {
      return { reason: `quest "${questId}" is not active` };
    }
    for (const objective of def.objectives) {
      if ((state.progress.get(objective.id) ?? 0) < objective.count) {
        return { reason: `objective "${objective.id}" incomplete` };
      }
    }
    return null;
  }

  return {
    has(questId) {
      return catalog.has(questId);
    },
    get(questId) {
      return catalog.get(questId) ?? null;
    },
    canAccept(state, questId, options) {
      return canAcceptWorking(toWorking(state), questId, options);
    },
    accept(state, questId, options) {
      const working = toWorking(state);
      const denied = canAcceptWorking(working, questId, options);
      if (denied !== null) return denied;
      working.set(questId, { status: "active", progress: new Map() });
      return toSnapshot(working);
    },
    abandon(state, questId) {
      const working = toWorking(state);
      if (working.get(questId)?.status === "active") working.delete(questId);
      return toSnapshot(working);
    },
    progress(state, questId, objectiveId, delta) {
      const working = toWorking(state);
      progressWorking(working, questId, objectiveId, delta);
      return toSnapshot(working);
    },
    canTurnIn(state, questId) {
      return canTurnInWorking(toWorking(state), questId);
    },
    turnIn(state, questId) {
      const working = toWorking(state);
      const denied = canTurnInWorking(working, questId);
      if (denied !== null) return denied;
      const def = catalog.get(questId)!;
      working.get(questId)!.status = "completed";
      for (const nextQuestId of def.rewards?.quests ?? []) {
        if (canAcceptWorking(working, nextQuestId) === null) {
          working.set(nextQuestId, { status: "active", progress: new Map() });
        }
      }
      return { state: toSnapshot(working), rewards: def.rewards ?? null };
    },
    grant(state, questId, options) {
      const def = catalog.get(questId);
      if (def === undefined) return state.slice();
      const working = toWorking(state);
      const completed = options?.completed ?? false;
      const progressMap = new Map<string, number>();
      if (completed) {
        for (const objective of def.objectives) progressMap.set(objective.id, objective.count);
      }
      working.set(questId, {
        status: completed ? "completed" : "active",
        progress: progressMap,
      });
      return toSnapshot(working);
    },
    revoke(state, questId) {
      const working = toWorking(state);
      working.delete(questId);
      return toSnapshot(working);
    },
    creditKill(state, targetCatalogId) {
      const working = toWorking(state);
      creditWorking(
        working,
        (objective) => objective.kind === "kill" && objective.target === targetCatalogId,
        1,
      );
      return toSnapshot(working);
    },
    creditCollect(state, itemId, count) {
      const working = toWorking(state);
      creditWorking(
        working,
        (objective) => objective.kind === "collect" && objective.item === itemId,
        count,
      );
      return toSnapshot(working);
    },
    list(state) {
      const instances: QuestInstance[] = [];
      for (const entry of state) {
        const def = catalog.get(entry.questId);
        if (def === undefined) continue;
        instances.push({
          questId: entry.questId,
          status: entry.status,
          objectives: def.objectives.map((objective) => {
            const current = entry.progress[objective.id] ?? 0;
            return {
              id: objective.id,
              kind: objective.kind,
              count: objective.count,
              progress: current,
              complete: current >= objective.count,
            };
          }),
        });
      }
      return instances;
    },
  };
}
