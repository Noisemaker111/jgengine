import { describe, expect, test } from "bun:test";
import {
  CLAIM_BASE_COST,
  canClaimCell,
  claimCost,
  claimedCellsFor,
  createPlacementCellPolicy,
  isCellOwnedBy,
  planFootprintClaims,
  type DatacenterClaim,
} from "@llmville/game/datacenter/claims";

const claim = (cx: number, cz: number, ownerGameId: string): DatacenterClaim => ({
  cx,
  cz,
  ownerGameId,
  ownerName: ownerGameId,
});

describe("datacenter claims", () => {
  test("rejects an already claimed cell", () => {
    expect(
      canClaimCell({ cell: { cx: 2, cz: 2 }, ownerGameId: "me", claims: [claim(2, 2, "me")], money: 1000 }),
    ).toEqual({ ok: false, reason: "already_claimed" });
  });

  test("enforces the 4-cell gap to foreign claims", () => {
    const claims = [claim(0, 0, "them")];
    expect(canClaimCell({ cell: { cx: 4, cz: 0 }, ownerGameId: "me", claims, money: 1000 })).toEqual({
      ok: false,
      reason: "too_close_to_other_claim",
    });
    expect(canClaimCell({ cell: { cx: 4, cz: 4 }, ownerGameId: "me", claims, money: 1000 })).toEqual({
      ok: false,
      reason: "too_close_to_other_claim",
    });
    expect(canClaimCell({ cell: { cx: 5, cz: 0 }, ownerGameId: "me", claims, money: 1000 })).toEqual({
      ok: true,
      cost: claimCost(0),
    });
  });

  test("own claims may be adjacent", () => {
    expect(
      canClaimCell({ cell: { cx: 1, cz: 0 }, ownerGameId: "me", claims: [claim(0, 0, "me")], money: 1000 }),
    ).toEqual({ ok: true, cost: claimCost(1) });
  });

  test("cost ramps gently from the owner's cell count", () => {
    expect(claimCost(0)).toBe(25);
    expect(claimCost(1)).toBe(26);
    expect(claimCost(20)).toBe(55);
    const claims = [claim(0, 0, "me"), claim(1, 0, "me"), claim(20, 20, "them")];
    expect(canClaimCell({ cell: { cx: 0, cz: 1 }, ownerGameId: "me", claims, money: 1000 })).toEqual({
      ok: true,
      cost: claimCost(2),
    });
  });

  test("rejects when money is short", () => {
    expect(canClaimCell({ cell: { cx: 0, cz: 0 }, ownerGameId: "me", claims: [], money: 24 })).toEqual({
      ok: false,
      reason: "insufficient_funds",
    });
  });

  test("isCellOwnedBy and claimedCellsFor filter by owner", () => {
    const claims = [claim(0, 0, "me"), claim(3, -2, "me"), claim(9, 9, "them")];
    expect(isCellOwnedBy(claims, { cx: 0, cz: 0 }, "me")).toBe(true);
    expect(isCellOwnedBy(claims, { cx: 9, cz: 9 }, "me")).toBe(false);
    expect(claimedCellsFor(claims, "me")).toEqual([
      { cx: 0, cz: 0 },
      { cx: 3, cz: -2 },
    ]);
  });
});

describe("planFootprintClaims", () => {
  test("charges only the unowned cells of a mixed footprint", () => {
    const plan = planFootprintClaims({
      cells: [
        { cx: 0, cz: 0 },
        { cx: 1, cz: 0 },
      ],
      ownerGameId: "me",
      claims: [claim(0, 0, "me")],
      money: 10_000,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.newCells).toEqual([{ cx: 1, cz: 0 }]);
    expect(plan.totalCost).toBe(claimCost(1));
  });

  test("costs nothing when the whole footprint is already owned", () => {
    expect(
      planFootprintClaims({
        cells: [{ cx: 3, cz: 4 }],
        ownerGameId: "me",
        claims: [claim(3, 4, "me")],
        money: 0,
      }),
    ).toEqual({ ok: true, newCells: [], totalCost: 0 });
  });

  test("rejects a cell owned by another game", () => {
    expect(
      planFootprintClaims({
        cells: [
          { cx: 40, cz: 0 },
          { cx: 41, cz: 0 },
        ],
        ownerGameId: "me",
        claims: [claim(40, 0, "them")],
        money: 10_000,
      }),
    ).toEqual({ ok: false, reason: "already_claimed" });
  });

  test("rejects a footprint that violates the gap to another game", () => {
    expect(
      planFootprintClaims({
        cells: [{ cx: 10, cz: 10 }],
        ownerGameId: "me",
        claims: [claim(12, 10, "them")],
        money: 10_000,
      }),
    ).toEqual({ ok: false, reason: "too_close_to_other_claim" });
  });

  test("checks cumulative cost against the balance", () => {
    const cells = [
      { cx: 0, cz: 0 },
      { cx: 1, cz: 0 },
      { cx: 2, cz: 0 },
    ];
    const affordable = planFootprintClaims({ cells, ownerGameId: "me", claims: [], money: 10_000 });
    expect(affordable.ok).toBe(true);
    if (!affordable.ok) return;
    expect(affordable.totalCost).toBe(claimCost(0) + claimCost(1) + claimCost(2));

    expect(
      planFootprintClaims({ cells, ownerGameId: "me", claims: [], money: CLAIM_BASE_COST }),
    ).toEqual({ ok: false, reason: "insufficient_funds" });
  });
});

describe("createPlacementCellPolicy", () => {
  test("accepts owned and claimable cells and refuses another game's land", () => {
    const policy = createPlacementCellPolicy([claim(0, 0, "me"), claim(50, 50, "them")], "me");
    expect(policy.canUse({ cx: 0, cz: 0 })).toBe(true);
    expect(policy.canUse({ cx: 1, cz: 0 })).toBe(true);
    expect(policy.canUse({ cx: 50, cz: 50 })).toBe(false);
    expect(policy.canUse({ cx: 52, cz: 50 })).toBe(false);
  });

  test("quotes the unowned cells ignoring money", () => {
    const quote = createPlacementCellPolicy([claim(0, 0, "me")], "me").quote([
      { cx: 0, cz: 0 },
      { cx: 0, cz: 1 },
    ]);
    expect(quote.newCells).toEqual([{ cx: 0, cz: 1 }]);
    expect(quote.totalCost).toBe(claimCost(1));
  });
});
