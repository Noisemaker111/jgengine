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

  test("generated IDs preserve supplied listings through purchase, cancellation and expiry", () => {
    const book = bookFixture({ expirySeconds: 10 });
    const first = book.post({ id: "listing_1", sellerId: "amy", itemId: "sword", count: 2, price: 100, currency: "copper", now: 0 });
    const second = book.post({ id: "listing_2", sellerId: "ben", itemId: "shield", count: 3, price: 100, currency: "copper", now: 0 });
    const generated = book.post({ sellerId: "cara", itemId: "axe", count: 4, price: 100, currency: "copper", now: 0 });
    if (first.status !== "ok" || second.status !== "ok" || generated.status !== "ok") throw new Error("expected ok");

    expect(book.get("listing_1")).toEqual(first.listing);
    expect(book.get("listing_2")).toEqual(second.listing);
    expect(generated.listing.id).not.toBe("listing_1");
    expect(generated.listing.id).not.toBe("listing_2");
    expect(book.active()).toHaveLength(3);
    expect(book.countOf("amy")).toBe(1);
    expect(book.countOf("ben")).toBe(1);
    expect(book.countOf("cara")).toBe(1);

    expect(book.buy(generated.listing.id, "dean", 1)).toEqual({
      status: "ok",
      outcome: { listing: generated.listing, houseCut: 5, sellerProceeds: 95 },
    });
    expect(book.cancel("listing_1", "amy")).toEqual({ status: "ok", listing: first.listing });
    expect(book.sweepExpired(10)).toEqual([second.listing]);
    expect(book.sweepExpired(10)).toEqual([]);
    expect(book.active()).toEqual([]);
    expect(book.collectionOf("amy")).toEqual({ currency: {}, items: [] });
    expect(book.collectionOf("ben")).toEqual({ currency: {}, items: [{ itemId: "shield", count: 3 }] });
    expect(book.collectionOf("cara")).toEqual({ currency: { copper: 95 }, items: [] });
    expect(book.claimItem("ben", "shield", 1)).toBe(true);
    expect(book.collectionOf("ben").items).toEqual([{ itemId: "shield", count: 2 }]);
    expect(book.claimItem("ben", "shield", 2)).toBe(true);
    expect(book.claimItem("ben", "shield", 1)).toBe(false);
    expect(book.claimCurrency("cara")).toEqual({ copper: 95 });
    expect(book.claimCurrency("cara")).toEqual({});
  });

  for (const suppliedId of [false, true]) {
    for (const sellerId of ["amy", "ben"]) {
      test(`duplicate explicit ID preserves the ${suppliedId ? "supplied" : "generated"} listing when posted by ${sellerId}`, () => {
        const book = bookFixture();
        const input = { sellerId: "amy", itemId: "sword", count: 2, price: 100, currency: "copper", now: 0 };
        const posted = book.post(suppliedId ? { ...input, id: "saved-order-42" } : input);
        if (posted.status !== "ok") throw new Error("expected ok");

        const duplicate = book.post({ id: posted.listing.id, sellerId, itemId: "shield", count: 3, price: 200, currency: "silver", now: 1 });
        expect(book.get(posted.listing.id)).toEqual(posted.listing);
        expect(duplicate).toEqual({ status: "rejected", reason: "duplicate-id" });
        expect(book.active()).toEqual([posted.listing]);
        expect(book.countOf("amy")).toBe(1);
        expect(book.countOf("ben")).toBe(0);
        expect(book.collectionOf("amy")).toEqual({ currency: {}, items: [] });
        expect(book.collectionOf("ben")).toEqual({ currency: {}, items: [] });
        expect(book.buy(posted.listing.id, "cara", 2)).toEqual({
          status: "ok",
          outcome: { listing: posted.listing, houseCut: 5, sellerProceeds: 95 },
        });
        expect(book.claimCurrency("amy")).toEqual({ copper: 95 });
        expect(book.claimCurrency("ben")).toEqual({});

        const reused = book.post({ id: posted.listing.id, sellerId, itemId: "shield", count: 3, price: 200, currency: "silver", now: 3 });
        if (reused.status !== "ok") throw new Error("expected reusable ID after removal");
        expect(reused.listing.id).toBe(posted.listing.id);
        expect(book.cancel(reused.listing.id, sellerId)).toEqual({ status: "ok", listing: reused.listing });
        expect(book.sweepExpired(200)).toEqual([]);
        expect(book.collectionOf(sellerId)).toEqual({ currency: {}, items: [] });
      });
    }
  }

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

  for (const count of [-3, -0.5, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    test(`claimItem retains both owners' collections for invalid count ${count}`, () => {
      const book = bookFixture({ expirySeconds: 1 });
      expect(book.post({ sellerId: "amy", itemId: "sword", count: 5, price: 10, currency: "copper", now: 0 }).status).toBe("ok");
      expect(book.post({ sellerId: "ben", itemId: "sword", count: 7, price: 10, currency: "copper", now: 0 }).status).toBe("ok");
      const sale = book.post({ sellerId: "amy", itemId: "shield", count: 1, price: 100, currency: "copper", now: 0 });
      if (sale.status !== "ok") throw new Error("expected ok");
      expect(book.buy(sale.listing.id, "cara", 0).status).toBe("ok");
      expect(book.sweepExpired(1)).toHaveLength(2);
      const amyBox = { currency: { copper: 95 }, items: [{ itemId: "sword", count: 5 }] };
      const benBox = { currency: {}, items: [{ itemId: "sword", count: 7 }] };
      expect(book.collectionOf("amy")).toEqual(amyBox);
      expect(book.collectionOf("ben")).toEqual(benBox);

      const claimed = book.claimItem("amy", "sword", count);
      expect(book.collectionOf("amy")).toEqual(amyBox);
      expect(book.collectionOf("ben")).toEqual(benBox);
      expect(claimed).toBe(false);
      expect(book.claimItem("amy", "sword", 5)).toBe(true);
      expect(book.claimItem("amy", "sword", 1)).toBe(false);
      expect(book.collectionOf("amy")).toEqual({ currency: { copper: 95 }, items: [] });
      expect(book.collectionOf("ben")).toEqual(benBox);
    });
  }

  test("zero and over-quantity claims retain goods for later valid partial claims", () => {
    const book = bookFixture({ expirySeconds: 1 });
    expect(book.post({ sellerId: "amy", itemId: "sword", count: 5, price: 10, currency: "copper", now: 0 }).status).toBe("ok");
    book.sweepExpired(1);
    const retained = { currency: {}, items: [{ itemId: "sword", count: 5 }] };
    expect(book.claimItem("amy", "sword", 0)).toBe(true);
    expect(book.collectionOf("amy")).toEqual(retained);
    expect(book.claimItem("amy", "sword", 6)).toBe(false);
    expect(book.collectionOf("amy")).toEqual(retained);
    expect(book.claimItem("ben", "sword", 1)).toBe(false);
    expect(book.collectionOf("amy")).toEqual(retained);
    expect(book.claimItem("amy", "sword", 2)).toBe(true);
    expect(book.collectionOf("amy").items).toEqual([{ itemId: "sword", count: 3 }]);
    expect(book.claimItem("amy", "sword", 3)).toBe(true);
    expect(book.collectionOf("amy")).toEqual({ currency: {}, items: [] });
  });
});
