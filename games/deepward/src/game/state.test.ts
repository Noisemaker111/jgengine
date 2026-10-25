import { describe, expect, test } from "bun:test";
import { ageDive, depart, fits, newDive, newHome, pack, recoverInterrupted, settle, takeLoot, type Dive, type ItemKind } from "./state";
import { rollItem } from "./items";

function loot(dive: Dive, source: string, kind: ItemKind, depth = 1): Dive {
  const result = takeLoot(dive, source, kind, depth);
  if (!result.ok) throw new Error(result.message);
  return result.dive;
}
const item = (kind: ItemKind, id: string) => rollItem(kind, 1, `test:${id}`, id);

describe("Bellwether extraction invariants", () => {
  test("a settled haul is unique; the next Life loses only its carried cache", () => {
    const first = depart(newHome());
    const dive = loot(newDive(first.activeDive!), "wire", "wire");
    expect(takeLoot(dive, "wire", "wire").ok).toBe(false);
    const home = settle(first, dive, "extracted", "Rail return");
    expect(home.stash.map(i => i.id)).toEqual(["1:wire"]);
    expect(() => settle(home, dive, "extracted", "Again")).toThrow();
    const away = depart(home);
    const lost = settle(away, loot(newDive(2), "ink", "ink", 4), "lost", "Fitter");
    expect(lost.stash).toEqual(home.stash);
    expect(lost.life).toBe(2);
  });
  test("reload of an outstanding departure resolves loss once", () => {
    const recovered = recoverInterrupted(depart(newHome()));
    expect(recovered.activeDive).toBeNull();
    expect(recovered.deaths).toBe(1);
    expect(recovered.last!.count).toBeNull();
    expect(recoverInterrupted(recovered)).toBe(recovered);
  });
  test("packing consumes footprints and rejects overlapping or out-of-bounds placement", () => {
    const ink = pack([], item("ink", "1:ink"))!;
    expect(fits([ink], { ...item("cells", "1:cells"), x: 0, y: 0, rotated: false })).toBe(false);
    expect(fits([], { ...ink, x: 3 })).toBe(false);
    expect(pack([ink], item("service-rifle", "1:fitter"))).not.toBeNull();
  });
  test("air exhaustion bleeds only time actually spent without air", () => {
    const dive = { ...newDive(1), oxygen: 0.5 };
    expect(ageDive(dive, 1, false).health).toBe(94);
    expect(ageDive(ageDive(dive, 0.5, false), 0.5, false).health).toBe(94);
  });
});
