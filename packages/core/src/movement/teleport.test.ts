import { expect, test } from "bun:test";

import { defineGameDefinition } from "../game/defineGame";
import { DEFAULT_WALK_CODES } from "../input/actionBindings";
import { createHeadlessRunner } from "../runtime/headlessRunner";
import { ridingOf } from "../scene/riding";
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

test("a teleport while riding moves the mount, the rider comes along, and walking carries on from there", () => {
  const game = runner();
  expect(ridingOf(game.ctx).ride(game.userId, "raptor", [0, 1, 0]).ok).toBe(true);
  game.step(0.1, { held: ["moveForward"] });

  expect(teleportPlayer(game.ctx, game.userId, { x: 200, z: -40, yaw: Math.PI / 2 })).toBe("raptor");
  game.step(0.05, { held: [] });
  const mount = game.ctx.scene.entity.get("raptor")!.position;
  const rider = game.ctx.scene.entity.get(game.userId)!.position;
  expect(mount[0]).toBeCloseTo(200, 3);
  expect(mount[2]).toBeCloseTo(-40, 3);
  expect(Math.hypot(rider[0] - 200, rider[2] + 40)).toBeLessThan(0.01);

  // The camera turned with the teleport, so forward now walks along +X from the new spot.
  game.step(0.5, { held: ["moveForward"] });
  const walked = game.ctx.scene.entity.get("raptor")!.position;
  expect(walked[0]).toBeGreaterThan(201);
  expect(Math.abs(walked[2] + 40)).toBeLessThan(0.05);
});

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
