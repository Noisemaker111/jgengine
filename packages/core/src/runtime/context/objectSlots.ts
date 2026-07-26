import {
  countItem,
  createEmptyInventory,
  putItem,
  takeItem,
  type InventoryLayout,
  type InventorySet,
  type InventoryState,
  type ItemTraits,
} from "../../inventory/inventoryModel";
import type { ObjectStore } from "../../scene/objectStore";

/** Why an object slot mutation was refused — the instance, its catalog entry, the player inventory, or the declared `accepts`/capacity. */
export type ObjectSlotRejection =
  | "unknown-object"
  | "no-slot-inventory"
  | "unknown-inventory"
  | "no-space"
  | "wrong-kind"
  | "slot-occupied"
  | "invalid-slot"
  | "insufficient";

/** Outcome of an object slot mutation: applied, or refused with a reason and no state change on either side. */
export type ObjectSlotResult = { status: "ok" } | { status: "rejected"; reason: ObjectSlotRejection };

/** Which player inventory a transfer moves between, and what it moves. */
export interface ObjectSlotTransfer {
  instanceId: string;
  userId: string;
  inventoryId: string;
  itemId: string;
  /** Defaults to `1`. */
  count?: number;
  /** Explicit slot index **on the object**; omit to auto-place (transfer in) or drain the object's matching stacks (transfer out). */
  slot?: number;
}

/**
 * Per-instance container contents for placed objects whose catalog entry declares `slotInventory` —
 * the engine side of "install a GPU into a rack", "put an item in a chest". Contents live on
 * `SceneObject.slots`, so they replicate and save with the object rather than needing a game-owned
 * table keyed by `instanceId`, and every mutation is validated against the declared `accepts` and
 * stack limits.
 *
 * @capability object-slot-inventory placed objects hold validated per-instance container contents that replicate and save with the placement
 */
export interface SceneObjectSlots {
  /** The catalog `slotInventory` layout for a placed instance, or `null` when its catalog entry declares none. */
  layout(instanceId: string): InventoryLayout | null;
  /** Live contents, defaulting to the layout's empty slots. `null` when the instance is unplaced or has no `slotInventory`. */
  state(instanceId: string): InventoryState | null;
  /** How many of `itemId` this object holds; `0` for an unplaced or slot-less instance. */
  count(instanceId: string, itemId: string): number;
  /** Add items directly, bypassing any player inventory — world seeding, loot generation, admin tools. */
  put(instanceId: string, itemId: string, count?: number, options?: { slot?: number }): ObjectSlotResult;
  /** Remove items directly, bypassing any player inventory. */
  take(instanceId: string, itemId: string, count?: number): ObjectSlotResult;
  /** Move items from a player inventory into the object's slots; nothing is consumed if the object rejects them. */
  transferIn(transfer: ObjectSlotTransfer): ObjectSlotResult;
  /** Move items from the object's slots into a player inventory; nothing leaves the object if the inventory rejects them. */
  transferOut(transfer: ObjectSlotTransfer): ObjectSlotResult;
}

/** @internal */
export interface ObjectSlotsDeps {
  objects: ObjectStore;
  layoutOf: (instanceId: string) => InventoryLayout | null;
  traits: () => ItemTraits;
  hasInventory: (inventoryId: string) => boolean;
  inventoryFor: (userId: string) => InventorySet<string> | null;
  notify: () => void;
}

/** Drain `count` of `itemId` from one explicit slot, so "pull the GPU out of rack slot 3" is expressible. */
function takeFromSlot(state: InventoryState, slot: number, itemId: string, count: number): ObjectSlotResult & { state?: InventoryState } {
  if (!Number.isInteger(slot) || slot < 0 || slot >= state.slots.length) {
    return { status: "rejected", reason: "invalid-slot" };
  }
  const held = state.slots[slot];
  if (held === null || held === undefined || held.itemId !== itemId || held.count < count) {
    return { status: "rejected", reason: "insufficient" };
  }
  const slots = [...state.slots];
  slots[slot] = held.count === count ? null : { itemId, count: held.count - count };
  return { status: "ok", state: { slots } };
}

/** @internal */
export function createObjectSlots(d: ObjectSlotsDeps): SceneObjectSlots {
  function resolve(instanceId: string): { layout: InventoryLayout; state: InventoryState } | ObjectSlotResult {
    const object = d.objects.get(instanceId);
    if (object === null) return { status: "rejected", reason: "unknown-object" };
    const layout = d.layoutOf(instanceId);
    if (layout === null) return { status: "rejected", reason: "no-slot-inventory" };
    return { layout, state: object.slots ?? createEmptyInventory(layout) };
  }

  function playerInventory(transfer: ObjectSlotTransfer): InventorySet<string> | null {
    if (!d.hasInventory(transfer.inventoryId)) return null;
    return d.inventoryFor(transfer.userId);
  }

  function commit(instanceId: string, state: InventoryState): ObjectSlotResult {
    d.objects.setSlots(instanceId, state);
    d.notify();
    return { status: "ok" };
  }

  return {
    layout(instanceId) {
      return d.objects.get(instanceId) === null ? null : d.layoutOf(instanceId);
    },
    state(instanceId) {
      const resolved = resolve(instanceId);
      return "status" in resolved ? null : resolved.state;
    },
    count(instanceId, itemId) {
      const resolved = resolve(instanceId);
      return "status" in resolved ? 0 : countItem(resolved.state, itemId);
    },
    put(instanceId, itemId, count = 1, options) {
      const resolved = resolve(instanceId);
      if ("status" in resolved) return resolved;
      const result = putItem(resolved.state, resolved.layout, d.traits(), itemId, count, options);
      if (result.status === "rejected") return result;
      return commit(instanceId, result.state);
    },
    take(instanceId, itemId, count = 1) {
      const resolved = resolve(instanceId);
      if ("status" in resolved) return resolved;
      const result = takeItem(resolved.state, itemId, count);
      if (result.status === "rejected") return result;
      return commit(instanceId, result.state);
    },
    transferIn(transfer) {
      const count = transfer.count ?? 1;
      const resolved = resolve(transfer.instanceId);
      if ("status" in resolved) return resolved;
      const inventory = playerInventory(transfer);
      if (inventory === null) return { status: "rejected", reason: "unknown-inventory" };

      const options = transfer.slot === undefined ? undefined : { slot: transfer.slot };
      const accepted = putItem(resolved.state, resolved.layout, d.traits(), transfer.itemId, count, options);
      if (accepted.status === "rejected") return accepted;

      const removed = inventory.take(transfer.inventoryId, transfer.itemId, count);
      if (removed.status === "rejected") return removed;
      return commit(transfer.instanceId, accepted.state);
    },
    transferOut(transfer) {
      const count = transfer.count ?? 1;
      const resolved = resolve(transfer.instanceId);
      if ("status" in resolved) return resolved;
      const inventory = playerInventory(transfer);
      if (inventory === null) return { status: "rejected", reason: "unknown-inventory" };

      const drained =
        transfer.slot === undefined
          ? takeItem(resolved.state, transfer.itemId, count)
          : takeFromSlot(resolved.state, transfer.slot, transfer.itemId, count);
      if (drained.status === "rejected" || drained.state === undefined) {
        return drained.status === "rejected" ? drained : { status: "rejected", reason: "insufficient" };
      }

      const given = inventory.put(transfer.inventoryId, transfer.itemId, count);
      if (given.status === "rejected") return given;
      return commit(transfer.instanceId, drained.state);
    },
  };
}
