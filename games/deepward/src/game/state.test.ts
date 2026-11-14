import { describe, expect, test } from "bun:test";
import { acknowledgeCaught, carry, clockText, depart, familyUp, fits, isDawn, lightsOn, newHome, newRun, peekLoot, recoverInterrupted, settle, twoHanded, NIGHT_SECONDS, type Home, type Run } from "./state";
import { rollItem, SETS } from "./loot";
import { packOf } from "./burrow";
import { roomOf } from "./state";

function start(home: Home = newHome()): { home: Home; run: Run } {
  const next = depart(home);
  return { home: next, run: newRun(next.activeRun!, next, home) };
}
const item = (kind: Parameters<typeof rollItem>[0], n = 0, run = 1) => rollItem(kind, 1, `t:${kind}:${n}`, `${run}:${kind}~t${n}`);

describe("a run", () => {
  test("departing opens one run with a seeded house, a 4 × 3 pack and the whole night ahead", () => {
    const { home, run } = start();
    expect(home.activeRun).toBe(1);
    expect(run.seed).toContain("night-1");
    expect([run.packW, run.packH]).toEqual([4, 3]);
    expect(run.health).toBe(100);
    expect(roomOf(run).template.root).toBe(true);
    expect(() => depart(home)).toThrow("already outstanding");
  });
  test("weight and squares both gate what comes home; two-handed finds slow everyone but Tuck", () => {
    let { run } = start();
    const cheese = item("cheese-cube");
    const first = carry(run, cheese, "a");
    if (!first.ok) throw new Error(first.message);
    run = first.run;
    expect(twoHanded(run)).toBe(true);
    expect(twoHanded({ ...run, little: "tuck" })).toBe(false);
    expect(carry(run, item("crumb", 1), "a").ok).toBe(false); // that spot is already empty
    // A pile of coins blows the weight limit long before the grid is full.
    let refusal = "";
    for (let n = 0; n < 6 && refusal === ""; n++) { const r = carry(run, item("coin", n), `c${n}`); if (r.ok) run = r.run; else refusal = r.reason; }
    expect(["over-capacity", "pack-full"]).toContain(refusal);
    expect(fits(run.pack, { ...run.pack[0]!, x: 9 }, run.packW, run.packH)).toBe(false);
  });
  test("extracting banks the pack, turns bottle caps into the purse and pays a whole set's bonus", () => {
    let { home, run } = start();
    for (const [n, kind] of SETS["midnight-feast"].pieces.entries()) { const r = carry(run, item(kind, n), `s${n}`); if (r.ok) run = r.run; }
    const r = carry(run, item("bottle-cap", 9), "cap");
    if (r.ok) run = r.run;
    const carried = run.pack.length;
    const after = settle(home, run, "extracted", "Home through the crack.");
    expect(after.activeRun).toBeNull();
    expect(after.extractions).toBe(1);
    expect(after.stash.length).toBe(carried - 1);
    const feastHome = run.pack.filter(i => SETS["midnight-feast"].pieces.includes(i.baseId as never)).length === 5;
    expect(after.caps).toBeGreaterThanOrEqual(feastHome ? 50 : 10);
    if (feastHome) expect(after.sets).toContain("midnight-feast");
    expect(() => settle(after, run, "extracted", "again")).toThrow();
  });
  test("caught loses the run's haul, keeps the stash and waits for an acknowledgement", () => {
    const banked = settle(start().home, { id: 1, pack: [], kidTook: [], deepest: 0 }, "extracted", "first");
    let { home, run } = start({ ...banked, stash: [item("button", 0, 1)] });
    const r = carry(run, item("marble", 2, 2), "m");
    if (r.ok) run = r.run;
    const lost = settle(home, run, "lost", "The Cat got you.");
    expect(lost.stash.map(i => i.baseId)).toEqual(["button"]);
    expect(lost.caughtPending).toBe(true);
    expect(() => depart(lost)).toThrow("Shake it off");
    expect(acknowledgeCaught(lost).caughtPending).toBe(false);
  });
  test("what the kid took waits in the toy box for a later night", () => {
    const { home, run } = start();
    const after = settle(home, { ...run, kidTook: [item("coin", 4)] }, "lost", "caught");
    expect(after.kidsBox.map(i => i.baseId)).toEqual(["coin"]);
  });
  test("a run left outstanding by a closed tab is settled as lost on the next boot", () => {
    const { home } = start();
    const recovered = recoverInterrupted(home);
    expect(recovered.activeRun).toBeNull();
    expect(recovered.caught).toBe(1);
    expect(recovered.last?.count).toBeNull();
  });
  test("the night runs from 3 AM to dawn, then the family gets up", () => {
    const { run } = start();
    expect(clockText(run)).toBe("3:00 AM");
    expect(clockText({ ...run, elapsed: NIGHT_SECONDS / 2 })).toBe("4:30 AM");
    expect(isDawn({ ...run, elapsed: NIGHT_SECONDS })).toBe(true);
    expect(familyUp({ ...run, elapsed: NIGHT_SECONDS + 30 })).toBe(false);
    expect(familyUp({ ...run, elapsed: NIGHT_SECONDS + 61 })).toBe(true);
    expect(lightsOn({ ...run, elapsed: NIGHT_SECONDS }, { lightsAt: null })).toBe(true);
    expect(lightsOn(run, { lightsAt: null })).toBe(false);
  });
  test("brought gear rides in the pack and the larder feeds the next Little from the stash", () => {
    const home: Home = { ...newHome(), nextRun: 2, extractions: 1, upgrades: { ...newHome().upgrades, larder: 1, satchel: 1 }, stash: [item("grapple", 0, 1), item("crumb", 1, 1)] };
    const withBring = { ...home, bring: [home.stash[0]!.id] };
    const next = depart(withBring), run = newRun(next.activeRun!, next, withBring);
    expect(run.pack.map(i => i.baseId)).toEqual(["grapple"]);
    expect(run.maxHealth).toBe(125);
    expect(next.stash).toEqual([]);
    expect([run.packW, run.packH]).toEqual([packOf(1).w, packOf(1).h]);
  });
  test("a spot's find is the same instance before and after the search", () => {
    const { run } = start();
    const loot = roomOf(run).loot.find(l => l.kind !== "toybox")!;
    expect(peekLoot(run, loot)).toEqual(peekLoot(run, loot));
  });
});
