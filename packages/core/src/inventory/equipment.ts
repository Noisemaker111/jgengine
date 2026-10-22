import { devtools } from "../devtools/devtools";

/** One body slot: the item kinds it accepts and the slots it occupies while filled. */
export interface EquipSlotDef {
  /** Stable slot id, in the caller's nouns ("weapon", "rig", "boots"). */
  id: string;
  /** Item kinds this slot accepts; omitted accepts any kind. */
  accepts?: readonly string[];
  /** Slot ids this slot occupies while filled, e.g. a two-handed weapon blocking "offhand". */
  blocks?: readonly string[];
}

/**
 * The gear facts the equip rules read from an item. A rolled item resolves its runtime id through
 * the instance registry to its base and answers from that base's data — this is not a second item type.
 */
export interface EquipItemDef {
  /** Slot ids this item may occupy, most preferred first. */
  slots: readonly string[];
  /** Kind tag checked against {@link EquipSlotDef.accepts}. */
  kind?: string;
}

/** Item lookup the rules read; returns nothing for an unknown id. */
export type EquipItemLookup = (itemId: string) => EquipItemDef | null | undefined;

/** Serializable equip state: the filled slots as `[slotId, itemId]` pairs. */
export interface EquipmentState {
  slots: readonly (readonly [string, string])[];
}

/** Why an equip attempt was refused; `detail` names the item and slots involved. */
export type EquipRejection = "unknown-slot" | "not-equippable" | "wrong-slot" | "already-equipped" | "blocked";

/** An equip attempt: the new worn set plus the replaced item, or the refusal with its reason and detail. */
export type EquipResult =
  | { status: "ok"; state: EquipmentState; slotId: string; replaced: string | null }
  | { status: "rejected"; reason: EquipRejection; detail: string };

/** An unequip attempt: the new worn set plus the item taken off, or the refusal with its detail. */
export type UnequipResult =
  | { status: "ok"; state: EquipmentState; itemId: string }
  | { status: "rejected"; reason: "unknown-slot" | "empty-slot"; detail: string };

/** One worn item and the slot holding it. */
export interface WornEntry {
  slotId: string;
  itemId: string;
}

/** What the debug overlay reads about a worn set. */
export interface EquipmentProbeReading {
  filled: number;
  slots: Readonly<Record<string, string>>;
}

/** A worn-gear set: one item per slot, rules from slot and item data, state out and back in. */
export interface Equipment {
  /** Wear `itemId` in `slotId`; a filled slot is replaced and its item returned as `replaced`. */
  equip(slotId: string, itemId: string): EquipResult;
  /** Wear `itemId` in the first of its preferred slots that is empty, else the first slot that accepts it. */
  equipBest(itemId: string): EquipResult;
  /** Clear `slotId` and hand back the item it held. */
  unequip(slotId: string): UnequipResult;
  /** Worn items in declared slot order. */
  worn(): readonly WornEntry[];
  /** The slot holding `itemId`, or null when that item is not worn. */
  slotOf(itemId: string): string | null;
  /** Declared slot ids, in order. */
  slotIds(): readonly string[];
  state(): EquipmentState;
  /** Replace the worn set; returns false without mutation when an entry breaks the rules. */
  restore(next: EquipmentState): boolean;
  reset(): void;
  /** Drop the devtools probe registered by `devtoolsName`. Safe to call twice. */
  dispose(): void;
}

/** Options for {@link createEquipment}. */
export interface EquipmentOptions {
  /** Register a devtools probe under this name reporting which slots are filled. */
  devtoolsName?: string;
}

function slotAcceptsKind(slot: EquipSlotDef, kind: string | undefined): boolean {
  if (slot.accepts === undefined) return true;
  return kind !== undefined && slot.accepts.includes(kind);
}

/**
 * A worn-gear set over caller slot and item data.
 *
 * Slot defs own what a slot accepts and which slots it blocks; item defs own which slots an item may
 * occupy and its kind. Equipping into a filled slot swaps and returns the replaced item, so gear is
 * never silently lost: the caller puts `replaced` back. A two-handed item and the slot it blocks
 * cannot both be filled, and the rejection names the occupied slot.
 *
 * @capability equipment-slot-inventory wear gear by slot with item-kind rules, two-handed blocking and replace-on-equip
 */
export function createEquipment(
  slotDefs: readonly EquipSlotDef[],
  lookup: EquipItemLookup,
  options: EquipmentOptions = {},
): Equipment {
  const byId = new Map<string, EquipSlotDef>();
  for (const def of slotDefs) {
    if (def.id.trim() === "") throw new RangeError('Equipment slot field "id" must not be empty');
    if (byId.has(def.id)) throw new RangeError(`Equipment slot "${def.id}" is declared twice`);
    byId.set(def.id, def);
  }
  const order = slotDefs.map((def) => def.id);
  const filled = new Map<string, string>();

  function readState(): EquipmentState {
    const slots: [string, string][] = [];
    for (const slotId of order) {
      const itemId = filled.get(slotId);
      if (itemId !== undefined) slots.push([slotId, itemId]);
    }
    return { slots };
  }

  function conflicts(slotId: string, occupied: ReadonlyMap<string, string> = filled): string[] {
    const blockedByOwn = byId.get(slotId)?.blocks ?? [];
    const blocking = order.filter((other) => other !== slotId && (byId.get(other)?.blocks ?? []).includes(slotId));
    return [...new Set([...blockedByOwn, ...blocking])].filter((other) => occupied.has(other));
  }

  function check(slotId: string, itemId: string, occupied: ReadonlyMap<string, string>): EquipResult | null {
    const slot = byId.get(slotId);
    if (slot === undefined) {
      return { status: "rejected", reason: "unknown-slot", detail: `"${slotId}" is not a declared slot (${order.join(", ")})` };
    }
    const item = lookup(itemId);
    if (item === null || item === undefined || item.slots.length === 0) {
      return { status: "rejected", reason: "not-equippable", detail: `item "${itemId}" declares no equip slot` };
    }
    if (!item.slots.includes(slotId)) {
      return {
        status: "rejected",
        reason: "wrong-slot",
        detail: `item "${itemId}" belongs in ${item.slots.join(", ")}; "${slotId}" is not one of them`,
      };
    }
    if (!slotAcceptsKind(slot, item.kind)) {
      return {
        status: "rejected",
        reason: "wrong-slot",
        detail: `slot "${slotId}" accepts ${(slot.accepts ?? []).join(", ")}; item "${itemId}" is ${item.kind ?? "untyped"}`,
      };
    }
    const wornAt = [...occupied].find(([, worn]) => worn === itemId)?.[0];
    if (wornAt !== undefined && wornAt !== slotId) {
      return { status: "rejected", reason: "already-equipped", detail: `item "${itemId}" is already worn in "${wornAt}"` };
    }
    const conflict = conflicts(slotId, occupied).filter((other) => other !== slotId)[0];
    if (conflict !== undefined) {
      return {
        status: "rejected",
        reason: "blocked",
        detail: `slot "${conflict}" is occupied and cannot be worn with "${slotId}"`,
      };
    }
    return null;
  }

  function equipInto(slotId: string, itemId: string): EquipResult {
    const refusal = check(slotId, itemId, filled);
    if (refusal !== null) return refusal;
    const replaced = filled.get(slotId) ?? null;
    filled.set(slotId, itemId);
    return { status: "ok", state: readState(), slotId, replaced };
  }

  const probe = options.devtoolsName === undefined
    ? null
    : devtools.probes.register(options.devtoolsName, (): EquipmentProbeReading => ({
      filled: filled.size,
      slots: Object.fromEntries(filled),
    }));

  return {
    equip: equipInto,
    equipBest(itemId) {
      const item = lookup(itemId);
      if (item === null || item === undefined || item.slots.length === 0) {
        return { status: "rejected", reason: "not-equippable", detail: `item "${itemId}" declares no equip slot` };
      }
      const allowed = item.slots.filter((slotId) => byId.has(slotId));
      if (allowed.length === 0) {
        return {
          status: "rejected",
          reason: "unknown-slot",
          detail: `item "${itemId}" names no declared slot (${item.slots.join(", ")})`,
        };
      }
      const preferred = allowed.filter((slotId) => check(slotId, itemId, filled) === null);
      if (preferred.length === 0) return check(allowed[0]!, itemId, filled)!;
      return equipInto(preferred.find((slotId) => !filled.has(slotId)) ?? preferred[0]!, itemId);
    },
    unequip(slotId) {
      if (!byId.has(slotId)) {
        return { status: "rejected", reason: "unknown-slot", detail: `"${slotId}" is not a declared slot (${order.join(", ")})` };
      }
      const itemId = filled.get(slotId);
      if (itemId === undefined) {
        return { status: "rejected", reason: "empty-slot", detail: `slot "${slotId}" holds nothing` };
      }
      filled.delete(slotId);
      return { status: "ok", state: readState(), itemId };
    },
    worn() {
      const out: WornEntry[] = [];
      for (const slotId of order) {
        const itemId = filled.get(slotId);
        if (itemId !== undefined) out.push({ slotId, itemId });
      }
      return out;
    },
    slotOf(itemId) {
      for (const [slotId, worn] of filled) if (worn === itemId) return slotId;
      return null;
    },
    slotIds: () => [...order],
    state: readState,
    restore(next) {
      if (next === null || typeof next !== "object" || !Array.isArray(next.slots)) return false;
      const staged = new Map<string, string>();
      for (const entry of next.slots as readonly unknown[]) {
        if (!Array.isArray(entry) || entry.length !== 2) return false;
        const [slotId, itemId] = entry as unknown[];
        if (typeof slotId !== "string" || typeof itemId !== "string" || itemId.trim() === "") return false;
        if (staged.has(slotId)) return false;
        if (check(slotId, itemId, staged) !== null) return false;
        staged.set(slotId, itemId);
      }
      filled.clear();
      for (const [slotId, itemId] of staged) filled.set(slotId, itemId);
      return true;
    },
    reset() {
      filled.clear();
    },
    dispose() {
      probe?.();
    },
  };
}
