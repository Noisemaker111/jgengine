import type { ContentProgressionRule } from "@jgengine/core/game/contentValidation";
import { evalCurve } from "@jgengine/core/progression/leveling";
import type { SuiteContent, SuiteUnlock } from "@jgengine/core/suite/contentAudit";

import { CHASSIS } from "../src/game/cart/chassis";
import { GOODS, POWER_UPS } from "../src/game/cart/goods";
import { LADDERS, PART_PRICE } from "../src/game/career";
import { YARD_EVENTS, YARD_TIERS } from "../src/game/events/catalog";
import { PARTS } from "../src/game/parts/catalog";
import { TRACKS } from "../src/game/tracks/catalog";

const tierFact = (id: string) => `tier:${id}`;
const trackFact = (id: string) => `track:${id}`;

/** Medal points open the next tier of the weekly circular; each tier's events open their departments. */
const tiers: ContentProgressionRule[] = YARD_TIERS.slice(1).map((tier, index) => ({
  id: `medals:${tier.id}`,
  path: `src/game/events/catalog.ts/${tier.id}`,
  requires: [tierFact(YARD_TIERS[index]!.id)],
  provides: [tierFact(tier.id)],
}));
const events: ContentProgressionRule[] = YARD_EVENTS.map((event) => ({
  id: `event:${event.id}`,
  path: `src/game/events/catalog.ts/${event.id}`,
  requires: [tierFact(event.tier)],
  provides: [trackFact(event.track)],
}));

/** Every department's shelves hand out its stock, and its mod displays hand out mods. */
const shelves: ContentProgressionRule[] = TRACKS.map((track) => ({
  id: `shelves:${track.id}`,
  path: `src/game/tracks/${track.id}`,
  requires: [trackFact(track.id)],
  provides: [...new Set(track.shelves.map((spot) => spot.item.id))],
}));
const displays: ContentProgressionRule[] = TRACKS.map((track) => ({
  id: `displays:${track.id}`,
  path: `src/game/tracks/${track.id}`,
  requires: [trackFact(track.id)],
  provides: [...new Set(track.pickups.map((pickup) => pickup.partId))],
}));

/**
 * The store-credit runway: customer service's mod rungs and the corral's carts, bought cheapest
 * first, each unlocking at the credit spent so far.
 */
const purchases = [
  ...Object.entries(LADDERS).flatMap(([, ladder]) => ladder.map((id, index) => ({ id: `mod:${id}`, price: Math.round(evalCurve(PART_PRICE, index + 1)) }))),
  ...CHASSIS.filter((entry) => entry.price > 0).map((entry) => ({ id: `cart:${entry.id}`, price: entry.price })),
].sort((a, b) => a.price - b.price);
const unlocks: SuiteUnlock[] = [];
let spent = 0;
for (const purchase of purchases) {
  spent += purchase.price;
  unlocks.push({ id: purchase.id, at: spent });
}

/** Cleanup on Aisle 9's content for the game suite's data entries: stock, power-ups, mods and carts. */
export const content: SuiteContent = {
  items: [...GOODS.map((goods) => ({ id: goods.id })), ...POWER_UPS.map((power) => ({ id: power.id })), ...PARTS.map((part) => ({ id: part.id }))],
  start: [tierFact(YARD_TIERS[0]!.id), "cart:standard"],
  sources: [...tiers, ...events, ...shelves, ...displays],
  uses: [
    { id: "checkout", path: "src/game/cart/checkout.ts", items: GOODS.map((goods) => goods.id) },
    { id: "basket-load", path: "src/game/cart/basket.ts", items: GOODS.map((goods) => goods.id) },
    { id: "power-up", path: "src/game/run/session.ts", items: POWER_UPS.map((power) => power.id) },
    { id: "fit-mod", path: "src/game/parts/build.ts", items: PARTS.map((part) => part.id) },
  ],
  places: [],
  runway: { axis: "store credit spent", cap: spent, unlocks },
};
