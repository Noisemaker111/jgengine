import { describe, expect, test } from "bun:test";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { gamePhase } from "@jgengine/core/game/gamePhase";
import { memorySaveBackend } from "@jgengine/core/save/saveStore";
import { game } from "../../game.config";
import { loop, normalizeAfterRestore } from "../../loop";
import { content } from "../content";
import { registerCommands, startedStore } from "../commands";
import { streetPlayOf } from "../streetPlay";
import {
  cargoCondition,
  courierRuntime,
  courierSettlement,
  courierStore,
  courierMissionId,
  courierMissionStore,
  DELIVERY_ROUTES,
  DISPATCH,
  setupCourierLandmarks,
  tickCourier,
} from "./courier";

const THIEF = "parcel_thief";

function boot(backend = memorySaveBackend()) {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: "courier-test", isNew: true }, save: { backend, mode: "manual", key: "courier-test" } });
  ctx.scene.entity.spawn("street_runner", { id: ctx.player.userId, position: [DISPATCH[0], 0, DISPATCH[1]], role: "player" });
  registerCommands(ctx);
  ctx.game.commands.run("game.start", {});
  return ctx;
}

function moveTo(ctx: ReturnType<typeof boot>, position: readonly [number, number]): void {
  ctx.scene.entity.setPose(ctx.player.userId, { position: [position[0], ctx.world.groundHeightAt(position[0], position[1]), position[1]] });
}

/** Into a ground car parked at the booth: what an express parcel needs. */
function driveUp(ctx: ReturnType<typeof boot>): void {
  ctx.scene.entity.spawn("car_compact", { id: "courier_car", position: [DISPATCH[0] + 2, ctx.world.groundHeightAt(DISPATCH[0] + 2, DISPATCH[1]), DISPATCH[1]], role: "prop" });
  streetPlayOf(ctx).enterVehicle(ctx, "courier_car");
}

describe("Mainsail courier contract", () => {
  test("rush requires a lesson, a ground car and a bond; a missed deadline fails the contract", () => {
    const ctx = boot();
    ctx.game.commands.run("courier.accept", { service: "rush" });
    expect(courierStore.read(ctx).phase).toBe("idle");
    courierStore.write(ctx, { ...courierStore.read(ctx), delivered: 1 });
    ctx.game.economy.grant(ctx.player.userId, "cash", 100);
    // On foot, express is refused and nothing is charged.
    const onFoot = ctx.game.economy.balance(ctx.player.userId, "cash");
    expect(ctx.game.commands.run("courier.accept", { service: "rush" }).status).toBe("rejected");
    expect(courierStore.read(ctx).phase).toBe("idle");
    expect(ctx.game.economy.balance(ctx.player.userId, "cash")).toBe(onFoot);
    ctx.game.economy.charge(ctx.player.userId, "cash", 100);
    driveUp(ctx);
    ctx.game.commands.run("courier.accept", { service: "rush" });
    expect(courierStore.read(ctx).phase).toBe("idle");
    ctx.game.economy.grant(ctx.player.userId, "cash", 100);
    const before = ctx.game.economy.balance(ctx.player.userId, "cash");
    ctx.game.commands.run("courier.accept", { service: "rush" });
    expect(ctx.game.economy.balance(ctx.player.userId, "cash")).toBe(before - 60);
    expect(courierStore.read(ctx).remaining).toBe(34);

    tickCourier(ctx, 35);
    expect(courierStore.read(ctx).phase).toBe("lost");
    const state = courierRuntime(ctx).state()!;
    expect(state.status).toBe("failed");
    expect(state.outcome).toBe("cargo_late_rush");
    expect(ctx.game.economy.balance(ctx.player.userId, "cash")).toBe(before - 60);

    ctx.game.commands.run("courier.dismiss", {});
    ctx.game.commands.run("courier.accept", {});
    expect(courierStore.read(ctx).service).toBe("standard");
  });

  test("careful versus reckless cargo value differs, and a standard box takes half the knocks", () => {
    expect(cargoCondition(100, 10, 35, 0)).toBe(100);
    expect(cargoCondition(100, 10, 65, 0)).toBe(64);
    expect(cargoCondition(100, 10, 35, 20)).toBe(60);
    expect(cargoCondition(100, 10, 65, 0, 0.5)).toBe(82);
  });

  test("the receipt itemizes the run: on time, damage claim, premium and bond", () => {
    expect(courierSettlement({ payout: 250, rush: false, won: true, handoff: 30, condition: 60 })).toEqual({
      lines: [{ label: "Contract", amount: 250 }, { label: "On time", amount: 60 }, { label: "Cargo damage", amount: -50 }],
      carried: 60,
      claim: 50,
    });
    expect(courierSettlement({ payout: 250, rush: true, won: true, handoff: 10, condition: 50 })).toEqual({
      lines: [{ label: "Contract", amount: 250 }, { label: "On time", amount: 20 }, { label: "Fragile premium", amount: 100 }, { label: "Bond paid", amount: -60 }, { label: "Bond returned", amount: 30 }],
      carried: 150,
      claim: 0,
    });
    expect(courierSettlement({ payout: 250, rush: true, won: false, handoff: 0, condition: 100 }).lines).toEqual([{ label: "Bond forfeited", amount: -60 }]);
  });

  test("a rough standard run pays less: the damage claim comes off the settlement", () => {
    const ctx = boot();
    ctx.game.commands.run("courier.accept", {});
    const cash = ctx.game.economy.balance(ctx.player.userId, "cash");
    const route = DELIVERY_ROUTES[0];
    moveTo(ctx, route.position);
    tickCourier(ctx, 5);
    // The parcel arrives at 40%: the client claims back 30% of the payout.
    courierStore.write(ctx, { ...courierStore.read(ctx), condition: 40 });
    ctx.game.commands.run("courier.deliver", {});
    const thief = ctx.scene.entity.get(THIEF);
    ctx.scene.entity.setPose(ctx.player.userId, { position: [...thief!.position] });
    tickCourier(ctx, 0.1);
    const receipt = courierStore.read(ctx).receipt!;
    expect(receipt.won).toBe(true);
    const claim = receipt.lines.find((line) => line.label === "Cargo damage");
    expect(claim?.amount).toBe(-Math.floor(route.payout * (1 - courierStore.read(ctx).condition! / 100) * 0.5));
    expect(claim!.amount).toBeLessThan(-70);
    const paid = ctx.game.economy.balance(ctx.player.userId, "cash") - cash;
    expect(paid).toBe(receipt.reward);
    expect(paid).toBe(receipt.lines.reduce((sum, line) => sum + line.amount, 0));
  });

  test("the runner wears the parcel down for every second they have it", () => {
    const ctx = boot();
    ctx.game.commands.run("courier.accept", {});
    moveTo(ctx, DELIVERY_ROUTES[0].position);
    tickCourier(ctx, 1);
    ctx.game.commands.run("courier.deliver", {});
    const before = courierStore.read(ctx).condition!;
    // Stand still while the runner holds it: no driving wear, only theirs.
    for (let i = 0; i < 4; i += 1) tickCourier(ctx, 1);
    expect(courierRuntime(ctx).view()?.objectiveId).toBe("recover");
    expect(courierStore.read(ctx).condition).toBeCloseTo(before - 6, 5);
  });

  test("the drop must be real, the runner must be caught, and the route pays once", () => {
    const ctx = boot();
    ctx.game.commands.run("courier.accept", {});
    const cash = ctx.game.economy.balance(ctx.player.userId, "cash");
    ctx.game.commands.run("courier.deliver", {});
    expect(courierStore.read(ctx).phase).toBe("running");

    const route = DELIVERY_ROUTES[0];
    moveTo(ctx, route.position);
    tickCourier(ctx, 5);
    ctx.game.commands.run("courier.deliver", {});
    expect(courierRuntime(ctx).view()?.objectiveId).toBe("recover");
    const thief = ctx.scene.entity.get(THIEF);
    expect(thief).not.toBeNull();

    ctx.scene.entity.setPose(ctx.player.userId, { position: [...thief!.position] });
    tickCourier(ctx, 0.1);
    expect(courierStore.read(ctx).phase).toBe("won");
    const state = courierRuntime(ctx).state()!;
    expect(state.status).toBe("completed");
    const paid = ctx.game.economy.balance(ctx.player.userId, "cash") - cash;
    // The on-time bonus pays on the delivery clock at the handover (65 s less the 5 s drive), not the runner's timer.
    expect(courierStore.read(ctx).handoff).toBe(60);
    expect(paid).toBe(route.payout + 120);
    // The receipt must show the whole payout, not just the bonus granted on top of the contract.
    expect(courierStore.read(ctx).receipt?.reward).toBe(paid);

    tickCourier(ctx, 1);
    ctx.game.commands.run("courier.deliver", {});
    expect(ctx.game.economy.balance(ctx.player.userId, "cash") - cash).toBe(paid);
    expect(gamePhase(ctx)).toBe("paused");
  });

  test("a runner shot dead loses the parcel", () => {
    const ctx = boot();
    ctx.game.commands.run("courier.accept", {});
    const route = DELIVERY_ROUTES[0];
    moveTo(ctx, route.position);
    tickCourier(ctx, 1);
    ctx.game.commands.run("courier.deliver", {});
    ctx.scene.entity.despawn(THIEF);
    tickCourier(ctx, 0.1);
    expect(courierStore.read(ctx).phase).toBe("lost");
    expect(courierRuntime(ctx).state()?.outcome).toBe("cargo_lost");
  });

  test("settings cannot unpause a manual pause; the delivery clock holds", () => {
    const ctx = boot();
    ctx.game.commands.run("courier.accept", {});
    ctx.game.commands.run("session.pause", { paused: true });
    ctx.game.commands.run("session.settings", { open: true });
    ctx.game.commands.run("session.settings", { open: false });
    expect(ctx.time.isPaused()).toBe(true);
    loop.onTick(ctx, 10);
    expect(courierStore.read(ctx).remaining).toBe(65);
    ctx.game.commands.run("session.pause", { paused: false });
    const cash = ctx.game.economy.balance(ctx.player.userId, "cash");
    tickCourier(ctx, 70);
    expect(courierStore.read(ctx).phase).toBe("lost");
    expect(ctx.game.economy.balance(ctx.player.userId, "cash")).toBe(cash);
  });

  test("reload preserves an in-flight parcel, its objective and its clock", async () => {
    const backend = memorySaveBackend();
    const ctx = boot(backend);
    setupCourierLandmarks(ctx);
    ctx.game.commands.run("courier.accept", {});
    expect(courierMissionStore.read(ctx)?.state?.missionId).toBe(courierMissionId(0, false));
    tickCourier(ctx, 10);
    await ctx.game.save!.save();
    const restored = boot(backend);
    startedStore.clear(restored);
    expect(await restored.game.save!.load()).toBe(true);
    normalizeAfterRestore(restored, false);
    setupCourierLandmarks(restored);
    expect(courierStore.read(restored).phase).toBe("running");
    expect(courierRuntime(restored).state()?.missionId).toBe(courierMissionId(0, false));
    expect(courierRuntime(restored).view()?.objectiveId).toBe("deliver");
    expect(courierStore.read(restored).remaining).toBe(55);
    expect(restored.scene.object.list().filter((object) => object.catalogId.startsWith("obj_delivery_") || object.catalogId === "obj_dispatch")).toHaveLength(4);
    expect(restored.time.isPaused()).toBe(true);
    restored.game.commands.run("game.start", {});
    expect(restored.time.isPaused()).toBe(false);
  });
});
