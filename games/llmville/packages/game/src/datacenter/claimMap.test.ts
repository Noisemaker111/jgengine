import { describe, expect, test } from "bun:test";
import { canClaimCell, type DatacenterClaim } from "@llmville/game/datacenter/claims";
import { cellKey } from "@llmville/game/datacenter/grid";
import {
  buildClaimMapIndex,
  cellBlockEdges,
  cellMapStatus,
  cellsInRect,
  contiguousCellBlocks,
  planClaimRun,
} from "@llmville/game/datacenter/claimMap";

const claim = (cx: number, cz: number, ownerGameId: string): DatacenterClaim => ({
  cx,
  cz,
  ownerGameId,
  ownerName: ownerGameId,
});

describe("claim map index", () => {
  test("blocked ring agrees with canClaimCell over a wide window", () => {
    const claims = [claim(0, 0, "them"), claim(9, 3, "me")];
    const index = buildClaimMapIndex(claims, "me");
    for (let cx = -10; cx <= 20; cx++) {
      for (let cz = -10; cz <= 20; cz++) {
        const cell = { cx, cz };
        const status = cellMapStatus(index, cell, "me");
        const decision = canClaimCell({ cell, ownerGameId: "me", claims, money: 1_000_000 });
        if (status.kind === "open") {
          expect(decision.ok).toBe(true);
        } else if (status.kind === "blocked") {
          expect(decision).toEqual({ ok: false, reason: "too_close_to_other_claim" });
        } else {
          expect(decision).toEqual({ ok: false, reason: "already_claimed" });
        }
      }
    }
  });

  test("own claims never block", () => {
    const index = buildClaimMapIndex([claim(0, 0, "me")], "me");
    expect(index.ownedCellCount).toBe(1);
    expect(index.blockedCellKeys.has(cellKey({ cx: 1, cz: 0 }))).toBe(false);
    expect(cellMapStatus(index, { cx: 1, cz: 0 }, "me")).toEqual({ kind: "open" });
  });
});

describe("claim run planning", () => {
  test("prices each cell against the growing owned count", () => {
    const plan = planClaimRun({
      cells: cellsInRect({ cx: 0, cz: 0 }, { cx: 1, cz: 0 }),
      ownerGameId: "me",
      claims: [],
      money: 1000,
    });
    expect(plan.claimable).toHaveLength(2);
    expect(plan.steps[0]?.cost).toBe(25);
    expect(plan.steps[1]?.cost).toBe(26);
    expect(plan.totalCost).toBe(51);
  });

  test("stops paying once money runs out and reports the reason", () => {
    const plan = planClaimRun({
      cells: cellsInRect({ cx: 0, cz: 0 }, { cx: 2, cz: 0 }),
      ownerGameId: "me",
      claims: [],
      money: 30,
    });
    expect(plan.claimable).toHaveLength(1);
    expect(plan.blockingReason).toBe("insufficient_funds");
  });

  test("skips cells inside a foreign walkway buffer", () => {
    const plan = planClaimRun({
      cells: cellsInRect({ cx: 3, cz: 0 }, { cx: 6, cz: 0 }),
      ownerGameId: "me",
      claims: [claim(0, 0, "them")],
      money: 1000,
    });
    expect(plan.steps.filter((step) => step.ok).map((step) => step.cell.cx)).toEqual([5, 6]);
    expect(plan.blockingReason).toBe("too_close_to_other_claim");
  });
});

describe("claim block geometry", () => {
  test("splits disconnected cells into blocks", () => {
    const blocks = contiguousCellBlocks([
      { cx: 0, cz: 0 },
      { cx: 1, cz: 0 },
      { cx: 8, cz: 8 },
    ]);
    expect(blocks).toHaveLength(2);
    expect(blocks.map((block) => block.length).sort()).toEqual([1, 2]);
  });

  test("emits only perimeter edges", () => {
    const edges = cellBlockEdges(cellsInRect({ cx: 0, cz: 0 }, { cx: 1, cz: 1 }));
    expect(edges).toHaveLength(8);
    expect(edges.some((edge) => edge.cx === 0 && edge.cz === 0 && edge.side === "east")).toBe(false);
  });
});
