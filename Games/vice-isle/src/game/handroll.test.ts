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
  test("entering a vehicle freezes+hides the rider, follows it, and overlays the drive camera; exiting reverses all (#1299)", () => {
    const ctx = boot();
    const handroll = createHandroll();
    ctx.scene.entity.spawn("car_compact", { id: "car_1", position: [10, 0, 10], role: "prop" });

    handroll.enterVehicle(ctx, "car_1");
    expect(handroll.drivingVehicleId()).toBe("car_1");
    expect(ctx.camera.followedEntityId()).toBe("car_1");
    expect(ctx.scene.entity.get(HERO)?.movement.frozen).toBe(true);
    // The seated rider stops rendering — its model otherwise pokes through the car body.
    expect(ctx.scene.entity.get(HERO)?.hidden).toBe(true);
    // Speed→FOV, bank, lead, drift-lag are a driving-only overlay, never the on-foot baseline.
    const tuning = ctx.camera.chaseTuning();
    expect(tuning).not.toBeNull();
    expect(tuning?.fov?.max).toBe(86);
    expect(tuning?.bank?.perYawRate).toBeGreaterThan(0);

    handroll.exitVehicle(ctx);
    expect(handroll.drivingVehicleId()).toBeNull();
    expect(ctx.camera.followedEntityId()).toBe(HERO);
    expect(ctx.scene.entity.get(HERO)?.movement.frozen).toBe(false);
    expect(ctx.scene.entity.get(HERO)?.hidden).toBe(false);
    expect(ctx.camera.chaseTuning()).toBeNull();
  });

  test("the static on-foot chase config carries no speed-reactive lens or roll (#1299)", () => {
    const chase = game.camera?.chase;
    expect(chase).toBeDefined();
    expect(chase?.fov?.speedForMax).toBe(0);
    expect(chase?.bank).toBeUndefined();
    expect(chase?.lead).toBeUndefined();
    expect(chase?.shakePerSpeed).toBeUndefined();
    expect(chase?.velocityYaw).toBeUndefined();
  });

  test("throttle drives the vehicle entity forward over several ticks", () => {
    const ctx = boot();
    const handroll = createHandroll();
    // Spawn on an open avenue — origin is buried under downtown lots and the obstacle clamp pins the car.
    ctx.scene.entity.spawn("car_muscle", { id: "car_2", position: [-180, 0, 40], rotationY: 0, role: "prop" });
    handroll.enterVehicle(ctx, "car_2");

    ctx.input.publish(["moveForward"]);
    for (let i = 0; i < 120; i += 1) handroll.tick(ctx, STEP);

    const vehicle = ctx.scene.entity.get("car_2")!;
    const moved = Math.hypot(vehicle.position[0] - -180, vehicle.position[2] - 40);
    expect(moved).toBeGreaterThan(5);
    expect(handroll.carSpeedKmh()).toBeGreaterThan(0);
  });

  test("helicopter collective lifts the aircraft and publishes flight telemetry", () => {
    const ctx = boot();
    const handroll = createHandroll();
    ctx.scene.entity.spawn("air_helicopter", { id: "heli_1", position: [0, 1, 0], role: "prop" });
    handroll.enterVehicle(ctx, "heli_1");

    ctx.input.publish(["flightThrottleUp", "moveForward"]);
    for (let i = 0; i < 300; i += 1) handroll.tick(ctx, STEP);

    const helicopter = ctx.scene.entity.get("heli_1")!;
    expect(helicopter.position[1]).toBeGreaterThan(3);
    expect(Math.abs(helicopter.position[2])).toBeGreaterThan(1);
    expect(handroll.telemetry().mode).toBe("aircraft");
    expect(handroll.telemetry().altitude).toBeGreaterThan(2);
  });

  test("witnessed heat gains escalate stars, unwitnessed gains do not", () => {
    const ctx = boot();
    const handroll = createHandroll();

    handroll.addHeat(ctx, 250);
    handroll.tick(ctx, STEP);
    expect(handroll.wanted().stars).toBe(2);
    expect(handroll.wanted().peakStars).toBe(2);
  });

  test("a cop in range and line of sight shoots on its wall-clock cadence via the pursuit primitive", () => {
    const ctx = boot();
    const handroll = createHandroll();
    // Deterministic line of sight so the shot gate depends only on range + cooldown.
    ctx.scene.entity.hasLineOfSight = () => true;
    ctx.scene.entity.setPose(HERO, { position: [0, 0, 0] });
    ctx.scene.entity.spawn("cop_patrol", { id: "cop_x", position: [1.5, 0, 0], role: "npc" });

    // Count only the damage this cop deals to the player.
    const realEffect = ctx.scene.entity.effect.bind(ctx.scene.entity);
    let shots = 0;
    ctx.scene.entity.effect = (opts: Parameters<typeof realEffect>[0]) => {
      if (opts.from === "cop_x" && opts.to === HERO && opts.effect === "damage") shots += 1;
      return realEffect(opts);
    };

    handroll.addHeat(ctx, 150); // one star, so cops engage
    // cop_patrol fires every 1.2s; over 2.5s expect shots at t≈0, 1.2, 2.4.
    for (let i = 0; i < 150; i += 1) handroll.tick(ctx, STEP);
    expect(shots).toBe(3);
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
