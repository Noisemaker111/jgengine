import { describe, expect, test } from "bun:test";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { game } from "../game.config";
import { loop } from "../loop";
import { AWAY_CAP_MS, awayStore, catchUpAway, noteSavedAt } from "./away";
import { earn } from "./cash";
import { cityOf } from "./cityRuntime";
import { houseStore, safehouseStore } from "./commands";
import { landWeaponHit } from "./combat/hitModel";
import { content } from "./content";
import { vehicleById } from "./entities/vehicles/catalog";
import { moddedTuning, upgradeRank } from "./progression/upgrades";

function boot(): GameContext {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: "upgrade-test", isNew: true } });
  loop.onInit(ctx);
  loop.onNewPlayer(ctx);
  ctx.game.commands.run("game.start", {});
  return ctx;
}

const cash = (ctx: GameContext) => ctx.game.economy.balance(ctx.player.userId, "cash");

describe("Harbor Heat upgrades", () => {
  test("the bay's engine tune costs its price, lifts an owned car's pull, and stops at its top rank", () => {
    const ctx = boot();
    earn(ctx, 20_000, "reconcile", "test");
    const before = cash(ctx);
    ctx.game.commands.run("upgrade.buy", { id: "car_engine" });
    expect(upgradeRank(ctx, "car_engine")).toBe(1);
    expect(before - cash(ctx)).toBe(900);
    const car = vehicleById("car_compact")!;
    if (car.dynamics.type !== "ground") throw new Error("car_compact is a ground car");
    const stock = car.dynamics.tuning;
    const tuned = moddedTuning(ctx, stock);
    expect(tuned.engineAccel).toBeCloseTo(stock.engineAccel * 1.12);
    expect(tuned.brakeAccel).toBe(stock.brakeAccel);
    ctx.game.commands.run("upgrade.buy", { id: "car_engine" });
    ctx.game.commands.run("upgrade.buy", { id: "car_engine" });
    const maxed = cash(ctx);
    ctx.game.commands.run("upgrade.buy", { id: "car_engine" });
    expect(upgradeRank(ctx, "car_engine")).toBe(3);
    expect(cash(ctx)).toBe(maxed);
  });

  test("hot loads make the player's shots hit harder, not anyone else's", () => {
    const ctx = boot();
    const shoot = (from: string) => {
      const id = ctx.scene.entity.spawn("ganger_dock", { position: [0, 0, 0], role: "npc" });
      const start = ctx.scene.entity.stats.get(id, "health")!.current;
      landWeaponHit(ctx, { from, to: id, weaponId: "pistol_vice" });
      return start - ctx.scene.entity.stats.get(id, "health")!.current;
    };
    const stock = shoot(ctx.player.userId);
    earn(ctx, 5_000, "reconcile", "test");
    ctx.game.commands.run("upgrade.buy", { id: "gun_damage" });
    expect(shoot(ctx.player.userId)).toBeGreaterThan(stock);
    expect(shoot("someone_else")).toBe(stock);
  });

  test("bungalow rooms need the bungalow", () => {
    const ctx = boot();
    earn(ctx, 5_000, "reconcile", "test");
    ctx.game.commands.run("upgrade.buy", { id: "house_locker" });
    expect(upgradeRank(ctx, "house_locker")).toBe(0);
    safehouseStore.write(ctx, true);
    ctx.game.commands.run("upgrade.buy", { id: "house_locker" });
    expect(upgradeRank(ctx, "house_locker")).toBe(1);
  });
});

describe("Harbor Heat time passing", () => {
  test("sleeping in the bungalow skips to morning, the safe fills, and the paper says so", () => {
    const ctx = boot();
    safehouseStore.write(ctx, true);
    cityOf(ctx).set("port.owner", "player");
    ctx.game.commands.run("safehouse.rest", {});
    expect(houseStore.read(ctx)).toBe(true);
    const takings = cityOf(ctx).num("fronts.takings");
    ctx.game.commands.run("safehouse.sleep", {});
    expect(ctx.time.calendar().hour).toBe(8);
    expect(houseStore.read(ctx)).toBeUndefined();
    expect(cityOf(ctx).num("fronts.takings")).toBeGreaterThan(takings);
    const paper = awayStore.read(ctx)!;
    expect(paper.kind).toBe("sleep");
    expect(paper.lines.some((line) => line.label === "Fronts' safe")).toBe(true);
    ctx.game.commands.run("away.dismiss", {});
    expect(awayStore.read(ctx)).toBeUndefined();
  });

  test("Continue catches the city up on real time away, capped, and only once per save", () => {
    const ctx = boot();
    cityOf(ctx).set("port.owner", "player");
    const now = 1_000_000_000;
    noteSavedAt(ctx, now - 3 * 60 * 60 * 1000);
    const clock = ctx.time.now();
    const paper = catchUpAway(ctx, now);
    expect(paper?.kind).toBe("away");
    expect(ctx.time.now() - clock).toBeCloseTo(AWAY_CAP_MS / 1000);
    expect(paper?.lines.find((line) => line.label === "Fronts' safe")).toBeDefined();
    expect(catchUpAway(ctx, now + 10_000)).toBeNull();
  });

  test("a reload under a minute later is not time away", () => {
    const ctx = boot();
    const now = 2_000_000_000;
    noteSavedAt(ctx, now - 30_000);
    expect(catchUpAway(ctx, now)).toBeNull();
  });
});
