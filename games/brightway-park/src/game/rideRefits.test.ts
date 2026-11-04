import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHeadlessRunner } from "@jgengine/core/runtime/headlessRunner";
import { upgradeStepAction } from "@jgengine/core/worldModel/upgradePaths";

import { game } from "../game.config";
import { DAY_LENGTH } from "./catalog";
import { BUILDABLES } from "./objects/catalog";
import { monthLine, park, reliability } from "./park";
import { resetPark } from "./parkReset";
import { REFIT_SHARE, REFITS, REFURB_SECONDS, reopenAction, shutAction, SHUT_UPKEEP } from "./rideRefits";
import { rideSystem, rideView } from "./rides";

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

/** The authored starter park, started, with no guests, so only the rides' own numbers move. */
function starterPark() {
  const runner = createHeadlessRunner({ game, maxStepSeconds: 1 });
  runner.ctx.sim.retune({ hz: "variable" });
  resetPark(runner.ctx, { layout: "starter", guests: 0 });
  runner.ui.invoke("park.start");
  runner.ctx.time.hydrate({ ...runner.ctx.time.snapshot(), now: DAY_LENGTH * 0.3, paused: false });
  const w = park.of(runner.ctx);
  const ride = w.instances().find((entry) => BUILDABLES[entry.kind]?.ride !== undefined && w.fact(`${entry.id}.closed`) === false);
  if (ride === undefined) throw new Error("the starter park has no open ride");
  w.set("park.cash", 50_000);
  runner.step(0.25);
  return { runner, w, id: ride.id, kind: ride.kind, def: BUILDABLES[ride.kind]! };
}

const step = (runner: ReturnType<typeof starterPark>["runner"], seconds: number) => {
  for (let t = 0; t < seconds; t += 0.25) runner.step(0.25);
};

/** Run an action and one tick, the tick its landing (retheme, relink, upkeep) is heard on. */
const act = (runner: ReturnType<typeof starterPark>["runner"], action: string, target: string) => {
  const status = runner.ctx.game.commands.run("brightway.act", { action, target }).status;
  runner.step(0.25);
  return status;
};

/** Set a ride's wear in the sim, as if it had run that many cycles since its last service. */
function wearDown(id: string, runs: number): void {
  const snapshot = rideSystem().snapshot();
  const entry = snapshot.rides.find((candidate) => candidate.definition.id === id)!;
  entry.wear = runs;
  rideSystem().restore(snapshot);
}

describe("ride refits", () => {
  test("a Premium refit costs its share of the ride, seats half as many again, lifts appeal and costs more to run", () => {
    const { runner, w, id, kind, def } = starterPark();
    const cash = w.num("park.cash");
    const appeal = w.num(`${id}.appeal`);
    expect(w.costOf(upgradeStepAction(kind, "premium", 1), id)["park.cash"]).toBe(-Math.round(def.cost * REFIT_SHARE));
    expect(act(runner, upgradeStepAction(kind, "premium", 1), id)).toBe("applied");
    expect(w.num("park.cash")).toBeCloseTo(cash - Math.round(def.cost * REFIT_SHARE), 0);
    expect(rideView(id)!.capacity).toBe(Math.round(def.ride!.capacity * (1 + REFITS.premium.capacity)));
    expect(w.num(`${id}.appeal`)).toBeCloseTo(appeal + REFITS.premium.appeal, 5);
    expect(w.num(`${id}.upkeep_delta`)).toBeCloseTo(def.upkeep * REFITS.premium.upkeep, 2);
    // The fork is closed: no second refit, either way.
    expect(act(runner, upgradeStepAction(kind, "efficient", 1), id)).toBe("rejected");
    expect(act(runner, upgradeStepAction(kind, "premium", 1), id)).toBe("rejected");
  });

  test("an Efficient refit runs cheaper and wears slower, for a little appeal", () => {
    const { runner, w, id, kind, def } = starterPark();
    const appeal = w.num(`${id}.appeal`);
    expect(act(runner, upgradeStepAction(kind, "efficient", 1), id)).toBe("applied");
    expect(w.num(`${id}.upkeep_delta`)).toBeCloseTo(def.upkeep * REFITS.efficient.upkeep, 2);
    expect(w.num(`${id}.appeal`)).toBeCloseTo(appeal + REFITS.efficient.appeal, 5);
    expect(reliability(def, 20, w.num(`${id}.wear_scale`))).toBeGreaterThan(reliability(def, 20));
  });

  test("the park pays a refit's upkeep through the day", () => {
    const { runner, w, id, kind, def } = starterPark();
    expect(act(runner, upgradeStepAction(kind, "premium", 1), id)).toBe("applied");
    const before = w.num(monthLine("upkeep"));
    const asBuilt = w.num("park.upkeep_delta");
    step(runner, 30);
    const perDay = (w.num(monthLine("upkeep")) - before) * (DAY_LENGTH / 30);
    // The month's upkeep line grows by every structure's upkeep plus the refit's extra.
    expect(asBuilt).toBeCloseTo(def.upkeep * REFITS.premium.upkeep, 2);
    expect(perDay).toBeGreaterThan(def.upkeep * REFITS.premium.upkeep);
  });
});

describe("closing a ride to refurbish it", () => {
  test("a shut ride takes no guests, costs a quarter of its upkeep, sheds its wear and reopens", () => {
    const { runner, w, id, kind, def } = starterPark();
    wearDown(id, 10);
    const open = w.num("park.rides_open");
    expect(act(runner, shutAction(kind), id)).toBe("applied");
    expect(w.fact(`${id}.closed`)).toBe(true);
    expect(w.num("park.rides_open")).toBe(open - 1);
    expect(w.num(`${id}.upkeep_delta`)).toBeCloseTo(def.upkeep * (SHUT_UPKEEP - 1), 2);

    step(runner, REFURB_SECONDS * 4);
    expect(rideView(id)!.wear).toBeLessThanOrEqual(6);
    expect(rideView(id)!.wear).toBeGreaterThanOrEqual(5);

    expect(act(runner, shutAction(kind), id)).toBe("rejected");
    expect(act(runner, reopenAction(kind), id)).toBe("applied");
    expect(w.fact(`${id}.closed`)).toBe(false);
    expect(w.num("park.rides_open")).toBe(open);
    expect(w.num(`${id}.upkeep_delta`)).toBe(0);
    const wear = rideView(id)!.wear;
    step(runner, REFURB_SECONDS * 2);
    expect(rideView(id)!.wear).toBeGreaterThanOrEqual(wear);
  });

  test("a shut ride's upkeep line runs at a quarter", () => {
    const { runner, w, id, kind, def } = starterPark();
    const open = () => {
      const before = w.num(monthLine("upkeep"));
      step(runner, 20);
      return w.num(monthLine("upkeep")) - before;
    };
    const running = open();
    expect(act(runner, shutAction(kind), id)).toBe("applied");
    const shut = open();
    expect(running - shut).toBeCloseTo(def.upkeep * (1 - SHUT_UPKEEP) * (20 / DAY_LENGTH), 1);
  });

  test("a broken ride can't be shut; it needs its repair first", () => {
    const { runner, w, id, kind } = starterPark();
    w.set(`${id}.broken`, true);
    expect(act(runner, shutAction(kind), id)).toBe("rejected");
  });
});
