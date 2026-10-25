import { describe, expect, it } from "bun:test";
import { CLAIM_GAP_CELLS, chebyshevCellDistance, worldToCell } from "./grid";
import { isStructuralColumnCell } from "./layout";
import {
  pickStarterClaimBlock,
  starterClaimCellsAround,
  STARTER_CLAIM_RADIUS_CELLS,
} from "./starterClaim";

const SIDE = STARTER_CLAIM_RADIUS_CELLS * 2 + 1;

describe("pickStarterClaimBlock", () => {
  it("returns a full square block centred on the spawn point", () => {
    const block = pickStarterClaimBlock(1234, []);
    expect(block.cells).toHaveLength(SIDE * SIDE);
    expect(worldToCell(block.spawn.x, block.spawn.z)).toEqual(block.center);
    expect(block.cells).toContainEqual(block.center);
  });

  it("is deterministic for a seed", () => {
    expect(pickStarterClaimBlock(99, []).center).toEqual(pickStarterClaimBlock(99, []).center);
  });

  it("keeps the claim gap from existing claims", () => {
    const first = pickStarterClaimBlock(7, []);
    const claims = first.cells.map((cell) => ({ ...cell, ownerGameId: "other", ownerName: "" }));
    const second = pickStarterClaimBlock(7, claims);
    for (const cell of second.cells) {
      for (const claim of claims) {
        expect(chebyshevCellDistance(cell, claim)).toBeGreaterThan(CLAIM_GAP_CELLS);
      }
    }
  });

  it("never overlaps a structural column", () => {
    for (const cell of pickStarterClaimBlock(42, []).cells) {
      expect(isStructuralColumnCell(cell)).toBe(false);
    }
  });

  it("builds the block around an arbitrary centre", () => {
    expect(starterClaimCellsAround({ cx: 0, cz: 0 })).toHaveLength(SIDE * SIDE);
  });
});
