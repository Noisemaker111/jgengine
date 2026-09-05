import { expect, test } from "bun:test";
import { createEmptyPlayerRow, createRuntimeSnapshot } from "../runtime/snapshot";
import { claimTerritory, createTerritory, placeWithTerritory, planFootprintClaims, territoryFootprintCells, territoryOwnerOf, territoryChunkKeys } from "./territory";
import { validatePlacement } from "./placement";
function initial() { return createRuntimeSnapshot({ gameId: "test", serverId: "world", players: { a: { ...createEmptyPlayerRow("a"), economy: { cash: 100 } }, b: createEmptyPlayerRow("b") } }); }
test("claim costs grow once per unique cell and persist across chunks", () => {
  const before = initial();
  const claimed = claimTerritory(before, "a", [{ x: -1, z: 0 }, { x: 64, z: 0 }, { x: -1, z: 0 }], { currency: "cash", price: n => (n + 1) * 5 });
  expect(claimed.ok).toBe(true); if (!claimed.ok) return;
  expect(claimed.cost).toBe(15); expect(claimed.snapshot.players.a!.economy.cash).toBe(85);
  expect(claimed.snapshot.dirty.chunks).toEqual(["-1,0", "1,0"]);
  expect(before.chunks).toEqual({});
  expect(territoryOwnerOf(claimed.snapshot, { x: 64, z: 0 })).toBe("a");
  expect(planFootprintClaims(claimed.snapshot, "a", [{ x: 64, z: 0 }]).ok).toBe(true);
});
test("gaps reject foreign neighbors across chunk boundaries", () => {
  const result = claimTerritory(initial(), "b", [{ x: 63, z: 0 }]); if (!result.ok) throw new Error();
  expect(planFootprintClaims(result.snapshot, "a", [{ x: 64, z: 0 }], { gapCells: 1 })).toEqual({ ok: false, reason: "territory.blocked" });
  expect(planFootprintClaims(result.snapshot, "a", [{ x: 65, z: 0 }], { gapCells: 1 }).ok).toBe(true);
});
test("affordability and placement failure do not mutate balances or claims", () => {
  const snapshot = initial();
  expect(claimTerritory(snapshot, "a", [{ x: 0, z: 0 }], { currency: "cash", price: () => 101 })).toEqual({ ok: false, reason: "territory.unaffordable" });
  expect(placeWithTerritory(snapshot, "a", { minX: 0, minZ: 0, maxX: 1, maxZ: 1 }, { currency: "cash", price: () => 50 }, () => ({ ok: false, reason: "occupied" }))).toEqual({ ok: false, reason: "occupied" });
  expect(snapshot.players.a!.economy.cash).toBe(100); expect(snapshot.chunks).toEqual({});
});
test("starter is idempotent and release decrements persistent owned count", () => {
  let snapshot = initial(); const territory = createTerritory({ get: () => snapshot, set: next => { snapshot = next; } }, () => ({ starterBlock: 3 }));
  expect(territory.grantStarter("a", { x: 0, z: 0 }).ok).toBe(true);
  expect(snapshot.players.a!.territoryOwnedCount).toBe(9);
  territory.grantStarter("a", { x: 100, z: 100 });
  expect(snapshot.players.a!.territoryOwnedCount).toBe(9);
  expect(territory.release("b", { x: 0, z: 0 })).toBe(false);
  expect(territory.release("a", { x: 0, z: 0 })).toBe(true);
  expect(snapshot.players.a!.territoryOwnedCount).toBe(8);
});
test("footprints exclude touching edges and placement reports blocked territory", () => {
  expect(territoryFootprintCells({ minX: -1, minZ: 0, maxX: 1, maxZ: 1 })).toEqual([{ x: -1, z: 0 }, { x: 0, z: 0 }]);
  expect(validatePlacement({ center: [0, 0], footprint: { w: 1, d: 1 } }, { territory: () => ({ ok: false }) })).toEqual({ status: "rejected", reason: "territory.blocked" });
  expect(() => planFootprintClaims(initial(), "a", [{ x: 0, z: 0 }], { price: () => NaN })).toThrow();
});

test("claim read scope includes cross-boundary gap chunks", () => {
  expect(new Set(territoryChunkKeys([{ x: 63, z: 0 }], { gapCells: 1 }))).toEqual(new Set(["0,-1", "0,0", "1,-1", "1,0"]));
});
