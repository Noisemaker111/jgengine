import { describe, expect, test } from "bun:test";
import { openRecord, RECORD_ENTRY, SAVE_KEY, validHome, type RunHooks, type RunSnapshot, type StoragePort } from "./save";
import { depart, newDive, newHome, recoverInterrupted, settle, takeLoot, type ItemKind } from "./state";
import { kindOf, rollItem } from "./items";

function memory(): StoragePort {
  const data = new Map<string, string>();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: key => { data.delete(key); } };
}
function loot(source: string, kind: ItemKind, depth = 1) {
  const result = takeLoot(newDive(1), source, kind, depth);
  if (!result.ok) throw new Error(result.message);
  return result.dive;
}
/** A stand-in run section: a dive, its HUD hint and where the diver stood. */
function hooks(snapshot: RunSnapshot | null = null): RunHooks & { restored: RunSnapshot | null } {
  const state = { restored: null as RunSnapshot | null, snapshot: () => snapshot ?? { mode: "home", dive: null, rifleUid: null, hint: "", pending: null, player: null, weapon: null, hand: null }, restore: (next: RunSnapshot | null) => { state.restored = next; } };
  return state;
}
const run: RunSnapshot = { mode: "dive", dive: newDive(1), rifleUid: null, hint: "Bellwether / salvage shift.", pending: null, player: [0, 0, 4], weapon: null, hand: "kessler-sidearm" };

describe("the one Marrow record", () => {
  test("a fresh record writes nothing until a transition, then a reload restores the home record and its dive", async () => {
    const storage = memory();
    const first = openRecord(storage, hooks());
    await first.load();
    expect(storage.getItem(RECORD_ENTRY)).toBeNull();
    expect(first.home.version).toBe(5);

    const departure = depart(first.home);
    await first.commit(departure, run);
    const written = storage.getItem(RECORD_ENTRY)!;
    expect(written).toContain('"marrow"');
    expect(written).toContain('"run"');

    const second = openRecord(storage, hooks());
    await second.load();
    expect(second.home.activeDive).toBe(1);
    expect(second.home.revision).toBe(departure.revision);
    expect(second.restoredRun).not.toBeNull();
    expect(second.restoredRun!.dive!.id).toBe(1);
    expect(second.restoredRun!.player).toEqual([0, 0, 4]);
    // The document's digest is state, so the same record reads the same hash in a second world.
    expect(second.digest()).toBe(first.digest());
  });

  test("a settled haul survives a reload with the same items, scrip and standing", async () => {
    const storage = memory();
    const first = openRecord(storage, hooks());
    await first.load();
    await first.commit(depart(first.home), run);
    const settled = settle(first.home, loot("ink", "ink", 4), "extracted", "Returned by rail");
    await first.commit(settled, { ...run, mode: "home", dive: null });

    const second = openRecord(storage, hooks());
    await second.load();
    expect(second.home.stash.map(i => i.id)).toEqual(["1:ink"]);
    expect(kindOf(second.home.stash[0]!)).toBe("ink");
    expect(second.home.stash[0]!.level).toBe(4);
    expect(second.home.bank.banked).toBe(settled.bank.banked);
    expect(second.home.extractions).toBe(1);
    expect(recoverInterrupted(second.home)).toBe(second.home);
  });

  test("v1-v3 bytes still load, roll their stash and are rewritten as a record without touching the old bytes", async () => {
    const legacy = JSON.stringify({
      version: 3, refits: ["tank"], reprintPending: false, revision: 2, nextDive: 2, life: 1, activeDive: null,
      stash: [{ uid: "1:ink", kind: "ink", level: 1 }], extractions: 1, deaths: 0,
      last: { kind: "extracted", dive: 1, count: 1, reason: "Returned by rail", scrip: 45 },
      bank: { banked: 45, haul: 0, deposited: 45, lost: 0, bestHaul: 45, runs: 1 },
      standing: { records: { operator: { marrow: 14 } } },
    });
    for (const version of [1, 2, 3]) {
      const storage = memory();
      const raw = JSON.stringify({ ...JSON.parse(legacy), version });
      storage.setItem(SAVE_KEY, raw);
      const record = openRecord(storage, hooks());
      await record.load();
      expect(record.home.version).toBe(5);
      expect(record.home.stash).toHaveLength(1);
      expect(kindOf(record.home.stash[0]!)).toBe("ink");
      expect(record.home.stash[0]!.id).toBe("1:ink");
      expect(record.home.ledger).toEqual({});
      expect(storage.getItem(SAVE_KEY)).toBe(raw);
      expect(storage.getItem(RECORD_ENTRY)).not.toBeNull();
      const reloaded = openRecord(storage, hooks());
      await reloaded.load();
      expect(reloaded.home.stash[0]!.baseId).toBe("ink");
    }
  });

  test("a v4 record loads, opens the counter's books at its banked scrip and keeps its standing", async () => {
    const storage = memory();
    storage.setItem(SAVE_KEY, JSON.stringify({ ...newHome(), version: 4, books: undefined, revision: 3, nextDive: 2, extractions: 1, life: 1, bank: { banked: 90, haul: 0, deposited: 90, lost: 0, bestHaul: 90, runs: 1 }, last: { kind: "extracted", dive: 1, count: 0, reason: "Rail", scrip: 90 }, standing: { records: { operator: { marrow: 14 } } } }));
    const record = openRecord(storage, hooks());
    await record.load();
    expect(record.home.version).toBe(5);
    expect(record.home.bank.banked).toBe(90);
    expect(record.home.books.accounts.operator!.scrip).toBe(90);
    expect(record.home.extractions).toBe(1);
  });

  test("damaged, unreadable and future records block play and keep their bytes", async () => {
    for (const raw of ["{", JSON.stringify({ ...newHome(), version: 9 }), JSON.stringify({ version: 1, savedAt: 0, value: { systems: { marrow: { ...newHome(), revision: "x" } } } }), JSON.stringify({ version: 99, savedAt: 0, value: { systems: {} } })]) {
      const storage = memory();
      const legacy = raw.startsWith('{"version":') && !raw.includes("savedAt") ? raw : null;
      if (legacy === null) storage.setItem(RECORD_ENTRY, raw); else storage.setItem(SAVE_KEY, raw);
      const record = openRecord(storage, hooks());
      await expect(record.load()).rejects.toThrow();
      expect(legacy === null ? storage.getItem(RECORD_ENTRY) : storage.getItem(SAVE_KEY)).toBe(raw);
    }
  });

  test("a second live session cannot overwrite bytes another window wrote", async () => {
    const storage = memory();
    const first = openRecord(storage, hooks()), stale = openRecord(storage, hooks());
    await first.load();
    await stale.load();
    await first.commit(depart(first.home), run);
    await expect(stale.commit(depart(stale.home), run)).rejects.toThrow("another window");
  });

  test("a write the store cannot complete rejects the transition instead of acknowledging it", async () => {
    const storage = memory();
    const record = openRecord(storage, hooks());
    await record.load();
    const departure = depart(record.home);
    storage.setItem = () => { throw new Error("quota"); };
    await expect(record.commit(departure, run)).rejects.toThrow("quota");
    expect(record.home.activeDive).toBeNull();
  });

  test("a second record is its own document, and switching back restores the first Life", async () => {
    const storage = memory();
    const record = openRecord(storage, hooks());
    await record.load();
    expect(record.slot()).toBe("marrow");
    await record.commit(depart(record.home), run);

    await record.switchSlot("marrow-2");
    expect(record.slot()).toBe("marrow-2");
    expect(record.home.activeDive).toBeNull();
    await record.commit(depart(record.home, null), { ...run, dive: newDive(1), player: [0, 0, 9] });
    expect(storage.getItem("deepward.marrow.record:marrow-2")).not.toBeNull();

    await record.switchSlot("marrow");
    expect(record.restoredRun?.player).toEqual([0, 0, 4]);
    expect((await record.slots()).sort()).toEqual(["marrow", "marrow-2"]);
    expect((await record.peek("marrow-2"))?.systems).toHaveProperty("marrow");
  });

  test("a damaged record in another slot blocks opening it instead of starting a new Life", async () => {
    const storage = memory();
    const record = openRecord(storage, hooks());
    await record.load();
    storage.setItem("deepward.marrow.record:marrow-3", "{}");
    await expect(record.switchSlot("marrow-3")).rejects.toThrow();
    expect(record.slot()).toBe("marrow");
  });

  test("a saved instance is checked against the catalog, not a copied shape", () => {
    const item = rollItem("ink", 4, "save:catalog", "purchase-1:ink");
    const home = { ...newHome(), stash: [item], extractions: 0, last: null };
    expect(validHome(home)).toBe(true);
    expect(validHome({ ...home, stash: [{ ...item, level: 99 }] })).toBe(false);
    expect(validHome({ ...home, stash: [{ ...item, baseId: "service-rifle" }] })).toBe(false);
    expect(validHome({ ...home, stash: [{ ...item, rarity: "mythic" }] })).toBe(false);
    expect(validHome({ ...home, ledger: { [item.id]: "salvaged" } })).toBe(false);
    expect(validHome({ ...home, ledger: { other: "lost" } })).toBe(false);
  });
});
