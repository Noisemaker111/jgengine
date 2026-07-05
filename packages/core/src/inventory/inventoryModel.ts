export interface ItemTraits {
  stackLimit(itemId: string): number;
  kind?(itemId: string): string | null;
}

export interface InventoryLayout {
  slots: number;
  accepts?: string | readonly string[];
}

export type InventorySlot = { itemId: string; count: number } | null;

export interface InventoryState {
  slots: InventorySlot[];
}

export type PutResult =
  | { status: "ok"; state: InventoryState }
  | { status: "rejected"; reason: "no-space" | "wrong-kind" | "slot-occupied" | "invalid-slot" };

export type TakeResult = { status: "ok"; state: InventoryState } | { status: "rejected"; reason: "insufficient" };

export type MoveResult =
  | { status: "ok"; from: InventoryState; to: InventoryState }
  | { status: "rejected"; reason: "invalid-slot" | "empty-slot" | "wrong-kind" | "no-space" };

export function createEmptyInventory(layout: InventoryLayout): InventoryState {
  return { slots: new Array(layout.slots).fill(null) };
}

function violatesKind(layout: InventoryLayout, traits: ItemTraits, itemId: string): boolean {
  if (layout.accepts === undefined || traits.kind === undefined) return false;
  const kind = traits.kind(itemId);
  if (Array.isArray(layout.accepts)) return kind === null || !layout.accepts.includes(kind);
  return kind !== layout.accepts;
}

function computeCapacity(state: InventoryState, traits: ItemTraits, itemId: string) {
  const limit = traits.stackLimit(itemId);
  let existingRoom = 0;
  let freeSlots = 0;
  for (const slot of state.slots) {
    if (slot === null) freeSlots += 1;
    else if (slot.itemId === itemId) existingRoom += Math.max(0, limit - slot.count);
  }
  return { limit, existingRoom, freeCapacity: freeSlots * limit };
}

function fillSlots(slots: InventorySlot[], itemId: string, limit: number, amount: number): number {
  let remaining = amount;
  for (let i = 0; i < slots.length && remaining > 0; i++) {
    const slot = slots[i];
    if (slot !== null && slot.itemId === itemId && slot.count < limit) {
      const add = Math.min(limit - slot.count, remaining);
      slots[i] = { itemId, count: slot.count + add };
      remaining -= add;
    }
  }
  for (let i = 0; i < slots.length && remaining > 0; i++) {
    if (slots[i] === null) {
      const add = Math.min(limit, remaining);
      slots[i] = { itemId, count: add };
      remaining -= add;
    }
  }
  return remaining;
}

function autoPut(state: InventoryState, layout: InventoryLayout, traits: ItemTraits, itemId: string, count: number): PutResult {
  if (violatesKind(layout, traits, itemId)) return { status: "rejected", reason: "wrong-kind" };
  if (count <= 0) return { status: "ok", state };

  const { limit, existingRoom, freeCapacity } = computeCapacity(state, traits, itemId);
  if (existingRoom + freeCapacity < count) return { status: "rejected", reason: "no-space" };

  const slots = state.slots.slice();
  fillSlots(slots, itemId, limit, count);
  return { status: "ok", state: { slots } };
}

function explicitPut(
  state: InventoryState,
  layout: InventoryLayout,
  traits: ItemTraits,
  itemId: string,
  count: number,
  slot: number,
): PutResult {
  if (slot < 0 || slot >= state.slots.length) return { status: "rejected", reason: "invalid-slot" };
  if (violatesKind(layout, traits, itemId)) return { status: "rejected", reason: "wrong-kind" };
  if (count <= 0) return { status: "ok", state };

  const limit = traits.stackLimit(itemId);
  const existing = state.slots[slot];
  const slots = state.slots.slice();

  if (existing === null) {
    if (count > limit) return { status: "rejected", reason: "no-space" };
    slots[slot] = { itemId, count };
    return { status: "ok", state: { slots } };
  }

  if (existing.itemId !== itemId) return { status: "rejected", reason: "slot-occupied" };

  const newCount = existing.count + count;
  if (newCount > limit) return { status: "rejected", reason: "no-space" };
  slots[slot] = { itemId, count: newCount };
  return { status: "ok", state: { slots } };
}

export function putItem(
  state: InventoryState,
  layout: InventoryLayout,
  traits: ItemTraits,
  itemId: string,
  count: number,
  options?: { slot?: number },
): PutResult {
  if (options?.slot !== undefined) return explicitPut(state, layout, traits, itemId, count, options.slot);
  return autoPut(state, layout, traits, itemId, count);
}

export function takeItem(state: InventoryState, itemId: string, count: number): TakeResult {
  if (count <= 0) return { status: "ok", state };
  if (countItem(state, itemId) < count) return { status: "rejected", reason: "insufficient" };

  const slots = state.slots.slice();
  let remaining = count;
  for (let i = slots.length - 1; i >= 0 && remaining > 0; i--) {
    const slot = slots[i];
    if (slot !== null && slot.itemId === itemId) {
      const removed = Math.min(slot.count, remaining);
      const newCount = slot.count - removed;
      slots[i] = newCount > 0 ? { itemId, count: newCount } : null;
      remaining -= removed;
    }
  }
  return { status: "ok", state: { slots } };
}

export function countItem(state: InventoryState, itemId: string): number {
  let total = 0;
  for (const slot of state.slots) if (slot !== null && slot.itemId === itemId) total += slot.count;
  return total;
}

export function hasItem(state: InventoryState, itemId: string, count: number): boolean {
  return countItem(state, itemId) >= count;
}

export function moveItem(
  from: InventoryState,
  fromSlot: number,
  to: InventoryState,
  toLayout: InventoryLayout,
  traits: ItemTraits,
  toSlot?: number,
): MoveResult {
  if (fromSlot < 0 || fromSlot >= from.slots.length) return { status: "rejected", reason: "invalid-slot" };
  const source = from.slots[fromSlot];
  if (source === null) return { status: "rejected", reason: "empty-slot" };
  if (violatesKind(toLayout, traits, source.itemId)) return { status: "rejected", reason: "wrong-kind" };

  const sameInventory = from === to;

  if (sameInventory && toSlot === undefined) {
    return { status: "ok", from, to };
  }

  if (sameInventory && toSlot === fromSlot) {
    return { status: "ok", from, to };
  }

  const fromSlots = from.slots.slice();
  const toSlots = sameInventory ? fromSlots : to.slots.slice();
  const limit = traits.stackLimit(source.itemId);

  if (toSlot !== undefined) {
    if (toSlot < 0 || toSlot >= toSlots.length) return { status: "rejected", reason: "invalid-slot" };
    const dest = toSlots[toSlot];

    if (dest === null) {
      toSlots[toSlot] = { itemId: source.itemId, count: source.count };
      fromSlots[fromSlot] = null;
    } else if (dest.itemId === source.itemId) {
      const merged = dest.count + source.count;
      const placed = Math.min(merged, limit);
      const remainder = merged - placed;
      toSlots[toSlot] = { itemId: source.itemId, count: placed };
      fromSlots[fromSlot] = remainder > 0 ? { itemId: source.itemId, count: remainder } : null;
    } else {
      toSlots[toSlot] = source;
      fromSlots[fromSlot] = dest;
    }
  } else {
    const { existingRoom, freeCapacity } = computeCapacity({ slots: toSlots }, traits, source.itemId);
    if (existingRoom + freeCapacity < source.count) return { status: "rejected", reason: "no-space" };
    fillSlots(toSlots, source.itemId, limit, source.count);
    fromSlots[fromSlot] = null;
  }

  return {
    status: "ok",
    from: { slots: fromSlots },
    to: sameInventory ? { slots: fromSlots } : { slots: toSlots },
  };
}

export interface InventorySet<TId extends string> {
  put(id: TId, itemId: string, count: number, options?: { slot?: number }): PutResult;
  take(id: TId, itemId: string, count: number): TakeResult;
  move(fromId: TId, fromSlot: number, toId: TId, toSlot?: number): MoveResult;
  count(id: TId, itemId: string): number;
  has(id: TId, itemId: string, count: number): boolean;
  state(id: TId): InventoryState;
  replaceState(id: TId, state: InventoryState): void;
}

export function createInventorySet<TId extends string>(
  layouts: Record<TId, InventoryLayout>,
  traits: ItemTraits,
): InventorySet<TId> {
  const states = new Map<TId, InventoryState>();
  for (const id of Object.keys(layouts) as TId[]) {
    states.set(id, createEmptyInventory(layouts[id]));
  }

  function requireState(id: TId): InventoryState {
    const current = states.get(id);
    if (current === undefined) throw new Error(`unknown inventory id: ${id}`);
    return current;
  }

  return {
    put(id, itemId, count, options) {
      const result = putItem(requireState(id), layouts[id], traits, itemId, count, options);
      if (result.status === "ok") states.set(id, result.state);
      return result;
    },
    take(id, itemId, count) {
      const result = takeItem(requireState(id), itemId, count);
      if (result.status === "ok") states.set(id, result.state);
      return result;
    },
    move(fromId, fromSlot, toId, toSlot) {
      const result = moveItem(requireState(fromId), fromSlot, requireState(toId), layouts[toId], traits, toSlot);
      if (result.status === "ok") {
        states.set(fromId, result.from);
        states.set(toId, result.to);
      }
      return result;
    },
    count(id, itemId) {
      return countItem(requireState(id), itemId);
    },
    has(id, itemId, count) {
      return hasItem(requireState(id), itemId, count);
    },
    state(id) {
      return requireState(id);
    },
    replaceState(id, state) {
      states.set(id, state);
    },
  };
}
