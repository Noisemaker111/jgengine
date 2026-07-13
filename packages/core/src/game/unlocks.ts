export interface UnlockDef {
  id: string;
  category?: string;
}

export type UnlockState = readonly string[];

export function hasUnlock(granted: UnlockState, unlockId: string): boolean {
  return granted.includes(unlockId);
}

export function grantUnlock(granted: UnlockState, unlockId: string): string[] {
  return granted.includes(unlockId) ? granted.slice() : [...granted, unlockId];
}

export function unlockTree(defs: readonly UnlockDef[], categoryId: string): UnlockDef[] {
  return defs.filter((def) => def.category === categoryId);
}

export interface UnlockCatalog {
  has(unlockId: string): boolean;
  tree(categoryId: string): UnlockDef[];
}

/**
 * A catalog of unlockable content gated behind conditions the player earns, tracking what is unlocked.
 *
 * @capability unlockables gate content behind unlock conditions the player earns
 */
export function createUnlockCatalog(defs: readonly UnlockDef[] = []): UnlockCatalog {
  const byId = new Map<string, UnlockDef>();
  for (const def of defs) byId.set(def.id, def);
  return {
    has: (unlockId) => byId.has(unlockId),
    tree: (categoryId) => unlockTree(defs, categoryId),
  };
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
      return unlockTree(Array.from(definitions.values()), categoryId);
    },
    snapshot(userId) {
      return Array.from(granted.get(userId) ?? []);
    },
    hydrate(userId, ids) {
      granted.set(userId, new Set(ids));
    },
  };
}
