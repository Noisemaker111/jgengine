import { describe, expect, test } from "bun:test";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { memorySaveBackend } from "@jgengine/core/game/saveStore";
import { game } from "../../game.config";
import { content } from "../content";
import { registerCommands } from "../commands";
import {
  courierLoop,
  courierRuntime,
  courierStore,
  courierDeadline,
  DELIVERY_ROUTES,
  DISPATCH,
  finishCourier,
  setupCourierLandmarks,
  tickCourier,
} from "./courier";

const THIEF = "parcel_thief";

function boot() {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: "courier-session", isNew: true }, save: { backend: memorySaveBackend(), mode: "manual", key: "courier-session" } });
  ctx.scene.entity.spawn("street_runner", { id: ctx.player.userId, position: [DISPATCH[0], 0, DISPATCH[1]], role: "player" });
  registerCommands(ctx);
  ctx.game.commands.run("game.start", {});
  return ctx;
}

function moveTo(ctx: ReturnType<typeof boot>, position: readonly [number, number]): void {
  ctx.scene.entity.setPose(ctx.player.userId, { position: [position[0], ctx.world.groundHeightAt(position[0], position[1]), position[1]] });
}

/** The session a contract runs: the mission loop opens it, carries the run's bonus and settles it. */
describe("Mainsail courier mission session", () => {
  test("the shared session loop opens the contract, carries the bonus and settles it", () => {
    const ctx = boot();
    const loop = courierLoop(ctx);
    expect(loop.kind()).toBe("mission");
    expect(loop.phase()).toBe("idle");

    ctx.game.commands.run("courier.accept", {});
    expect(loop.phase()).toBe("open");
    expect(loop.snapshot()).toMatchObject({ session: 1, closed: 0, carried: 0 });
    // The HUD store republishes the loop's phase; it is not its own authority.
    expect(courierStore.read(ctx).phase).toBe("running");

    const route = DELIVERY_ROUTES[0];
    moveTo(ctx, route.position);
    tickCourier(ctx, 5);
    ctx.game.commands.run("courier.deliver", {});
    const thief = ctx.scene.entity.get(THIEF);
    ctx.scene.entity.setPose(ctx.player.userId, { position: [...thief!.position] });
    tickCourier(ctx, 0.1);

    // The same numbers the contract always paid: the contract's payout plus the time bonus.
    const remaining = Math.max(0, courierStore.read(ctx).remaining);
    const bonus = Math.floor(remaining * 2);
    const receipt = courierStore.read(ctx).receipt!;
    expect(receipt.won).toBe(true);
    expect(receipt.reward).toBe(route.payout + bonus);
    expect(loop.phase()).toBe("closed");
    expect(loop.snapshot()).toMatchObject({ session: 1, closed: 1, carried: 0 });
    expect(courierStore.read(ctx).delivered).toBe(1);
  });

  test("a missed deadline closes the session and loses what it carried", () => {
    const ctx = boot();
    const loop = courierLoop(ctx);
    ctx.game.commands.run("courier.accept", {});
    expect(loop.phase()).toBe("open");
    tickCourier(ctx, DELIVERY_ROUTES[0].seconds + 1);
    expect(loop.phase()).toBe("closed");
    expect(loop.snapshot().closed).toBe(1);
    // A failed contract banks nothing and does not advance the route rotation.
    expect(courierStore.read(ctx).receipt).toMatchObject({ won: false, reward: 0 });
    expect(courierStore.read(ctx).delivered).toBe(0);
  });

  test("the loop's own probe reports the live session", () => {
    const ctx = boot();
    ctx.game.commands.run("courier.accept", {});
    const probe = (globalThis as { __jgengineRun?: { read(): { session: number; phase: string; kind: string | null; carried: number; closed: number; offered: string | null } } }).__jgengineRun;
    expect(probe).toBeDefined();
    expect(probe!.read()).toEqual({ session: 1, phase: "open", kind: "mission", carried: 0, closed: 0, offered: null });
    finishCourier(ctx, false, "test boundary");
    expect(probe!.read()).toMatchObject({ session: 1, phase: "closed", closed: 1 });
  });
});
