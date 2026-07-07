import type { UnlockDef, UnlockState } from "../game/unlocks";
import { createUnlocks, grantUnlock, hasUnlock, unlockTree } from "../game/unlocks";

export interface TechNodeDef extends UnlockDef {
  requires?: readonly string[];
  cost?: Readonly<Record<string, number>>;
  grants?: readonly string[];
  recipe?: string;
}

export type TechState = UnlockState;

export type TechRejection =
  | { reason: "unknown-node" }
  | { reason: "already-unlocked" }
  | { reason: "missing-prerequisites"; missing: readonly string[] };

export type TechCheck = { ok: true } | ({ ok: false } & TechRejection);

export function techPrerequisitesMet(state: TechState, node: TechNodeDef): boolean {
  const requires = node.requires ?? [];
  return requires.every((id) => hasUnlock(state, id));
}

export function missingPrerequisites(state: TechState, node: TechNodeDef): string[] {
  return (node.requires ?? []).filter((id) => !hasUnlock(state, id));
}

export function canUnlockTech(defs: readonly TechNodeDef[], state: TechState, id: string): TechCheck {
  const node = defs.find((n) => n.id === id);
  if (node === undefined) return { ok: false, reason: "unknown-node" };
  if (hasUnlock(state, id)) return { ok: false, reason: "already-unlocked" };
  const missing = missingPrerequisites(state, node);
  if (missing.length > 0) return { ok: false, reason: "missing-prerequisites", missing };
  return { ok: true };
}

export function grantTech(state: TechState, node: TechNodeDef): string[] {
  let next = grantUnlock(state, node.id);
  for (const extra of node.grants ?? []) next = grantUnlock(next, extra);
  return next;
}

export function availableTech(defs: readonly TechNodeDef[], state: TechState): TechNodeDef[] {
  return defs.filter((node) => !hasUnlock(state, node.id) && techPrerequisitesMet(state, node));
}

export function unlockedRecipes(defs: readonly TechNodeDef[], state: TechState): string[] {
  const recipes: string[] = [];
  for (const node of defs) {
    if (node.recipe !== undefined && hasUnlock(state, node.id)) recipes.push(node.recipe);
  }
  return recipes;
}

export interface TechTree {
  has(userId: string, id: string): boolean;
  canUnlock(userId: string, id: string): TechCheck;
  unlock(userId: string, id: string): TechCheck;
  available(userId: string): TechNodeDef[];
  recipes(userId: string): string[];
  list(userId: string): string[];
  tree(categoryId: string): UnlockDef[];
  node(id: string): TechNodeDef | null;
  snapshot(userId: string): string[];
  hydrate(userId: string, ids: string[]): void;
}

export function createTechTree(defs: readonly TechNodeDef[] = []): TechTree {
  const nodes = new Map<string, TechNodeDef>();
  for (const def of defs) nodes.set(def.id, def);
  const unlocks = createUnlocks(defs.map((d) => ({ id: d.id, category: d.category })));

  function stateOf(userId: string): TechState {
    return unlocks.list(userId);
  }

  return {
    has: (userId, id) => unlocks.has(userId, id),
    canUnlock: (userId, id) => canUnlockTech(defs, stateOf(userId), id),
    unlock(userId, id) {
      const check = canUnlockTech(defs, stateOf(userId), id);
      if (!check.ok) return check;
      const node = nodes.get(id)!;
      unlocks.grant(userId, node.id);
      for (const extra of node.grants ?? []) unlocks.grant(userId, extra);
      return { ok: true };
    },
    available: (userId) => availableTech(defs, stateOf(userId)),
    recipes: (userId) => unlockedRecipes(defs, stateOf(userId)),
    list: (userId) => unlocks.list(userId),
    tree: (categoryId) => unlockTree(defs, categoryId),
    node: (id) => nodes.get(id) ?? null,
    snapshot: (userId) => unlocks.snapshot(userId),
    hydrate: (userId, ids) => unlocks.hydrate(userId, ids),
  };
}
