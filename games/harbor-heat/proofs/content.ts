import type { ContentProgressionRule } from "@jgengine/core/game/contentValidation";
import type { SuiteContent, SuiteUnlock } from "@jgengine/core/suite/contentAudit";

import { SAFEHOUSE_PRICE } from "../src/game/commands";
import { VEHICLES } from "../src/game/entities/vehicles/catalog";
import { GEAR, GEAR_SHOP } from "../src/game/items/gear";
import { STARTING_DEBT, UPGRADES as SHOP_TRACKS } from "../src/game/pizza/pizzeria";
import { UPGRADES as MODS } from "../src/game/progression/upgrades";

/** Note payments are made in these installments at the shop's books (the books also offer pay-it-all). */
const NOTE_INSTALLMENT = 2000;

/**
 * Everything a career's tips buy, in the order a careful rider affords it: the shop's ovens, toppings and
 * bags, the fleet on Sunset Motors' lot, the lot's bike mods, the bungalow and its rooms, and the note
 * MegaSlice holds, paid down two thousand at a time. Each is read from its own catalog.
 */
const purchases: { id: string; cost: number }[] = [
  ...Object.values(SHOP_TRACKS).flatMap((track) => track.tiers.slice(1).map((tier, index) => ({ id: `shop:${track.kind}:${index + 2}`, cost: tier.cost }))),
  ...VEHICLES.filter((vehicle) => vehicle.price > 0).map((vehicle) => ({ id: `fleet:${vehicle.id}`, cost: vehicle.price })),
  ...MODS.flatMap((mod) => {
    const values = mod.cost.kind === "steps" ? mod.cost.values.slice(1) : [];
    return values.map((cost, index) => ({ id: `mod:${mod.id}:${index + 1}`, cost }));
  }),
  { id: "bungalow", cost: SAFEHOUSE_PRICE },
  ...Array.from({ length: Math.ceil(STARTING_DEBT / NOTE_INSTALLMENT) }, (_, index) => ({ id: `note:${(index + 1) * NOTE_INSTALLMENT}`, cost: NOTE_INSTALLMENT })),
];

/** The runway on career tips: each purchase unlocks at the cumulative spend of everything cheaper before it. */
const unlocks: SuiteUnlock[] = [];
let spent = 0;
for (const purchase of [...purchases].sort((a, b) => a.cost - b.cost)) {
  spent += purchase.cost;
  unlocks.push({ id: purchase.id, at: spent });
}

/** Mercato Fresco sells each piece of rider gear for cash, which every delivery pays. */
const vendor: ContentProgressionRule[] = GEAR.filter((gear) => gear.trade?.shops?.includes(GEAR_SHOP) === true).map((gear) => ({
  id: `vendor:${gear.id}`,
  path: `src/game/items/gear.ts/${gear.id}`,
  requires: ["cash"],
  provides: [gear.id],
}));

/** High Tide Pizza's content for the game suite's data entries. */
export const content: SuiteContent = {
  items: GEAR.map((gear) => ({ id: gear.id })),
  // Every delivery pays cash, and the starter kit carries two first-aid kits.
  start: ["cash", "medkit_street"],
  sources: vendor,
  uses: GEAR.map((gear) => ({ id: gear.use ?? gear.id, path: "src/game/items/use-handlers.ts", items: [gear.id] })),
  places: [],
  runway: { axis: "career tips ($)", cap: spent, unlocks },
};
