import { describe, expect, test } from "bun:test";

import {
  buyPart,
  garageRows,
  newCareer,
  ownedParts,
  readCareer,
  saveCareer,
  settleRun,
  standingOf,
  YARD_COUNTER,
  DRIVER,
  type CareerSave,
  type CareerStorage,
} from "./career";
import { PARTS } from "./parts/catalog";

function memory(): CareerStorage {
  const data = new Map<string, string>();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
}

function standingAt(score: number, career: CareerSave = newCareer()): CareerSave {
  const standing = standingOf(career);
  standing.adjust(DRIVER, "yard", score);
  return { ...career, standing: standing.snapshot() };
}

function rich(career: CareerSave, credits: number): CareerSave {
  return { ...career, bank: { ...career.bank, banked: credits } };
}

describe("yard career", () => {
  test("an escape banks the haul and raises standing; a crush loses both the haul and standing", () => {
    const crushed = settleRun(standingAt(20), { kind: "crushed", place: 4, haul: 75 });
    expect(crushed.bank.banked).toBe(0);
    expect(crushed.bank.lost).toBe(75);
    expect(standingOf(crushed).standing(DRIVER, "yard")).toBe(16);

    const escaped = settleRun(standingAt(20), { kind: "escape", place: 2, haul: 175 });
    expect(escaped.bank.banked).toBe(175);
    expect(standingOf(escaped).standing(DRIVER, "yard")).toBe(30);
    expect(standingOf(escaped).tier(DRIVER, "yard").id).toBe("trusted");
  });

  test("a win also pays the place bonus", () => {
    const won = settleRun(standingAt(0), { kind: "escape", place: 1, haul: 0 });
    expect(standingOf(won).standing(DRIVER, "yard")).toBe(14);
  });

  test("the ladder prices each rung from the same curve, and a lost run cannot buy", () => {
    const rows = garageRows(rich(standingAt(0), 1000));
    expect(rows.find(row => row.slot === "engine")?.price).toBe(150);
    const broke = garageRows(newCareer());
    expect(broke.every(row => !row.owned)).toBe(true);
  });

  test("a part is locked by standing and opens exactly at its threshold", () => {
    const twoRungs = (score: number) => garageRows({ ...standingAt(score), ladders: { ranks: { engine: 2 } } }).find(row => row.slot === "engine")!;
    expect(twoRungs(24).part?.id).toBe("ev_conversion");
    expect(twoRungs(24).locked).toBe(true);
    expect(twoRungs(24).needs).toBe(25);
    expect(twoRungs(25).locked).toBe(false);
    expect(twoRungs(25).price).toBe(661);
  });

  test("buying a rung spends credits, owns the part and survives a reload", () => {
    const storage = memory();
    const start = rich(standingAt(0), 500);
    expect(saveCareer(start, storage)).toBe(true);
    const bought = buyPart(readCareer(storage), "engine");
    expect(bought.bank.banked).toBe(350);
    expect(ownedParts(bought).map(part => part.id)).toEqual(["salvage_v6"]);
    saveCareer(bought, storage);
    const reloaded = readCareer(storage);
    expect(reloaded.bank.banked).toBe(350);
    expect(reloaded.ladders.ranks.engine).toBe(1);
    expect(ownedParts(reloaded).map(part => part.id)).toEqual(["salvage_v6"]);
  });

  test("a locked rung or an empty wallet refuses without moving anything", () => {
    const locked = { ...standingAt(0), ladders: { ranks: { engine: 2 } } };
    expect(() => buyPart(rich(locked, 5000), "engine")).toThrow(/will not sell EV Conversion yet/);
    const poor = rich(standingAt(0), 100);
    expect(() => buyPart(poor, "engine")).toThrow(/Not enough credits/);
    expect(poor.bank.banked).toBe(100);
  });

  test("every gate names a part that exists, so no reward resolves to nothing", () => {
    const ids = new Set(PARTS.map(part => part.id));
    expect(YARD_COUNTER.gates().length).toBeGreaterThan(0);
    for (const gate of YARD_COUNTER.gates()) expect(ids.has(gate.unlock as never)).toBe(true);
  });

  test("a damaged or missing career file reads as a fresh pit", () => {
    const storage = memory();
    storage.setItem("drift-foundry.career.v1", "{");
    expect(readCareer(storage).bank.banked).toBe(0);
    storage.setItem("drift-foundry.career.v1", JSON.stringify({ version: 1, bank: { banked: -5 } }));
    expect(readCareer(storage).standing.records).toEqual({});
  });

  test("the same two events produce the same money, standing and garage", () => {
    const play = (): string => {
      const first = settleRun(rich(standingAt(0), 200), { kind: "escape", place: 1, haul: 150 });
      const second = settleRun(first, { kind: "crushed", place: 4, haul: 90 });
      return `${JSON.stringify(second.bank)}:${JSON.stringify(second.standing)}:${JSON.stringify(garageRows(second))}`;
    };
    expect(play()).toBe(play());
  });
});
