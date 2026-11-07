import type { DurabilitySpec } from "@jgengine/core/item/durability";

import { recipeDef } from "./engrams";
import { itemDef } from "./items";

/**
 * ARK's durability: each swing or shot that lands wears a tool one point, and at zero it breaks and is
 * gone. Repairing a fully worn tool costs about half what crafting it did (ARK's repair cost, approx),
 * a partly worn one that share of it.
 */
export const REPAIR_SHARE = 0.5;

/** A tool's durability and what repairing it takes; null for anything that never wears (fists, a torch). */
export function toolDurability(itemId: string): DurabilitySpec | null {
  const max = itemDef(itemId)?.tool?.durability;
  if (max === undefined) return null;
  const inputs = recipeDef(itemId)?.inputs ?? [];
  return { max, wearPerUse: 1, repair: { materials: inputs.map((input) => ({ item: input.itemId, perPoint: (input.count * REPAIR_SHARE) / max })) } };
}
