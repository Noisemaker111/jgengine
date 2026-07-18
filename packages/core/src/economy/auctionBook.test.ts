import { describe, expect, test } from "bun:test";
import { createAuctionBook } from "@jgengine/core/economy/auctionBook";

function bookFixture(overrides: Partial<Parameters<typeof createAuctionBook>[0]> = {}) {
  return createAuctionBook({
    maxAuctionsPerSeller: 3,
    durationSeconds: 100,
    cutRate: 0.05,
    antiSnipeWindowSeconds: 10,
    antiSnipeExtensionSeconds: 30,
    ...overrides,
  });
}

function posted(book: ReturnType<typeof bookFixture>, buyoutPrice?: number) {
  const result = book.post({
    sellerId: "amy",
    itemId: "sword",
    count: 1,
    currency: "copper",
    startPrice: 100,
    minIncrement: 10,
    buyoutPrice,
    now: 0,
  });
  if (result.status !== "ok") throw new Error("expected ok");
  return result.auction;
}

describe("economy/auctionBook", () => {
  test("post rejects invalid counts, prices, increments, and sub-start buyouts", () => {
    const book = bookFixture();
    const base = { sellerId: "amy", itemId: "sword", currency: "copper", now: 0 };
    expect(book.post({ ...base, count: 0, startPrice: 100, minIncrement: 10 })).toEqual({
      status: "rejected",
      reason: "invalid-count",
    });
    expect(book.post({ ...base, count: 1, startPrice: 0, minIncrement: 10 })).toEqual({
      status: "rejected",
      reason: "invalid-price",
    });
    expect(book.post({ ...base, count: 1, startPrice: 100, minIncrement: 0 })).toEqual({
      status: "rejected",
      reason: "invalid-increment",
    });
    expect(
      book.post({ ...base, count: 1, startPrice: 100, minIncrement: 10, buyoutPrice: 50 }),
    ).toEqual({ status: "rejected", reason: "invalid-buyout" });
  });

  test("post caps active auctions per seller", () => {
    const book = bookFixture({ maxAuctionsPerSeller: 1 });
    posted(book);
    expect(
      book.post({
        sellerId: "amy",
        itemId: "shield",
        count: 1,
        currency: "copper",
        startPrice: 5,
        minIncrement: 1,
        now: 0,
      }),
    ).toEqual({ status: "rejected", reason: "auction-cap-reached" });
  });

  test("bid enforces start price, increments, and rejects seller and leading bidder", () => {
    const book = bookFixture();
    const auction = posted(book);
    expect(book.bid(auction.id, "amy", 100, 1)).toEqual({ status: "rejected", reason: "own-auction" });
    expect(book.bid(auction.id, "bob", 99, 1)).toEqual({ status: "rejected", reason: "bid-too-low" });
    const first = book.bid(auction.id, "bob", 100, 1);
    expect(first).toMatchObject({ status: "ok", escrowed: 100, won: false });
    expect(book.bid(auction.id, "bob", 200, 2)).toEqual({
      status: "rejected",
      reason: "already-leading",
    });
    expect(book.bid(auction.id, "cal", 105, 2)).toEqual({ status: "rejected", reason: "bid-too-low" });
    expect(book.bid(auction.id, "cal", 110, 2)).toMatchObject({ status: "ok", escrowed: 110 });
  });

  test("outbid players are refunded into their collection box", () => {
    const book = bookFixture();
    const auction = posted(book);
    book.bid(auction.id, "bob", 100, 1);
    book.bid(auction.id, "cal", 110, 2);
    expect(book.collectionOf("bob").currency).toEqual({ copper: 100 });
    expect(book.claimCurrency("bob")).toEqual({ copper: 100 });
    expect(book.collectionOf("bob").currency).toEqual({});
  });

  test("a bid near the close extends the auction (anti-snipe)", () => {
    const book = bookFixture({ durationSeconds: 100, antiSnipeWindowSeconds: 10, antiSnipeExtensionSeconds: 30 });
    const auction = posted(book);
    const early = book.bid(auction.id, "bob", 100, 50);
    if (early.status !== "ok") throw new Error("expected ok");
    expect(early.auction.endsAt).toBe(100);
    const late = book.bid(auction.id, "cal", 110, 95);
    if (late.status !== "ok") throw new Error("expected ok");
    expect(late.auction.endsAt).toBe(125);
  });

  test("a bid at or above the buyout price settles immediately at the buyout price", () => {
    const book = bookFixture();
    const auction = posted(book, 500);
    const result = book.bid(auction.id, "bob", 600, 1);
    expect(result).toMatchObject({ status: "ok", escrowed: 500, won: true });
    expect(book.get(auction.id)).toBeNull();
    expect(book.collectionOf("amy").currency).toEqual({ copper: 475 });
    expect(book.collectionOf("bob").items).toEqual([{ itemId: "sword", count: 1 }]);
  });

  test("buyout refunds the buyer's own prior escrowed bid before charging the buyout", () => {
    const book = bookFixture();
    const auction = posted(book, 500);
    book.bid(auction.id, "bob", 100, 1);
    const result = book.buyout(auction.id, "bob", 2);
    expect(result).toMatchObject({ status: "ok", escrowed: 500, won: true });
    expect(book.collectionOf("bob").currency).toEqual({ copper: 100 });
    expect(book.collectionOf("bob").items).toEqual([{ itemId: "sword", count: 1 }]);
  });

  test("buyout is rejected on an auction without a buyout price", () => {
    const book = bookFixture();
    const auction = posted(book);
    expect(book.buyout(auction.id, "bob", 1)).toEqual({ status: "rejected", reason: "no-buyout" });
  });

  test("cancel works for the owner only and never after a bid lands", () => {
    const book = bookFixture();
    const auction = posted(book);
    expect(book.cancel(auction.id, "bob")).toEqual({ status: "rejected", reason: "not-owner" });
    book.bid(auction.id, "bob", 100, 1);
    expect(book.cancel(auction.id, "amy")).toEqual({ status: "rejected", reason: "has-bids" });
  });

  test("settleExpired pays the seller minus the house cut and awards the item to the winner", () => {
    const book = bookFixture({ cutRate: 0.05 });
    const auction = posted(book);
    book.bid(auction.id, "bob", 200, 1);
    expect(book.settleExpired(50)).toEqual([]);
    const settlements = book.settleExpired(100);
    expect(settlements).toEqual([
      {
        status: "sold",
        auction: expect.objectContaining({ id: auction.id }),
        winnerId: "bob",
        price: 200,
        houseCut: 10,
        sellerProceeds: 190,
      },
    ]);
    expect(book.collectionOf("amy").currency).toEqual({ copper: 190 });
    expect(book.collectionOf("bob").items).toEqual([{ itemId: "sword", count: 1 }]);
    expect(book.claimItem("bob", "sword", 1)).toBe(true);
    expect(book.collectionOf("bob").items).toEqual([]);
  });

  test("settleExpired returns unsold goods to the seller's collection box", () => {
    const book = bookFixture();
    const auction = posted(book);
    const settlements = book.settleExpired(100);
    expect(settlements).toEqual([
      { status: "returned", auction: expect.objectContaining({ id: auction.id }) },
    ]);
    expect(book.collectionOf("amy").items).toEqual([{ itemId: "sword", count: 1 }]);
    expect(book.active()).toEqual([]);
  });

  test("bids are rejected once the close time passes", () => {
    const book = bookFixture();
    const auction = posted(book);
    expect(book.bid(auction.id, "bob", 100, 100)).toEqual({ status: "rejected", reason: "ended" });
  });
});
