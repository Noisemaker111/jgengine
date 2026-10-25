import { describe, expect, test } from "bun:test";
import { depart, newDive, newHome, settle, takeLoot, type Dive, type ItemKind } from "./state";

function loot(dive: Dive, source: string, kind: ItemKind, depth = 1): Dive {
  const result = takeLoot(dive, source, kind, depth);
  if (!result.ok) throw new Error(result.message);
  return result.dive;
}

/** A dive is a session: departure opens it, the packed haul is what it carries, the bank/lose rules settle it. */
describe("Bellwether dive session", () => {
  test("departure opens a run session, the haul it packed is what it carries, extraction settles it", () => {
    const home = newHome();
    const departed = depart(home);
    expect(departed.session).toMatchObject({ session: 1, closed: 0, carried: 0 });
    expect(departed.activeDive).toBe(1);
    expect(departed.nextDive).toBe(2);

    const dive = loot(loot(newDive(departed.activeDive!), "wire", "wire"), "ink", "ink");
    const settled = settle(departed, dive, "extracted", "Rail return");

    // The same numbers the shared haul rules always produced: both instances banked, one run closed.
    expect(settled.stash.map(item => item.id)).toEqual(["1:wire", "1:ink"]);
    expect(settled.extractions).toBe(1);
    expect(settled.session).toMatchObject({ session: 1, closed: 1, carried: 0 });
    expect(settled.activeDive).toBeNull();
    expect(settled.nextDive).toBe(2);
    expect(settled.last).toMatchObject({ kind: "extracted", dive: 1, count: 2 });
  });

  test("a lost Life closes the same session and loses what it carried", () => {
    const departed = depart(newHome());
    const dive = loot(newDive(departed.activeDive!), "wire", "wire");
    const lost = settle(departed, dive, "lost", "No air");
    expect(lost.stash).toEqual([]);
    expect(lost.deaths).toBe(1);
    expect(lost.session).toMatchObject({ session: 1, closed: 1, carried: 0 });
    // A closed session cannot be settled twice, and the next departure opens the next one.
    expect(() => settle(lost, dive, "lost", "Again")).toThrow();
    const again = depart({ ...lost, reprintPending: false });
    expect(again.session).toMatchObject({ session: 2, closed: 1 });
  });
});
