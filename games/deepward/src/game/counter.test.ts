import { describe, expect, test } from "bun:test";
import { openRecord, validHome, type RunHooks, type StoragePort } from "./save";
import { buySupply, counterRows, dismantle, haulScrip, marrowStanding, openScripBooks, OPERATOR, priceOf, REASON, SCRIP, scripJournal, settleEconomy } from "./counter";
import { depart, newDive, newHome, settle, takeLoot, type Dive, type Home } from "./state";
import { breakdownValue, kindOf, rollItem, type ItemKind } from "./items";

function memory(): StoragePort {
  const data = new Map<string, string>();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
}
/** The record's run section is not part of these money rules; a stub stands in for the live view. */
const stub: RunHooks = { snapshot: () => null as never, restore: () => {} };
async function open(storage: StoragePort) {
  const record = openRecord(storage, stub);
  await record.load();
  return record;
}
function standingAt(score: number): Home {
  const standing = marrowStanding();
  standing.adjust(OPERATOR, "marrow", score);
  return { ...newHome(), standing: standing.snapshot() };
}
const wire = rollItem("wire", 1, "test:wire", "1:wire");
const ink = rollItem("ink", 4, "test:ink", "1:ink");
function carried(source: string, kind: ItemKind): Dive {
  const result = takeLoot(newDive(1), source, kind);
  if (!result.ok) throw new Error(result.message);
  return result.dive;
}

describe("Marrow's counter", () => {
  test("standing rises on a return and falls on a lost Life", () => {
    const home = standingAt(0);
    const returned = settleEconomy(home, [wire, ink], "extracted");
    expect(returned.scrip).toBe(haulScrip([wire, ink]));
    expect(returned.bank.banked).toBe(returned.scrip);
    expect(marrowStanding(returned.standing).standing(OPERATOR, "marrow")).toBe(14);

    const died = settleEconomy(home, [ink], "lost");
    expect(died.scrip).toBe(haulScrip([ink]));
    expect(died.bank.banked).toBe(0);
    expect(died.bank.lost).toBe(haulScrip([ink]));
    expect(marrowStanding(died.standing).standing(OPERATOR, "marrow")).toBe(-10);
  });

  test("the shelf opens exactly at the standing it names", () => {
    const before = counterRows(standingAt(14)).find(row => row.supply.kind === "polymer")!;
    expect(before.locked).toBe(true);
    expect(before.needs).toBe(15);
    const at = counterRows(standingAt(15)).find(row => row.supply.kind === "polymer")!;
    expect(at.locked).toBe(false);
    expect(counterRows(standingAt(39)).find(row => row.supply.kind === "cells")!.locked).toBe(true);
    expect(counterRows(standingAt(40)).find(row => row.supply.kind === "cells")!.locked).toBe(false);
    expect(counterRows(standingAt(14)).find(row => row.supply.kind === "service-rifle")!.locked).toBe(false);
    expect(counterRows(standingAt(14)).find(row => row.supply.kind === "service-rifle")!.needs).toBeNull();
  });

  test("prices fall as standing rises, from one authored curve", () => {
    expect(priceOf("wire", 0)).toBe(36);
    expect(priceOf("wire", 40)).toBe(27);
    expect(priceOf("wire", 500)).toBeGreaterThanOrEqual(18);
    expect(priceOf("ink", 80)).toBeLessThan(priceOf("ink", 0));
    expect(priceOf("service-rifle", 40)).toBeLessThan(priceOf("service-rifle", 15));
  });

  test("a locked shelf refuses the purchase and an open one costs scrip", () => {
    const poor = standingAt(0);
    expect(() => buySupply(poor, "ink")).toThrow(/cleared you for/);
    expect(() => buySupply(poor, "service-rifle")).toThrow(/Scrip short/);

    const rich = { ...standingAt(80), bank: { banked: 900, haul: 0, deposited: 0, lost: 0, bestHaul: 0, runs: 0 } };
    const bought = buySupply(rich, "ink");
    expect(bought.bank.banked).toBe(900 - priceOf("ink", 80));
    expect(bought.stash).toHaveLength(1);
    expect(kindOf(bought.stash[0]!)).toBe("ink");
    expect(bought.stash[0]!.id).toBe(`purchase-${rich.revision}:ink`);
    expect(bought.revision).toBe(rich.revision + 1);

    const rifle = buySupply(rich, "service-rifle");
    expect(kindOf(rifle.stash[0]!)).toBe("service-rifle");
    expect(rifle.stash[0]!.level).toBe(2);
  });

  test("a purchase survives the save's own validation and a reload", async () => {
    const storage = memory();
    const session = await open(storage);
    const rich = { ...session.home, revision: session.home.revision + 1, bank: { ...session.home.bank, banked: 200 } };
    expect(validHome(rich)).toBe(true);
    await session.commit(rich);
    await session.commit(buySupply(session.home, "wire"));
    const reloaded = await open(storage);
    expect(reloaded.home.stash).toHaveLength(1);
    expect(reloaded.home.bank.banked).toBe(200 - priceOf("wire", 0));
    expect(reloaded.home.bank.banked).toBeLessThan(200);
  });

  test("a whole dive banks scrip through settle and keeps the haul on a loss", async () => {
    const storage = memory();
    const session = await open(storage);
    await session.commit(depart(session.home));
    await session.commit(settle(session.home, carried("wire", "wire"), "extracted", "Returned by rail"));
    const reloaded = await open(storage);
    expect(reloaded.home.bank.banked).toBe(haulScrip([rollItem("wire", 1, "deepward:1:wire", "1:wire")]));
    expect(reloaded.home.standing.records[OPERATOR]?.marrow).toBe(14);
  });

  test("a lost Life banks nothing and takes its standing with it", async () => {
    const storage = memory();
    const session = await open(storage);
    await session.commit(depart(session.home));
    await session.commit(settle(session.home, carried("ink", "ink"), "lost", "The print took that Life"));
    const reloaded = await open(storage);
    expect(reloaded.home.bank.banked).toBe(0);
    expect(reloaded.home.bank.lost).toBe(haulScrip([rollItem("ink", 1, "deepward:1:ink", "1:ink")]));
    expect(reloaded.home.stash).toEqual([]);
    expect(reloaded.home.standing.records[OPERATOR]?.marrow).toBe(-10);
  });

  test("the same two shifts produce the same money and standing", () => {
    const play = (): string => {
      const home = standingAt(20);
      const first = settleEconomy(home, [wire, ink], "extracted");
      const second = settleEconomy({ ...home, ...first }, [ink], "lost");
      return `${JSON.stringify(second.bank)}:${JSON.stringify(second.standing)}`;
    };
    expect(play()).toBe(play());
  });

  test("every scrip movement keeps its reason and the balance the counter shows", () => {
    const home: Home = { ...standingAt(80), revision: 4, bank: { banked: 100, haul: 0, deposited: 100, lost: 0, bestHaul: 0, runs: 1 }, books: openScripBooks(100) };
    const bought = buySupply(home, "wire");
    const purchase = scripJournal(bought).at(-1)!;
    expect(purchase).toMatchObject({ reason: REASON.purchase, ref: "wire", amount: -priceOf("wire", 80), balanceAfter: bought.bank.banked });

    const broken = dismantle(bought, bought.stash.find(item => kindOf(item) === "wire")!.id);
    const salvage = scripJournal(broken.home).at(-1)!;
    expect(salvage).toMatchObject({ reason: REASON.salvage, amount: broken.scrip, balanceAfter: broken.home.bank.banked });

    const departed = depart(broken.home);
    const returned = settle(departed, { ...carried("cells", "cells"), id: departed.activeDive! }, "extracted", "Rail");
    const haul = scripJournal(returned).at(-1)!;
    expect(haul).toMatchObject({ reason: REASON.haul, ref: `dive-${returned.last!.dive}`, balanceAfter: returned.bank.banked });
    expect(returned.books.accounts[OPERATOR]![SCRIP.id]).toBe(returned.bank.banked);

    // A lost Life pays nothing, so the journal gains no credit entry for it.
    const second = depart(returned);
    const lost = settle(second, { ...carried("wire", "wire"), id: second.activeDive! }, "lost", "No air");
    expect(lost.books.entries).toHaveLength(returned.books.entries.length);
    expect(lost.books.accounts[OPERATOR]![SCRIP.id]).toBe(lost.bank.banked);
  });

  test("breaking an item down pays its salvage value once and spends the instance", () => {
    const home: Home = { ...standingAt(20), bank: { banked: 5, haul: 0, deposited: 5, lost: 0, bestHaul: 0, runs: 1 } };
    const carrying: Home = {
      ...home,
      revision: 1, extractions: 1,
      stash: [ink],
      last: { kind: "extracted", dive: 1, count: 1, reason: "Returned by rail" },
    };
    const paid = dismantle(carrying, ink.id);
    expect(paid.scrip).toBe(breakdownValue(ink));
    expect(paid.home.bank.banked).toBe(5 + breakdownValue(ink));
    expect(paid.home.stash).toEqual([]);
    expect(paid.home.ledger).toEqual({ [ink.id]: "salvaged" });
    expect(() => dismantle({ ...paid.home, stash: [ink] }, ink.id)).toThrow(/already broken down/);
    expect(() => depart({ ...paid.home, stash: [ink] }, ink.id)).toThrow(/broken down/);
  });

  test("scrip is the counter's currency", () => {
    expect(SCRIP.id).toBe("scrip");
    expect(priceOf("cells", 0)).toBe(64);
  });
});
