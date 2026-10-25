import { describe, expect, test } from "bun:test";
import { installRefit, refitMissing } from "./progression";
import { acknowledgeReprint, depart, newDive, newHome, settle, takeLoot, type Dive, type ItemKind } from "./state";
import { openRecord, SAVE_KEY, validHome, type RunHooks, type StoragePort } from "./save";
import { kindOf } from "./items";

function loot(dive: Dive, source: string, kind: ItemKind): Dive {
  const result = takeLoot(dive, source, kind);
  if (!result.ok) throw new Error(result.message);
  return result.dive;
}
function banked() {
  const home = depart(newHome());
  const dive = loot(loot(loot(newDive(1), "wire", "wire"), "polymer", "polymer"), "cells", "cells");
  return settle(home, dive, "extracted", "Rail");
}
function memory(home = banked()): StoragePort {
  const data = new Map<string, string>([[SAVE_KEY, JSON.stringify(home)]]);
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
}
/** The record's run section is not part of these refit rules; a stub stands in for the live view. */
const stub: RunHooks = { snapshot: () => null as never, restore: () => {} };
async function open(storage: StoragePort) {
  const record = openRecord(storage, stub);
  await record.load();
  return record;
}
describe("Marrow refits and reprint ownership", () => {
  test("competing recipes spend exact instances once without changing the input", () => {
    const original = banked(), tank = installRefit(original, "tank");
    expect(original.stash.length).toBe(3);
    expect(tank.stash.map(kindOf)).toEqual(["cells"]);
    expect(tank.refits).toEqual(["tank"]);
    expect(refitMissing(tank, "reserve")).toEqual([{ itemId: "wire", count: 1 }]);
    expect(() => installRefit(tank, "reserve")).toThrow("Not enough");
    expect(() => installRefit(tank, "tank")).toThrow("already installed");
    const reserve = installRefit(original, "reserve");
    expect(reserve.stash.map(kindOf)).toEqual(["polymer"]);
    expect(newDive(2, reserve).reservePool).toBe(30);
    expect(newDive(2, reserve).oxygen).toBe(110);
    expect(newDive(2, tank).oxygen).toBe(145);
    expect(newDive(2, tank).tankSeconds).toBe(145);
    expect(newDive(2, tank).reservePool).toBe(18);
  });
  test("empty shelves, unknown recipes and active expeditions cannot spend", () => {
    expect(() => installRefit(newHome(), "tank")).toThrow("Not enough");
    expect(() => installRefit(banked(), "bogus" as "tank")).toThrow("Unknown");
    expect(() => installRefit(depart(banked()), "tank")).toThrow("Return");
  });
  test("purchase acknowledgement follows atomic verified persistence; failed and stale writers retain their view", async () => {
    const storage = memory(), session = await open(storage), stale = await open(storage);
    await session.commit(installRefit(session.home, "tank"));
    expect((await open(storage)).home.refits).toEqual(["tank"]);
    await expect(stale.commit(installRefit(stale.home, "reserve"))).rejects.toThrow("another window");
    const blockedStorage = memory(), blocked = await open(blockedStorage);
    blockedStorage.setItem = () => { throw new Error("quota"); };
    await expect(blocked.commit(installRefit(blocked.home, "tank"))).rejects.toThrow("quota");
    expect(blocked.home.refits).toEqual([]);
    expect(blocked.home.stash.length).toBe(3);
  });
  test("upgrades and old stash survive loss; reprint blocks departure and persists exactly once", async () => {
    const storage = memory(installRefit(banked(), "tank")), session = await open(storage);
    await session.commit(depart(session.home));
    await session.commit(settle(session.home, loot(newDive(2, session.home), "ink", "ink"), "lost", "No air"));
    const reloaded = await open(storage);
    expect(reloaded.home.deaths).toBe(1);
    expect(reloaded.home.refits).toEqual(["tank"]);
    expect(reloaded.home.stash.map(kindOf)).toEqual(["cells"]);
    expect(() => depart(reloaded.home)).toThrow("Acknowledge");
    await reloaded.commit(acknowledgeReprint(reloaded.home));
    expect((await open(storage)).home.reprintPending).toBe(false);
    expect(() => acknowledgeReprint(reloaded.home)).toThrow();
    expect(newDive(depart(reloaded.home).activeDive!, reloaded.home).oxygen).toBe(145);
  });
  test("durable flags reject duplicate or unknown upgrades and impossible pending reprints", () => {
    expect(validHome({ ...banked(), refits: ["tank", "tank"] })).toBe(false);
    expect(validHome({ ...banked(), refits: ["cheat"] })).toBe(false);
    expect(validHome({ ...banked(), reprintPending: true })).toBe(false);
    expect(validHome({ ...depart(banked()), reprintPending: true })).toBe(false);
  });
  test("v1 migration preserves loaded bytes until the next durable transition", async () => {
    const { refits, reprintPending, ledger, ...current } = banked();
    const legacy = JSON.stringify({ ...current, version: 1, stash: current.stash.map(item => ({ uid: item.id, kind: kindOf(item), level: 1 })) });
    const data = new Map<string, string>([[SAVE_KEY, legacy]]);
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
    const session = await open(storage);
    expect(session.home.version).toBe(5);
    expect(session.home.refits).toEqual([]);
    expect(session.home.stash).toHaveLength(3);
    expect(data.get(SAVE_KEY)).toBe(legacy);
    await session.commit(installRefit(session.home, "tank"));
    expect((await open(storage)).home.stash.length).toBe(1);
    expect(data.get(SAVE_KEY)).toBe(legacy);
  });
});
