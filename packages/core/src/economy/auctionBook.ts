import type { ItemStack } from "../inventory/storageTier";
import type { CollectionBoxSnapshot } from "./listingBook";

/** One live timed auction in an {@link AuctionBook}: an item stack under open bidding until it closes. */
export interface Auction {
  readonly id: string;
  readonly sellerId: string;
  readonly itemId: string;
  readonly count: number;
  readonly currency: string;
  readonly startPrice: number;
  readonly minIncrement: number;
  readonly buyoutPrice: number | null;
  readonly listedAt: number;
  readonly endsAt: number;
  readonly highBid: HighBid | null;
}

/** The current leading bid on an {@link Auction}. */
export interface HighBid {
  readonly bidderId: string;
  readonly amount: number;
  readonly at: number;
}

/**
 * Tunables for {@link createAuctionBook} — per-seller auction cap, run length, house cut, and the
 * anti-snipe window: a bid landing within `antiSnipeWindowSeconds` of the close pushes the close
 * out so it ends at least `antiSnipeExtensionSeconds` after that bid.
 */
export interface AuctionBookConfig {
  maxAuctionsPerSeller: number;
  durationSeconds: number;
  cutRate: number;
  antiSnipeWindowSeconds?: number;
  antiSnipeExtensionSeconds?: number;
}

/** Input to {@link AuctionBook.post} — the goods, opening terms, and current game-time. */
export interface PostAuctionInput {
  id?: string;
  sellerId: string;
  itemId: string;
  count: number;
  currency: string;
  startPrice: number;
  minIncrement: number;
  buyoutPrice?: number;
  now: number;
}

/** Why {@link AuctionBook.post} refused an auction. */
export type PostAuctionReason =
  | "invalid-count"
  | "invalid-price"
  | "invalid-increment"
  | "invalid-buyout"
  | "auction-cap-reached";

/** Result of {@link AuctionBook.post}. */
export type PostAuctionResult =
  | { status: "ok"; auction: Auction }
  | { status: "rejected"; reason: PostAuctionReason };

/** Why {@link AuctionBook.bid} refused a bid. */
export type BidReason =
  | "not-found"
  | "ended"
  | "own-auction"
  | "already-leading"
  | "bid-too-low"
  | "invalid-amount"
  | "no-buyout";

/**
 * Result of {@link AuctionBook.bid}. On `ok` the caller must escrow `escrowed` from the bidder's
 * wallet; any previously escrowed leading bid has already been refunded to that bidder's
 * collection box. `won` is true when the bid met the buyout price and settled the auction
 * immediately.
 */
export type BidResult =
  | { status: "ok"; auction: Auction; escrowed: number; won: boolean }
  | { status: "rejected"; reason: BidReason };

/** Result of {@link AuctionBook.cancel}: a bid-on auction can no longer be withdrawn. */
export type CancelAuctionResult =
  | { status: "ok"; auction: Auction }
  | { status: "rejected"; reason: "not-found" | "not-owner" | "has-bids" };

/** How one closed auction resolved during {@link AuctionBook.settleExpired}. */
export type AuctionSettlement =
  | {
      status: "sold";
      auction: Auction;
      winnerId: string;
      price: number;
      houseCut: number;
      sellerProceeds: number;
    }
  | { status: "returned"; auction: Auction };

/**
 * A timed-bid auction marketplace plus the per-player collection boxes behind it. See
 * {@link createAuctionBook}.
 */
export interface AuctionBook {
  post(input: PostAuctionInput): PostAuctionResult;
  bid(auctionId: string, bidderId: string, amount: number, now: number): BidResult;
  buyout(auctionId: string, buyerId: string, now: number): BidResult;
  cancel(auctionId: string, sellerId: string): CancelAuctionResult;
  settleExpired(now: number): readonly AuctionSettlement[];
  get(auctionId: string): Auction | null;
  active(): readonly Auction[];
  auctionsOf(sellerId: string): readonly Auction[];
  countOf(sellerId: string): number;
  collectionOf(playerId: string): CollectionBoxSnapshot;
  claimCurrency(playerId: string): Readonly<Record<string, number>>;
  claimItem(playerId: string, itemId: string, count: number): boolean;
}

interface AuctionState {
  readonly id: string;
  readonly sellerId: string;
  readonly itemId: string;
  readonly count: number;
  readonly currency: string;
  readonly startPrice: number;
  readonly minIncrement: number;
  readonly buyoutPrice: number | null;
  readonly listedAt: number;
  endsAt: number;
  highBid: HighBid | null;
}

interface CollectionBoxState {
  currency: Record<string, number>;
  items: ItemStack[];
}

/**
 * Timed-bid auctions in the WoW/BDO auction-house mold: post an item with a start price, minimum
 * increment, and optional buyout; bids escrow currency, outbid players are refunded into their
 * collection box, bids near the close extend it (anti-snipe), and settlement pays the seller minus
 * the house cut while the item lands in the winner's collection box. Unsold auctions return the
 * goods to the seller's box. Wallet and inventory movement is the caller's job (mirrors
 * `economy/listingBook`) — this primitive owns the auction lifecycle and the escrowed
 * collection-box bookkeeping behind it.
 *
 * @capability auction-book timed bid auctions with escrowed bids, buyout, anti-snipe close extension, and collection-box settlement
 */
export function createAuctionBook(config: AuctionBookConfig): AuctionBook {
  const auctions = new Map<string, AuctionState>();
  const boxes = new Map<string, CollectionBoxState>();
  let counter = 0;

  function boxOf(playerId: string): CollectionBoxState {
    let box = boxes.get(playerId);
    if (box === undefined) {
      box = { currency: {}, items: [] };
      boxes.set(playerId, box);
    }
    return box;
  }

  function creditCurrency(playerId: string, currency: string, amount: number): void {
    const box = boxOf(playerId);
    box.currency[currency] = (box.currency[currency] ?? 0) + amount;
  }

  function creditItem(playerId: string, itemId: string, count: number): void {
    const box = boxOf(playerId);
    const existing = box.items.find((stack) => stack.itemId === itemId);
    if (existing !== undefined) existing.count += count;
    else box.items.push({ itemId, count });
  }

  function countOf(sellerId: string): number {
    let total = 0;
    for (const auction of auctions.values()) if (auction.sellerId === sellerId) total += 1;
    return total;
  }

  function snapshot(state: AuctionState): Auction {
    return { ...state, highBid: state.highBid };
  }

  function minimumBid(state: AuctionState): number {
    return state.highBid === null ? state.startPrice : state.highBid.amount + state.minIncrement;
  }

  function settle(state: AuctionState, winnerId: string, price: number): AuctionSettlement {
    auctions.delete(state.id);
    const houseCut = Math.floor(price * config.cutRate);
    const sellerProceeds = price - houseCut;
    creditCurrency(state.sellerId, state.currency, sellerProceeds);
    creditItem(winnerId, state.itemId, state.count);
    return { status: "sold", auction: snapshot(state), winnerId, price, houseCut, sellerProceeds };
  }

  function acceptBid(state: AuctionState, bidderId: string, amount: number, now: number): BidResult {
    if (state.highBid !== null) {
      creditCurrency(state.highBid.bidderId, state.currency, state.highBid.amount);
    }
    if (state.buyoutPrice !== null && amount >= state.buyoutPrice) {
      state.highBid = { bidderId, amount: state.buyoutPrice, at: now };
      const settlement = settle(state, bidderId, state.buyoutPrice);
      if (settlement.status !== "sold") throw new Error("unreachable");
      return { status: "ok", auction: settlement.auction, escrowed: state.buyoutPrice, won: true };
    }
    state.highBid = { bidderId, amount, at: now };
    const window = config.antiSnipeWindowSeconds ?? 0;
    const extension = config.antiSnipeExtensionSeconds ?? 0;
    if (window > 0 && extension > 0 && state.endsAt - now < window) {
      state.endsAt = Math.max(state.endsAt, now + extension);
    }
    return { status: "ok", auction: snapshot(state), escrowed: amount, won: false };
  }

  return {
    post(input) {
      if (!Number.isInteger(input.count) || input.count < 1) {
        return { status: "rejected", reason: "invalid-count" };
      }
      if (!Number.isFinite(input.startPrice) || input.startPrice <= 0) {
        return { status: "rejected", reason: "invalid-price" };
      }
      if (!Number.isFinite(input.minIncrement) || input.minIncrement <= 0) {
        return { status: "rejected", reason: "invalid-increment" };
      }
      if (input.buyoutPrice !== undefined) {
        if (!Number.isFinite(input.buyoutPrice) || input.buyoutPrice < input.startPrice) {
          return { status: "rejected", reason: "invalid-buyout" };
        }
      }
      if (countOf(input.sellerId) >= config.maxAuctionsPerSeller) {
        return { status: "rejected", reason: "auction-cap-reached" };
      }
      const id = input.id ?? `auction_${(counter += 1)}`;
      const state: AuctionState = {
        id,
        sellerId: input.sellerId,
        itemId: input.itemId,
        count: input.count,
        currency: input.currency,
        startPrice: input.startPrice,
        minIncrement: input.minIncrement,
        buyoutPrice: input.buyoutPrice ?? null,
        listedAt: input.now,
        endsAt: input.now + config.durationSeconds,
        highBid: null,
      };
      auctions.set(id, state);
      return { status: "ok", auction: snapshot(state) };
    },
    bid(auctionId, bidderId, amount, now) {
      const state = auctions.get(auctionId);
      if (state === undefined) return { status: "rejected", reason: "not-found" };
      if (state.endsAt <= now) return { status: "rejected", reason: "ended" };
      if (state.sellerId === bidderId) return { status: "rejected", reason: "own-auction" };
      if (!Number.isFinite(amount) || amount <= 0) {
        return { status: "rejected", reason: "invalid-amount" };
      }
      if (state.highBid?.bidderId === bidderId) {
        return { status: "rejected", reason: "already-leading" };
      }
      if (amount < minimumBid(state)) return { status: "rejected", reason: "bid-too-low" };
      return acceptBid(state, bidderId, amount, now);
    },
    buyout(auctionId, buyerId, now) {
      const state = auctions.get(auctionId);
      if (state === undefined) return { status: "rejected", reason: "not-found" };
      if (state.endsAt <= now) return { status: "rejected", reason: "ended" };
      if (state.sellerId === buyerId) return { status: "rejected", reason: "own-auction" };
      if (state.buyoutPrice === null) return { status: "rejected", reason: "no-buyout" };
      if (state.highBid?.bidderId === buyerId) {
        creditCurrency(buyerId, state.currency, state.highBid.amount);
        state.highBid = null;
      }
      return acceptBid(state, buyerId, state.buyoutPrice, now);
    },
    cancel(auctionId, sellerId) {
      const state = auctions.get(auctionId);
      if (state === undefined) return { status: "rejected", reason: "not-found" };
      if (state.sellerId !== sellerId) return { status: "rejected", reason: "not-owner" };
      if (state.highBid !== null) return { status: "rejected", reason: "has-bids" };
      auctions.delete(auctionId);
      return { status: "ok", auction: snapshot(state) };
    },
    settleExpired(now) {
      const ended: AuctionState[] = [];
      for (const state of auctions.values()) if (state.endsAt <= now) ended.push(state);
      const settlements: AuctionSettlement[] = [];
      for (const state of ended) {
        if (state.highBid === null) {
          auctions.delete(state.id);
          creditItem(state.sellerId, state.itemId, state.count);
          settlements.push({ status: "returned", auction: snapshot(state) });
        } else {
          settlements.push(settle(state, state.highBid.bidderId, state.highBid.amount));
        }
      }
      return settlements;
    },
    get(auctionId) {
      const state = auctions.get(auctionId);
      return state === undefined ? null : snapshot(state);
    },
    active() {
      return [...auctions.values()].map(snapshot);
    },
    auctionsOf(sellerId) {
      return [...auctions.values()].filter((a) => a.sellerId === sellerId).map(snapshot);
    },
    countOf,
    collectionOf(playerId) {
      const box = boxes.get(playerId);
      if (box === undefined) return { currency: {}, items: [] };
      return { currency: { ...box.currency }, items: box.items.map((stack) => ({ ...stack })) };
    },
    claimCurrency(playerId) {
      const box = boxOf(playerId);
      const claimed = box.currency;
      box.currency = {};
      return claimed;
    },
    claimItem(playerId, itemId, count) {
      const box = boxOf(playerId);
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
