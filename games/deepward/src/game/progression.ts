import { craft, missingInputs, type RecipeDef } from "@jgengine/core/crafting/recipe";
import { kindOf } from "./items";
import type { Home } from "./state";

export const REFITS = {
  tank: { name: "Sealed tank", effect: "145 seconds of air on each departure (was 110)", recipe: { id: "marrow-tank", inputs: [{ itemId: "wire", count: 1 }, { itemId: "polymer", count: 1 }], outputs: [] } },
  reserve: { name: "Reserve rack", effect: "30 reserve rounds on each departure (was 18)", recipe: { id: "marrow-reserve", inputs: [{ itemId: "wire", count: 1 }, { itemId: "cells", count: 1 }], outputs: [] } },
} satisfies Record<string, { name: string; effect: string; recipe: RecipeDef }>;
export type RefitId = keyof typeof REFITS;
const inventory = (home: Home) => ({ slots: home.stash.map(item => ({ itemId: kindOf(item), count: 1 })) });
export function refitMissing(home: Home, id: RefitId) { return missingInputs(inventory(home), REFITS[id].recipe); }
/** Published crafting owns cost validation/consumption; Marrow owns persistent instance identity and benefits. */
export function installRefit(home: Home, id: RefitId): Home {
  if (!Object.hasOwn(REFITS, id)) throw new Error("Unknown Marrow refit");
  if (home.activeDive !== null || home.reprintPending) throw new Error("Return to Marrow before refitting");
  if (home.refits.includes(id)) throw new Error("Refit already installed");
  const result = craft(inventory(home), { slots: home.stash.length }, { stackLimit: () => 1 }, REFITS[id].recipe);
  if (result.status !== "ok") throw new Error("Not enough banked salvage for this refit");
  return { ...home, revision: home.revision + 1, stash: home.stash.filter((_, index) => result.state.slots[index] !== null), refits: [...home.refits, id] };
}
