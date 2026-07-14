import type { ItemStack } from "../inventory/storageTier";

/** One active post in a {@link ListingBook}: an item stack a seller offered at a fixed price until it expires. */
export interface Listing {
  readonly id: string;
  readonly sellerId: string;
  readonly itemId: string;
  readonly count: number;
  readonly price: number;
  readonly currency: string;
  readonly listedAt: number;
  readonly expiresAt: number;
}

/** Tunables for {@link createListingBook} — per-seller listing cap, expiry window, house cut, and optional price bounds. */
export interface ListingBookConfig {
  maxListingsPerSeller: number;
  expirySeconds: number;
  cutRate: number;
  minPrice?: number;
  maxPrice?: number;
}

/** Input to {@link ListingBook.post} — the goods, asking price, and current game-time to stamp the listing with. */
export interface PostListingInput {
  id?: string;
  sellerId: string;
  itemId: string;
  count: number;
  price: number;
  currency: string;
  now: number;
}

/** Why {@link ListingBook.post} refused a listing. */
export type PostListingReason =
  | "invalid-count"
  | "invalid-price"
  | "price-too-low"
  | "price-too-high"
  | "listing-cap-reached";

/** Result of {@link ListingBook.post}. */
export type PostListingResult =
  | { status: "ok"; listing: Listing }
  | { status: "rejected"; reason: PostListingReason };

/** Result of {@link ListingBook.cancel}. */
export type CancelListingResult =
  | { status: "ok"; listing: Listing }
  | { status: "rejected"; reason: "not-found" | "not-owner" };

/** The financial split of a completed sale: total price, the house's cut, and what the seller's collection box was credited. */
export interface BuyListingOutcome {
  listing: Listing;
  houseCut: number;
  sellerProceeds: number;
}

/** Result of {@link ListingBook.buy}. */
export type BuyListingResult =
  | { status: "ok"; outcome: BuyListingOutcome }
  | { status: "rejected"; reason: "not-found" | "expired" | "own-listing" };

/** A read-only view of a seller's collection box — currency and item stacks waiting to be claimed. */
export interface CollectionBoxSnapshot {
  currency: Readonly<Record<string, number>>;
  items: readonly ItemStack[];
}

/** A player-driven marketplace of {@link Listing}s plus the per-seller collection boxes behind it. See {@link createListingBook}. */
export interface ListingBook {
  post(input: PostListingInput): PostListingResult;
  cancel(listingId: string, sellerId: string): CancelListingResult;
  buy(listingId: string, buyerId: string, now: number): BuyListingResult;
  sweepExpired(now: number): readonly Listing[];
  get(listingId: string): Listing | null;
  active(): readonly Listing[];
  listingsOf(sellerId: string): readonly Listing[];
  countOf(sellerId: string): number;
  collectionOf(sellerId: string): CollectionBoxSnapshot;
  claimCurrency(sellerId: string): Readonly<Record<string, number>>;
  claimItem(sellerId: string, itemId: string, count: number): boolean;
}

interface CollectionBoxState {
  currency: Record<string, number>;
  items: ItemStack[];
}

/**
 * A player-driven listing marketplace: post/cancel/buy against a shared book with a house cut on
 * every sale, an expiry sweep that pulls unsold goods out of circulation, and a per-seller
 * collection box holding sale proceeds and returned items until claimed. Buyer/seller wallet and
 * inventory movement is the caller's job (mirrors `game/trade`'s split) — this primitive owns only
 * the listing lifecycle and the escrowed collection-box bookkeeping behind it.
 *
 * @capability listing-book player-driven marketplace listings with a house cut, expiry sweep, and seller collection box
 */
export function createListingBook(config: ListingBookConfig): ListingBook {
  const listings = new Map<string, Listing>();
  const boxes = new Map<string, CollectionBoxState>();
  let counter = 0;

  function boxOf(sellerId: string): CollectionBoxState {
    let box = boxes.get(sellerId);
    if (box === undefined) {
      box = { currency: {}, items: [] };
      boxes.set(sellerId, box);
    }
    return box;
  }

  function creditCurrency(sellerId: string, currency: string, amount: number): void {
    const box = boxOf(sellerId);
    box.currency[currency] = (box.currency[currency] ?? 0) + amount;
  }

  function creditItem(sellerId: string, itemId: string, count: number): void {
    const box = boxOf(sellerId);
    const existing = box.items.find((stack) => stack.itemId === itemId);
    if (existing !== undefined) existing.count += count;
    else box.items.push({ itemId, count });
  }

  function countOf(sellerId: string): number {
    let total = 0;
    for (const listing of listings.values()) if (listing.sellerId === sellerId) total += 1;
    return total;
  }

  return {
    post(input) {
      if (!Number.isInteger(input.count) || input.count < 1) {
        return { status: "rejected", reason: "invalid-count" };
      }
      if (!Number.isFinite(input.price) || input.price <= 0) {
        return { status: "rejected", reason: "invalid-price" };
      }
      if (config.minPrice !== undefined && input.price < config.minPrice) {
        return { status: "rejected", reason: "price-too-low" };
      }
      if (config.maxPrice !== undefined && input.price > config.maxPrice) {
        return { status: "rejected", reason: "price-too-high" };
      }
      if (countOf(input.sellerId) >= config.maxListingsPerSeller) {
        return { status: "rejected", reason: "listing-cap-reached" };
      }
      const id = input.id ?? `listing_${(counter += 1)}`;
      const listing: Listing = {
        id,
        sellerId: input.sellerId,
        itemId: input.itemId,
        count: input.count,
        price: input.price,
        currency: input.currency,
        listedAt: input.now,
        expiresAt: input.now + config.expirySeconds,
      };
      listings.set(id, listing);
      return { status: "ok", listing };
    },
    cancel(listingId, sellerId) {
      const listing = listings.get(listingId);
      if (listing === undefined) return { status: "rejected", reason: "not-found" };
      if (listing.sellerId !== sellerId) return { status: "rejected", reason: "not-owner" };
      listings.delete(listingId);
      return { status: "ok", listing };
    },
    buy(listingId, buyerId, now) {
      const listing = listings.get(listingId);
      if (listing === undefined) return { status: "rejected", reason: "not-found" };
      if (listing.sellerId === buyerId) return { status: "rejected", reason: "own-listing" };
      if (listing.expiresAt <= now) return { status: "rejected", reason: "expired" };
      listings.delete(listingId);
      const houseCut = Math.floor(listing.price * config.cutRate);
      const sellerProceeds = listing.price - houseCut;
      creditCurrency(listing.sellerId, listing.currency, sellerProceeds);
      return { status: "ok", outcome: { listing, houseCut, sellerProceeds } };
    },
    sweepExpired(now) {
      const expired: Listing[] = [];
      for (const listing of listings.values()) {
        if (listing.expiresAt <= now) expired.push(listing);
      }
      for (const listing of expired) {
        listings.delete(listing.id);
        creditItem(listing.sellerId, listing.itemId, listing.count);
      }
      return expired;
    },
    get(listingId) {
      return listings.get(listingId) ?? null;
    },
    active() {
      return [...listings.values()];
    },
    listingsOf(sellerId) {
      return [...listings.values()].filter((listing) => listing.sellerId === sellerId);
    },
    countOf,
    collectionOf(sellerId) {
      const box = boxes.get(sellerId);
      if (box === undefined) return { currency: {}, items: [] };
      return { currency: { ...box.currency }, items: box.items.map((stack) => ({ ...stack })) };
    },
    claimCurrency(sellerId) {
      const box = boxOf(sellerId);
      const claimed = box.currency;
      box.currency = {};
      return claimed;
    },
    claimItem(sellerId, itemId, count) {
      const box = boxOf(sellerId);
      const index = box.items.findIndex((stack) => stack.itemId === itemId);
      if (index === -1) return false;
      const stack = box.items[index];
      if (stack.count < count) return false;
      if (stack.count === count) box.items.splice(index, 1);
      else box.items[index] = { ...stack, count: stack.count - count };
      return true;
    },
  };
}
