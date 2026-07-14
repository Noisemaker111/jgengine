import { describe, expect, test } from "bun:test";
import { createListingBook } from "@jgengine/core/economy/listingBook";

function bookFixture(overrides: Partial<Parameters<typeof createListingBook>[0]> = {}) {
  return createListingBook({
    maxListingsPerSeller: 3,
    expirySeconds: 100,
    cutRate: 0.05,
    minPrice: 1,
    maxPrice: 1_000_000,
    ...overrides,
  });
}

describe("economy/listingBook", () => {
  test("post rejects a non-positive or fractional count", () => {
    const book = bookFixture();
    expect(
      book.post({ sellerId: "amy", itemId: "sword", count: 0, price: 10, currency: "copper", now: 0 }),
    ).toEqual({ status: "rejected", reason: "invalid-count" });
    expect(
      book.post({ sellerId: "amy", itemId: "sword", count: 1.5, price: 10, currency: "copper", now: 0 }),
    ).toEqual({ status: "rejected", reason: "invalid-count" });
  });

  test("post rejects a non-finite or non-positive price", () => {
    const book = bookFixture();
    expect(
      book.post({ sellerId: "amy", itemId: "sword", count: 1, price: 0, currency: "copper", now: 0 }),
    ).toEqual({ status: "rejected", reason: "invalid-price" });
    expect(
      book.post({ sellerId: "amy", itemId: "sword", count: 1, price: Number.NaN, currency: "copper", now: 0 }),
    ).toEqual({ status: "rejected", reason: "invalid-price" });
  });

  test("post enforces the configured price bounds", () => {
    const book = bookFixture({ minPrice: 5, maxPrice: 50 });
    expect(
      book.post({ sellerId: "amy", itemId: "sword", count: 1, price: 1, currency: "copper", now: 0 }),
    ).toEqual({ status: "rejected", reason: "price-too-low" });
    expect(
      book.post({ sellerId: "amy", itemId: "sword", count: 1, price: 500, currency: "copper", now: 0 }),
    ).toEqual({ status: "rejected", reason: "price-too-high" });
  });

  test("post caps active listings per seller", () => {
    const book = bookFixture({ maxListingsPerSeller: 2 });
    expect(book.post({ sellerId: "amy", itemId: "a", count: 1, price: 10, currency: "copper", now: 0 }).status).toBe("ok");
    expect(book.post({ sellerId: "amy", itemId: "b", count: 1, price: 10, currency: "copper", now: 0 }).status).toBe("ok");
    expect(
      book.post({ sellerId: "amy", itemId: "c", count: 1, price: 10, currency: "copper", now: 0 }),
    ).toEqual({ status: "rejected", reason: "listing-cap-reached" });
    expect(book.countOf("amy")).toBe(2);
  });

  test("cancel returns the listing to its owner and removes it from the active book", () => {
    const book = bookFixture();
    const posted = book.post({ sellerId: "amy", itemId: "sword", count: 1, price: 10, currency: "copper", now: 0 });
    if (posted.status !== "ok") throw new Error("expected ok");
    const cancelled = book.cancel(posted.listing.id, "amy");
    expect(cancelled).toEqual({ status: "ok", listing: posted.listing });
    expect(book.active()).toEqual([]);
  });

  test("cancel rejects an unknown listing or the wrong owner", () => {
    const book = bookFixture();
    expect(book.cancel("nope", "amy")).toEqual({ status: "rejected", reason: "not-found" });
    const posted = book.post({ sellerId: "amy", itemId: "sword", count: 1, price: 10, currency: "copper", now: 0 });
    if (posted.status !== "ok") throw new Error("expected ok");
    expect(book.cancel(posted.listing.id, "ben")).toEqual({ status: "rejected", reason: "not-owner" });
  });

  test("buy takes the house cut and credits the seller's collection box, not their wallet", () => {
    const book = bookFixture({ cutRate: 0.05 });
    const posted = book.post({ sellerId: "amy", itemId: "sword", count: 1, price: 100, currency: "copper", now: 0 });
    if (posted.status !== "ok") throw new Error("expected ok");
    const bought = book.buy(posted.listing.id, "ben", 10);
    expect(bought).toEqual({
      status: "ok",
      outcome: { listing: posted.listing, houseCut: 5, sellerProceeds: 95 },
    });
    expect(book.get(posted.listing.id)).toBeNull();
    expect(book.collectionOf("amy")).toEqual({ currency: { copper: 95 }, items: [] });
  });

  test("buy rejects a listing that has already expired", () => {
    const book = bookFixture({ expirySeconds: 10 });
    const posted = book.post({ sellerId: "amy", itemId: "sword", count: 1, price: 10, currency: "copper", now: 0 });
    if (posted.status !== "ok") throw new Error("expected ok");
    expect(book.buy(posted.listing.id, "ben", 11)).toEqual({ status: "rejected", reason: "expired" });
  });

  test("buy rejects the seller purchasing their own listing", () => {
    const book = bookFixture();
    const posted = book.post({ sellerId: "amy", itemId: "sword", count: 1, price: 10, currency: "copper", now: 0 });
    if (posted.status !== "ok") throw new Error("expected ok");
    expect(book.buy(posted.listing.id, "amy", 1)).toEqual({ status: "rejected", reason: "own-listing" });
  });

  test("sweepExpired moves unsold listings into the seller's collection box as items, never currency", () => {
    const book = bookFixture({ expirySeconds: 48 });
    const posted = book.post({ sellerId: "amy", itemId: "sword", count: 2, price: 10, currency: "copper", now: 0 });
    if (posted.status !== "ok") throw new Error("expected ok");
    const stillActive = book.post({ sellerId: "amy", itemId: "shield", count: 1, price: 20, currency: "copper", now: 40 });
    expect(stillActive.status).toBe("ok");

    const expired = book.sweepExpired(49);
    expect(expired).toEqual([posted.listing]);
    expect(book.active().map((listing) => listing.itemId)).toEqual(["shield"]);
    expect(book.collectionOf("amy")).toEqual({ currency: {}, items: [{ itemId: "sword", count: 2 }] });

    expect(book.sweepExpired(49)).toEqual([]);
  });

  test("claimCurrency drains the box and a second claim is empty", () => {
    const book = bookFixture();
    const posted = book.post({ sellerId: "amy", itemId: "sword", count: 1, price: 100, currency: "copper", now: 0 });
    if (posted.status !== "ok") throw new Error("expected ok");
    book.buy(posted.listing.id, "ben", 1);
    expect(book.claimCurrency("amy")).toEqual({ copper: 95 });
    expect(book.claimCurrency("amy")).toEqual({});
    expect(book.collectionOf("amy").currency).toEqual({});
  });

  test("claimItem only removes what bag space accepted, leaving the remainder boxed", () => {
    const book = bookFixture({ expirySeconds: 1 });
    const posted = book.post({ sellerId: "amy", itemId: "sword", count: 5, price: 10, currency: "copper", now: 0 });
    if (posted.status !== "ok") throw new Error("expected ok");
    book.sweepExpired(2);
    expect(book.claimItem("amy", "sword", 3)).toBe(true);
    expect(book.collectionOf("amy").items).toEqual([{ itemId: "sword", count: 2 }]);
    expect(book.claimItem("amy", "sword", 10)).toBe(false);
    expect(book.claimItem("amy", "sword", 2)).toBe(true);
    expect(book.collectionOf("amy").items).toEqual([]);
  });
});
