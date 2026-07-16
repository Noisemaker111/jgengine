import { command, keybind, proximityPrompt } from "@jgengine/core/interaction/proximityPrompt";
import { createListingBook } from "@jgengine/core/economy/listingBook";
import { itemDefById } from "../items/catalog";
import { INTERACT_RANGE } from "../math/combat";
import { COPPER } from "../model";
import { storeKeys as heroStoreKeys } from "../session/hero";
import { ZONES } from "../world/zones";
export const AUCTION_BOARD = "auction_board";
export const AUCTION_MAX_LISTINGS = 12;
export const AUCTION_EXPIRY_HOURS = 48;
export const AUCTION_CUT_RATE = 0.05;
export const AUCTION_MIN_PRICE = 1;
export const AUCTION_MAX_PRICE = 5_000_000;
export const AUCTION_SWEEP_INTERVAL_SEC = 60;
export const AUCTION_BROWSE_LIMIT = 100;
const AUCTION_INVENTORY = "bags";
const storeKeys = {
    open: (userId) => `auction:${userId}`,
    query: (userId) => `auctionQuery:${userId}`,
    view: (userId) => `auctionView:${userId}`,
};
const book = createListingBook({
    maxListingsPerSeller: AUCTION_MAX_LISTINGS,
    expirySeconds: AUCTION_EXPIRY_HOURS * 3600,
    cutRate: AUCTION_CUT_RATE,
    minPrice: AUCTION_MIN_PRICE,
    maxPrice: AUCTION_MAX_PRICE,
});
function displayNameOf(ctx, userId) {
    const name = ctx.game.store.get(heroStoreKeys.name(userId));
    return typeof name === "string" && name.length > 0 ? name : userId;
}
function itemNameOf(itemId) {
    return itemDefById(itemId)?.name ?? itemId;
}
function listingView(ctx, listing, viewerId) {
    return {
        id: listing.id,
        sellerId: listing.sellerId,
        sellerName: displayNameOf(ctx, listing.sellerId),
        itemId: listing.itemId,
        count: listing.count,
        price: listing.price,
        expiresInSec: Math.max(0, listing.expiresAt - ctx.time.now()),
        mine: listing.sellerId === viewerId,
    };
}
function syncAuctionView(ctx, userId) {
    const raw = ctx.game.store.get(storeKeys.query(userId));
    const query = (typeof raw === "string" ? raw : "").trim().toLowerCase();
    const others = book.active().filter((listing) => listing.sellerId !== userId);
    const filtered = query.length === 0
        ? others
        : others.filter((listing) => itemNameOf(listing.itemId).toLowerCase().includes(query));
    filtered.sort((a, b) => {
        const nameCompare = itemNameOf(a.itemId).localeCompare(itemNameOf(b.itemId));
        return nameCompare !== 0 ? nameCompare : a.price - b.price;
    });
    const box = book.collectionOf(userId);
    const view = {
        query,
        listings: filtered.slice(0, AUCTION_BROWSE_LIMIT).map((listing) => listingView(ctx, listing, userId)),
        mine: book.listingsOf(userId).map((listing) => listingView(ctx, listing, userId)),
        collection: { currency: box.currency, items: box.items },
        maxListings: AUCTION_MAX_LISTINGS,
    };
    ctx.game.store.set(storeKeys.view(userId), view);
}
export function placeAuctionBoard(ctx) {
    for (const zone of ZONES) {
        const x = zone.hub.x - 7;
        const z = zone.hub.z + 7;
        ctx.scene.object.place(AUCTION_BOARD, x, ctx.world.groundHeightAt(x, z), z);
    }
}
export function auctionPrompts(ctx) {
    void ctx;
    return ZONES.map((zone) => ({
        id: `auction:${zone.id}`,
        position: { x: zone.hub.x - 7, z: zone.hub.z + 7 },
        prompt: proximityPrompt({
            radius: INTERACT_RANGE,
            display: keybind("interact"),
            invoke: command("auction.open", {}),
        }),
    }));
}
export function startAuctionSweep(ctx) {
    ctx.time.every(AUCTION_SWEEP_INTERVAL_SEC, () => {
        book.sweepExpired(ctx.time.now());
    });
}
export function openAuction(ctx, userId) {
    ctx.game.store.set(storeKeys.open(userId), true);
    ctx.game.store.delete(`mail:${userId}`);
    syncAuctionView(ctx, userId);
}
export function closeAuction(ctx, userId) {
    ctx.game.store.delete(storeKeys.open(userId));
}
export function searchAuction(ctx, userId, query) {
    ctx.game.store.set(storeKeys.query(userId), query);
    syncAuctionView(ctx, userId);
}
export function listAuction(ctx, userId, itemId, count, price) {
    if (ctx.game.store.get(storeKeys.open(userId)) !== true)
        return "auction-closed";
    const taken = ctx.player.inventory.take(AUCTION_INVENTORY, itemId, count);
    if (taken.status !== "ok")
        return "missing-item";
    const result = book.post({ sellerId: userId, itemId, count, price, currency: COPPER, now: ctx.time.now() });
    if (result.status !== "ok") {
        ctx.player.inventory.put(AUCTION_INVENTORY, itemId, count);
        return result.reason;
    }
    syncAuctionView(ctx, userId);
    return null;
}
export function cancelAuctionListing(ctx, userId, listingId) {
    const result = book.cancel(listingId, userId);
    if (result.status !== "ok")
        return result.reason;
    const put = ctx.player.inventory.put(AUCTION_INVENTORY, result.listing.itemId, result.listing.count);
    if (put.status !== "ok")
        ctx.player.inventory.put("bank", result.listing.itemId, result.listing.count);
    syncAuctionView(ctx, userId);
    return null;
}
export function buyAuctionListing(ctx, userId, listingId) {
    const listing = book.get(listingId);
    if (listing === null)
        return "not-found";
    if (listing.sellerId === userId)
        return "own-listing";
    const put = ctx.player.inventory.put(AUCTION_INVENTORY, listing.itemId, listing.count);
    if (put.status !== "ok")
        return "no-space";
    const chargeError = ctx.game.economy.charge(userId, listing.currency, listing.price);
    if (chargeError !== null) {
        ctx.player.inventory.take(AUCTION_INVENTORY, listing.itemId, listing.count);
        return chargeError.reason;
    }
    const result = book.buy(listingId, userId, ctx.time.now());
    if (result.status !== "ok") {
        ctx.player.inventory.take(AUCTION_INVENTORY, listing.itemId, listing.count);
        ctx.game.economy.grant(userId, listing.currency, listing.price);
        return result.reason;
    }
    syncAuctionView(ctx, userId);
    return null;
}
export function collectAuction(ctx, userId) {
    const currency = book.claimCurrency(userId);
    for (const [currencyId, amount] of Object.entries(currency)) {
        if (amount > 0)
            ctx.game.economy.grant(userId, currencyId, amount);
    }
    const box = book.collectionOf(userId);
    for (const stack of box.items) {
        const put = ctx.player.inventory.put(AUCTION_INVENTORY, stack.itemId, stack.count);
        if (put.status === "ok")
            book.claimItem(userId, stack.itemId, stack.count);
    }
    syncAuctionView(ctx, userId);
}
export function tickAuction(ctx, userId) {
    if (ctx.game.store.get(storeKeys.open(userId)) === true)
        syncAuctionView(ctx, userId);
}
