import {
  createDeliveryQueue,
  type DeliveryEntry,
  type DeliveryQueue,
} from "@jgengine/core/inventory/storageTier";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { COPPER } from "../model";
import { mailOpenStore, mailViewStore, marketOpenStore, shopStore } from "../session/stores";
import { ZONES } from "../world/zones";

export const MAILBOX = "waystation_post";
export const MAIL_DELAY_SEC = 8;
export const MARKET_SHOP = "shop_eastbrook";

const queues = new Map<string, DeliveryQueue>();

export interface MailView {
  pending: readonly {
    id: string;
    items: readonly { itemId: string; count: number }[];
    deliverAt: number;
    ready: boolean;
  }[];
  inbox: readonly { itemId: string; count: number }[];
}

function queueOf(userId: string): DeliveryQueue {
  let queue = queues.get(userId);
  if (queue === undefined) {
    queue = createDeliveryQueue();
    queues.set(userId, queue);
  }
  return queue;
}

export function placeMailboxes(ctx: GameContext): void {
  for (const zone of ZONES) {
    const x = zone.hub.x - 7;
    const z = zone.hub.z - 7;
    ctx.scene.object.place(MAILBOX, x, ctx.world.groundHeightAt(x, z), z);
  }
}

export function openMail(ctx: GameContext, userId: string): void {
  deliverDue(ctx, userId);
  mailOpenStore.write(ctx, userId, true);
  syncMail(ctx, userId);
}

export function closeMail(ctx: GameContext, userId: string): void {
  mailOpenStore.clear(ctx, userId);
  marketOpenStore.clear(ctx, userId);
}

export function openMarket(ctx: GameContext, userId: string): void {
  marketOpenStore.write(ctx, userId, true);
  shopStore.write(ctx, userId, MARKET_SHOP);
  mailOpenStore.clear(ctx, userId);
}

export function sendToSelf(
  ctx: GameContext,
  userId: string,
  itemId: string,
  count = 1,
): string | null {
  if (!mailOpenStore.read(ctx, userId)) return "mailbox-closed";
  if (count < 1) return "invalid-count";
  if (ctx.player.inventory.take("bags", itemId, count).status !== "ok") return "missing-item";
  const deliverAt = ctx.time.now() + MAIL_DELAY_SEC;
  queueOf(userId).schedule({
    userId,
    inventoryId: "bags",
    items: [{ itemId, count }],
    deliverAt,
  });
  syncMail(ctx, userId);
  ctx.scene.entity.floatText({
    instanceId: userId,
    text: `Mail scheduled (${MAIL_DELAY_SEC}s)`,
    kind: "info",
  });
  return null;
}

export function sendCopperToSelf(ctx: GameContext, userId: string, amount: number): string | null {
  if (!mailOpenStore.read(ctx, userId)) return "mailbox-closed";
  if (amount < 1) return "invalid-amount";
  if (ctx.game.economy.charge(userId, COPPER, amount) !== null) return "not-enough-copper";
  const deliverAt = ctx.time.now() + MAIL_DELAY_SEC;
  queueOf(userId).schedule({
    userId,
    inventoryId: "bags",
    items: [{ itemId: `__copper__`, count: amount }],
    deliverAt,
  });
  syncMail(ctx, userId);
  return null;
}

export function codStub(ctx: GameContext, userId: string): void {
  ctx.scene.entity.floatText({
    instanceId: userId,
    text: "COD mail requires multiplayer (#320)",
    kind: "info",
  });
}

function deliverDue(ctx: GameContext, userId: string): void {
  const due = queueOf(userId).claimDue(ctx.time.now());
  for (const entry of due) applyDelivery(ctx, entry);
}

function applyDelivery(ctx: GameContext, entry: DeliveryEntry): void {
  for (const stack of entry.items) {
    if (stack.itemId === `__copper__`) {
      ctx.game.economy.grant(entry.userId, COPPER, stack.count);
      continue;
    }
    const put = ctx.player.inventory.put(entry.inventoryId, stack.itemId, stack.count);
    if (put.status !== "ok") {
      ctx.player.inventory.put("bank", stack.itemId, stack.count);
    }
  }
  if (entry.items.length > 0) {
    ctx.scene.entity.floatText({
      instanceId: entry.userId,
      text: "Mail delivered",
      kind: "info",
    });
  }
}

export function tickMail(ctx: GameContext, userId: string): void {
  if (mailOpenStore.read(ctx, userId)) {
    deliverDue(ctx, userId);
    syncMail(ctx, userId);
  } else {
    const pending = queueOf(userId).due(ctx.time.now());
    if (pending.length > 0) {
      deliverDue(ctx, userId);
    }
  }
}

function syncMail(ctx: GameContext, userId: string): void {
  const now = ctx.time.now();
  const pending = queueOf(userId).pending(userId).map((entry) => ({
    id: entry.id,
    items: entry.items,
    deliverAt: entry.deliverAt,
    ready: entry.deliverAt <= now,
  }));
  const view: MailView = { pending, inbox: [] };
  mailViewStore.write(ctx, userId, view);
}

export function marketBuy(ctx: GameContext, userId: string, itemId: string): string | null {
  const openShopId = shopStore.read(ctx, userId);
  if (!marketOpenStore.read(ctx, userId) && openShopId === null) {
    return "market-closed";
  }
  const shopId = openShopId ?? MARKET_SHOP;
  const rejection = ctx.game.trade!.buy(itemId, 1, { shop: shopId, inventoryId: "bags" });
  return rejection?.reason ?? null;
}
