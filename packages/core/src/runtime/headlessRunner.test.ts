import { describe, expect, test } from "bun:test";

import { defineGameDefinition } from "../game/defineGame";
import { environment, grass, terrain } from "../world/features";
import { summarizeEnvironment } from "../world/environmentSummary";
import { offline } from "./adapter";
import type { GameContext } from "./gameContext";
import type { GameContextContent } from "./gameContext";
import { createHeadlessRunner } from "./headlessRunner";

const MOVE_SPEED = 4;

const content: GameContextContent = {
  entityById: (id) =>
    id === "hero"
      ? { role: "player", movement: { walkSpeed: MOVE_SPEED }, stats: { health: { max: 100, min: 0 } } }
      : null,
};

function heroGame() {
  return defineGameDefinition({
    name: "Headless Hero",
    multiplayer: offline(),
    world: environment({ terrain: terrain(), vegetation: grass({ density: 0.4 }) }),
    loop: {
      onNewPlayer(ctx: GameContext) {
        ctx.scene.entity.spawn("hero", { id: ctx.player.userId, position: [0, 0, 0] });
      },
      onTick(ctx: GameContext, dt: number) {
        const hero = ctx.scene.entity.get(ctx.player.userId);
        if (hero === null) return;
        let [x, y, z] = hero.position;
        if (ctx.input.isDown("moveRight")) x += MOVE_SPEED * dt;
        if (ctx.input.isDown("moveLeft")) x -= MOVE_SPEED * dt;
        if (ctx.input.justPressed("jump")) y += 1;
        ctx.scene.entity.setPose(ctx.player.userId, { position: [x, y, z] });
      },
    },
  });
}

function boot() {
  const game = heroGame();
  const runner = createHeadlessRunner({
    definition: game,
    content,
    loop: game.loop,
    player: { userId: "p1", isNew: true },
  });
  return { game, runner };
}

describe("createHeadlessRunner", () => {
  test("runs a real game loop with no renderer in scope", () => {
    // Booting and ticking must not require a DOM/WebGL surface — this file imports no React/three.
    expect(typeof globalThis.document).toBe("undefined");
    const { runner } = boot();
    expect(runner.ctx.scene.entity.get("p1")).not.toBeNull();
  });

  test("input in changes the world snapshot out", () => {
    const { runner } = boot();
    const startX = runner.ctx.scene.entity.get("p1")!.position[0];

    // No input held: snapshot must not drift.
    runner.step(0.05, { held: [] });
    expect(runner.ctx.scene.entity.get("p1")!.position[0]).toBe(startX);

    // Hold moveRight across several steps: hero slides +x.
    for (let i = 0; i < 10; i += 1) runner.step(0.05, { held: ["moveRight"] });
    const movedX = runner.ctx.scene.entity.get("p1")!.position[0];
    expect(movedX).toBeGreaterThan(startX);

    // Release and hold moveLeft: hero reverses.
    for (let i = 0; i < 5; i += 1) runner.step(0.05, { held: ["moveLeft"] });
    expect(runner.ctx.scene.entity.get("p1")!.position[0]).toBeLessThan(movedX);
  });

  test("edge detection fires once across steps", () => {
    const { runner } = boot();
    const startY = runner.ctx.scene.entity.get("p1")!.position[1];
    // Hold jump for three steps: justPressed only on the first.
    runner.step(0.05, { held: ["jump"] });
    runner.step(0.05, { held: ["jump"] });
    runner.step(0.05, { held: ["jump"] });
    expect(runner.ctx.scene.entity.get("p1")!.position[1]).toBe(startY + 1);
  });

  test("clamps a long stall to maxStepSeconds", () => {
    const { runner } = boot();
    const gameDt = runner.step(10, { held: [] });
    expect(gameDt).toBeLessThanOrEqual(0.05);
  });

  test("the game's world scene populates headlessly", () => {
    const { game } = boot();
    expect(game.world?.kind).toBe("environment");
    if (game.world?.kind === "environment") {
      expect(summarizeEnvironment(game.world).isEmpty).toBe(false);
    }
  });

  test("publishInput pre-seeds the held set before the first step", () => {
    const { runner } = boot();
    runner.publishInput({ held: ["moveRight"] });
    expect(runner.input.isDown("moveRight")).toBe(true);
    // A step with no input keeps the pre-seeded set, so the hero still moves.
    const startX = runner.ctx.scene.entity.get("p1")!.position[0];
    runner.step(0.05);
    expect(runner.ctx.scene.entity.get("p1")!.position[0]).toBeGreaterThan(startX);
  });
});
