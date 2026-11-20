import { expect, test } from "bun:test";

import { planDatacenterClaims } from "@llmville/game/datacenter/claims";
import { worldToCell } from "@llmville/game/datacenter/grid";
import { COMMONS_CELLS, isCommonsCell } from "@llmville/game/datacenter/layout";
import { pickDatacenterSpawn } from "@llmville/game/datacenter/spawn";
import { pickStarterClaimBlock } from "@llmville/game/datacenter/starterClaim";

test("no lab claims a Commons cell, however rich, and a cell just outside it is claimable", () => {
  const inside = planDatacenterClaims({ cells: [{ cx: 33, cz: 30 }], ownerGameId: "lab", claims: [], money: 1e9 });
  expect(inside).toEqual({ ok: false, reason: "commons" });
  const outside = planDatacenterClaims({ cells: [{ cx: COMMONS_CELLS.maxCx + 1, cz: 30 }], ownerGameId: "lab", claims: [], money: 1e9 });
  expect(outside.ok).toBe(true);
});

test("no spawn and no starter claim lands in the Commons, over many worlds", () => {
  for (let seed = 1; seed <= 400; seed += 1) {
    const spawn = pickDatacenterSpawn(seed, []);
    expect(isCommonsCell(worldToCell(spawn.x, spawn.z))).toBe(false);
    for (const cell of pickStarterClaimBlock(seed, []).cells) expect(isCommonsCell(cell)).toBe(false);
  }
});
