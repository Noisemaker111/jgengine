import { describe, expect, test } from "bun:test";

import { defineGame } from "../game/defineGame";
import { createAssetCatalog } from "../scene/assetCatalog";
import { createGameContext, type GameContext, type GameContextContent } from "../runtime/gameContext";
import type { InputFrame } from "../runtime/inputSnapshot";
import type { TerrainField } from "../world/terrain";
import {
  playerMovementHeading,
  resolvePlayerMovementTuning,
  stepPlayerMovement,
  type PlayerMovementTuning,
} from "./playerMovement";

const CONTENT: GameContextContent = {
  entityById: (catalogId) => (catalogId === "hero" ? { stats: { health: { max: 10 } } } : null),
};

function context(userIds: string[]): GameContext {
  const ctx = createGameContext({
    definition: defineGame({
      name: "Move",
      assets: createAssetCatalog(),
      multiplayer: "off",
      features: { players: true },
    }),
    content: CONTENT,
    player: { userId: userIds[0]!, isNew: true },
  });
  for (const id of userIds) {
    ctx.game.players?.join(id, true);
    ctx.scene.entity.spawn("hero", { id, position: [0, 0, 0] });
  }
  return ctx;
}

const FLAT = resolvePlayerMovementTuning({});

function frame(held: string[]): InputFrame {
  return { held, pointer: null };
}

function drive(ctx: GameContext, userId: string, held: string[], steps: number, heading?: number): void {
  for (let i = 0; i < steps; i++) stepPlayerMovement(ctx, userId, frame(held), 1 / 60, FLAT, heading);
}

describe("stepPlayerMovement", () => {
  test("holding moveForward advances the entity along +Z (heading 0)", () => {
    const ctx = context(["a"]);
    drive(ctx, "a", ["moveForward"], 20, 0);
    const pos = ctx.scene.entity.get("a")!.position;
    expect(pos[2]).toBeGreaterThan(0);
    expect(Math.abs(pos[0])).toBeLessThan(1e-6);
  });

  test("heading rotates the forward direction — heading π/2 moves along +X", () => {
    const ctx = context(["a"]);
    drive(ctx, "a", ["moveForward"], 20, Math.PI / 2);
    const pos = ctx.scene.entity.get("a")!.position;
    expect(pos[0]).toBeGreaterThan(0);
    expect(Math.abs(pos[2])).toBeLessThan(1e-6);
  });

  test("idle input leaves the entity in place", () => {
    const ctx = context(["a"]);
    drive(ctx, "a", [], 20, 0);
    const pos = ctx.scene.entity.get("a")!.position;
    expect(Math.abs(pos[0])).toBeLessThan(1e-6);
    expect(Math.abs(pos[2])).toBeLessThan(1e-6);
  });

  test("with no heading override, turnRight integrates the internal heading", () => {
    const ctx = context(["a"]);
    for (let i = 0; i < 20; i++) stepPlayerMovement(ctx, "a", frame(["turnRight"]), 1 / 60, FLAT);
    expect(playerMovementHeading(ctx, "a")).not.toBeCloseTo(0);
  });

  test("each connected player integrates independently", () => {
    const ctx = context(["a", "b"]);
    for (let i = 0; i < 20; i++) {
      stepPlayerMovement(ctx, "a", frame(["moveForward"]), 1 / 60, FLAT, 0);
      stepPlayerMovement(ctx, "b", frame([]), 1 / 60, FLAT, 0);
    }
    expect(ctx.scene.entity.get("a")!.position[2]).toBeGreaterThan(0);
    expect(ctx.scene.entity.get("b")!.position[2]).toBeCloseTo(0);
  });

  test("a per-player motion impulse lifts that player off the ground", () => {
    const ctx = context(["a"]);
    ctx.player.motionFor("a").impulse(6);
    stepPlayerMovement(ctx, "a", frame([]), 1 / 60, FLAT, 0);
    expect(ctx.scene.entity.get("a")!.position[1]).toBeGreaterThan(0);
  });
});

function tuning(over: Partial<PlayerMovementTuning> & { ground: TerrainField }): PlayerMovementTuning {
  return { hasTerrain: true, ...over };
}

const FLAT_GROUND: TerrainField = { sampleHeight: () => 0, sampleNormal: () => [0, 1, 0] };
const SUBMERGED_GROUND: TerrainField = { sampleHeight: () => -5, sampleNormal: () => [0, 1, 0], waterLevel: 0 };
const ABOVE_WATER_GROUND: TerrainField = { sampleHeight: () => 5, sampleNormal: () => [0, 1, 0], waterLevel: 0 };
const N = Math.sqrt(10);
const STEEP_GROUND: TerrainField = {
  sampleHeight: (x) => -3 * x,
  sampleNormal: () => [3 / N, 1 / N, 0],
};

function driveWith(ctx: GameContext, userId: string, held: string[], steps: number, t: PlayerMovementTuning, heading?: number): void {
  for (let i = 0; i < steps; i++) stepPlayerMovement(ctx, userId, frame(held), 1 / 60, t, heading);
}

describe("swim (heightfield)", () => {
  test("submerged travel is capped below waterLevel and floats at the surface", () => {
    const water = context(["a"]);
    driveWith(water, "a", ["moveForward"], 40, tuning({ movement: { swim: true }, ground: SUBMERGED_GROUND }), Math.PI / 2);
    const wet = water.scene.entity.get("a")!.position;

    const dry = context(["b"]);
    driveWith(dry, "b", ["moveForward"], 40, tuning({ movement: { swim: true }, ground: ABOVE_WATER_GROUND }), Math.PI / 2);
    const land = dry.scene.entity.get("b")!.position;

    expect(wet[1]).toBeCloseTo(0, 6);
    expect(wet[0]).toBeGreaterThan(0);
    expect(wet[0] / land[0]).toBeCloseTo(0.65, 2);
  });

  test("swim unset leaves the player on the (submerged) floor", () => {
    const ctx = context(["a"]);
    driveWith(ctx, "a", [], 5, tuning({ ground: SUBMERGED_GROUND }));
    expect(ctx.scene.entity.get("a")!.position[1]).toBeCloseTo(-5, 6);
  });
});

describe("slope-slide (heightfield)", () => {
  test("off by default: idling on a steep slope does not move the player", () => {
    const ctx = context(["a"]);
    driveWith(ctx, "a", [], 30, tuning({ ground: STEEP_GROUND }));
    expect(ctx.scene.entity.get("a")!.position[0]).toBeCloseTo(0, 6);
  });

  test("enabled: idling on a steep slope slides downhill", () => {
    const ctx = context(["a"]);
    driveWith(ctx, "a", [], 30, tuning({ movement: { slopeSlide: true }, ground: STEEP_GROUND }));
    expect(ctx.scene.entity.get("a")!.position[0]).toBeGreaterThan(0.1);
  });

  test("enabled: flat ground is untouched", () => {
    const ctx = context(["a"]);
    driveWith(ctx, "a", [], 30, tuning({ movement: { slopeSlide: true }, ground: FLAT_GROUND }));
    const pos = ctx.scene.entity.get("a")!.position;
    expect(pos[0]).toBeCloseTo(0, 6);
    expect(pos[2]).toBeCloseTo(0, 6);
  });
});

describe("per-player motion queues", () => {
  test("motionFor isolates each player's pending impulses", () => {
    const ctx = context(["a", "b"]);
    ctx.player.motionFor("a").impulse(3);
    expect(ctx.player.motionFor("b").takePending()).toBeNull();
    expect(ctx.player.motionFor("a").takePending()?.impulses).toEqual([3]);
  });

  test("ctx.player.motion routes to the local player outside a command", () => {
    const ctx = context(["a"]);
    ctx.player.motion.impulse(2);
    expect(ctx.player.motionFor("a").takePending()?.impulses).toEqual([2]);
  });
});
