import { canCarry, characterLoad, type WeightLookup } from "../inventory/carryLoad";
import type { InventorySet, InventoryState, InventorySlot } from "../inventory/inventoryModel";
import type { ItemStack } from "../inventory/storageTier";
import type { KeyValueStorage } from "../game/keyValueStore";

/** What a carry attempt returns: the new load, or the rule that refused it. */
export type CarryOutcome =
  | { ok: true; mass: number; remaining: number }
  | { ok: false; reason: "over-capacity" | "no-space" | "invalid-count"; mass: number; remaining: number };

/** Stacks moved between a run and its stash, or lost when the run fails. */
export interface HaulTransfer {
  /** Stacks that reached the stash, or were lost, in slot order. */
  stacks: readonly ItemStack[];
  /** Stacks the stash had no room for; they stay in the run inventory. */
  refused: readonly ItemStack[];
}

/** Detached run and stash contents, for a save or a debug readout. */
export interface RunHaulState {
  run: InventoryState;
  stash: InventoryState;
}

/** What a run haul needs: two inventories, a weight rule and an optional save cell. */
export interface RunHaulConfig<TId extends string> {
  /** The keyed inventory set that owns both the run and stash inventories. */
  inventories: InventorySet<TId>;
  /** Inventory carried during the run; its contents are lost on `fail`. */
  runId: TId;
  /** Inventories that survive a failed run; left out of the carry weight. */
  stashId: TId;
  /** Per-instance mass in the caller's weight unit; unknown ids weigh 0 only if the caller says so. */
  weightOf: WeightLookup;
  /** Carrying capacity in the same unit as `weightOf`. */
  capacity: number;
  /** Worn item ids, one unit each; they weigh against capacity. */
  worn?: readonly string[];
  /** Fraction of worn weight that counts (default `1`). */
  wornFactor?: number;
  /** Save backend for the stash; `null` keeps it in memory for the session only. */
  storage?: KeyValueStorage | null;
  /** Storage key; defaults to `"jgengine.items.stash"`. */
  key?: string;
}

/** A run's carried loot and the stash that outlives it. */
export interface RunHaul {
  /** Add `count` of `itemId` to the run if the carrier can take its weight and there is slot room. */
  carry(itemId: string, count?: number): CarryOutcome;
  /** Move everything the stash fits out of the run and save; returns what moved and what did not. */
  bank(): HaulTransfer;
  /** Discard the run's haul and save the untouched stash; returns the lost stacks. */
  fail(): HaulTransfer;
  /** Load the stash from storage; false when absent or malformed. */
  load(): boolean;
  /** Write the stash to storage. */
  save(): void;
  state(): RunHaulState;
  /** Replace run and stash contents; false without mutation when either is malformed. */
  restore(next: RunHaulState): boolean;
  /** Carried and stashed mass plus capacity left, for the HUD. */
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

/**
 * A run's haul beside a persistent stash. Carrying is gated by the shared encumbrance rules;
 * `bank` moves what the stash fits and saves; `fail` throws the run's haul away and leaves the
 * stash as it was. The game decides when a run succeeds or fails and calls one of them.
 *
 * @capability item-run-haul carry loot with a weight gate, bank it into a persistent stash, or lose it when the run fails
 */
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
        if (stack === null) continue;
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
