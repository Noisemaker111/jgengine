import { createEventTicker, type EventTicker } from "@jgengine/core/feed/eventTicker";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

import { itemLabel } from "./data/items";

/** How long a line stays up, in game milliseconds. */
const LINE_MS = 4000;

const tickers = perContext((ctx: GameContext): EventTicker => createEventTicker({ limit: 4, ttlMs: LINE_MS, now: () => ctx.time.now() * 1000 }));

/** ARK's item lines at the top of the screen: "ADDED: 3x Thatch", "CONSUMED: 1x Cooked Meat". */
export function pickupFeed(ctx: GameContext): EventTicker {
  return tickers(ctx);
}

export function feedAdded(ctx: GameContext, itemId: string, count: number): void {
  tickers(ctx).push({ kind: "added", text: `ADDED: ${count}x ${itemLabel(itemId)}`, icon: itemId });
}

export function feedConsumed(ctx: GameContext, itemId: string, count: number): void {
  tickers(ctx).push({ kind: "consumed", text: `CONSUMED: ${count}x ${itemLabel(itemId)}`, icon: itemId });
}
