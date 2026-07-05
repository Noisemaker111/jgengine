export interface UnlockDef {
  id: string;
  category?: string;
}

export interface Unlocks {
  has(userId: string, unlockId: string): boolean;
  grant(userId: string, unlockId: string): void;
  list(userId: string): string[];
  tree(categoryId: string): UnlockDef[];
  snapshot(userId: string): string[];
  hydrate(userId: string, ids: string[]): void;
}

export function createUnlocks(defs: UnlockDef[] = []): Unlocks {
  const definitions = new Map<string, UnlockDef>();
  for (const def of defs) definitions.set(def.id, def);

  const granted = new Map<string, Set<string>>();

  function requireGrantedSet(userId: string): Set<string> {
    let set = granted.get(userId);
    if (!set) {
      set = new Set();
      granted.set(userId, set);
    }
    return set;
  }

  return {
    has(userId, unlockId) {
      return granted.get(userId)?.has(unlockId) ?? false;
    },
    grant(userId, unlockId) {
      requireGrantedSet(userId).add(unlockId);
    },
    list(userId) {
      return Array.from(granted.get(userId) ?? []);
    },
    tree(categoryId) {
      return Array.from(definitions.values()).filter((def) => def.category === categoryId);
    },
    snapshot(userId) {
      return Array.from(granted.get(userId) ?? []);
    },
    hydrate(userId, ids) {
      granted.set(userId, new Set(ids));
    },
  };
}
