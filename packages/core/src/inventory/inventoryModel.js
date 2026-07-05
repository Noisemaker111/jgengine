export function createEmptyInventory(layout) {
    return { slots: new Array(layout.slots).fill(null) };
}
function violatesKind(layout, traits, itemId) {
    if (layout.accepts === undefined || traits.kind === undefined)
        return false;
    const kind = traits.kind(itemId);
    if (Array.isArray(layout.accepts))
        return kind === null || !layout.accepts.includes(kind);
    return kind !== layout.accepts;
}
function computeCapacity(state, traits, itemId) {
    const limit = traits.stackLimit(itemId);
    let existingRoom = 0;
    let freeSlots = 0;
    for (const slot of state.slots) {
        if (slot === null)
            freeSlots += 1;
        else if (slot.itemId === itemId)
            existingRoom += Math.max(0, limit - slot.count);
    }
    return { limit, existingRoom, freeCapacity: freeSlots * limit };
}
function fillSlots(slots, itemId, limit, amount) {
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
function autoPut(state, layout, traits, itemId, count) {
    if (violatesKind(layout, traits, itemId))
        return { status: "rejected", reason: "wrong-kind" };
    if (count <= 0)
        return { status: "ok", state };
    const { limit, existingRoom, freeCapacity } = computeCapacity(state, traits, itemId);
    if (existingRoom + freeCapacity < count)
        return { status: "rejected", reason: "no-space" };
    const slots = state.slots.slice();
    fillSlots(slots, itemId, limit, count);
    return { status: "ok", state: { slots } };
}
function explicitPut(state, layout, traits, itemId, count, slot) {
    if (slot < 0 || slot >= state.slots.length)
        return { status: "rejected", reason: "invalid-slot" };
    if (violatesKind(layout, traits, itemId))
        return { status: "rejected", reason: "wrong-kind" };
    if (count <= 0)
        return { status: "ok", state };
    const limit = traits.stackLimit(itemId);
    const existing = state.slots[slot];
    const slots = state.slots.slice();
    if (existing === null) {
        if (count > limit)
            return { status: "rejected", reason: "no-space" };
        slots[slot] = { itemId, count };
        return { status: "ok", state: { slots } };
    }
    if (existing.itemId !== itemId)
        return { status: "rejected", reason: "slot-occupied" };
    const newCount = existing.count + count;
    if (newCount > limit)
        return { status: "rejected", reason: "no-space" };
    slots[slot] = { itemId, count: newCount };
    return { status: "ok", state: { slots } };
}
export function putItem(state, layout, traits, itemId, count, options) {
    if (options?.slot !== undefined)
        return explicitPut(state, layout, traits, itemId, count, options.slot);
    return autoPut(state, layout, traits, itemId, count);
}
export function takeItem(state, itemId, count) {
    if (count <= 0)
        return { status: "ok", state };
    if (countItem(state, itemId) < count)
        return { status: "rejected", reason: "insufficient" };
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
export function countItem(state, itemId) {
    let total = 0;
    for (const slot of state.slots)
        if (slot !== null && slot.itemId === itemId)
            total += slot.count;
    return total;
}
export function hasItem(state, itemId, count) {
    return countItem(state, itemId) >= count;
}
export function moveItem(from, fromSlot, to, toLayout, traits, toSlot) {
    if (fromSlot < 0 || fromSlot >= from.slots.length)
        return { status: "rejected", reason: "invalid-slot" };
    const source = from.slots[fromSlot];
    if (source === null)
        return { status: "rejected", reason: "empty-slot" };
    if (violatesKind(toLayout, traits, source.itemId))
        return { status: "rejected", reason: "wrong-kind" };
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
        if (toSlot < 0 || toSlot >= toSlots.length)
            return { status: "rejected", reason: "invalid-slot" };
        const dest = toSlots[toSlot];
        if (dest === null) {
            toSlots[toSlot] = { itemId: source.itemId, count: source.count };
            fromSlots[fromSlot] = null;
        }
        else if (dest.itemId === source.itemId) {
            const merged = dest.count + source.count;
            const placed = Math.min(merged, limit);
            const remainder = merged - placed;
            toSlots[toSlot] = { itemId: source.itemId, count: placed };
            fromSlots[fromSlot] = remainder > 0 ? { itemId: source.itemId, count: remainder } : null;
        }
        else {
            toSlots[toSlot] = source;
            fromSlots[fromSlot] = dest;
        }
    }
    else {
        const { existingRoom, freeCapacity } = computeCapacity({ slots: toSlots }, traits, source.itemId);
        if (existingRoom + freeCapacity < source.count)
            return { status: "rejected", reason: "no-space" };
        fillSlots(toSlots, source.itemId, limit, source.count);
        fromSlots[fromSlot] = null;
    }
    return {
        status: "ok",
        from: { slots: fromSlots },
        to: sameInventory ? { slots: fromSlots } : { slots: toSlots },
    };
}
export function createInventorySet(layouts, traits) {
    const states = new Map();
    for (const id of Object.keys(layouts)) {
        states.set(id, createEmptyInventory(layouts[id]));
    }
    function requireState(id) {
        const current = states.get(id);
        if (current === undefined)
            throw new Error(`unknown inventory id: ${id}`);
        return current;
    }
    return {
        put(id, itemId, count, options) {
            const result = putItem(requireState(id), layouts[id], traits, itemId, count, options);
            if (result.status === "ok")
                states.set(id, result.state);
            return result;
        },
        take(id, itemId, count) {
            const result = takeItem(requireState(id), itemId, count);
            if (result.status === "ok")
                states.set(id, result.state);
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
