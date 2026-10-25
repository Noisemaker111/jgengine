import { createCodex, type Codex, type CodexEntryDef, type CodexSnapshot } from "@jgengine/core/game/codex";
import { craft, missingInputs, type RecipeDef, type RecipeItem } from "@jgengine/core/crafting/recipe";
import { createRecipeGraph } from "@jgengine/core/crafting/recipe";
import { kindOf, type Item } from "./items";

/**
 * Marrow's fabricator. A blueprint is learned by scanning its fragments in Bellwether (the engine
 * codex counts the scans); a learned blueprint can be printed from banked salvage (the engine
 * recipe graph checks and spends the exact stash instances). Gear is permanent: it survives a
 * reprint the way the refits do. Lures are consumable and wait in Marrow until the next departure.
 */
export type Gear = "cutter" | "drill" | "seal2" | "seal3" | "o2" | "crawler" | "lure";
export type Blueprint = Gear | "growbed";

export interface CodexMeta { kind: "blueprint" | "log" | "fauna"; text: string }
const blueprint = (id: Blueprint, name: string, fragments: number, text: string): CodexEntryDef<CodexMeta> =>
  ({ id, name, category: "Blueprints", fragments, description: text, meta: { kind: "blueprint", text } });
const log = (id: string, name: string, text: string): CodexEntryDef<CodexMeta> =>
  ({ id, name, category: "Logs", description: text, secret: true, meta: { kind: "log", text } });
const fauna = (id: string, name: string, text: string): CodexEntryDef<CodexMeta> =>
  ({ id, name, category: "Fauna", description: text, secret: true, meta: { kind: "fauna", text } });

/** Everything the scanner can learn, in the order the sheet lists it. */
export const CODEX_ENTRIES: readonly CodexEntryDef<CodexMeta>[] = [
  blueprint("cutter", "Plasma cutter", 2, "Opens sealed cable runs for wire and cells."),
  blueprint("seal2", "Seal Mk II", 3, "Rates the suit to pressure 3: the Ink Wells."),
  blueprint("drill", "Seam drill", 2, "Bores ink seams for raw printer ink."),
  blueprint("growbed", "Growbed", 1, "A Marrow bay module that grows rations while powered."),
  blueprint("lure", "Blood lure", 1, "A thrown tin of print-blood. Predators go where it lands."),
  blueprint("o2", "Spare cylinder", 1, "Forty more seconds of air on every departure."),
  blueprint("seal3", "Seal Mk III", 3, "Rates the suit to pressure 4: the Choir Deep."),
  blueprint("crawler", "Rail crawler", 3, "Carries you to the deepest lift you have charted, and home from any lift."),
  log("log-receiving", "Shift 406 / receiving", "VALE: Printer 06 keeps making Fitters from the 406 pattern. They walk our old routes. They stop when you shoot them, mostly."),
  log("log-cold", "Shift 406 / cold stores", "ROOK: The heaters went with the power. Rations keep forever down here, people don't. If you hear hands on the shelves, keep walking."),
  log("log-wells", "Shift 406 / ink wells", "LIN: The couriers smell the ink on you. Walk, don't run. Bleeding is running."),
  log("log-relay", "Relay / cage code", "A relay hums the same eleven tones on a loop. Marrow's mast reads them as a cage code for the lift below the Wells."),
  log("log-choir", "Shift 406 / the choir", "HALLOWAY: We built the Overrun to clear rubble. It learned to come to lamps because the lamps were where the rubble was."),
  log("log-zero", "Printer Zero", "The first printer. Every Life Marrow prints is a copy of a copy of the pattern here. Take it home and the copies stop fading."),
  fauna("hand", "Hand", "A failed print that kept only its hands. Harmless, skittish, turns from lamps. Its blood makes a good lure."),
  fauna("courier", "Courier", "A runner print. Hunts by sound and by the smell of blood; investigates what it only hears, charges what it sees."),
  fauna("overrun", "The Overrun", "Thirty tonnes of rubble-clearer. Nearly blind; comes to light. It does not stop."),
];

export function createDeepCodex(saved?: CodexSnapshot): Codex<CodexMeta> {
  const codex = createCodex<CodexMeta>({ entries: CODEX_ENTRIES });
  if (saved !== undefined) codex.restore(saved);
  return codex;
}

export interface GearDef { name: string; effect: string; recipe: RecipeDef; permanent: boolean }
const recipe = (id: Gear, inputs: readonly RecipeItem[]): RecipeDef => ({ id, inputs, outputs: [], station: undefined, category: "fabricator" });
export const GEAR: Record<Gear, GearDef> = {
  cutter: { name: "Plasma cutter", effect: "Cut cable runs", permanent: true, recipe: recipe("cutter", [{ itemId: "wire", count: 1 }, { itemId: "cells", count: 1 }]) },
  seal2: { name: "Seal Mk II", effect: "Suit rated to pressure 3", permanent: true, recipe: recipe("seal2", [{ itemId: "polymer", count: 2 }, { itemId: "wire", count: 1 }]) },
  drill: { name: "Seam drill", effect: "Drill ink seams", permanent: true, recipe: recipe("drill", [{ itemId: "cells", count: 1 }, { itemId: "wire", count: 2 }]) },
  lure: { name: "Blood lure", effect: "One thrown lure (G) on the next departure", permanent: false, recipe: recipe("lure", [{ itemId: "polymer", count: 1 }]) },
  o2: { name: "Spare cylinder", effect: "+40 s of air every departure", permanent: true, recipe: recipe("o2", [{ itemId: "polymer", count: 1 }, { itemId: "cells", count: 1 }]) },
  seal3: { name: "Seal Mk III", effect: "Suit rated to pressure 4", permanent: true, recipe: recipe("seal3", [{ itemId: "polymer", count: 2 }, { itemId: "ink", count: 1 }]) },
  crawler: { name: "Rail crawler", effect: "Depart to your deepest lift; ride home from any lift", permanent: true, recipe: recipe("crawler", [{ itemId: "cells", count: 2 }, { itemId: "wire", count: 2 }, { itemId: "ink", count: 1 }]) },
};
export const GEAR_ORDER: readonly Gear[] = ["cutter", "seal2", "drill", "lure", "o2", "seal3", "crawler"];
export const RECIPES = createRecipeGraph(GEAR_ORDER.map(id => GEAR[id].recipe));

const inventory = (stash: readonly Item[]) => ({ slots: stash.map(item => ({ itemId: kindOf(item), count: 1 })) });
export function gearMissing(stash: readonly Item[], id: Gear): RecipeItem[] { return missingInputs(inventory(stash), GEAR[id].recipe); }
/** Spend the exact stash instances a recipe takes; throws with the shortfall in words. */
export function spendRecipe(stash: readonly Item[], inputs: RecipeDef): Item[] {
  const result = craft(inventory(stash), { slots: stash.length }, { stackLimit: () => 1 }, inputs);
  if (result.status !== "ok") {
    const short = result.reason === "missing-inputs" ? result.missing.map(entry => `${entry.count} ${entry.itemId}`).join(", ") : result.reason;
    throw new Error(`Not enough banked salvage: short ${short}`);
  }
  return stash.filter((_, index) => result.state.slots[index] !== null);
}
