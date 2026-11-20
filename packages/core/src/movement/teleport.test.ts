import { expect, test } from "bun:test";

import { defineGameDefinition } from "../game/defineGame";
import { DEFAULT_WALK_CODES } from "../input/actionBindings";
import { createHeadlessRunner } from "../runtime/headlessRunner";
import { environment, terrain } from "../world/features";
import { teleportPlayer } from "./teleport";

function runner() {
  const definition = defineGameDefinition({ name: "Teleport", world: environment({ terrain: terrain() }), input: { ...DEFAULT_WALK_CODES } });
  return createHeadlessRunner({
    definition,
    content: { entityById: () => ({ movement: { walkSpeed: 4 } }) },
    loop: {
      onNewPlayer(ctx) {
        ctx.scene.entity.spawn("hero", { id: ctx.player.userId, position: [0, 0, 0] });
        ctx.scene.entity.spawn("raptor", { id: "raptor", position: [3, 0, 0] });
      },
    },
  });
}

test("a teleport on foot keeps no carried velocity and turns the walk heading", () => {
  const game = runner();
  game.step(0.5, { held: ["moveForward"] });
  teleportPlayer(game.ctx, game.userId, { x: -10, z: 10, yaw: Math.PI });
  game.step(0.05, { held: [] });
  const stood = game.ctx.scene.entity.get(game.userId)!.position;
  expect(Math.hypot(stood[0] + 10, stood[2] - 10)).toBeLessThan(0.01);
  expect(game.look.heading).toBeCloseTo(Math.PI, 6);
  game.step(0.5, { held: ["moveForward"] });
  expect(game.ctx.scene.entity.get(game.userId)!.position[2]).toBeLessThan(9);
});

test("a teleport refuses a coordinate that is not a number", () => {
  const game = runner();
  expect(() => teleportPlayer(game.ctx, game.userId, { x: Number.NaN, z: 0 })).toThrow(/finite/);
});

/** A car the game drives itself: its sim owns the pose and the racers bind puts it on the body every tick (#3095). */
function selfDrivingRunner(acceptTeleports: boolean) {
  const definition = defineGameDefinition({ name: "Self-driving", world: environment({ terrain: terrain() }), input: { ...DEFAULT_WALK_CODES } });
  const car = { x: 0, z: 0, heading: 0 };
  const game = createHeadlessRunner({
    definition,
    content: { entityById: () => ({}) },
    playerMovement: false,
    loop: {
      onInit(ctx) {
        if (!acceptTeleports) return;
        ctx.scene.entity.bind("racers").onTeleport((_id, placement) => {
          car.x = placement.position[0];
          car.z = placement.position[2];
          car.heading = placement.rotationY ?? car.heading;
          return true;
        });
      },
      onNewPlayer(ctx) {
        ctx.scene.entity.bind("racers").sync([{ id: ctx.player.userId, kind: "car", position: [car.x, 0, car.z], rotationY: car.heading }]);
      },
      onTick(ctx, dt) {
        car.z += 10 * dt;
        ctx.scene.entity.bind("racers").sync([{ id: ctx.player.userId, kind: "car", position: [car.x, 0, car.z], rotationY: car.heading }], dt);
      },
    },
  });
  return { game, car };
}

test("a teleport of a body a game sim poses moves the sim, so it stays where it was put", () => {
  const { game } = selfDrivingRunner(true);
  game.step(1, { held: [] });
  expect(teleportPlayer(game.ctx, game.userId, { x: 50, z: 127, yaw: 0.5 })).toEqual({ ok: true, entity: game.userId });
  game.step(0.1, { held: [] });
  const at = game.ctx.scene.entity.get(game.userId)!;
  expect(at.position[0]).toBeCloseTo(50, 6);
  // Drove on from the new spot, not from the old one.
  expect(at.position[2]).toBeCloseTo(128, 6);
  expect(at.rotationY).toBeCloseTo(0.5, 6);
});

test("a teleport of a body a game sim poses with no teleport handler answers not ok and moves nothing", () => {
  const { game } = selfDrivingRunner(false);
  game.step(1, { held: [] });
  const before = [...game.ctx.scene.entity.get(game.userId)!.position];
  const moved = teleportPlayer(game.ctx, game.userId, { x: 50, z: 127, yaw: 0.5 });
  expect(moved.ok).toBe(false);
  if (!moved.ok) expect(moved.error).toMatch(/onTeleport/);
  expect(game.ctx.scene.entity.get(game.userId)!.position).toEqual(before);
  expect(game.ctx.camera.takeTurnTo()).toBeNull();
});
