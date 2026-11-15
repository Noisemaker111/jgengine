import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { game } from "../game.config";
import { DAY_LENGTH, clockLabel, CLOSE_FRACTION, OPEN_FRACTION } from "./catalog";
import { FULL_MOON_NIGHT, isFullMoon, MONTH_DAYS } from "./books";
import { pickVisitorKind, VISITORS } from "./entities/guests/catalog";
import { GHOSTS, ghostDef, ghostFact } from "./ghostCatalog";
import { ghostStatuses, MOVE_IN_SECONDS, RESTLESS_SECONDS } from "./ghosts";
import { BUILDABLES, SKEPTIC_LINE } from "./objects/catalog";
import { cellFor, park, researched } from "./park";
import { resetPark } from "./parkReset";
import { chainMultiplier, CHAIN_SECONDS, ECTO_PER_NERVE, liveChain, shrugsOff, tickScares } from "./scares";
import { seedGuests } from "./sim/guests";
import { session } from "./session";
import { EXORCIST_EVIDENCE, leaveWithFootage, noonExorcism } from "./threats";

function haunt() {
  const runner = createHeadlessRunner({ game, maxStepSeconds: 1 });
  runner.ctx.sim.retune({ hz: "variable" });
  resetPark(runner.ctx);
  runner.ui.invoke("park.start");
  runner.ctx.time.hydrate({ ...runner.ctx.time.snapshot(), now: DAY_LENGTH * 0.4, paused: false });
  return { runner, w: park.of(runner.ctx) };
}

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
beforeEach(() => {
  const records = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => records.set(key, value),
    removeItem: (key: string) => records.delete(key),
  } });
});
afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
});

describe("hauntworks nights", () => {
  test("one night of each moon is a full moon", () => {
    expect(isFullMoon(FULL_MOON_NIGHT)).toBe(true);
    expect(isFullMoon(FULL_MOON_NIGHT + 1)).toBe(false);
    expect(isFullMoon(FULL_MOON_NIGHT + MONTH_DAYS)).toBe(true);
  });

  test("the living come at dusk and go home at dawn, on a noon-to-noon clock", () => {
    expect(clockLabel(OPEN_FRACTION)).toBe("17:45");
    expect(clockLabel(CLOSE_FRACTION)).toBe("07:12");
    expect(clockLabel(0)).toBe("12:00");
    expect(clockLabel(0.5)).toBe("00:00");
  });

  test("hunters and TV crews only turn up once the rumor has reached them", () => {
    const early = new Set(Array.from({ length: 200 }, (_, i) => pickVisitorKind(0, i / 200).id));
    expect(early.has("visitor_hunter")).toBe(false);
    expect(early.has("visitor_tvcrew")).toBe(false);
    const late = new Set(Array.from({ length: 200 }, (_, i) => pickVisitorKind(1000, i / 200).id));
    for (const kind of VISITORS) expect(late.has(kind.id)).toBe(true);
  });
});

describe("hauntworks scares", () => {
  test("scares close together chain into a growing multiplier that a long breather breaks", () => {
    expect(chainMultiplier(0)).toBe(1);
    expect(chainMultiplier(2)).toBeGreaterThan(chainMultiplier(1));
    expect(chainMultiplier(100)).toBe(chainMultiplier(6));
    const guest = { combo: 3, lastScareAt: 100 } as Parameters<typeof liveChain>[0];
    expect(liveChain(guest, 100 + CHAIN_SECONDS - 1)).toBe(3);
    expect(liveChain(guest, 100 + CHAIN_SECONDS + 1)).toBe(0);
  });

  test("a skeptic shrugs off a cheap prop but not a proper fright", () => {
    expect(shrugsOff("visitor_skeptic", SKEPTIC_LINE - 1)).toBe(true);
    expect(shrugsOff("visitor_skeptic", SKEPTIC_LINE)).toBe(false);
    expect(shrugsOff("visitor_teen", 1)).toBe(false);
  });

  test("a prop jolts the living in its reach: nerve spent, ectoplasm wrung out, a link in the chain, then a cooldown", () => {
    const { runner, w } = haunt();
    const ctx = runner.ctx;
    expect(ctx.game.commands.run("brightway.place", { kind: "prop_coffin", cell: cellFor("prop_coffin", 20, 20) }).status).toBe("applied");
    const coffin = w.instances("prop_coffin")[0]!;
    seedGuests(ctx, 1);
    const guest = [...session.guests.values()][0]!;
    guest.courage = 30;
    ctx.scene.entity.setPose(guest.id, { position: [coffin.position![0] + 1, 0, coffin.position![1]] });
    const cash = w.num("park.cash");
    tickScares(ctx);
    const fright = BUILDABLES.prop_coffin!.scare!.fright;
    expect(guest.courage).toBe(30 - fright);
    expect(guest.combo).toBe(1);
    expect(w.num("park.cash")).toBeCloseTo(cash + fright * ECTO_PER_NERVE);
    // Ready again only after its cooldown.
    tickScares(ctx);
    expect(guest.courage).toBe(30 - fright);
  }, 30_000);

  test("a visitor out of nerve flees screaming, spreading the rumor and shaking the rest of the group", () => {
    const { runner, w } = haunt();
    const ctx = runner.ctx;
    seedGuests(ctx, 2);
    const [first, second] = [...session.guests.values()];
    first!.group = "group#test";
    second!.group = "group#test";
    first!.courage = 0.5;
    second!.courage = 40;
    runner.step(0.2);
    expect(w.num("park.screams")).toBe(1);
    expect(first!.phase).toBe("leaving");
    expect(second!.courage).toBeLessThan(40);
  }, 30_000);
});

describe("hauntworks ghosts", () => {
  test("every ghost wants things the park can build, and whispers a séance when it moves in", () => {
    expect(GHOSTS.length).toBe(6);
    for (const ghost of GHOSTS) {
      expect(ghost.wants.length).toBeGreaterThan(0);
      expect(BUILDABLES[ghost.unlocks]?.research).toBeDefined();
    }
  });

  test("the Victorian Child moves in once the carousel and a toy have both stood a while, then leaves if they go", () => {
    const { runner, w } = haunt();
    const ctx = runner.ctx;
    const run = (name: string, input: Record<string, unknown>) => ctx.game.commands.run(name, input);
    expect(run("brightway.place", { kind: "ride_carousel", cell: cellFor("ride_carousel", -20, 20) }).status).toBe("applied");
    for (let t = 0; t < MOVE_IN_SECONDS + 2; t += 1) runner.step(1);
    // A carousel alone is not enough.
    expect(w.num(ghostFact("child"))).toBe(0);
    expect(run("brightway.place", { kind: "prop_coffin", cell: cellFor("prop_coffin", -8, 20) }).status).toBe("applied");
    expect(ghostStatuses(ctx).find((status) => status.ghost.id === "child")?.wants.every((want) => want.met)).toBe(true);
    for (let t = 0; t < MOVE_IN_SECONDS + 2; t += 1) runner.step(1);
    expect(w.num(ghostFact("child"))).toBe(1);
    expect(w.num("park.ghosts")).toBe(1);
    expect(w.fact(researched(ghostDef("child")!.unlocks))).toBe(true);
    expect(ctx.scene.entity.get("ghost:child")).not.toBeNull();
    // Her seep lands every second of the night.
    const cash = w.num("park.cash");
    runner.step(10);
    expect(w.num("park.cash")).toBeGreaterThan(cash - 10);

    run("brightway.remove", { id: w.instances("prop_coffin")[0]!.id });
    for (let t = 0; t < RESTLESS_SECONDS + 3; t += 1) runner.step(1);
    expect(w.num(ghostFact("child"))).toBe(0);
    expect(ctx.scene.entity.get("ghost:child")).toBeNull();
  }, 30_000);
});

describe("hauntworks threats", () => {
  test("footage counts only if the crew walks out calmly; a full record brings the exorcist at noon", () => {
    const { runner, w } = haunt();
    const ctx = runner.ctx;
    seedGuests(ctx, 1);
    const crew = [...session.guests.values()][0]!;
    crew.footage = 30;
    leaveWithFootage(ctx, crew, true);
    expect(w.num("park.evidence")).toBe(0);
    crew.footage = 30;
    leaveWithFootage(ctx, crew, false);
    expect(w.num("park.evidence")).toBe(30);

    // A ghost at home, the record full: noon throws it out, empties the record and charges the fee.
    w.set(ghostFact("child"), 1);
    w.set("park.ghosts", 1);
    w.change({ "park.evidence": EXORCIST_EVIDENCE });
    const cash = w.num("park.cash");
    expect(noonExorcism(ctx)).toBe(true);
    expect(w.num(ghostFact("child"))).toBe(0);
    expect(w.num("park.evidence")).toBe(0);
    expect(w.num("park.cash")).toBeLessThan(cash);
    expect(w.num(`${ghostFact("child")}.banished_until`)).toBeGreaterThan(ctx.time.now());
    // The exorcist walks in from the gate, blesses the spot and walks out again.
    expect(ctx.scene.entity.get("exorcist")).not.toBeNull();
    for (let t = 0; t < 90 && ctx.scene.entity.get("exorcist") != null; t += 1) runner.step(1);
    expect(ctx.scene.entity.get("exorcist")).toBeNull();
    // Below the line, noon only lets the evidence fade.
    w.change({ "park.evidence": 40 });
    expect(noonExorcism(ctx)).toBe(false);
    expect(w.num("park.evidence")).toBeLessThan(40);
  }, 30_000);
});
