import { describe, expect, test } from "bun:test";

import { defineGameDefinition } from "../game/defineGameDefinition";
import { createAssetCatalog } from "../scene/assetCatalog";
import { fittedObjectColliders } from "../scene/colliders";
import { encodeCollisionMesh, type CollisionMeshSource } from "../scene/collisionMesh";
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
    definition: defineGameDefinition({
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

describe("smoothed body-turn", () => {
  const HEAD = Math.PI / 2;

  test("default (turnSpeed unset): body facing snaps to the movement heading", () => {
    const ctx = context(["a"]);
    driveWith(ctx, "a", ["moveForward"], 1, tuning({ ground: FLAT_GROUND }), HEAD);
    expect(ctx.scene.entity.get("a")!.rotationY).toBeCloseTo(HEAD, 5);
  });

  test("turnSpeed set: a single frame rotates at most turnSpeed * dt toward the heading", () => {
    const ctx = context(["a"]);
    driveWith(ctx, "a", ["moveForward"], 1, tuning({ movement: { turnSpeed: 1 }, ground: FLAT_GROUND }), HEAD);
    expect(ctx.scene.entity.get("a")!.rotationY).toBeCloseTo(1 / 60, 4);
  });

  test("turnSpeed set: facing converges on the heading over time without overshoot", () => {
    const ctx = context(["a"]);
    driveWith(ctx, "a", ["moveForward"], 240, tuning({ movement: { turnSpeed: 1 }, ground: FLAT_GROUND }), HEAD);
    expect(ctx.scene.entity.get("a")!.rotationY).toBeCloseTo(HEAD, 4);
  });

  test("turnSpeed set: smoothed facing lags the instant heading mid-turn", () => {
    const smooth = context(["a"]);
    driveWith(smooth, "a", ["moveForward"], 20, tuning({ movement: { turnSpeed: 1 }, ground: FLAT_GROUND }), HEAD);
    const snap = context(["b"]);
    driveWith(snap, "b", ["moveForward"], 20, tuning({ ground: FLAT_GROUND }), HEAD);
    expect(smooth.scene.entity.get("a")!.rotationY).toBeLessThan(snap.scene.entity.get("b")!.rotationY);
    expect(smooth.scene.entity.get("a")!.rotationY).toBeGreaterThan(0);
  });
});

/** Append an axis-aligned box's 8 corners + 12 surface triangles to a soup. */
function pushBox(
  soup: { positions: number[]; indices: number[] },
  min: readonly [number, number, number],
  max: readonly [number, number, number],
): void {
  const base = soup.positions.length / 3;
  for (let corner = 0; corner < 8; corner += 1) {
    soup.positions.push(
      (corner & 1) === 0 ? min[0] : max[0],
      (corner & 2) === 0 ? min[1] : max[1],
      (corner & 4) === 0 ? min[2] : max[2],
    );
  }
  const quads: readonly [number, number, number, number][] = [
    [0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5],
  ];
  for (const [a, b, c, d] of quads) soup.indices.push(base + a, base + b, base + c, base + a, base + c, base + d);
}

/** A 4m-wide archway (pillars x[-2,-1] & x[1,2], full height 0..3; lintel across the top at y[2,3]) with
 * an open 2m central doorway x∈(-1,1) that reaches the floor — the walk-through fixture (wide enough to
 * clear the 0.3m-radius capsule once the pillar faces voxelize). */
function archwaySoup(): CollisionMeshSource {
  const soup = { positions: [] as number[], indices: [] as number[] };
  pushBox(soup, [-2, 0, -0.15], [-1, 3, 0.15]);
  pushBox(soup, [1, 0, -0.15], [2, 3, 0.15]);
  pushBox(soup, [-2, 2, -0.15], [2, 3, 0.15]);
  return soup;
}

const ARCHWAY_DIMS = { footprint: { w: 4, d: 0.3 }, center: { x: 0, z: 0 }, minY: 0, maxY: 3 };

/** Fresh single-player context with the controlled entity relocated to `startX` on the −Z side of a wall. */
function collisionContext(startX: number): GameContext {
  const ctx = context(["a"]);
  ctx.scene.entity.setPose("a", { position: [startX, 0, 0], rotationY: 0, dt: 1 / 60 });
  return ctx;
}

/** Place the archway at world z=+2 and install its fitted (mesh + compound boxes) blocking collider. */
function placeArchway(ctx: GameContext): void {
  const collisionMesh = encodeCollisionMesh(archwaySoup());
  if (collisionMesh === null) throw new Error("archway failed to encode");
  const set = fittedObjectColliders({ dims: ARCHWAY_DIMS, collisionMesh });
  if (set === null) throw new Error("archway failed to fit");
  const id = ctx.scene.object.place("archway", 0, 0, 2);
  ctx.scene.object.setColliders(id, set);
}

const COLLIDE = resolvePlayerMovementTuning({ movement: { collideObjects: true } });

describe("stepPlayerMovement object collision (mesh-accurate)", () => {
  test("a player walks THROUGH the archway opening (heading toward the doorway gap)", () => {
    const ctx = collisionContext(0);
    placeArchway(ctx);
    driveWith(ctx, "a", ["moveForward"], 120, COLLIDE, 0);
    // Feet 0..head 1.8 clears the lintel (y≥2) and the doorway is open, so the player crosses z=2.
    expect(ctx.scene.entity.get("a")!.position[2]).toBeGreaterThan(2);
    expect(Math.abs(ctx.scene.entity.get("a")!.position[0])).toBeLessThan(0.5);
  });

  test("a player is stopped by a pillar 1.5m off-centre — the wall blocks across its true 4m span", () => {
    const ctx = collisionContext(1.5);
    placeArchway(ctx);
    driveWith(ctx, "a", ["moveForward"], 120, COLLIDE, 0);
    // A phantom 1×1 box at the object centre would have let x=1.5 pass; the real pillar stops it short of z=2.
    expect(ctx.scene.entity.get("a")!.position[2]).toBeLessThan(2);
    expect(ctx.scene.entity.get("a")!.position[0]).toBeCloseTo(1.5, 6);
  });

  test("without collideObjects the same off-centre player passes straight through", () => {
    const ctx = collisionContext(1.5);
    placeArchway(ctx);
    driveWith(ctx, "a", ["moveForward"], 120, FLAT, 0);
    expect(ctx.scene.entity.get("a")!.position[2]).toBeGreaterThan(2);
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
