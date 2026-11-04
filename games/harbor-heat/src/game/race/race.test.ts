import { describe, expect, test } from "bun:test";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { memorySaveBackend } from "@jgengine/core/save/saveStore";
import { game } from "../../game.config";
import { content } from "../content";
import { registerCommands } from "../commands";
import { RIVAL_RACER_ID, raceStore, streetPlayOf } from "../streetPlay";
import { RACE_ROUTES } from "../world/districts";
import { ROUTE_RIVALS, rivalsFor } from "./rivals";

const CAR = "race_car";

function boot(): GameContext {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: "racer", isNew: true }, save: { backend: memorySaveBackend(), mode: "manual", key: "racer" } });
  ctx.scene.entity.spawn("street_runner", { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
  registerCommands(ctx);
  ctx.game.commands.run("game.start", {});
  return ctx;
}

function circuit(id: string) {
  const route = RACE_ROUTES.find((r) => r.id === id);
  if (route === undefined) throw new Error(`no circuit ${id}`);
  return route;
}

/** In a car parked `offset` metres east of a circuit's start line. */
function lineUp(ctx: GameContext, routeId: string, offset = 0): void {
  const start = circuit(routeId).checkpoints.at(-1);
  if (start === undefined) throw new Error("circuit has no start");
  const x = start[0] + offset;
  ctx.scene.entity.spawn("car_compact", { id: CAR, position: [x, ctx.world.groundHeightAt(x, start[1]), start[1]], role: "prop" });
  streetPlayOf(ctx).enterVehicle(ctx, CAR);
}

function driveTo(ctx: GameContext, x: number, z: number): void {
  streetPlayOf(ctx).placeVehicle(ctx, CAR, [x, ctx.world.groundHeightAt(x, z), z], 0);
  streetPlayOf(ctx).tick(ctx, 0.05);
}

describe("Harbor Heat circuit races", () => {
  test("every circuit has its own crew, each in a different car at a different pace", () => {
    for (const route of RACE_ROUTES) {
      const crew = ROUTE_RIVALS[route.id];
      expect(crew?.length).toBeGreaterThanOrEqual(2);
      expect(new Set(crew?.map((r) => r.car)).size).toBe(crew?.length);
      expect(new Set(crew?.map((r) => r.pace)).size).toBe(crew?.length);
    }
    const leads = RACE_ROUTES.map((route) => rivalsFor(route.id)[0]?.name);
    expect(new Set(leads).size).toBe(RACE_ROUTES.length);
  });

  test("a race starts only at that circuit's start line, against that circuit's rival", () => {
    const ctx = boot();
    lineUp(ctx, "race-heights", 40);
    expect(streetPlayOf(ctx).startRace(ctx)).toBe(false);
    expect(raceStore.read(ctx)).toBeUndefined();
    const start = circuit("race-heights").checkpoints.at(-1) ?? [0, 0];
    driveTo(ctx, start[0] + 4, start[1]);
    expect(streetPlayOf(ctx).startRace(ctx)).toBe(true);
    const lead = rivalsFor("race-heights")[0];
    expect(raceStore.read(ctx)).toMatchObject({ routeId: "race-heights", active: true });
    expect(raceStore.read(ctx)?.rival).toContain(lead?.name ?? "?");
    expect(ctx.scene.entity.get(RIVAL_RACER_ID)?.name).toBe(lead?.car ?? "?");
  });

  test("the climb's hilltop gates stand on the hill, so driving the circuit finishes it", () => {
    const ctx = boot();
    lineUp(ctx, "race-heights");
    expect(streetPlayOf(ctx).startRace(ctx)).toBe(true);
    for (const [x, z] of circuit("race-heights").checkpoints) driveTo(ctx, x, z);
    expect(raceStore.read(ctx)).toMatchObject({ finished: true, won: true, forfeit: null });
    expect(ctx.scene.entity.get(RIVAL_RACER_ID)).toBeNull();
  });

  test("getting out of the car forfeits the race", () => {
    const ctx = boot();
    lineUp(ctx, "race-coast");
    expect(streetPlayOf(ctx).startRace(ctx)).toBe(true);
    streetPlayOf(ctx).exitVehicle(ctx, true);
    streetPlayOf(ctx).tick(ctx, 0.05);
    expect(raceStore.read(ctx)).toMatchObject({ finished: true, won: false });
    expect(raceStore.read(ctx)?.forfeit).toContain("left the car");
  });

  test("swapping into another car forfeits the race", () => {
    const ctx = boot();
    lineUp(ctx, "race-harbor");
    expect(streetPlayOf(ctx).startRace(ctx)).toBe(true);
    const at = ctx.scene.entity.get(CAR)?.position ?? [0, 0, 0];
    ctx.scene.entity.spawn("car_sedan", { id: "other_car", position: [at[0] + 3, at[1], at[2]], role: "prop" });
    streetPlayOf(ctx).exitVehicle(ctx, true);
    streetPlayOf(ctx).enterVehicle(ctx, "other_car");
    streetPlayOf(ctx).tick(ctx, 0.05);
    expect(raceStore.read(ctx)).toMatchObject({ finished: true, won: false });
    expect(raceStore.read(ctx)?.forfeit).not.toBeNull();
  });
});
