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
  resolvePlayerMovementTuning,
  restorePlayerMovement,
  snapshotPlayerMovement,
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
