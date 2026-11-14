import { describe, expect, test } from "bun:test";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { game } from "../../game.config";
import { loop } from "../../loop";
import { content } from "../content";
import { DAY_SECONDS, secondsAtHour } from "../clock";
import { cityOf, tickCity } from "../cityRuntime";
import { tickTide, tideStore } from "../tide/tideRuntime";
import { tideLevelAt } from "../tide/tide";
import { tickNightLook } from "../world/nightLook";
import { nightStore } from "./nights";
import { customerSpot, shiftStore, tickShift } from "./shift";

function boot() {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: "nights-test", isNew: true } });
  loop.onInit(ctx);
  loop.onNewPlayer(ctx);
  ctx.game.commands.run("game.start", {});
  return ctx;
}
type Ctx = ReturnType<typeof boot>;

function at(ctx: Ctx, hour: number): void {
  const clock = ctx.time.snapshot();
  ctx.time.hydrate({ ...clock, now: Math.floor(clock.now / DAY_SECONDS) * DAY_SECONDS + secondsAtHour(hour) });
}

/** Open the story up to a set-piece night and start it from its giver. */
function startNight(ctx: Ctx, jobId: string, before: readonly string[]): void {
  for (const id of before) cityOf(ctx).set(`jobs.${id}`, "done");
  if (cityOf(ctx).missionView() !== null) cityOf(ctx).abandonJob();
  expect(ctx.game.commands.run("city.job.start", { id: jobId }).status).not.toBe("rejected");
}

function run(ctx: Ctx, seconds: number, step = 0.5): void {
  for (let t = 0; t < seconds; t += step) {
    tickCity(ctx, step);
    tickTide(ctx);
    tickShift(ctx, step);
  }
}

describe("set-piece nights", () => {
  test("lantern night opens with the shop, tips the crowd's bonus, and counts toward the chapter", () => {
    const ctx = boot();
    startNight(ctx, "festival_night", ["welcome", "learn_water", "crust_war"]);
    at(ctx, 17.8);
    run(ctx, 1);
    expect(nightStore.read(ctx).running).toBeNull();
    at(ctx, 18.1);
    run(ctx, 1);
    expect(nightStore.read(ctx).running).toBe("festival");
    const spot = customerSpot("gus")!;
    ctx.scene.entity.setPose(ctx.player.userId, { position: [spot[0], ctx.world.groundHeightAt(spot[0], spot[1]), spot[1]] });
    shiftStore.write(ctx, { ...shiftStore.read(ctx), bag: [{ id: "f1", customerId: "gus", pizzaId: "margherita", heat: 95, soak: 0, age: 10, par: 60 }], nextCallIn: 999 });
    ctx.game.commands.run("pizza.deliver", {});
    expect(shiftStore.read(ctx).lastReceipt!.lines.some((line) => line.label === "Festival crowd")).toBe(true);
    expect(nightStore.read(ctx).score).toBe(1);
  });

  test("midnight before the score rains the night out and the chapter can be asked for again", () => {
    const ctx = boot();
    startNight(ctx, "festival_night", ["welcome", "learn_water", "crust_war"]);
    at(ctx, 23.95);
    run(ctx, 1);
    expect(nightStore.read(ctx).running).toBe("festival");
    const clock = ctx.time.snapshot();
    ctx.time.hydrate({ ...clock, now: clock.now + secondsAtHour(0.2) });
    run(ctx, 1);
    expect(cityOf(ctx).job("festival_night")?.status).toBe("failed");
    expect(nightStore.read(ctx).running).toBeNull();
  });

  test("the storm surge runs the water half a metre higher, and the blackout puts the lamps out", () => {
    const ctx = boot();
    startNight(ctx, "storm_surge", ["welcome", "learn_water", "crust_war", "festival_night", "riptide_run"]);
    at(ctx, 20);
    run(ctx, 1);
    expect(nightStore.read(ctx).running).toBe("storm");
    expect(tideStore.read(ctx)!.level).toBeCloseTo(tideLevelAt(20) + 0.5, 2);

    const dark = boot();
    startNight(dark, "blackout", ["welcome", "learn_water", "crust_war", "festival_night", "riptide_run", "storm_surge", "megaslice_man"]);
    at(dark, 21);
    run(dark, 1);
    expect(nightStore.read(dark).running).toBe("blackout");
    tickNightLook(dark);
    expect(dark.scene.object.list().filter((object) => object.catalogId === "obj_lamp_pool")).toHaveLength(0);
  });
});
