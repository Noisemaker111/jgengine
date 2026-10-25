import { describe, expect, test } from "bun:test";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { memorySaveBackend } from "@jgengine/core/game/saveStore";
import { game } from "../../game.config";
import { content } from "../content";
import { registerCommands } from "../commands";
import { handrollOf } from "../handroll";
import { PLAYER_SPAWN } from "../world/districts";
import { FARE_ID, FLORIST, GIG_KINDS, GIG_SPOTS, gigBoard, gigSave, gigStore, restoreGigs, tickGigs } from "./gigs";

function boot() {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: "gigs", isNew: true }, save: { backend: memorySaveBackend(), mode: "manual", key: "gigs" } });
  ctx.scene.entity.spawn("street_runner", { id: ctx.player.userId, position: [PLAYER_SPAWN[0], 0, PLAYER_SPAWN[2]], role: "player" });
  registerCommands(ctx);
  ctx.game.commands.run("game.start", {});
  ctx.scene.entity.spawn("car_compact", { id: "gig_cab", position: [PLAYER_SPAWN[0] + 2, 0, PLAYER_SPAWN[2]], role: "prop" });
  handrollOf(ctx).enterVehicle(ctx, "gig_cab");
  return ctx;
}

function driveTo(ctx: ReturnType<typeof boot>, x: number, z: number): void {
  ctx.scene.entity.setPose("gig_cab", { position: [x, ctx.world.groundHeightAt(x, z), z] });
}

const cash = (ctx: ReturnType<typeof boot>) => ctx.game.economy.balance(ctx.player.userId, "cash");

describe("Harbor Heat gigs", () => {
  test("the scene authors the kerbs, the florist and a fare network", () => {
    expect(GIG_SPOTS.filter((s) => s.tags?.includes("fare")).length).toBeGreaterThanOrEqual(12);
    expect(GIG_SPOTS.filter((s) => s.tags?.includes("flowers")).length).toBeGreaterThanOrEqual(6);
    expect(FLORIST?.label).toBe("Boardwalk Blooms");
    expect(GIG_KINDS.find((k) => k.id === "street")?.routes?.length).toBe(4);
  });

  test("a taxi fare end to end: hail, pull up, ride, drop, paid with tip", () => {
    const ctx = boot();
    expect(ctx.game.commands.run("taxiDuty", {}).status).toBe("applied");
    tickGigs(ctx, 0.1);
    const hail = gigStore.read(ctx).offers.find((o) => o.kindId === "taxi")!;
    expect(hail).toBeDefined();
    expect(hail.fare).toBeGreaterThanOrEqual(150);
    expect(hail.fare).toBeLessThanOrEqual(450);
    expect(ctx.scene.entity.get(FARE_ID)).not.toBeNull();

    driveTo(ctx, hail.pickup.x, hail.pickup.z);
    tickGigs(ctx, 0.5);
    expect(gigStore.read(ctx).view?.phase).toBe("pickup");
    tickGigs(ctx, 1.5);
    expect(gigStore.read(ctx).view?.phase).toBe("en-route");
    expect(ctx.scene.entity.get(FARE_ID)).toBeNull();

    const before = cash(ctx);
    const drop = hail.drops[0]!;
    driveTo(ctx, drop.x, drop.z);
    tickGigs(ctx, 10);
    const receipt = gigStore.read(ctx).receipt!;
    expect(receipt).toMatchObject({ outcome: "paid", kindId: "taxi", fare: hail.fare, tip: Math.round(hail.fare * 0.25) });
    expect(cash(ctx) - before).toBe(receipt.total);
    expect(receipt.total).toBeGreaterThan(hail.fare);
  });

  test("a cop chase cuts the tip and leaving the car loses the fare", () => {
    const ctx = boot();
    ctx.game.commands.run("taxiDuty", {});
    tickGigs(ctx, 0.1);
    const hail = gigStore.read(ctx).offers[0]!;
    driveTo(ctx, hail.pickup.x, hail.pickup.z);
    tickGigs(ctx, 0.5);
    tickGigs(ctx, 1.5);
    const rule = GIG_KINDS.find((k) => k.id === "taxi")!.comfortLoss!;
    // Three stars for 3 s costs 36 points of mood; one crash costs 20.
    expect(rule({ dt: 3, speed: 20, facts: { stars: 3 } })).toBe(36);
    expect(rule({ dt: 0.1, speed: 20, facts: { crash: true } })).toBe(20);
    handrollOf(ctx).exitVehicle(ctx, true);
    tickGigs(ctx, 0.1);
    expect(gigStore.read(ctx).receipt).toMatchObject({ outcome: "failed", reason: "left-car", total: 0 });
  });

  test("a flower run loads at the florist and runs three drops", () => {
    const ctx = boot();
    driveTo(ctx, FLORIST!.x, FLORIST!.z);
    expect(ctx.game.commands.run("gigs.flowers", {}).status).toBe("applied");
    tickGigs(ctx, 0.1);
    const job = gigBoard(ctx).job()!;
    expect(job.offer.drops).toHaveLength(3);
    expect(job.phase).toBe("en-route");
    for (const drop of job.offer.drops) {
      driveTo(ctx, drop.x, drop.z);
      tickGigs(ctx, 1);
    }
    expect(gigStore.read(ctx).receipt).toMatchObject({ outcome: "paid", kindId: "flowers" });
  });

  test("a street race takes the stake and a reload keeps the taxi light and the board", () => {
    const ctx = boot();
    ctx.game.economy.grant(ctx.player.userId, "cash", 1000);
    const before = cash(ctx);
    ctx.game.commands.run("gigs.race", {});
    expect(gigBoard(ctx).job()?.offer.kindId).toBe("street");
    expect(before - cash(ctx)).toBe(200);
    ctx.game.commands.run("taxiDuty", {});
    const saved = JSON.parse(JSON.stringify(gigSave(ctx)));
    const copy = boot();
    restoreGigs(copy, saved);
    expect(gigStore.read(copy).duty).toBe(true);
    expect(gigBoard(copy).job()?.offer.kindId).toBe("street");
  });
});
