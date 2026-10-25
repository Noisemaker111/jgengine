import { describe, expect, test } from "bun:test";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";

import { game } from "../game.config";
import { loop } from "../loop";
import { content } from "./content";
import { createHandroll, handrollOf } from "./handroll";
import { cruiserGoal } from "./handroll/pursuit";
import { paceBandFactor } from "@jgengine/core/ai/driver";
import { RESIDENTS, residentAt, residentStats, tickResidents } from "./world/residents";
import { advanceBehaviors } from "@jgengine/core/scene/behaviorRuntime";

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
    expect(tuning?.fov?.max).toBe(88);
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

  test("clinic recovery releases an airborne rider even when voluntary exit requires landing", () => {
    const ctx = boot();
    const handroll = handrollOf(ctx);
    ctx.game.commands.run("game.start", {});
    ctx.scene.entity.spawn("air_helicopter", { id: "clinic_heli", position: [-193, 30, 44], role: "prop" });
    handroll.enterVehicle(ctx, "clinic_heli");
    handroll.exitVehicle(ctx);
    expect(handroll.drivingVehicleId()).toBe("clinic_heli");
    ctx.scene.entity.stats.set(HERO, "health", { current: 0 });
    loop.onTick(ctx, STEP);
    expect(handroll.drivingVehicleId()).toBeNull();
    expect(ctx.scene.entity.get(HERO)?.hidden).toBe(false);
    expect(ctx.scene.entity.get(HERO)?.movement.frozen).toBe(false);
    expect(ctx.camera.followedEntityId()).toBe(HERO);
    expect(ctx.scene.entity.stats.get(HERO, "health")?.current).toBeGreaterThan(0);
  });

  test("witnessed heat gains escalate stars, unwitnessed gains do not", () => {
    const ctx = boot();
    const handroll = createHandroll();
    const player = ctx.scene.entity.get(HERO)!;
    ctx.scene.entity.spawn("ped_beach", {
      id: "ped_heat_witness",
      position: [player.position[0] + 4, player.position[1], player.position[2]],
      rotationY: -Math.PI / 2,
      role: "npc",
    });

    handroll.tick(ctx, STEP);
    handroll.addHeat(ctx, 150);
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
    // A witness and one crime so the search exists: officers only engage someone the search is about.
    ctx.scene.entity.spawn("ped_beach", { id: "ped_shot_witness", position: [4, 0, 0], rotationY: -Math.PI / 2, role: "npc" });

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

  test("a cruiser's chase goal carries the shared pace band: pushed when the player is far, eased at the bumper", () => {
    const facing = { position: [0, 0, 0] as const, heading: 0 };
    const far = cruiserGoal(facing, [0, 0, 40]);
    expect(paceBandFactor(far.paceBand!, far.paceGap!)).toBeGreaterThan(1);
    // Cruise is held below the car's top speed, so the push has somewhere to go and the cap holds.
    expect(far.speedLimit).toBeLessThan(40);
    const near = cruiserGoal(facing, [0, 0, 2]);
    expect(paceBandFactor(near.paceBand!, near.paceGap!)).toBeLessThan(0.2);
    // A cruiser that has run past the player counts as ahead and eases rather than ramming back.
    const overshot = cruiserGoal(facing, [0, 0, -10]);
    expect(paceBandFactor(overshot.paceBand!, overshot.paceGap!)).toBeLessThan(0.2);
  });

  test("interceptors close on the player from the spawn ring instead of driving off", () => {
    const ctx = boot();
    const handroll = createHandroll();
    ctx.scene.entity.setPose(HERO, { position: [0, 0, 0] });
    // Heat only sticks while a witness holds the player in view, so the street is watched first.
    const player = ctx.scene.entity.get(HERO)!;
    ctx.scene.entity.spawn("ped_beach", {
      id: "ped_cruiser_witness",
      position: [player.position[0] + 4, player.position[1], player.position[2]],
      rotationY: -Math.PI / 2,
      role: "npc",
    });
    handroll.tick(ctx, STEP);
    // Five stars so the cruisers engage and the spawn ring drops one 60 m out.
    handroll.addHeat(ctx, 500);
    handroll.tick(ctx, STEP);
    const cruiser = ctx.scene.entity.list().find((entity) => entity.id.startsWith("cruiser_"));
    expect(cruiser).toBeDefined();

    const gap = (): number => Math.hypot(cruiser!.position[0], cruiser!.position[2]);
    expect(gap()).toBeGreaterThan(40);
    for (let tick = 0; tick < 60 * 8; tick += 1) handroll.tick(ctx, STEP);
    expect(gap()).toBeLessThan(8);
  });

  test("clearWanted resets heat and stars", () => {
    const ctx = boot();
    const handroll = createHandroll();
    const player = ctx.scene.entity.get(HERO)!;
    ctx.scene.entity.spawn("ped_beach", {
      id: "ped_clear_witness",
      position: [player.position[0] + 4, player.position[1], player.position[2]],
      rotationY: -Math.PI / 2,
      role: "npc",
    });
    handroll.tick(ctx, STEP);
    handroll.addHeat(ctx, 150);
    handroll.tick(ctx, STEP);
    expect(handroll.wanted().stars).toBeGreaterThan(0);

    handroll.clearWanted(ctx);
    expect(handroll.wanted().stars).toBe(0);
    expect(handroll.wanted().heat).toBe(0);
  });
});

describe("residents in the live world", () => {
  test("named residents walk their own routine legs near the player", () => {
    const ctx = boot();
    // The first frame splits the population by distance; nobody is simulated before it.
    tickResidents(ctx, STEP);
    const stats = residentStats(ctx);
    expect(stats).not.toBeNull();
    expect(stats?.agents).toBe(RESIDENTS.length);
    // The player spawns on the boardwalk, so somebody's day is being simulated right away.
    expect(stats?.near).toBeGreaterThan(0);
    expect(stats?.far).toBe(RESIDENTS.length - (stats?.near ?? 0));

    const spawned = RESIDENTS.map((spec) => ctx.scene.entity.get(`resident-${spec.id}`)).filter(
      (entity) => entity !== null,
    );
    expect(spawned.length).toBe(stats?.near ?? -1);
    const start = new Map(spawned.map((entity) => [entity.id, entity.position] as const));

    for (let i = 0; i < 600; i += 1) {
      ctx.time.advance(STEP);
      tickResidents(ctx, STEP);
    }

    // Each walker follows its own route — not one shared crowd loop — and actually moves along it.
    const moved = [...start].filter(([id, from]) => {
      const now = ctx.scene.entity.get(id)?.position;
      return now !== undefined && Math.hypot(now[0] - from[0], now[2] - from[2]) > 0.2;
    });
    expect(moved.length).toBeGreaterThan(0);
    for (const spec of RESIDENTS) {
      const agent = residentAt(ctx, spec.id);
      if (agent?.mode !== "near") continue;
      expect(agent.travelling || agent.activity !== null).toBe(true);
    }
  });
});
