import type { SceneEntity } from "./entityStore";

export interface PossessionSwappedEvent {
  userId: string;
  entityId: string;
  previousEntityId: string;
}

export interface PossessionEntities {
  get(id: string): SceneEntity | null;
  update(id: string, patch: { role?: SceneEntity["role"] }): boolean;
}

export interface PossessionEvents {
  emit(name: "possession.swapped", payload: PossessionSwappedEvent): void;
}

export interface PossessionDeps {
  entities: PossessionEntities;
  events?: PossessionEvents;
}

export interface Possession {
  own(userId: string, entityId: string): void;
  disown(userId: string, entityId: string): void;
  owns(userId: string, entityId: string): boolean;
  listOwned(userId: string): readonly string[];
  active(userId: string): string;
  possess(userId: string, entityId: string): { reason: string } | null;
}

export function createPossession(deps: PossessionDeps): Possession {
  const owned = new Map<string, Set<string>>();
  const activeByUser = new Map<string, string>();

  function ownedSet(userId: string): Set<string> {
    let set = owned.get(userId);
    if (set === undefined) {
      set = new Set([userId]);
      owned.set(userId, set);
    }
    return set;
  }

  return {
    own(userId, entityId) {
      ownedSet(userId).add(entityId);
    },
    disown(userId, entityId) {
      if (entityId === userId) return;
      ownedSet(userId).delete(entityId);
      if (activeByUser.get(userId) === entityId) activeByUser.delete(userId);
    },
    owns(userId, entityId) {
      return ownedSet(userId).has(entityId);
    },
    listOwned(userId) {
      return Array.from(ownedSet(userId));
    },
    active(userId) {
      return activeByUser.get(userId) ?? userId;
    },
    possess(userId, entityId) {
      if (!ownedSet(userId).has(entityId)) {
        return { reason: `entity "${entityId}" is not owned by "${userId}"` };
      }
      if (deps.entities.get(entityId) === null) {
        return { reason: `entity "${entityId}" is not spawned` };
      }
      const previousEntityId = activeByUser.get(userId) ?? userId;
      if (previousEntityId === entityId) return null;

      activeByUser.set(userId, entityId);
      if (deps.entities.get(previousEntityId) !== null) {
        deps.entities.update(previousEntityId, { role: "npc" });
      }
      deps.entities.update(entityId, { role: "player" });
      deps.events?.emit("possession.swapped", { userId, entityId, previousEntityId });
      return null;
    },
  };
}
