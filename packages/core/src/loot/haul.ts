import { canCarry, characterLoad, type WeightLookup } from "../inventory/carryLoad";
import type { EncumbranceConfig } from "../inventory/encumbrance";
import type { InventorySet, InventoryState, InventorySlot } from "../inventory/inventoryModel";
import type { ItemStack } from "../inventory/storageTier";
import type { KeyValueStorage } from "../game/keyValueStore";

export type CarryOutcome =
  | { ok: true; mass: number; remaining: number }
  | { ok: false; reason: "over-capacity" | "no-space" | "invalid-count"; mass: number; remaining: number };

export interface HaulTransfer {
  stacks: readonly ItemStack[];
  refused: readonly ItemStack[];
}

export interface RunHaulState {
  run: InventoryState;
  stash: InventoryState;
}

export interface RunHaulConfig<TId extends string> {
  inventories: InventorySet<TId>;
  runId: TId;
  /** Inventories that survive a failed run; left out of the carry weight. */
  stashId: TId;
  weightOf: WeightLookup;
  capacity: number;
  encumbrance: EncumbranceConfig;
  worn?: readonly string[];
  wornFactor?: number;
  storage?: KeyValueStorage | null;
  /** Storage key; defaults to `"jgengine.items.stash"`. */
  key?: string;
}

export interface RunHaul {
  carry(itemId: string, count?: number): CarryOutcome;
  bank(): HaulTransfer;
  fail(): HaulTransfer;
  load(): boolean;
  save(): void;
  state(): RunHaulState;
  restore(next: RunHaulState): boolean;
  mass(): { run: number; stash: number; remaining: number };
}

const DEFAULT_KEY = "jgengine.items.stash";

function emptyLike(state: InventoryState): InventoryState {
  return { slots: new Array<InventorySlot>(state.slots.length).fill(null) };
}

function stacksOf(state: InventoryState): ItemStack[] {
  const out: ItemStack[] = [];
  for (const slot of state.slots) if (slot !== null) out.push({ itemId: slot.itemId, count: slot.count });
  return out;
}

/** @capability item-run-haul carry loot with a weight gate, bank it into a persistent stash, or lose it when the run fails */
export function createRunHaul<TId extends string>(config: RunHaulConfig<TId>): RunHaul {
  const { inventories, runId, stashId } = config;
  const key = config.key ?? DEFAULT_KEY;
  const storage = config.storage ?? null;

  const runMass = (): ReturnType<typeof characterLoad> => characterLoad({
    carried: [inventories.state(runId)],
    worn: config.worn,
    wornFactor: config.wornFactor,
    weightOf: config.weightOf,
    capacity: config.capacity,
    encumbrance: config.encumbrance,
  });

  const persist = (): void => {
    if (storage === null) return;
    try {
      storage.setItem(key, JSON.stringify({ stash: inventories.snapshot()[stashId] }));
    } catch {
      // A full or blocked save cell must not lose the live stash; the next save retries.
    }
  };

  return {
    carry(itemId, count = 1) {
      const load = runMass();
      if (!Number.isFinite(count) || count <= 0) {
        return { ok: false, reason: "invalid-count", mass: load.mass, remaining: load.remaining };
      }
      const added = config.weightOf(itemId) * count;
      if (!canCarry(load, added)) {
        return { ok: false, reason: "over-capacity", mass: load.mass, remaining: load.remaining };
      }
      const put = inventories.put(runId, itemId, count);
      if (put.status !== "ok") {
        return { ok: false, reason: "no-space", mass: load.mass, remaining: load.remaining };
      }
      const after = runMass();
      return { ok: true, mass: after.mass, remaining: after.remaining };
    },
    bank() {
      const moved: ItemStack[] = [];
      const refused: ItemStack[] = [];
      const run = inventories.state(runId);
      for (let slot = 0; slot < run.slots.length; slot += 1) {
        const stack = inventories.state(runId).slots[slot];
        if (stack === null || stack === undefined) continue;
        const put = inventories.put(stashId, stack.itemId, stack.count);
        if (put.status !== "ok") {
          refused.push({ itemId: stack.itemId, count: stack.count });
          continue;
        }
        inventories.take(runId, stack.itemId, stack.count);
        moved.push({ itemId: stack.itemId, count: stack.count });
      }
      persist();
      return { stacks: moved, refused };
    },
    fail() {
      const lost = stacksOf(inventories.state(runId));
      inventories.replaceState(runId, emptyLike(inventories.state(runId)));
      persist();
      return { stacks: lost, refused: [] };
    },
    load() {
      if (storage === null) return false;
      try {
        const raw = storage.getItem(key);
        if (raw === null) return false;
        const saved = JSON.parse(raw) as { stash?: unknown };
        if (saved === null || typeof saved !== "object" || saved.stash === undefined) return false;
        const next = inventories.snapshot();
        next[stashId] = saved.stash as InventoryState;
        return inventories.restore(next);
      } catch {
        return false;
      }
    },
    save: persist,
    state() {
      const saved = inventories.snapshot();
      return { run: saved[runId], stash: saved[stashId] };
    },
    restore(next) {
      const attempt = inventories.snapshot();
      attempt[runId] = next.run;
      attempt[stashId] = next.stash;
      return inventories.restore(attempt);
    },
    mass() {
      const load = runMass();
      let stash = 0;
      for (const slot of inventories.state(stashId).slots) {
        if (slot !== null) stash += config.weightOf(slot.itemId) * slot.count;
      }
      return {
        run: load.carriedMass,
        stash,
        remaining: load.remaining,
      };
    },
  };
}
