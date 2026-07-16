import type { GameEvents } from "./events";

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
    grantUnlock(userId: string, unlockId: string): void;
  };
  hasUnlock?(userId: string, id: string): boolean;
  partyMembersNear?(userId: string, radius: number): string[];
}

export interface QuestJournal {
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Track accepted quests and their per-objective progress, granting rewards on completion.
 *
 * @capability quest-log track accepted quests and their per-objective progress
 */
export function createQuestJournal(deps: QuestJournalDeps): QuestJournal {
  const catalog = new Map<string, QuestDef>();
  const users = new Map<string, Map<string, QuestState>>();

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
    for (const objective of def.objectives) {
      if ((state.progress.get(objective.id) ?? 0) < objective.count) {
        return { reason: `objective "${objective.id}" incomplete` };
      }
    }
    return null;
  }

  function applyRewards(userId: string, rewards: QuestRewards): { reason: string } | null {
    for (const entry of rewards.items ?? []) {
      const fail = deps.rewards.grantItem(userId, entry.inventory, entry.item, entry.count);
      if (fail !== null) return fail;
    }
    if (rewards.xp) deps.rewards.grantXp(userId, rewards.xp.amount);
    for (const [currencyId, amount] of Object.entries(rewards.economy ?? {})) {
      deps.rewards.grantEconomy(userId, currencyId, amount);
    }
    for (const unlockId of rewards.unlocks ?? []) {
      deps.rewards.grantUnlock(userId, unlockId);
    }
    return null;
  }

  function turnIn(userId: string, questId: string): { reason: string } | null {
    const denied = canTurnIn(userId, questId);
    if (denied !== null) return denied;
    const def = catalog.get(questId)!;
    const state = users.get(userId)!.get(questId)!;
    if (def.rewards) {
      const fail = applyRewards(userId, def.rewards);
      if (fail !== null) return fail;
    }
    state.status = "completed";
    deps.events.emit("quest.completed", { userId, questId });
    for (const nextQuestId of def.rewards?.quests ?? []) {
      if (canAccept(userId, nextQuestId) === null) accept(userId, nextQuestId);
    }
    return null;
  }

  function creditKill(killerUserId: string, catalogId: string): void {
    for (const def of catalog.values()) {
      for (const objective of def.objectives) {
        if (objective.kind !== "kill" || objective.target !== catalogId) continue;
        const recipients = new Set([killerUserId]);
        if (objective.partyShare?.credit === "all" && deps.partyMembersNear) {
          for (const member of deps.partyMembersNear(killerUserId, objective.partyShare.radius)) {
            recipients.add(member);
          }
        }
        for (const userId of recipients) progress(userId, def.id, objective.id, 1);
      }
    }
  }

  function creditCollect(userId: string, itemId: string, count: number): void {
    for (const def of catalog.values()) {
      for (const objective of def.objectives) {
        if (objective.kind !== "collect" || objective.item !== itemId) continue;
        progress(userId, def.id, objective.id, count);
      }
    }
  }

  return {
    register(defs) {
      const entries = Array.isArray(defs) ? defs : Object.values(defs);
      for (const def of entries) catalog.set(def.id, def);
    },
    has(questId) {
      return catalog.has(questId);
    },
    canAccept,
    accept,
    abandon(userId, questId) {
      const quests = users.get(userId);
      if (quests?.get(questId)?.status === "active") quests.delete(questId);
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
      if (completed) deps.events.emit("quest.completed", { userId, questId });
      else deps.events.emit("quest.accepted", { userId, questId });
    },
    revoke(userId, questId) {
      users.get(userId)?.delete(questId);
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
    hydrate(userId, data) {
      const quests = new Map<string, QuestState>();
      for (const entry of data) {
        quests.set(entry.questId, {
          status: entry.status,
          progress: new Map(Object.entries(entry.progress)),
        });
      }
      users.set(userId, quests);
    },
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
      for (const [userId, entries] of Object.entries(data)) {
        const quests = new Map<string, QuestState>();
        for (const entry of entries) {
          quests.set(entry.questId, {
            status: entry.status,
            progress: new Map(Object.entries(entry.progress)),
          });
        }
        users.set(userId, quests);
      }
    },
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

export function applyQuestRewards(
  rewards: QuestRewards,
  appliers: {
    grantXp?(amount: number): void;
    grantEconomy?(currencyId: string, amount: number): void;
    grantItem?(inventoryId: string, itemId: string, count: number): { reason: string } | null | void;
    grantUnlock?(unlockId: string): void;
  },
): { reason: string } | null {
  for (const entry of rewards.items ?? []) {
    const fail = appliers.grantItem?.(entry.inventory, entry.item, entry.count);
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
