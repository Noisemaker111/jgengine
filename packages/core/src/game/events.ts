export type DeathReason =
  | { kind: "player_kill"; killerUserId: string; via?: { item?: string } }
  | { kind: "environment"; source: string }
  | { kind: "self"; source: string };

export interface EntityDiedEvent {
  instanceId: string;
  catalogId: string;
  userId?: string;
  displayName?: string;
  reason: DeathReason;
  position: [number, number, number];
  serverId?: string;
}

export interface LootGrantedEvent {
  userId: string;
  drops: { item?: string; currency?: string; count: number }[];
  source?: string;
}

export interface InventoryAddedEvent {
  userId: string;
  item: string;
  count: number;
  source?: string;
}

export interface QuestAcceptedEvent {
  userId: string;
  questId: string;
}

export interface QuestUpdatedEvent {
  userId: string;
  questId: string;
  objectiveId?: string;
  progress?: number;
}

export interface QuestCompletedEvent {
  userId: string;
  questId: string;
}

export interface SocialFriendAddedEvent {
  userId: string;
  friendUserId: string;
}

export interface SocialPartyJoinedEvent {
  userId: string;
  partyId: string;
}

export interface SocialPartyLeftEvent {
  userId: string;
  partyId: string;
}

export interface StatLevelUpEvent {
  userId: string;
  stat: string;
  level: number;
}

export interface EntityFloatTextEvent {
  instanceId?: string;
  position: [number, number, number];
  text: string;
  kind: string;
  amount?: number;
}

export interface ProjectileSettledEvent {
  from: string;
  origin: [number, number, number];
  at: [number, number, number];
  effect: string;
  hit: boolean;
}

export interface CosmeticsChangedEvent {
  userId: string;
  slots: Record<string, string>;
}

export interface EmotePlayedEvent {
  from: string;
  emoteId: string;
  at: readonly [number, number, number];
  recipients: readonly string[];
}

export interface PossessionSwappedEvent {
  userId: string;
  entityId: string;
  previousEntityId: string;
}

export interface FormChangedEvent {
  instanceId: string;
  formId: string | null;
}

export interface GameEventMap {
  "entity.died": EntityDiedEvent;
  "entity.floatText": EntityFloatTextEvent;
  "loot.granted": LootGrantedEvent;
  "inventory.added": InventoryAddedEvent;
  "quest.accepted": QuestAcceptedEvent;
  "quest.updated": QuestUpdatedEvent;
  "quest.completed": QuestCompletedEvent;
  "social.friend.added": SocialFriendAddedEvent;
  "social.party.joined": SocialPartyJoinedEvent;
  "social.party.left": SocialPartyLeftEvent;
  "stat.levelUp": StatLevelUpEvent;
  "projectile.settled": ProjectileSettledEvent;
  "cosmetics.changed": CosmeticsChangedEvent;
  "emote.played": EmotePlayedEvent;
  "possession.swapped": PossessionSwappedEvent;
  "form.changed": FormChangedEvent;
}

export type GameEventHandler<TPayload> = (payload: TPayload) => void;

export interface GameEvents<TMap extends GameEventMap = GameEventMap> {
  on<TName extends keyof TMap>(name: TName, handler: GameEventHandler<TMap[TName]>): () => void;
  subscribe<TName extends keyof TMap>(name: TName, handler: GameEventHandler<TMap[TName]>): () => void;
  emit<TName extends keyof TMap>(name: TName, payload: TMap[TName]): void;
}

export function createGameEvents<TMap extends GameEventMap = GameEventMap>(): GameEvents<TMap> {
  const listeners = new Map<keyof TMap, Set<GameEventHandler<never>>>();

  function on<TName extends keyof TMap>(name: TName, handler: GameEventHandler<TMap[TName]>): () => void {
    let set = listeners.get(name);
    if (!set) {
      set = new Set();
      listeners.set(name, set);
    }
    const entry = handler as GameEventHandler<never>;
    set.add(entry);
    return () => set.delete(entry);
  }

  return {
    on,
    subscribe: on,
    emit(name, payload) {
      const set = listeners.get(name);
      if (!set) return;
      for (const handler of set) (handler as GameEventHandler<TMap[typeof name]>)(payload);
    },
  };
}
