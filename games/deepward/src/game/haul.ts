import { createInventorySet, type InventoryState } from "@jgengine/core/inventory/inventoryModel";
import { createRunHaul } from "@jgengine/core/loot/haul";
import { itemMass } from "@jgengine/core/loot/drop";
import { defOf, type Item } from "./loot";
import type { LittleDef } from "./littles";

/** Encumbered from 80% of the load, slowing toward 55% speed at the limit. */
const ENCUMBRANCE = { soft: 0.8, floor: 0.55 } as const;
const RUN_SLOTS = 24;
const STASH_SLOTS = 4096;

export interface HaulLoad { mass: number; remaining: number; capacity: number }
export type PackCheck = { ok: true; load: HaulLoad } | { ok: false; reason: "over-capacity" | "no-space"; message: string };

/** What an item weighs on this Little's back: Pip carries food at half weight. */
export function carriedWeight(item: Item, little: Pick<LittleDef, "foodSense">): number {
  const mass = itemMass(item);
  return Math.round((little.foodSense && defOf(item).category === "food" ? mass * 0.5 : mass) * 100) / 100;
}

function slotsOf(items: readonly Item[], slots: number): InventoryState {
  const out: ({ itemId: string; count: number } | null)[] = [];
  for (let index = 0; index < slots; index += 1) { const item = items[index]; out.push(item === undefined ? null : { itemId: item.id, count: 1 }); }
  return { slots: out };
}
/** A run haul restored from the live records, so the weight gate and the bank/fail rules are the shared ones. */
function haulOf(pack: readonly Item[], stash: readonly Item[], capacity: number, weigh: (item: Item) => number, incoming: readonly Item[] = []) {
  const inventories = createInventorySet({ run: { slots: RUN_SLOTS }, stash: { slots: STASH_SLOTS } }, { stackLimit: () => 1 });
  const masses = new Map<string, number>();
  for (const item of [...pack, ...stash, ...incoming]) masses.set(item.id, weigh(item));
  const haul = createRunHaul({ inventories, runId: "run", stashId: "stash", weightOf: id => masses.get(id) ?? 0, capacity, encumbrance: ENCUMBRANCE, storage: null });
  if (!haul.restore({ run: slotsOf(pack, RUN_SLOTS), stash: slotsOf(stash, STASH_SLOTS) })) throw new Error("crumb-run: pack records are not a valid haul");
  return haul;
}

export function loadOf(pack: readonly Item[], capacity: number, little: Pick<LittleDef, "foodSense">): HaulLoad {
  const mass = pack.reduce((sum, item) => sum + carriedWeight(item, little), 0);
  return { mass: Math.round(mass * 100) / 100, remaining: Math.round((capacity - mass) * 100) / 100, capacity };
}

/** Whether the pack can take one more find, through the shared weight gate. */
export function canCarry(pack: readonly Item[], item: Item, capacity: number, little: Pick<LittleDef, "foodSense">): PackCheck {
  const weigh = (entry: Item) => carriedWeight(entry, little);
  const outcome = haulOf(pack, [], capacity, weigh, [item]).carry(item.id);
  if (outcome.ok) return { ok: true, load: loadOf([...pack, item], capacity, little) };
  if (outcome.reason === "over-capacity") {
    const after = Math.round((loadOf(pack, capacity, little).mass + weigh(item)) * 100) / 100;
    return { ok: false, reason: "over-capacity", message: `${item.name} would make your pack ${after} of ${capacity}. Leave something behind first.` };
  }
  return { ok: false, reason: "no-space", message: `Your pack holds no more than ${RUN_SLOTS} things.` };
}

/** Move the haul into the stash; what the stash refuses stays behind. */
export function bankHaul(pack: readonly Item[], stash: readonly Item[]): { banked: Item[]; refused: Item[] } {
  const haul = haulOf(pack, stash, Number.MAX_SAFE_INTEGER, item => itemMass(item));
  const moved = haul.bank();
  const byId = new Map(pack.map(item => [item.id, item] as const));
  const keep = (stacks: readonly { itemId: string }[]) => stacks.map(stack => byId.get(stack.itemId)).filter((item): item is Item => item !== undefined);
  return { banked: keep(moved.stacks), refused: keep(moved.refused) };
}
/** A caught Little gives up the carried haul; the stash is untouched. */
export function loseHaul(pack: readonly Item[]): Item[] {
  return haulOf(pack, [], Number.MAX_SAFE_INTEGER, item => itemMass(item)).fail().stacks.map(stack => pack.find(item => item.id === stack.itemId)).filter((item): item is Item => item !== undefined);
}
