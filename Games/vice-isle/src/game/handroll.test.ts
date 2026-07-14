import { describe, expect, test } from "bun:test";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";

import { game } from "../game.config";
import { loop } from "../loop";
import { content } from "./content";
import { createHandroll } from "./handroll";

const HERO = "hero-test";
const STEP = 1 / 60;

function boot(): GameContext {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: HERO, isNew: true } });
  loop.onInit(ctx);
  loop.onNewPlayer(ctx);
  return ctx;
}

describe("handroll drivable-vehicle adoption", () => {
  test("entering a vehicle freezes the rider and points the camera at it, exiting reverses both", () => {
    const ctx = boot();
    const handroll = createHandroll();
    ctx.scene.entity.spawn("car_compact", { id: "car_1", position: [10, 0, 10], role: "prop" });

    handroll.enterVehicle(ctx, "car_1");
    expect(handroll.drivingVehicleId()).toBe("car_1");
    expect(ctx.camera.followedEntityId()).toBe("car_1");
    expect(ctx.scene.entity.get(HERO)?.movement.frozen).toBe(true);

    handroll.exitVehicle(ctx);
    expect(handroll.drivingVehicleId()).toBeNull();
    expect(ctx.camera.followedEntityId()).toBe(HERO);
    expect(ctx.scene.entity.get(HERO)?.movement.frozen).toBe(false);
  });

  test("throttle drives the vehicle entity forward over several ticks", () => {
    const ctx = boot();
    const handroll = createHandroll();
    ctx.scene.entity.spawn("car_muscle", { id: "car_2", position: [0, 0, 0], rotationY: 0, role: "prop" });
    handroll.enterVehicle(ctx, "car_2");

    ctx.input.publish(["moveForward"]);
    for (let i = 0; i < 120; i += 1) handroll.tick(ctx, STEP);

    const vehicle = ctx.scene.entity.get("car_2")!;
    expect(Math.hypot(vehicle.position[0], vehicle.position[2])).toBeGreaterThan(5);
    expect(handroll.carSpeedKmh()).toBeGreaterThan(0);
  });

  test("witnessed heat gains escalate stars, unwitnessed gains do not", () => {
    const ctx = boot();
    const handroll = createHandroll();

    handroll.addHeat(ctx, 250);
    handroll.tick(ctx, STEP);
    expect(handroll.wanted().stars).toBe(2);
    expect(handroll.wanted().peakStars).toBe(2);
  });

  test("clearWanted resets heat and stars", () => {
    const ctx = boot();
    const handroll = createHandroll();
    handroll.addHeat(ctx, 150);
    handroll.tick(ctx, STEP);
    expect(handroll.wanted().stars).toBeGreaterThan(0);

    handroll.clearWanted(ctx);
    expect(handroll.wanted().stars).toBe(0);
    expect(handroll.wanted().heat).toBe(0);
  });
});
