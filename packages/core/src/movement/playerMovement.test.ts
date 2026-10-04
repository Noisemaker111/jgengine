import { describe, expect, test } from "bun:test";

import { defineGameDefinition } from "../game/defineGame";
import { createPhysicsWorldBackend } from "../physics/physicsWorldBackend";
import { createAssetCatalog } from "../scene/assetCatalog";
import { fittedObjectColliders } from "../scene/colliders";
import { encodeCollisionMesh, type CollisionMeshSource } from "../scene/collisionMesh";
import { createGameContext, type GameContext, type GameContextContent } from "../runtime/gameContext";
import type { InputFrame } from "../runtime/inputSnapshot";
import type { TerrainField } from "../world/terrain";
import {
  playerMovementHeading,
  playerMovementTelemetry,
  forgetPlayerMovement,
  resolvePlayerMovementTuning,
  restorePlayerMovement,
  snapshotPlayerMovement,
  stepPlayerMovement,
  type PlayerMovementTuning,
} from "./playerMovement";
import { DEFAULT_OBSTACLE_PLAYER_HEIGHT } from "./movementModel";

const CONTENT: GameContextContent = {
  entityById: (catalogId) => (catalogId === "hero" ? { stats: { health: { max: 10 } } } : null),
};

function context(userIds: string[], content: GameContextContent = CONTENT): GameContext {
  const ctx = createGameContext({
    definition: defineGameDefinition({
      name: "Move",
      assets: createAssetCatalog(),
      multiplayer: "off",
      features: { players: true },
    }),
    content,
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

describe("heightfield climb-grade policy", () => {
  test("a rejected ascent keeps feet on the accepted ground", () => {
    const ctx = context(["a"]);
    const ground: TerrainField = { sampleHeight: (_x, z) => 2 * z, sampleNormal: () => [0, 1, 0] };
    const movement = { maxClimbGrade: 0.85 };
    driveWith(ctx, "a", ["moveForward"], 10, tuning({ ground, movement }), 0);
    const position = ctx.scene.entity.get("a")!.position;
    expect(position[2]).toBe(0);
    expect(position[1]).toBe(ground.sampleHeight(position[0], position[2]));
  });

  test("grade sampling can preserve raw terrain policy while feet follow effective ground", () => {
    const ctx = context(["a"]);
    const ground: TerrainField = { sampleHeight: () => 0.24, sampleNormal: () => [0, 1, 0] };
    const movement = { maxClimbGrade: 0.85, climbGradeHeight: (_x: number, z: number) => 2 * z };
    driveWith(ctx, "a", ["moveForward"], 10, tuning({ ground, movement }), 0);
    expect(ctx.scene.entity.get("a")!.position).toEqual([0, 0.24, 0]);
  });

  test("rejected airborne travel preserves the jump arc instead of raising feet to the rejected slope", () => {
    const hill = context(["hill"]);
    const flat = context(["flat"]);
    const ground: TerrainField = { sampleHeight: (_x, z) => 2 * z, sampleNormal: () => [0, 1, 0] };
    driveWith(hill, "hill", ["moveForward", "jump"], 10, tuning({ ground, movement: { maxClimbGrade: 0.85 } }), 0);
    driveWith(flat, "flat", ["jump"], 10, tuning({ ground: FLAT_GROUND }), 0);
    const position = hill.scene.entity.get("hill")!.position;
    expect(position[2]).toBe(0);
    expect(position[1]).toBeGreaterThan(0);
    expect(position[1]).toBeCloseTo(flat.scene.entity.get("flat")!.position[1], 8);
    expect(playerMovementTelemetry(hill, "hill")?.grounded).toBe(false);
  });

  test("omitted policy preserves existing ascent and live removal restores travel", () => {
    const ctx = context(["a"]);
    const ground: TerrainField = { sampleHeight: (_x, z) => 2 * z, sampleNormal: () => [0, 1, 0] };
    const movement: NonNullable<PlayerMovementTuning["movement"]> = { maxClimbGrade: 0.85 };
    const configured = tuning({ ground, movement });
    driveWith(ctx, "a", ["moveForward"], 10, configured, 0);
    expect(ctx.scene.entity.get("a")!.position[2]).toBe(0);
    delete movement.maxClimbGrade;
    driveWith(ctx, "a", ["moveForward"], 10, configured, 0);
    const position = ctx.scene.entity.get("a")!.position;
    expect(position[2]).toBeGreaterThan(0);
    expect(position[1]).toBe(ground.sampleHeight(position[0], position[2]));
  });
});

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
    // The 5m drop is taller than a step, so the player now genuinely falls before settling on the floor.
    driveWith(ctx, "a", [], 60, tuning({ ground: SUBMERGED_GROUND }));
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

describe("heightfield collision proportions", () => {
  function roof(ctx: GameContext, underside = 2.058): void {
    ctx.world.solids.set("roof", [{ center: [0, underside + 0.05, 2], halfExtents: [2, 0.05, 1] }]);
  }

  test("an authored 2.6m body stops before a roof the historical 1.8m body entered", () => {
    const ctx = collisionContext(0);
    roof(ctx);
    driveWith(ctx, "a", ["moveForward"], 120, resolvePlayerMovementTuning({ movement: { collisionHeight: 2.6 } }), 0);
    expect(ctx.scene.entity.get("a")!.position[2]).toBeLessThanOrEqual(0.7);
    expect(playerMovementTelemetry(ctx, "a")?.collisionHeight).toBe(2.6);
  });

  test("a smaller authored body travels beneath a roof below the default head span", () => {
    const ctx = collisionContext(0);
    roof(ctx, 1.05);
    ctx.scene.entity.setPose("a", { position: [0, 0, 2] });
    stepPlayerMovement(ctx, "a", frame(["moveForward"]), 1 / 60, resolvePlayerMovementTuning({ movement: { collisionHeight: 0.9 } }), 0);
    const position = ctx.scene.entity.get("a")!.position;
    expect(position[0]).toBe(0);
    expect(position[2]).toBeGreaterThan(2);
    expect(position[2]).toBeLessThan(2.1);
  });

  test("fresh oversized placement rejects explicitly before sideways escape or motion drain", () => {
    const ctx = collisionContext(0);
    roof(ctx);
    ctx.scene.entity.setPose("a", { position: [0, 0, 2] });
    ctx.player.motionFor("a").impulse(3);
    const configured = resolvePlayerMovementTuning({ movement: { collisionHeight: 2.6 } });
    expect(() => stepPlayerMovement(ctx, "a", frame(["turnRight"]), 1 / 60, configured, Math.PI / 3)).toThrow("collisionHeight");
    expect(ctx.scene.entity.get("a")!.position).toEqual([0, 0, 2]);
    expect(playerMovementHeading(ctx, "a")).toBe(0);
    expect(snapshotPlayerMovement(ctx, "a")!.facing).toBeNull();
    expect(playerMovementTelemetry(ctx, "a")).toBeNull();
    ctx.world.solids.set("roof", []);
    stepPlayerMovement(ctx, "a", frame([]), 1 / 60, configured);
    expect(playerMovementTelemetry(ctx, "a")!.verticalVelocity).toBeGreaterThan(0);
  });

  test("a fresh declared body stands on a shallow authored road plate", () => {
    const ctx = collisionContext(0);
    ctx.world.solids.set("street", [{ center: [0, 0.03, 0], halfExtents: [4, 0.01, 4] }]);
    stepPlayerMovement(ctx, "a", frame([]), 1 / 60, resolvePlayerMovementTuning({ movement: { collisionHeight: 2.6 } }));
    expect(ctx.scene.entity.get("a")!.position).toEqual([0, 0.04, 0]);
    expect(playerMovementTelemetry(ctx, "a")).toMatchObject({ collisionHeight: 2.6, grounded: true, collisionHeightBlocked: false });
  });

  test("prospective road support cannot grant headroom through a thin roof", () => {
    const ctx = collisionContext(0);
    ctx.world.solids.set("street-and-roof", [
      { center: [0, 0.03, 0], halfExtents: [4, 0.01, 4] },
      { center: [0, 2.6205, 0], halfExtents: [2, 0.0005, 2] },
    ]);
    expect(() => stepPlayerMovement(ctx, "a", frame([]), 1 / 60,
      resolvePlayerMovementTuning({ movement: { collisionHeight: 2.6 } }))).toThrow("intersects blocking geometry at entity a");
    expect(ctx.scene.entity.get("a")!.position).toEqual([0, 0, 0]);
    expect(snapshotPlayerMovement(ctx, "a")!.motion).toBeNull();
    expect(playerMovementTelemetry(ctx, "a")).toBeNull();
  });

  test("an airborne or floating body does not borrow grounded road-plate forgiveness", () => {
    for (const floating of [false, true]) {
      const ctx = collisionContext(0);
      if (!floating) {
        stepPlayerMovement(ctx, "a", frame([]), 1 / 60, COLLIDE);
        const saved = snapshotPlayerMovement(ctx, "a")!;
        saved.motion!.grounded = false;
        saved.heightfieldHeight = null;
        saved.heightfieldEntityId = null;
        restorePlayerMovement(ctx, "a", saved);
      }
      ctx.world.solids.set("street", [{ center: [0, 0.03, 0], halfExtents: [4, 0.01, 4] }]);
      const configured = floating
        ? tuning({ ground: SUBMERGED_GROUND, movement: { collisionHeight: 2.6, swim: true } })
        : resolvePlayerMovementTuning({ movement: { collisionHeight: 2.6 } });
      expect(() => stepPlayerMovement(ctx, "a", frame([]), 1 / 60, configured)).toThrow("collisionHeight");
      expect(ctx.scene.entity.get("a")!.position).toEqual([0, 0, 0]);
    }
  });

  test("blocked live growth replays its accepted height, exits safely, then grows and shrinks", () => {
    let height = 1.8;
    const configured = resolvePlayerMovementTuning({ movement: { get collisionHeight() { return height; } } });
    const setup = () => {
      const ctx = collisionContext(0);
      roof(ctx);
      ctx.scene.entity.setPose("a", { position: [0, 0, 2] });
      return ctx;
    };
    const ctx = setup();
    stepPlayerMovement(ctx, "a", frame([]), 1 / 60, configured);
    height = 2.6;
    stepPlayerMovement(ctx, "a", frame([]), 1 / 60, configured);
    expect(playerMovementTelemetry(ctx, "a")).toMatchObject({ collisionHeight: 1.8, requestedCollisionHeight: 2.6, collisionHeightBlocked: true });
    expect(ctx.scene.entity.get("a")!.position).toEqual([0, 0, 2]);
    const saved = snapshotPlayerMovement(ctx, "a")!;
    expect(saved.heightfieldHeight).toBe(1.8);
    const replay = setup();
    restorePlayerMovement(replay, "a", saved);
    for (let i = 0; i < 100; i++) {
      stepPlayerMovement(ctx, "a", frame(["moveForward"]), 1 / 60, configured, Math.PI / 2);
      stepPlayerMovement(replay, "a", frame(["moveForward"]), 1 / 60, configured, Math.PI / 2);
      expect(replay.scene.entity.get("a")!.position).toEqual(ctx.scene.entity.get("a")!.position);
      expect(playerMovementTelemetry(replay, "a")).toEqual(playerMovementTelemetry(ctx, "a"));
    }
    expect(ctx.scene.entity.get("a")!.position[0]).toBeGreaterThan(2.3);
    expect(ctx.scene.entity.get("a")!.position[2]).toBeCloseTo(2, 10);
    expect(playerMovementTelemetry(ctx, "a")).toMatchObject({ collisionHeight: 2.6, requestedCollisionHeight: 2.6, collisionHeightBlocked: false });
    height = 0.9;
    stepPlayerMovement(ctx, "a", frame([]), 1 / 60, configured);
    expect(playerMovementTelemetry(ctx, "a")).toMatchObject({ collisionHeight: 0.9, collisionHeightBlocked: false });
  });

  test("invalid live dimensions reject before state integration and preserve pending impulses", () => {
    let height = 1.8;
    const configured = resolvePlayerMovementTuning({ movement: { get collisionHeight() { return height; } } });
    const ctx = collisionContext(0);
    stepPlayerMovement(ctx, "a", frame([]), 1 / 60, configured);
    const before = snapshotPlayerMovement(ctx, "a")!;
    ctx.player.motionFor("a").impulse(3);
    for (const invalid of [0, -1, NaN, Infinity, -Infinity]) {
      height = invalid;
      expect(() => stepPlayerMovement(ctx, "a", frame(["turnRight"]), 1 / 60, configured, Math.PI / 3)).toThrow("collisionHeight");
      expect(snapshotPlayerMovement(ctx, "a")).toEqual(before);
    }
    height = 1.8;
    stepPlayerMovement(ctx, "a", frame([]), 1 / 60, configured);
    expect(playerMovementTelemetry(ctx, "a")!.verticalVelocity).toBeGreaterThan(0);
  });

  test("rejected height edits preserve semantic stance as well as motion state", () => {
    const content: GameContextContent = { entityById: () => ({ movement: { poses: ["standing", "running", "crouch"] } }) };
    for (const held of [["crouch"], ["sprint"], []]) {
      const ctx = context(["a"], content);
      stepPlayerMovement(ctx, "a", frame([]), 1 / 60, COLLIDE);
      if (held.length === 0) ctx.player.movement.setPose("a", "crouch");
      const before = ctx.player.movement.getPose("a");
      expect(() => stepPlayerMovement(ctx, "a", frame(held), 1 / 60,
        resolvePlayerMovementTuning({ movement: { collisionHeight: NaN } }))).toThrow("collisionHeight");
      expect(ctx.player.movement.getPose("a")).toBe(before);
    }
    const fresh = context(["a"], content);
    roof(fresh);
    fresh.scene.entity.setPose("a", { position: [0, 0, 2] });
    const before = fresh.player.movement.getPose("a");
    expect(() => stepPlayerMovement(fresh, "a", frame(["crouch"]), 1 / 60,
      resolvePlayerMovementTuning({ movement: { collisionHeight: 2.6 } }))).toThrow("collisionHeight");
    expect(fresh.player.movement.getPose("a")).toBe(before);
  });

  test("large body broadphase includes a ceiling above the historical query span", () => {
    const ctx = collisionContext(0);
    roof(ctx, 4.5);
    const configured = resolvePlayerMovementTuning({ movement: { collisionHeight: 4.8, feel: { groundAcceleration: 0, groundFriction: 0 } } });
    configured.authoritativeStep = true;
    stepPlayerMovement(ctx, "a", frame([]), 1 / 60, configured);
    const saved = snapshotPlayerMovement(ctx, "a")!;
    saved.motion!.horizontalVelocityZ = 2;
    restorePlayerMovement(ctx, "a", saved);
    stepPlayerMovement(ctx, "a", frame([]), 1, configured);
    expect(ctx.scene.entity.get("a")!.position[2]).toBe(0.7);
  });

  test("configured heights stop fast jumps at the physical head across translated coordinates", () => {
    for (const base of [-100, 0, 100]) {
      for (const height of [0.9, 2.6]) {
        const ctx = collisionContext(0);
        ctx.scene.entity.setPose("a", { position: [0, base, 0] });
        const underside = base + height + 0.25;
        ctx.world.solids.set("roof", [{ center: [0, underside + 0.05, 0], halfExtents: [2, 0.05, 2] }]);
        const configured = tuning({ ground: { sampleHeight: () => base, sampleNormal: () => [0, 1, 0] },
          movement: { collisionHeight: height }, physics: { gravityAcceleration: 0, jumpVelocity: 20 }, authoritativeStep: true });
        stepPlayerMovement(ctx, "a", frame(["jump"]), 0.2, configured);
        const position = ctx.scene.entity.get("a")!.position;
        expect(position[1] - base).toBeCloseTo(0.25, 10);
        expect(position[1] + height).toBeLessThanOrEqual(underside);
        expect(position[0]).toBe(0);
        expect(position[2]).toBe(0);
        expect(playerMovementTelemetry(ctx, "a")).toMatchObject({ collisionHeight: height, grounded: false, verticalVelocity: 0 });
      }
    }
  });

  test("legacy saves retain their historical body and malformed saved heights restore atomically", () => {
    const ctx = collisionContext(0);
    roof(ctx);
    ctx.scene.entity.setPose("a", { position: [0, 0, 2] });
    stepPlayerMovement(ctx, "a", frame([]), 1 / 60, COLLIDE);
    const legacy = snapshotPlayerMovement(ctx, "a")!;
    delete legacy.heightfieldHeight;
    restorePlayerMovement(ctx, "a", legacy);
    stepPlayerMovement(ctx, "a", frame([]), 1 / 60, resolvePlayerMovementTuning({ movement: { collisionHeight: 2.6 } }));
    expect(playerMovementTelemetry(ctx, "a")).toMatchObject({ collisionHeight: 1.8, collisionHeightBlocked: true });
    const before = snapshotPlayerMovement(ctx, "a")!;
    for (const invalid of [0, -1, NaN, Infinity, -Infinity, "2.6"] as const) {
      expect(() => restorePlayerMovement(ctx, "a", { ...before, heading: 5, heightfieldHeight: invalid as number })).toThrow("collisionHeight");
      expect(snapshotPlayerMovement(ctx, "a")).toEqual(before);
    }
    for (const invalid of [42, false, {}]) {
      expect(() => restorePlayerMovement(ctx, "a", { ...before, heading: 5, heightfieldEntityId: invalid as string })).toThrow("heightfieldEntityId");
      expect(snapshotPlayerMovement(ctx, "a")).toEqual(before);
    }
  });

  test("snapshot replay preserves which pawn accepted the previous body height", () => {
    for (const legacy of [false, true]) {
      let height = 1.8;
      const configured = resolvePlayerMovementTuning({ movement: { get collisionHeight() { return height; } } });
      const setup = () => {
        const ctx = collisionContext(0);
        roof(ctx);
        ctx.scene.entity.setPose("a", { position: [0, 0, 2] });
        ctx.scene.entity.spawn("hero", { id: "pawn", position: [0, 0, 2] });
        ctx.player.possession.own("a", "pawn");
        return ctx;
      };
      const original = setup();
      stepPlayerMovement(original, "a", frame([]), 1 / 60, configured);
      const saved = snapshotPlayerMovement(original, "a")!;
      if (legacy) { delete saved.heightfieldHeight; delete saved.heightfieldEntityId; }
      const replay = setup();
      restorePlayerMovement(replay, "a", saved);
      height = 2.6;
      for (const ctx of [original, replay]) {
        ctx.player.possession.possess("a", "pawn");
        expect(() => stepPlayerMovement(ctx, "a", frame([]), 1 / 60, configured)).toThrow("entity pawn");
        expect(ctx.scene.entity.get("pawn")!.position).toEqual([0, 0, 2]);
        expect(playerMovementTelemetry(ctx, "pawn")).toBeNull();
      }
    }
  });

  test("live shrink beneath a roof and deliberate object-collision opt-out apply immediately", () => {
    let height = 1.8;
    let collideObjects = true;
    const configured = resolvePlayerMovementTuning({ movement: { get collisionHeight() { return height; }, get collideObjects() { return collideObjects; } } });
    const ctx = collisionContext(0);
    roof(ctx);
    ctx.scene.entity.setPose("a", { position: [0, 0, 2] });
    stepPlayerMovement(ctx, "a", frame([]), 1 / 60, configured);
    height = 2.6;
    stepPlayerMovement(ctx, "a", frame([]), 1 / 60, configured);
    expect(playerMovementTelemetry(ctx, "a")?.collisionHeightBlocked).toBe(true);
    height = 0.9;
    stepPlayerMovement(ctx, "a", frame([]), 1 / 60, configured);
    expect(playerMovementTelemetry(ctx, "a")).toMatchObject({ collisionHeight: 0.9, collisionHeightBlocked: false });
    height = 2.6;
    collideObjects = false;
    stepPlayerMovement(ctx, "a", frame([]), 1 / 60, configured);
    expect(ctx.scene.entity.get("a")!.position).toEqual([0, 0, 2]);
    expect(playerMovementTelemetry(ctx, "a")).toMatchObject({ collisionHeight: 2.6, collisionHeightBlocked: false });
  });

  test("capsule and voxel dimensions keep authority and clear heightfield-only telemetry", () => {
    const ctx = collisionContext(0);
    stepPlayerMovement(ctx, "a", frame([]), 1 / 60, resolvePlayerMovementTuning({ movement: { collisionHeight: 2.6 } }));
    const view = playerMovementTelemetry(ctx, "a")!;
    const backend = createPhysicsWorldBackend({ capacity: 8, bounds: { min: [-10, -5, -10], max: [10, 10, 10] }, warn: false });
    backend.addBody({ shape: { kind: "box", halfExtents: [5, 0.5, 5] }, position: [0, -0.5, 0], kind: "static" });
    stepPlayerMovement(ctx, "a", frame([]), 1 / 60, resolvePlayerMovementTuning({ movement: { collisionHeight: -1 }, physics: { backend, controller: { radius: 0.2, height: 0.8 } } }));
    expect(snapshotPlayerMovement(ctx, "a")!.controller).not.toBeNull();
    expect(view.collisionHeight).toBeUndefined();
    expect(view.requestedCollisionHeight).toBeUndefined();
    expect(view.collisionHeightBlocked).toBeUndefined();
    stepPlayerMovement(ctx, "a", frame([]), 1 / 60, resolvePlayerMovementTuning({ movement: { collisionHeight: -1 }, collision: { voxel: true, height: 0.8, halfWidth: 0.2 } }));
    expect(snapshotPlayerMovement(ctx, "a")!.voxelBody).not.toBeNull();
    expect(playerMovementTelemetry(ctx, "a")?.collisionHeight).toBeUndefined();
    stepPlayerMovement(ctx, "a", frame([]), 1 / 60, resolvePlayerMovementTuning({ movement: { collisionHeight: -1, flight: true } }));
    expect(snapshotPlayerMovement(ctx, "a")!.flight).not.toBeNull();
    expect(playerMovementTelemetry(ctx, "a")?.collisionHeight).toBeUndefined();
  });
});

describe("stepPlayerMovement object collision (mesh-accurate)", () => {
  test("jumping under an archway stops at its lintel instead of ejecting the stationary player", () => {
    const ctx = collisionContext(0);
    placeArchway(ctx);
    ctx.scene.entity.setPose("a", { position: [0, 0, 2] });
    let maxHead = 0;
    let maxDrift = 0;
    for (let i = 0; i < 90; i++) {
      stepPlayerMovement(ctx, "a", frame(i < 30 ? ["jump"] : []), 1 / 60, COLLIDE);
      const position = ctx.scene.entity.get("a")!.position;
      maxHead = Math.max(maxHead, position[1] + DEFAULT_OBSTACLE_PLAYER_HEIGHT);
      maxDrift = Math.max(maxDrift, Math.abs(position[0]), Math.abs(position[2] - 2));
    }
    expect(maxHead).toBeLessThanOrEqual(2);
    expect(maxDrift).toBe(0);
    expect(ctx.scene.entity.get("a")!.position[1]).toBe(0);
    expect(playerMovementTelemetry(ctx, "a")?.grounded).toBe(true);
  });

  test("a curb under a low lintel cannot raise the player into the roof", () => {
    const ctx = collisionContext(0);
    const roof = ctx.scene.object.place("roof", 0, 0, 1);
    ctx.scene.object.setColliders(roof, { body: { name: "roof", purpose: "physical", shape: { kind: "aabb", halfExtents: [2, 0.05, 5], offset: [0, 2.05, 0] } } });
    placeCrate(ctx, 0, 2, 2, 0.3, "curb");
    let maxHead = 0;
    let maxSideways = 0;
    for (let i = 0; i < 60; i++) {
      stepPlayerMovement(ctx, "a", frame(["moveForward"]), 1 / 60, COLLIDE, 0);
      const position = ctx.scene.entity.get("a")!.position;
      maxHead = Math.max(maxHead, position[1] + DEFAULT_OBSTACLE_PLAYER_HEIGHT);
      maxSideways = Math.max(maxSideways, Math.abs(position[0]));
    }
    expect(maxHead).toBeLessThanOrEqual(2);
    expect(maxSideways).toBe(0);
    expect(ctx.scene.entity.get("a")!.position[2]).toBeLessThan(1);
    // A rejected ledge does not cancel an in-place jump from its legal inflated edge.
    ctx.scene.entity.setPose("a", { position: [0, 0, 0.7] });
    forgetPlayerMovement(ctx, "a");
    stepPlayerMovement(ctx, "a", frame(["jump"]), 1 / 60, COLLIDE, 0);
    expect(ctx.scene.entity.get("a")!.position[1]).toBeGreaterThan(0);
    expect(ctx.scene.entity.get("a")!.position[2]).toBe(0.7);
  });

  test("uphill terrain under a low lintel blocks the unsupported rise", () => {
    const ctx = collisionContext(0);
    const roof = ctx.scene.object.place("roof", 0, 0, 0);
    ctx.scene.object.setColliders(roof, { body: { name: "roof", purpose: "physical", shape: { kind: "aabb", halfExtents: [2, 0.05, 5], offset: [0, 2.05, 0] } } });
    const ground: TerrainField = { sampleHeight: (_x, z) => 0.5 * z, sampleNormal: () => [0, 1, 0] };
    const configured = tuning({ ground });
    let maxHead = 0;
    let maxSideways = 0;
    for (let i = 0; i < 60; i++) {
      stepPlayerMovement(ctx, "a", frame(["moveForward"]), 1 / 60, configured, 0);
      const position = ctx.scene.entity.get("a")!.position;
      maxHead = Math.max(maxHead, position[1] + DEFAULT_OBSTACLE_PLAYER_HEIGHT);
      maxSideways = Math.max(maxSideways, Math.abs(position[0]));
    }
    expect(maxHead).toBeLessThanOrEqual(2);
    expect(maxSideways).toBe(0);
    const position = ctx.scene.entity.get("a")!.position;
    expect(position[1]).toBe(ground.sampleHeight(position[0], position[2]));
  });

  test("a large terrain rise queries a world-solid roof above the starting body", () => {
    const ctx = collisionContext(0);
    ctx.world.solids.set("roof", [{ center: [0, 4.55, 0], halfExtents: [2, 0.05, 5] }]);
    const ground: TerrainField = { sampleHeight: (_x, z) => z > 0 ? 3 : 0, sampleNormal: () => [0, 1, 0] };
    stepPlayerMovement(ctx, "a", frame(["moveForward"]), 1 / 60, tuning({ ground }), 0);
    expect(ctx.scene.entity.get("a")!.position).toEqual([0, 0, 0]);
    expect(playerMovementTelemetry(ctx, "a")?.grounded).toBe(true);
  });

  test("a terrain rise cannot pass entirely through a thin roof", () => {
    const ctx = collisionContext(0);
    ctx.world.solids.set("roof", [{ center: [0, 2.05, 0], halfExtents: [2, 0.05, 5] }]);
    const ground: TerrainField = { sampleHeight: (_x, z) => z > 0 ? 3 : 0, sampleNormal: () => [0, 1, 0] };
    stepPlayerMovement(ctx, "a", frame(["moveForward"]), 1 / 60, tuning({ ground }), 0);
    expect(ctx.scene.entity.get("a")!.position).toEqual([0, 0, 0]);
  });

  test("headroom fallback cannot cross a thin wall on the alternate axis", () => {
    const ctx = collisionContext(0);
    ctx.world.solids.set("corner", [
      { center: [2, 2.05, 1], halfExtents: [0.5, 0.05, 3] },
      { center: [0, 1, 1], halfExtents: [0.1, 1, 0.01] },
    ]);
    const ground: TerrainField = { sampleHeight: (x) => x > 1 ? 0.3 : 0, sampleNormal: () => [0, 1, 0] };
    const configured = tuning({ ground, authoritativeStep: true, physics: { groundAcceleration: 0, groundFriction: 0 } });
    stepPlayerMovement(ctx, "a", frame([]), 1 / 60, configured);
    const saved = snapshotPlayerMovement(ctx, "a")!;
    saved.motion!.horizontalVelocityX = 2;
    saved.motion!.horizontalVelocityZ = 2;
    restorePlayerMovement(ctx, "a", saved);
    stepPlayerMovement(ctx, "a", frame([]), 1, configured);
    expect(ctx.scene.entity.get("a")!.position).toEqual([0, 0, 0]);
  });

  test("headroom axis sliding preserves the raw grade sampler's four-point budget", () => {
    const ctx = collisionContext(0);
    ctx.world.solids.set("roof", [{ center: [2, 2.05, 1], halfExtents: [0.5, 0.05, 3] }]);
    const samples: string[] = [];
    const configured = tuning({
      ground: { sampleHeight: (x) => x > 1 ? 0.3 : 0, sampleNormal: () => [0, 1, 0] },
      authoritativeStep: true,
      physics: { groundAcceleration: 0, groundFriction: 0 },
      movement: { maxClimbGrade: 0.85, climbGradeHeight: (x, z) => { samples.push(`${x},${z}`); return 0; } },
    });
    stepPlayerMovement(ctx, "a", frame([]), 1 / 60, configured);
    const saved = snapshotPlayerMovement(ctx, "a")!;
    saved.motion!.horizontalVelocityX = 2;
    saved.motion!.horizontalVelocityZ = 2;
    restorePlayerMovement(ctx, "a", saved);
    samples.length = 0;
    stepPlayerMovement(ctx, "a", frame([]), 1, configured);
    expect(ctx.scene.entity.get("a")!.position).toEqual([0, 0, 2]);
    expect(samples).toEqual(["0,0", "2,2", "2,0", "0,2"]);
  });

  test("a fast authoritative jump stops at the nearest thin world-solid ceiling", () => {
    const ctx = collisionContext(0);
    ctx.world.solids.set("roofs", [
      { center: [0, 10.0005, 0], halfExtents: [2, 0.0005, 2] },
      { center: [0, 5.0005, 0], halfExtents: [2, 0.0005, 2] },
    ]);
    const configured = tuning({ ground: FLAT_GROUND, authoritativeStep: true, physics: { gravityAcceleration: 0, jumpVelocity: 60 } });
    stepPlayerMovement(ctx, "a", frame(["jump"]), 0.2, configured);
    const position = ctx.scene.entity.get("a")!.position;
    expect(position[0]).toBe(0);
    expect(position[2]).toBe(0);
    expect(position[1] + DEFAULT_OBSTACLE_PLAYER_HEIGHT).toBeLessThanOrEqual(5);
    expect(position[1]).toBeCloseTo(3.2, 10);
    expect(playerMovementTelemetry(ctx, "a")).toMatchObject({ grounded: false, verticalVelocity: 0, crouching: false });
  });

  test("a fast descent lands on a thin platform without tunneling to terrain", () => {
    const ctx = collisionContext(0);
    ctx.world.solids.set("platform", [{ center: [0, 3.9995, 0], halfExtents: [2, 0.0005, 2] }]);
    const configured = tuning({ ground: FLAT_GROUND, authoritativeStep: true, physics: { gravityAcceleration: 0 } });
    stepPlayerMovement(ctx, "a", frame([]), 1 / 60, configured);
    const saved = snapshotPlayerMovement(ctx, "a")!;
    saved.motion!.jumpOffset = 8;
    saved.motion!.verticalVelocity = -50;
    saved.motion!.grounded = false;
    restorePlayerMovement(ctx, "a", saved);
    ctx.scene.entity.setPose("a", { position: [0, 8, 0] });
    stepPlayerMovement(ctx, "a", frame([]), 0.2, configured);
    expect(ctx.scene.entity.get("a")!.position).toEqual([0, 4, 0]);
    expect(playerMovementTelemetry(ctx, "a")).toMatchObject({ grounded: true, verticalVelocity: 0, crouching: false });
  });

  test("translated ceiling contact restores and lands without lateral ejection", () => {
    for (const base of [-100, 0, 100]) {
      const setup = () => {
        const ctx = collisionContext(0);
        ctx.scene.entity.setPose("a", { position: [0, base, 0] });
        ctx.world.solids.set("roof", [{ center: [0, base + 2.05, 0], halfExtents: [2, 0.05, 2] }]);
        return ctx;
      };
      const configured = tuning({ ground: { sampleHeight: () => base, sampleNormal: () => [0, 1, 0] }, physics: { gravityAcceleration: 20, jumpVelocity: 8 } });
      const ctx = setup();
      stepPlayerMovement(ctx, "a", frame(["jump"]), 1 / 60, configured);
      stepPlayerMovement(ctx, "a", frame(["jump"]), 1 / 60, configured);
      const contact = [...ctx.scene.entity.get("a")!.position] as [number, number, number];
      expect(contact[1] + DEFAULT_OBSTACLE_PLAYER_HEIGHT).toBeLessThanOrEqual(base + 2);
      expect(playerMovementTelemetry(ctx, "a")?.verticalVelocity).toBe(0);
      const restored = setup();
      restored.scene.entity.setPose("a", { position: contact });
      restorePlayerMovement(restored, "a", snapshotPlayerMovement(ctx, "a")!);
      for (let i = 0; i < 60; i++) {
        stepPlayerMovement(ctx, "a", frame([]), 1 / 60, configured);
        stepPlayerMovement(restored, "a", frame([]), 1 / 60, configured);
        expect(restored.scene.entity.get("a")!.position).toEqual(ctx.scene.entity.get("a")!.position);
      }
      expect(ctx.scene.entity.get("a")!.position).toEqual([0, base, 0]);
      expect(playerMovementTelemetry(ctx, "a")?.grounded).toBe(true);
    }
  });

  test("leaving a finite roof after contact keeps descent and responsive lateral input", () => {
    const ctx = collisionContext(0);
    ctx.world.solids.set("roof", [{ center: [0, 2.05, 0], halfExtents: [0.5, 0.05, 2] }]);
    stepPlayerMovement(ctx, "a", frame(["jump"]), 1 / 60, COLLIDE);
    stepPlayerMovement(ctx, "a", frame(["jump"]), 1 / 60, COLLIDE);
    expect(playerMovementTelemetry(ctx, "a")?.verticalVelocity).toBe(0);
    let previousX = 0;
    for (let i = 0; i < 60; i++) {
      stepPlayerMovement(ctx, "a", frame(["moveForward"]), 1 / 60, COLLIDE, Math.PI / 2);
      const position = ctx.scene.entity.get("a")!.position;
      expect(position[0] - previousX).toBeLessThan(0.1);
      expect(playerMovementTelemetry(ctx, "a")!.verticalVelocity).toBeLessThanOrEqual(0);
      previousX = position[0];
    }
    expect(previousX).toBeGreaterThan(0.8);
    expect(ctx.scene.entity.get("a")!.position[1]).toBe(0);
    expect(Math.abs(ctx.scene.entity.get("a")!.position[2])).toBeLessThan(1e-12);
  });

  test("exact headroom permits a supported rise and horizontal travel during a blocked jump", () => {
    for (const base of [-100, 0, 100]) {
      for (const jump of [false, true]) {
        const ctx = collisionContext(0);
        ctx.scene.entity.setPose("a", { position: [0, base, 0] });
        ctx.world.solids.set("roof", [{ center: [0, base + (jump ? 1.85 : 2.05), 0], halfExtents: [2, 0.05, 5] }]);
        const ground: TerrainField = { sampleHeight: (_x, z) => base + (!jump && z > 0 ? 0.2 : 0), sampleNormal: () => [0, 1, 0] };
        stepPlayerMovement(ctx, "a", frame(jump ? ["moveForward", "jump"] : ["moveForward"]), 1 / 60, tuning({ ground }), 0);
        const position = ctx.scene.entity.get("a")!.position;
        expect(position[2]).toBeGreaterThan(0);
        expect(position[1]).toBe(ground.sampleHeight(position[0], position[2]));
        expect(playerMovementTelemetry(ctx, "a")?.grounded).toBe(true);
      }
    }
  });

  test("lower ground keeps descent until actual landing and preserves recovery through replay", () => {
    const ctx = collisionContext(0);
    let height = 2;
    const configured = tuning({
      ground: { sampleHeight: () => height, sampleNormal: () => [0, 1, 0] },
      physics: { gravityAcceleration: 16, jumpVelocity: 6, landingRecoveryMs: 200 },
    });
    ctx.scene.entity.setPose("a", { position: [0, 2, 0] });
    stepPlayerMovement(ctx, "a", frame(["jump"]), 1 / 60, configured);
    let falling = snapshotPlayerMovement(ctx, "a")!;
    for (let i = 0; i < 90; i++) {
      falling = snapshotPlayerMovement(ctx, "a")!;
      const motion = falling.motion!;
      if (motion.verticalVelocity < 0 && motion.jumpOffset <= -(motion.verticalVelocity - 16 / 60) / 60) break;
      stepPlayerMovement(ctx, "a", frame([]), 1 / 60, configured);
    }
    expect(falling.motion!.grounded).toBe(false);
    const expectedVelocity = falling.motion!.verticalVelocity - 16 / 60;
    const pose = [...ctx.scene.entity.get("a")!.position] as [number, number, number];
    const replay = collisionContext(0);
    replay.scene.entity.setPose("a", { position: pose });
    restorePlayerMovement(replay, "a", falling);
    height = 0;
    for (const target of [ctx, replay]) {
      stepPlayerMovement(target, "a", frame([]), 1 / 60, configured);
      const motion = snapshotPlayerMovement(target, "a")!.motion!;
      expect(motion.grounded).toBe(false);
      expect(motion.verticalVelocity).toBeCloseTo(expectedVelocity, 10);
      expect(motion.landedAtMs).toBeNull();
      expect(motion.wasAirborne).toBe(true);
      expect(playerMovementTelemetry(target, "a")?.verticalVelocity).toBe(motion.verticalVelocity);
    }
    for (let i = 0; i < 120 && !playerMovementTelemetry(ctx, "a")!.grounded; i++) {
      stepPlayerMovement(ctx, "a", frame([]), 1 / 60, configured);
      stepPlayerMovement(replay, "a", frame([]), 1 / 60, configured);
      expect(replay.scene.entity.get("a")!.position).toEqual(ctx.scene.entity.get("a")!.position);
    }
    expect(ctx.scene.entity.get("a")!.position[1]).toBe(0);
    expect(snapshotPlayerMovement(ctx, "a")!.motion!.landedAtMs).toBe(snapshotPlayerMovement(ctx, "a")!.motion!.clockMs);
    stepPlayerMovement(ctx, "a", frame(["jump"]), 1 / 60, configured);
    expect(ctx.scene.entity.get("a")!.position[1]).toBe(0);
    driveWith(ctx, "a", [], 15, configured);
    stepPlayerMovement(ctx, "a", frame(["jump"]), 1 / 60, configured);
    expect(ctx.scene.entity.get("a")!.position[1]).toBeGreaterThan(0);
  });

  test("object collision opt-out and explicit height authority remain supported", () => {
    for (const policy of ["opt-out", "absolute-height", "before-commit"] as const) {
      const ctx = collisionContext(0);
      ctx.world.solids.set("roof", [{ center: [0, 2.05, 0], halfExtents: [2, 0.05, 2] }]);
      const configured = tuning({
        ground: FLAT_GROUND, authoritativeStep: true,
        physics: { gravityAcceleration: 0, jumpVelocity: 20 },
        movement: policy === "opt-out" ? { collideObjects: false } : policy === "before-commit" ? { beforeCommit: ({ next }) => [next[0], 4, next[2]] } : {},
      });
      if (policy === "absolute-height") ctx.player.motionFor("a").setY(5);
      stepPlayerMovement(ctx, "a", frame(["jump"]), 0.2, configured);
      expect(ctx.scene.entity.get("a")!.position).toEqual([0, policy === "absolute-height" ? 5 : 4, 0]);
      if (policy !== "opt-out") expect(playerMovementTelemetry(ctx, "a")).toBeNull();
    }
  });

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

  test("object collision is ON by default — the off-centre player is stopped without opting in", () => {
    const ctx = collisionContext(1.5);
    placeArchway(ctx);
    driveWith(ctx, "a", ["moveForward"], 120, FLAT, 0);
    expect(ctx.scene.entity.get("a")!.position[2]).toBeLessThan(2);
  });

  test("collideObjects: false opts out — the same off-centre player passes straight through", () => {
    const ctx = collisionContext(1.5);
    placeArchway(ctx);
    driveWith(ctx, "a", ["moveForward"], 120, resolvePlayerMovementTuning({ movement: { collideObjects: false } }), 0);
    expect(ctx.scene.entity.get("a")!.position[2]).toBeGreaterThan(2);
  });

  test("a runtime-reported wide prop blocks across its real span, not the phantom unit box", () => {
    // Without a report, the object obstructs as the default unit box at its centre — x=1.5 walks past.
    const unreported = collisionContext(1.5);
    unreported.scene.object.place("platform", 0, 0, 2);
    driveWith(unreported, "a", ["moveForward"], 120, COLLIDE, 0);
    expect(unreported.scene.entity.get("a")!.position[2]).toBeGreaterThan(2);
    // With the renderer's measured 5m span reported, the same walk is stopped by the real footprint.
    const reported = collisionContext(1.5);
    reported.scene.object.reportBounds("platform", { min: [-2.5, 0, -0.5], max: [2.5, 1.2, 0.5] });
    reported.scene.object.place("platform", 0, 0, 2);
    driveWith(reported, "a", ["moveForward"], 120, COLLIDE, 0);
    expect(reported.scene.entity.get("a")!.position[2]).toBeLessThan(2);
  });
});

/** Place a solid crate object at `(x, 0, z)` spanning `size` on each side, `height` tall (top at y=height). */
function placeCrate(ctx: GameContext, x: number, z: number, size: number, height: number, catalogId = "crate"): void {
  ctx.scene.object.reportBounds(catalogId, {
    min: [-size / 2, 0, -size / 2],
    max: [size / 2, height, size / 2],
  });
  ctx.scene.object.place(catalogId, x, 0, z);
}

describe("standing on and stepping over objects", () => {
  test("a low curb is stepped up onto instead of blocking (and its top becomes the ground)", () => {
    const ctx = collisionContext(0);
    placeCrate(ctx, 0, 2, 2, 0.3, "curb"); // curb spans z∈[1,3], top y=0.3
    driveWith(ctx, "a", ["moveForward"], 35, COLLIDE, 0);
    const pos = ctx.scene.entity.get("a")!.position;
    expect(pos[2]).toBeGreaterThan(1.2); // walked onto the curb, not stopped at its face
    expect(pos[1]).toBeCloseTo(0.3, 6); // feet standing on the curb top
  });

  test("a chest-high crate blocks walking but is landed ON by a jump — not clipped inside", () => {
    const ctx = collisionContext(0);
    placeCrate(ctx, 0, 2, 3, 0.8); // spans z∈[0.5,3.5], top y=0.8
    // Walking alone: blocked at the crate face (z=0.5 minus the 0.3 player radius), never lifted.
    driveWith(ctx, "a", ["moveForward"], 90, COLLIDE, 0);
    const walked = ctx.scene.entity.get("a")!.position;
    expect(walked[2]).toBeLessThan(0.21);
    expect(walked[1]).toBeCloseTo(0, 6);
    // Jump while holding forward: clears the 0.8 top and lands standing on it.
    driveWith(ctx, "a", ["moveForward", "jump"], 8, COLLIDE, 0);
    driveWith(ctx, "a", ["moveForward"], 30, COLLIDE, 0);
    const landed = ctx.scene.entity.get("a")!.position;
    expect(landed[1]).toBeCloseTo(0.8, 6);
    expect(landed[2]).toBeGreaterThan(0.5);
    expect(landed[2]).toBeLessThan(3.5);
  });

  test("walking off a crate falls back to the terrain instead of hovering or sticking", () => {
    const ctx = collisionContext(0);
    placeCrate(ctx, 0, 2, 2, 0.8); // top spans z∈[1,3]
    // Start standing on the crate top.
    ctx.scene.entity.setPose("a", { position: [0, 0.8, 2], rotationY: 0, dt: 1 / 60 });
    driveWith(ctx, "a", ["moveForward"], 120, COLLIDE, 0);
    const pos = ctx.scene.entity.get("a")!.position;
    expect(pos[2]).toBeGreaterThan(3.3); // walked past the far edge (inflated footprint ends at 3.3)
    expect(pos[1]).toBeCloseTo(0, 6); // and came back down to the ground
  });

  test("a building wider than the legacy 4m broadphase bound still blocks near its edge", () => {
    const ctx = collisionContext(9);
    // A 20m-wide building centred at x=0: its edge (x=10) is 10m from the centre point the broadphase
    // indexes; the old hardcoded 4m reach missed it entirely and the player walked through its side.
    ctx.scene.object.reportBounds("building", { min: [-10, 0, -1], max: [10, 6, 1] });
    ctx.scene.object.place("building", 0, 0, 4); // wall spans z∈[3,5] at the player's x
    driveWith(ctx, "a", ["moveForward"], 120, COLLIDE, 0);
    expect(ctx.scene.entity.get("a")!.position[2]).toBeLessThan(2.8);
  });

  test("a tall tower still blocks on foot without needing tower-height Y broadphase (#1517)", () => {
    const ctx = collisionContext(0);
    // 52 m tall solid — previously max(oy+hy) inflated inBox Y to ~100 m of empty 1 m cells per frame.
    ctx.scene.object.reportBounds("tower", { min: [-4, 0, -4], max: [4, 52, 4] });
    ctx.scene.object.place("tower", 0, 0, 6);
    driveWith(ctx, "a", ["moveForward"], 120, COLLIDE, 0);
    expect(ctx.scene.entity.get("a")!.position[2]).toBeLessThan(3.5);
  });

  test("movement.frozen skips the step entirely (seated rider does not pay obstacle gather)", () => {
    const ctx = collisionContext(0);
    ctx.scene.entity.update("a", { movement: { frozen: true } });
    const before = ctx.scene.entity.get("a")!.position;
    driveWith(ctx, "a", ["moveForward"], 60, COLLIDE, 0);
    expect(ctx.scene.entity.get("a")!.position).toEqual(before);
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

describe("resolvePlayerMovementTuning — movement.feel", () => {
  test("maps feel fields onto the controller overrides alongside physics and backpedal", () => {
    const tuning = resolvePlayerMovementTuning({
      physics: { gravity: -30, jumpVelocity: 9 },
      movement: { backpedalMult: 0.5, feel: { groundAcceleration: 10, airAcceleration: 0, groundFriction: 6, runMultiplier: 3, crouchMultiplier: 0.3 } },
    });
    expect(tuning.physics).toEqual({
      gravityAcceleration: 30,
      jumpVelocity: 9,
      backpedalSpeedMultiplier: 0.5,
      groundAcceleration: 10,
      airAcceleration: 0,
      groundFriction: 6,
      runSpeedMultiplier: 3,
      crouchSpeedMultiplier: 0.3,
    });
    expect(resolvePlayerMovementTuning({}).physics).toBeUndefined();
  });
});

describe("indexed movement telemetry", () => {
  test("follows physical jump and landing while reusing a live view", () => {
    const ctx = context(["a"]);
    expect(playerMovementTelemetry(ctx, "a")).toBeNull();
    drive(ctx, "a", [], 1);
    const view = playerMovementTelemetry(ctx, "a")!;
    expect(view.grounded).toBe(true);
    drive(ctx, "a", ["jump"], 1);
    expect(playerMovementTelemetry(ctx, "a")).toBe(view);
    expect(view.grounded).toBe(false);
    expect(view.verticalVelocity).toBeGreaterThan(5);
    drive(ctx, "a", [], 100);
    expect(view.grounded).toBe(true);
    expect(view.verticalVelocity).toBe(0);
    restorePlayerMovement(ctx, "a", snapshotPlayerMovement(ctx, "a")!);
    expect(playerMovementTelemetry(ctx, "a")).toBeNull();
    drive(ctx, "a", [], 1);
    expect(playerMovementTelemetry(ctx, "a")!.grounded).toBe(true);
    forgetPlayerMovement(ctx, "a");
    expect(playerMovementTelemetry(ctx, "a")).toBeNull();
  });

  test("resolves only the currently driven owned pawn without scanning other players", () => {
    const ctx = context(["a", "b"]);
    ctx.scene.entity.spawn("hero", { id: "pawn", position: [0, 0, 0] });
    ctx.player.possession.own("a", "pawn");
    ctx.player.possession.possess("a", "pawn");
    drive(ctx, "a", ["jump"], 1);
    drive(ctx, "b", [], 1);
    expect(playerMovementTelemetry(ctx, "pawn")!.grounded).toBe(false);
    expect(playerMovementTelemetry(ctx, "a")).toBeNull();
    expect(playerMovementTelemetry(ctx, "b")!.grounded).toBe(true);
    expect(playerMovementTelemetry(ctx, "unmanaged")).toBeNull();
    ctx.player.possession.own("a", "a");
    ctx.player.possession.possess("a", "a");
    expect(playerMovementTelemetry(ctx, "pawn")).toBeNull();
  });

  test("flight never invents ground contact and returning to walking reads its active motor", () => {
    const ctx = context(["a"]);
    const flight = resolvePlayerMovementTuning({ movement: { flight: { mode: "creative", collide: false } } });
    driveWith(ctx, "a", ["jump"], 5, flight);
    expect(playerMovementTelemetry(ctx, "a")!.grounded).toBe(false);
    expect(playerMovementTelemetry(ctx, "a")!.crouching).toBe(false);
    drive(ctx, "a", [], 1);
    expect(playerMovementTelemetry(ctx, "a")!.verticalVelocity).toBe(snapshotPlayerMovement(ctx, "a")!.motion!.verticalVelocity);
    drive(ctx, "a", [], 100);
    expect(playerMovementTelemetry(ctx, "a")!.grounded).toBe(true);
  });

  test("a policy replacement with external collision authority makes telemetry unavailable", () => {
    const reject = { beforeCommit: (frame: Parameters<NonNullable<NonNullable<Parameters<typeof resolvePlayerMovementTuning>[0]["movement"]>["beforeCommit"]>>[0]) => frame.current };
    const walking = context(["a"]);
    stepPlayerMovement(walking, "a", frame(["jump"]), 1 / 60, resolvePlayerMovementTuning({ movement: reject }));
    expect(walking.scene.entity.get("a")!.position).toEqual([0, 0, 0]);
    expect(playerMovementTelemetry(walking, "a")).toBeNull();
    const flight = context(["a"]);
    stepPlayerMovement(flight, "a", frame(["jump"]), 1 / 60, resolvePlayerMovementTuning({ movement: { ...reject, flight: { mode: "creative", collide: false } } }));
    expect(playerMovementTelemetry(flight, "a")).toBeNull();
    const backend = createPhysicsWorldBackend({ capacity: 16, bounds: { min: [-60, -5, -60], max: [60, 60, 60] }, warn: false });
    backend.addBody({ shape: { kind: "box", halfExtents: [50, 0.5, 50] }, position: [0, -0.5, 0], kind: "static" });
    const capsule = context(["a"]);
    capsule.scene.entity.setPose("a", { position: [0, 0.02, 0] });
    stepPlayerMovement(capsule, "a", frame(["jump"]), 1 / 60, resolvePlayerMovementTuning({ physics: { backend }, movement: reject }));
    expect(playerMovementTelemetry(capsule, "a")).toBeNull();
    const accepted = context(["a"]);
    stepPlayerMovement(accepted, "a", frame(["jump"]), 1 / 60, resolvePlayerMovementTuning({ movement: { beforeCommit: frame => frame.next } }));
    expect(playerMovementTelemetry(accepted, "a")!.grounded).toBe(false);
  });

  test("an absolute motion height override does not masquerade as motor ground contact", () => {
    const ctx = context(["a"]);
    ctx.player.motionFor("a").setY(10);
    stepPlayerMovement(ctx, "a", frame([]), 1 / 60, resolvePlayerMovementTuning({ movement: { beforeCommit: frame => frame.next } }));
    expect(ctx.scene.entity.get("a")!.position[1]).toBe(10);
    expect(playerMovementTelemetry(ctx, "a")).toBeNull();
  });

  test("an entity pose constraint also keeps the constrained motor state unknown", () => {
    const ctx = context(["a"]);
    ctx.scene.entity.setPoseConstraint("a", () => [0, 0, 0]);
    drive(ctx, "a", ["jump"], 1);
    expect(ctx.scene.entity.get("a")!.position).toEqual([0, 0, 0]);
    expect(playerMovementTelemetry(ctx, "a")).toBeNull();
  });

  test("a despawned pawn has no movement telemetry", () => {
    const ctx = context(["a"]);
    drive(ctx, "a", [], 1);
    ctx.scene.entity.despawn("a");
    expect(playerMovementTelemetry(ctx, "a")).toBeNull();
  });

  test("live capsule declarations retune dimensions and recompute omitted defaults", () => {
    const backend = createPhysicsWorldBackend({ capacity: 16, bounds: { min: [-60, -5, -60], max: [60, 60, 60] }, warn: false });
    backend.addBody({ shape: { kind: "box", halfExtents: [50, 0.5, 50] }, position: [0, -0.5, 0], kind: "static" });
    let capsule = { radius: 0.3, height: 1.8 };
    let lastShape: unknown;
    const shapecast = backend.shapecast.bind(backend);
    backend.shapecast = desc => { lastShape = desc.shape; return shapecast(desc); };
    const config = resolvePlayerMovementTuning({ physics: { backend, get controller() { return capsule; } } });
    const ctx = context(["a"]);
    driveWith(ctx, "a", [], 1, config);
    capsule = { radius: 0.2, height: 0.8 };
    driveWith(ctx, "a", [], 1, config);
    expect(lastShape).toEqual({ kind: "capsule", radius: 0.2, halfHeight: 0.2 });
    capsule.height = 1;
    driveWith(ctx, "a", [], 1, config);
    expect(lastShape).toEqual({ kind: "capsule", radius: 0.2, halfHeight: 0.3 });
  });

  test("capsule and voxel telemetry reads the actual owning body's state", () => {
    const backend = createPhysicsWorldBackend({ capacity: 16, bounds: { min: [-60, -5, -60], max: [60, 60, 60] }, warn: false });
    backend.addBody({ shape: { kind: "box", halfExtents: [50, 0.5, 50] }, position: [0, -0.5, 0], kind: "static" });
    const capsule = context(["a"], { entityById: () => ({ movement: { poses: ["standing", "crouch"] } }) });
    driveWith(capsule, "a", ["crouch"], 1, resolvePlayerMovementTuning({ physics: { backend } }));
    expect(playerMovementTelemetry(capsule, "a")).toEqual({ grounded: true, verticalVelocity: 0, crouching: true });
    const voxel = context(["a"]);
    driveWith(voxel, "a", [], 1, resolvePlayerMovementTuning({ collision: { voxel: true } }));
    const body = snapshotPlayerMovement(voxel, "a")!.voxelBody!;
    expect(playerMovementTelemetry(voxel, "a")).toEqual({ grounded: body.grounded, verticalVelocity: body.velocityY, crouching: false });
  });
});

describe("live authored movement tuning", () => {
  test("one resolved tuning follows replaced physics and feel through save/replay", () => {
    let movement = { feel: { runMultiplier: 1.2, jumpCutFactor: 0.2 } };
    let physics = { gravity: -20, jumpVelocity: 4 };
    const resolved = resolvePlayerMovementTuning({ get movement() { return movement; }, get physics() { return physics; } });
    expect(resolved.physics!.runSpeedMultiplier).toBe(1.2);
    expect(resolved.physics!.gravityAcceleration).toBe(20);
    movement = { feel: { runMultiplier: 3, jumpCutFactor: 0.8 } };
    physics = { gravity: -30, jumpVelocity: 9 };
    expect(resolved.physics!.runSpeedMultiplier).toBe(3);
    expect(resolved.physics!.jumpCutFactor).toBe(0.8);
    expect(resolved.physics!.gravityAcceleration).toBe(30);
    expect(resolved.physics!.jumpVelocity).toBe(9);
    const ctx = context(["a"]);
    driveWith(ctx, "a", ["moveForward", "sprint"], 10, resolved);
    const saved = snapshotPlayerMovement(ctx, "a")!;
    const position = ctx.scene.entity.get("a")!.position;
    driveWith(ctx, "a", ["moveForward", "sprint"], 10, resolved);
    const expected = ctx.scene.entity.get("a")!.position;
    restorePlayerMovement(ctx, "a", saved);
    ctx.scene.entity.setPose("a", { position });
    driveWith(ctx, "a", ["moveForward", "sprint"], 10, resolved);
    expect(ctx.scene.entity.get("a")!.position).toEqual(expected);
  });
});

describe("semantic crouch input", () => {
  const crouchContent: GameContextContent = {
    entityById: () => ({ movement: { poses: ["standing", "running", "crouch"] } }),
  };

  test("crouch reduces authored walking speed, wins over sprint, and updates stance", () => {
    const walking = context(["a"], crouchContent);
    const crouched = context(["a"], crouchContent);
    const config = resolvePlayerMovementTuning({ movement: { feel: { crouchMultiplier: 0.3 } } });
    driveWith(walking, "a", ["moveForward"], 60, config);
    driveWith(crouched, "a", ["moveForward", "crouch", "sprint"], 60, config);
    expect(crouched.scene.entity.get("a")!.position[2] / walking.scene.entity.get("a")!.position[2]).toBeCloseTo(0.3, 5);
    expect(crouched.player.movement.getPose("a")).toBe("crouch");
    stepPlayerMovement(crouched, "a", frame([]), 1 / 60, config);
    expect(crouched.player.movement.getPose("a")).toBe("standing");
  });

  test("crouch suppresses jumping only for an entity that allows crouch", () => {
    const crouched = context(["a"], crouchContent);
    stepPlayerMovement(crouched, "a", frame(["crouch", "jump"]), 1 / 60, FLAT);
    expect(crouched.scene.entity.get("a")!.position[1]).toBe(0);
    const standingOnly = context(["a"]);
    stepPlayerMovement(standingOnly, "a", frame(["crouch", "jump"]), 1 / 60, FLAT);
    expect(standingOnly.player.movement.getPose("a")).toBe("standing");
    expect(standingOnly.scene.entity.get("a")!.position[1]).toBeGreaterThan(0);
  });

  test("standing and jumping on one frame preserves the fresh jump press", () => {
    const backend = createPhysicsWorldBackend({ capacity: 16, bounds: { min: [-60, -5, -60], max: [60, 60, 60] }, warn: false });
    backend.addBody({ shape: { kind: "box", halfExtents: [50, 0.5, 50] }, position: [0, -0.5, 0], kind: "static" });
    const ctx = context(["a"], crouchContent);
    const config = resolvePlayerMovementTuning({ physics: { backend } });
    stepPlayerMovement(ctx, "a", frame(["crouch"]), 1 / 60, config);
    stepPlayerMovement(ctx, "a", frame(["jump"]), 1 / 60, config);
    expect(snapshotPlayerMovement(ctx, "a")!.controller!.verticalVelocity).toBeGreaterThan(5);
    expect(ctx.player.movement.getPose("a")).toBe("standing");
  });

  test("capsule crouch persists until headroom allows standing", () => {
    const backend = createPhysicsWorldBackend({ capacity: 16, bounds: { min: [-60, -5, -60], max: [60, 60, 60] }, warn: false });
    backend.addBody({ shape: { kind: "box", halfExtents: [50, 0.5, 50] }, position: [0, -0.5, 0], kind: "static" });
    const ceiling = backend.addBody({ shape: { kind: "box", halfExtents: [2, 0.1, 2] }, position: [0, 1.4, 0], kind: "static" });
    const ctx = context(["a"], crouchContent);
    const config = resolvePlayerMovementTuning({ physics: { backend } });
    stepPlayerMovement(ctx, "a", frame(["crouch"]), 1 / 60, config);
    expect(snapshotPlayerMovement(ctx, "a")!.controller!.crouching).toBe(true);
    stepPlayerMovement(ctx, "a", frame([]), 1 / 60, config);
    expect(ctx.player.movement.getPose("a")).toBe("crouch");
    backend.removeBody(ceiling);
    stepPlayerMovement(ctx, "a", frame([]), 1 / 60, config);
    expect(snapshotPlayerMovement(ctx, "a")!.controller!.crouching).toBe(false);
    expect(ctx.player.movement.getPose("a")).toBe("standing");
  });
});

describe("stepPlayerMovement jump buffer", () => {
  function bounces(jumpBufferMs: number | undefined): boolean {
    const t = resolvePlayerMovementTuning(jumpBufferMs === undefined ? {} : { movement: { feel: { jumpBufferMs } } });
    const ctx = context(["a"]);
    const step = (held: string[]) => stepPlayerMovement(ctx, "a", frame(held), 1 / 60, t, 0);
    step(["jump"]);
    for (let i = 0; i < 20; i++) step([]);
    while (ctx.scene.entity.get("a")!.position[1] > 0.1) step([]);
    step(["jump"]);
    for (let i = 0; i < 10; i++) step(["jump"]);
    return ctx.scene.entity.get("a")!.position[1] > 0.2;
  }

  test("movement.feel.jumpBufferMs turns a press just before landing into a jump", () => {
    expect(bounces(undefined)).toBe(false);
    expect(bounces(120)).toBe(true);
  });
});

describe("capsule jump feel", () => {
  function config(feel: NonNullable<NonNullable<Parameters<typeof resolvePlayerMovementTuning>[0]["movement"]>["feel"]> = {}, floorHalfWidth = 50): PlayerMovementTuning {
    const backend = createPhysicsWorldBackend({ capacity: 16, bounds: { min: [-60, -10, -60], max: [60, 40, 60] }, warn: false });
    backend.addBody({ shape: { kind: "box", halfExtents: [floorHalfWidth, 0.5, 50] }, position: [0, -0.5, 0], kind: "static" });
    return resolvePlayerMovementTuning({ physics: { backend, gravity: -20, jumpVelocity: 8 }, movement: { feel } });
  }

  test("capsule and heightfield share authoritative game steps and standalone stall clamping", () => {
    for (const authoritativeStep of [false, true]) {
      const capsule = context(["capsule"]);
      const heightfield = context(["heightfield"]);
      const capsuleTuning = { ...config(), authoritativeStep };
      const heightfieldTuning = { ...resolvePlayerMovementTuning({ physics: { gravity: -20, jumpVelocity: 8 } }), authoritativeStep };
      stepPlayerMovement(capsule, "capsule", frame(["jump"]), 0.2, capsuleTuning);
      stepPlayerMovement(heightfield, "heightfield", frame(["jump"]), 0.2, heightfieldTuning);
      const capsuleState = snapshotPlayerMovement(capsule, "capsule")!;
      const heightfieldState = snapshotPlayerMovement(heightfield, "heightfield")!;
      expect(capsuleState.motion!.clockMs).toBe(authoritativeStep ? 200 : 50);
      expect(capsuleState.motion!.clockMs).toBe(heightfieldState.motion!.clockMs);
      expect(capsuleState.motion!.verticalVelocity).toBe(heightfieldState.motion!.verticalVelocity);
      expect(capsule.scene.entity.get("capsule")!.position[1]).toBeCloseTo(authoritativeStep ? 0.8 : 0.35, 8);
      expect(capsule.scene.entity.get("capsule")!.position[1]).toBeCloseTo(heightfield.scene.entity.get("heightfield")!.position[1], 8);
    }
  });

  test("jump held on the first authored-floor frame starts ascent without an idle warm-up", () => {
    const ctx = context(["a"]);
    stepPlayerMovement(ctx, "a", frame(["jump"]), 1 / 60, config());
    expect(ctx.scene.entity.get("a")!.position[1]).toBeGreaterThan(0.1);
    expect(playerMovementTelemetry(ctx, "a")?.verticalVelocity).toBeGreaterThan(0);
    expect(playerMovementTelemetry(ctx, "a")?.grounded).toBe(false);
  });

  test("a released jump cuts the capsule ascent just like heightfield movement", () => {
    const peak = (hold: boolean) => {
      const ctx = context(["a"]);
      const t = config({ jumpCutFactor: 0.2 });
      stepPlayerMovement(ctx, "a", frame([]), 1 / 60, t);
      let highest = 0;
      for (let i = 0; i < 100; i++) {
        stepPlayerMovement(ctx, "a", frame(i === 0 || hold ? ["jump"] : []), 1 / 60, t);
        highest = Math.max(highest, ctx.scene.entity.get("a")!.position[1]);
      }
      return highest;
    };
    expect(peak(false)).toBeLessThan(peak(true) * 0.4);
  });

  test("a press shortly before physical landing is buffered once", () => {
    const ctx = context(["a"]);
    ctx.scene.entity.setPose("a", { position: [0, 2, 0] });
    const t = config({ jumpBufferMs: 120 });
    let pressed = false;
    let rebounded = false;
    let consumed = false;
    for (let i = 0; i < 130; i++) {
      const y = ctx.scene.entity.get("a")!.position[1];
      const held = !pressed && y < 0.25 ? ["jump"] : [];
      if (held.length > 0) pressed = true;
      stepPlayerMovement(ctx, "a", frame(held), 1 / 60, t);
      const snapshot = snapshotPlayerMovement(ctx, "a")!;
      if (pressed && snapshot.controller!.verticalVelocity > 4) rebounded = true;
      if (snapshot.jumpBuffer?.actions.jump?.consumed) consumed = true;
    }
    expect(pressed).toBe(true);
    expect(rebounded).toBe(true);
    expect(consumed).toBe(true);
    expect(snapshotPlayerMovement(ctx, "a")!.controller!.grounded).toBe(true);
  });

  test("coyote grace allows one late jump after walking off a physical platform", () => {
    const ctx = context(["a"]);
    const t = config({ coyoteMs: 100 }, 1);
    let leftGround = false;
    for (let i = 0; i < 120; i++) {
      stepPlayerMovement(ctx, "a", frame(["moveForward"]), 1 / 60, t, Math.PI / 2);
      if (!snapshotPlayerMovement(ctx, "a")!.controller!.grounded) { leftGround = true; break; }
    }
    expect(leftGround).toBe(true);
    stepPlayerMovement(ctx, "a", frame(["jump"]), 1 / 60, t);
    expect(snapshotPlayerMovement(ctx, "a")!.controller!.verticalVelocity).toBeGreaterThan(6);
  });

  test("landing recovery gates a new jump against the actual collision landing", () => {
    const ctx = context(["a"]);
    const t = config({ landingRecoveryMs: 200 });
    stepPlayerMovement(ctx, "a", frame([]), 1 / 60, t);
    stepPlayerMovement(ctx, "a", frame(["jump"]), 1 / 60, t);
    let landed = false;
    for (let i = 0; i < 100; i++) {
      stepPlayerMovement(ctx, "a", frame([]), 1 / 60, t);
      if (snapshotPlayerMovement(ctx, "a")!.controller!.grounded) { landed = true; break; }
    }
    expect(landed).toBe(true);
    stepPlayerMovement(ctx, "a", frame(["jump"]), 1 / 60, t);
    expect(snapshotPlayerMovement(ctx, "a")!.controller!.verticalVelocity).toBe(0);
  });
});

describe("snapshotPlayerMovement", () => {
  function trace(ctx: GameContext): number[] {
    const out: number[] = [];
    const inputs = [["moveForward", "jump"], ["moveForward"], ["moveRight"], [], ["turnLeft", "moveForward"]];
    for (let i = 0; i < 60; i++) {
      stepPlayerMovement(ctx, "a", frame(inputs[Math.floor(i / 12)]!), 1 / 60, FLAT);
      out.push(...ctx.scene.entity.get("a")!.position, playerMovementHeading(ctx, "a"));
    }
    return out;
  }

  test("restoring mid-jump replays the same path bit-exactly", () => {
    const ctx = context(["a"]);
    for (let i = 0; i < 10; i++) stepPlayerMovement(ctx, "a", frame(["moveForward", "jump", "turnRight"]), 1 / 60, FLAT);
    const saved = snapshotPlayerMovement(ctx, "a")!;
    const pose = [...ctx.scene.entity.get("a")!.position] as [number, number, number];
    const first = trace(ctx);
    restorePlayerMovement(ctx, "a", saved);
    ctx.scene.entity.setPose("a", { position: pose, rotationY: 0, dt: 1 / 60 });
    expect(trace(ctx)).toEqual(first);
    expect(JSON.parse(JSON.stringify(saved))).toEqual(saved);
  });

  test("a snapshot is a copy that later steps do not mutate", () => {
    const ctx = context(["a"]);
    for (let i = 0; i < 5; i++) stepPlayerMovement(ctx, "a", frame(["moveForward"]), 1 / 60, FLAT);
    const saved = snapshotPlayerMovement(ctx, "a")!;
    const before = JSON.stringify(saved);
    for (let i = 0; i < 20; i++) stepPlayerMovement(ctx, "a", frame(["moveForward", "jump"]), 1 / 60, FLAT);
    expect(JSON.stringify(saved)).toBe(before);
  });

  test("an unknown player has no snapshot, and restoring one creates its state", () => {
    const ctx = context(["a", "b"]);
    expect(snapshotPlayerMovement(ctx, "b")).toBeNull();
    for (let i = 0; i < 5; i++) stepPlayerMovement(ctx, "a", frame(["turnRight"]), 1 / 60, FLAT);
    restorePlayerMovement(ctx, "b", snapshotPlayerMovement(ctx, "a")!);
    expect(playerMovementHeading(ctx, "b")).toBe(playerMovementHeading(ctx, "a"));
  });

  test("legacy capsule saves preserve a held jump latch without inventing a new press", () => {
    const backend = createPhysicsWorldBackend({ capacity: 16, bounds: { min: [-60, -5, -60], max: [60, 60, 60] }, warn: false });
    backend.addBody({ shape: { kind: "box", halfExtents: [50, 0.5, 50] }, position: [0, -0.5, 0], kind: "static" });
    const config = resolvePlayerMovementTuning({ physics: { backend } });
    const live = context(["a"]);
    driveWith(live, "a", [], 1, config);
    driveWith(live, "a", ["jump"], 100, config);
    const saved = snapshotPlayerMovement(live, "a")!;
    expect(saved.controller!.grounded).toBe(true);
    expect(saved.controllerJumpHeld).toBe(true);
    saved.motion!.jumpHeld = false;
    saved.jumpBuffer = null;
    const replay = context(["a"]);
    replay.scene.entity.setPose("a", { position: live.scene.entity.get("a")!.position });
    restorePlayerMovement(replay, "a", saved);
    stepPlayerMovement(replay, "a", frame(["jump"]), 1 / 60, config);
    expect(snapshotPlayerMovement(replay, "a")!.controller!.grounded).toBe(true);
    expect(snapshotPlayerMovement(replay, "a")!.controller!.verticalVelocity).toBe(0);
    stepPlayerMovement(replay, "a", frame([]), 1 / 60, config);
    stepPlayerMovement(replay, "a", frame(["jump"]), 1 / 60, config);
    expect(snapshotPlayerMovement(replay, "a")!.controller!.verticalVelocity).toBeGreaterThan(5);
  });

  test("a capsule-controller player restored into a fresh context replays the same path", () => {
    function capsuleTuning(): PlayerMovementTuning {
      const backend = createPhysicsWorldBackend({ capacity: 16, bounds: { min: [-60, -5, -60], max: [60, 60, 60] }, warn: false });
      backend.addBody({ shape: { kind: "box", halfExtents: [50, 0.5, 50] }, position: [0, -0.5, 0], kind: "static" });
      return resolvePlayerMovementTuning({ physics: { backend } });
    }
    const run = (ctx: GameContext, tuning: PlayerMovementTuning, held: string[], steps: number) => {
      const out: number[] = [];
      for (let i = 0; i < steps; i++) {
        stepPlayerMovement(ctx, "a", frame(held), 1 / 60, tuning, 0);
        out.push(...ctx.scene.entity.get("a")!.position);
      }
      return out;
    };
    const live = context(["a"]);
    const liveTuning = capsuleTuning();
    run(live, liveTuning, ["moveForward"], 5);
    run(live, liveTuning, ["moveForward", "jump"], 4);
    const saved = snapshotPlayerMovement(live, "a")!;
    expect(saved.controller).not.toBeNull();
    expect(saved.controller!.verticalVelocity).toBeGreaterThan(0);
    const pose = [...live.scene.entity.get("a")!.position] as [number, number, number];
    const expected = run(live, liveTuning, ["moveForward"], 30);

    const replay = context(["a"]);
    replay.scene.entity.setPose("a", { position: pose, rotationY: 0, dt: 1 / 60 });
    restorePlayerMovement(replay, "a", saved);
    expect(run(replay, capsuleTuning(), ["moveForward"], 30)).toEqual(expected);
  });
});
