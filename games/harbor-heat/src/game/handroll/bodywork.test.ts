import { describe, expect, test } from "bun:test";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import type { KinematicVehicleTuning } from "@jgengine/core/world";

import { game } from "../../game.config";
import { loop } from "../../loop";
import { content } from "../content";
import { vehicleById } from "../entities/vehicles/catalog";
import {
  crashVehicle,
  restoreVehicleDamage,
  vehicleDamageReadout,
  vehicleDamageSave,
  VEHICLE_ZONES,
} from "./bodywork";

const HERALD = "bodywork-hero";

function boot(): GameContext {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: HERALD, isNew: true } });
  loop.onInit(ctx);
  loop.onNewPlayer(ctx);
  return ctx;
}

function spawnCar(ctx: GameContext): { id: string; base: KinematicVehicleTuning } {
  const ground = ctx.world.groundHeightAt(10, 10);
  ctx.scene.entity.spawn("car_compact", { id: "car_body", position: [10, ground, 10], role: "prop" });
  return { id: "car_body", base: vehicleById("car_compact")!.dynamics.tuning as KinematicVehicleTuning };
}

describe("harbor-heat vehicle damage", () => {
  test("an un-crashed car keeps the authored tuning and reports no bodywork", () => {
    const ctx = boot();
    const car = spawnCar(ctx);
    expect(vehicleDamageReadout(ctx, car.id)).toBeNull();
    expect(vehicleDamageSave(ctx)).toEqual({});
    // Four authored zones: a blow needs an impulse past the first threshold to move anything.
    expect(VEHICLE_ZONES.map((zone) => zone.id)).toEqual(["front", "rear", "left", "right"]);
    expect(VEHICLE_ZONES.every((zone) => zone.thresholds.length === 3)).toBe(true);
  });

  test("a hard front-end crash dents the front zone, costs grip, and escalates on the next hit", () => {
    const ctx = boot();
    const car = spawnCar(ctx);
    const retunes: KinematicVehicleTuning[] = [];

    const first = crashVehicle(
      ctx,
      car.id,
      car.base,
      { closingSpeed: 20, offsetRight: 0, offsetForward: 1 },
      (next) => retunes.push(next),
    );
    expect(first.map((row) => row.zone)).toEqual(["front"]);
    expect(first[0]!.stage).toBe(1);
    expect(retunes).toHaveLength(1);
    // The re-bake is the shared one: grip and drag move, the authored numbers are not mutated.
    expect(retunes[0]!.gripStrength).toBeLessThan(car.base.gripStrength);
    expect(retunes[0]!.coastDeceleration).toBeGreaterThan(car.base.coastDeceleration ?? 0);
    expect(car.base.gripStrength).toBe(vehicleById("car_compact")!.dynamics.tuning.gripStrength);

    const readout = vehicleDamageReadout(ctx, car.id)!;
    expect(readout.worstStage).toBe(1);
    expect(readout.total).toBeGreaterThan(0);

    // A second hard hit at the same corner steps the same zone again.
    const second = crashVehicle(
      ctx,
      car.id,
      car.base,
      { closingSpeed: 22, offsetRight: 0, offsetForward: 1 },
      (next) => retunes.push(next),
    );
    expect(second[0]!.previousStage).toBe(1);
    expect(second[0]!.stage).toBe(2);
    expect(retunes[1]!.gripStrength).toBeLessThan(retunes[0]!.gripStrength);
    expect(vehicleDamageReadout(ctx, car.id)!.worstStage).toBe(2);
  });

  test("a side impact dents the side the blow came from, and a saved car keeps its stages", () => {
    const ctx = boot();
    const car = spawnCar(ctx);
    crashVehicle(ctx, car.id, car.base, { closingSpeed: 24, offsetRight: 1, offsetForward: 0 }, () => {});
    const saved = vehicleDamageSave(ctx);
    expect(Object.keys(saved)).toEqual(["car_body"]);
    expect(saved.car_body!.zones.find((zone) => zone.id === "right")!.stage).toBeGreaterThan(0);

    const reboot = boot();
    const restored = spawnCar(reboot);
    const retuned: KinematicVehicleTuning[] = [];
    restoreVehicleDamage(
      reboot,
      saved,
      () => restored.base,
      (_id, next) => retuned.push(next),
    );
    expect(vehicleDamageReadout(reboot, restored.id)!.worstStage).toBe(
      vehicleDamageReadout(ctx, car.id)!.worstStage,
    );
    expect(retuned).toHaveLength(1);
  });
});
