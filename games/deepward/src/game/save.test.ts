import { describe, expect, test } from "bun:test";
import { migrateHome, openRecord, recordEntry, validHome, RECORD_SLOT, type RunSnapshot, type StoragePort } from "./save";
import { depart, newHome, newRun, settle } from "./state";
import { rollItem } from "./loot";

function memory(): StoragePort & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: k => { data.delete(k); } };
}
const noRun = { snapshot: (): RunSnapshot => ({ mode: "home", run: null, hint: "", pending: null, player: null, facing: 0 }), restore: () => {} };

describe("the burrow record", () => {
  test("a departure and its return round-trip through one save document", async () => {
    const storage = memory();
    const record = openRecord(storage, noRun);
    await record.load();
    const home = depart(newHome());
    const run = newRun(home.activeRun!, home);
    await record.commit(home, { mode: "run", run, hint: "out", pending: null, player: [1, 0, 2], facing: 0 });
    const reread = openRecord(storage, { snapshot: noRun.snapshot, restore: () => {} });
    await reread.load();
    expect(reread.home.activeRun).toBe(1);
    expect(reread.restoredRun?.run?.seed).toBe(run.seed);
    const coin = rollItem("coin", 2, "c", "1:coin~c");
    const back = settle(home, { ...run, pack: [{ ...coin, x: 0, y: 0, rotated: false }] }, "extracted", "home");
    await reread.commit(back, null);
    const third = openRecord(storage, noRun);
    await third.load();
    expect(third.home.stash.map(i => i.id)).toEqual(["1:coin~c"]);
  });
  test("a damaged record blocks play instead of starting over, and keeps its bytes", async () => {
    const storage = memory();
    storage.setItem(recordEntry(RECORD_SLOT), "{not json");
    await expect(openRecord(storage, noRun).load()).rejects.toThrow("unreadable");
    expect(storage.getItem(recordEntry(RECORD_SLOT))).toBe("{not json");
  });
  test("an invented item or an impossible tally is rejected", async () => {
    const home = settle(depart(newHome()), { id: 1, pack: [], kidTook: [], deepest: 0 }, "extracted", "ok");
    expect(validHome(home)).toBe(true);
    // A burrow saved before the slippers, clock, herbs and the cellar milestone still loads, with none built.
    const { slippers: _s, clock: _c, herbs: _h, ...oldUpgrades } = home.upgrades;
    const { cellarBanked: _m, ...oldMilestones } = home.milestones;
    const old = { ...home, upgrades: oldUpgrades, milestones: oldMilestones };
    expect(validHome(old)).toBe(false);
    expect(validHome(migrateHome(old))).toBe(true);
    expect((migrateHome(old) as typeof home).upgrades.clock).toBe(0);
    expect(validHome({ ...home, stash: [rollItem("coin", 1, "x", "9:coin~x")] })).toBe(false);
    expect(validHome({ ...home, stash: [rollItem("coin", 1, "x", "1:crumb~x")] })).toBe(false);
    expect(validHome({ ...home, extractions: 5 })).toBe(false);
    const record = openRecord(memory(), noRun);
    await record.load();
    await expect(record.commit({ ...home, caps: -1 })).rejects.toThrow("Invalid");
  });
  test("three burrows live side by side; switching opens a fresh one", async () => {
    const storage = memory();
    const record = openRecord(storage, noRun);
    await record.load();
    await record.commit(settle(depart(newHome()), { id: 1, pack: [], kidTook: [], deepest: 0 }, "extracted", "ok"));
    await record.switchSlot("burrow-2");
    expect(record.home.extractions).toBe(0);
    await record.switchSlot(RECORD_SLOT);
    expect(record.home.extractions).toBe(1);
  });
});
