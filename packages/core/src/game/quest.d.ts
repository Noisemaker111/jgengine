import type { GameEvents } from "./events";
export interface QuestObjective {
    id: string;
    kind: "kill" | "collect" | string;
    target?: string;
    item?: string;
    count: number;
    partyShare?: {
        radius: number;
        credit: "all" | "tagger";
    };
}
export interface QuestRewards {
    xp?: {
        amount: number;
    };
    economy?: Record<string, number>;
    items?: {
        item: string;
        count: number;
        inventory: string;
    }[];
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
        grantItem(userId: string, inventoryId: string, itemId: string, count: number): {
            reason: string;
        } | null;
        grantUnlock(userId: string, unlockId: string): void;
    };
    hasUnlock?(userId: string, id: string): boolean;
    partyMembersNear?(userId: string, radius: number): string[];
}
export interface QuestJournal {
    register(catalog: QuestDef[] | Record<string, QuestDef>): void;
    has(questId: string): boolean;
    canAccept(userId: string, questId: string): {
        reason: string;
    } | null;
    accept(userId: string, questId: string): {
        reason: string;
    } | null;
    abandon(userId: string, questId: string): void;
    progress(userId: string, questId: string, objectiveId: string, delta: number): void;
    canTurnIn(userId: string, questId: string): {
        reason: string;
    } | null;
    turnIn(userId: string, questId: string): {
        reason: string;
    } | null;
    grant(userId: string, questId: string, options?: {
        completed?: boolean;
    }): void;
    revoke(userId: string, questId: string): void;
    list(userId: string): QuestInstance[];
    bind(action: "entity.died" | "inventory.added"): () => void;
    snapshot(userId: string): QuestSnapshotEntry[];
    hydrate(userId: string, data: QuestSnapshotEntry[]): void;
}
export declare function createQuestJournal(deps: QuestJournalDeps): QuestJournal;
