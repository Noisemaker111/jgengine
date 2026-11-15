import { describe, expect, test } from "bun:test";

import { obstacleFromSolid, slideStep } from "@jgengine/core/movement/solidObstacles";
import { createBaseBuilding, type BaseBuildingConfig, type StructureShapeDef } from "./baseBuilding";

const H = Math.PI / 2;
const edges = (kind: string, y: number) => [
  { name: `${kind}+x`, kind, position: [1.5, y, 0] as const, yaw: 0 },
  { name: `${kind}+z`, kind, position: [0, y, 1.5] as const, yaw: H },
  { name: `${kind}-x`, kind, position: [-1.5, y, 0] as const, yaw: Math.PI },
  { name: `${kind}-z`, kind, position: [0, y, -1.5] as const, yaw: -H },
];
const facing = (kind: string, position: readonly [number, number, number]) => [
  { name: `${kind}a`, kind, position, yaw: H },
  { name: `${kind}b`, kind, position, yaw: -H },
];

const shapes: StructureShapeDef[] = [
  { id: "foundation", boxes: [{ min: [-1.5, -2, -1.5], max: [1.5, 0, 1.5] }], sockets: edges("floor", 0), ground: { lift: 0.3, maxStep: 1.5 } },
  { id: "wall", boxes: [{ min: [-1.5, 0, -0.15], max: [1.5, 3, 0.15] }], sockets: [...facing("base", [0, 0, 0]), ...facing("top", [0, 3, 0])] },
  {
    id: "doorframe",
    boxes: [
      { min: [-1.5, 0, -0.15], max: [-0.6, 3, 0.15] },
      { min: [0.6, 0, -0.15], max: [1.5, 3, 0.15] },
      { min: [-0.6, 2.3, -0.15], max: [0.6, 3, 0.15] },
    ],
    sockets: [...facing("base", [0, 0, 0]), ...facing("top", [0, 3, 0]), { name: "slot", kind: "slot", position: [0, 0, 0], yaw: 0 }],
  },
  {
    id: "door",
    boxes: [{ min: [-0.6, 0, -0.06], max: [0.6, 2.3, 0.06] }],
    openBoxes: [{ min: [-0.66, 0, 0], max: [-0.54, 2.3, 1.2] }],
    sockets: [{ name: "hinge", kind: "hinge", position: [0, 0, 0], yaw: Math.PI }],
  },
  { id: "ceiling", boxes: [{ min: [-1.5, -0.25, -1.5], max: [1.5, 0, 1.5] }], sockets: edges("ceiling", 0) },
  { id: "campfire", boxes: [{ min: [-0.5, 0, -0.5], max: [0.5, 0.4, 0.5] }], ground: {}, floor: true },
];

const config: BaseBuildingConfig = {
  shapes,
  tiers: [
    { id: "thatch", at: 0, damage: { ranged: 0 } },
    { id: "wood", at: 1, damage: { fist: 0, primitive: 0, ranged: 0 } },
  ],
  pieces: [
    { id: "thatch_foundation", shape: "foundation", tier: "thatch", health: 2400 },
    { id: "thatch_wall", shape: "wall", tier: "thatch", health: 1600 },
    { id: "thatch_doorframe", shape: "doorframe", tier: "thatch", health: 2400 },
    { id: "thatch_door", shape: "door", tier: "thatch", health: 1600 },
    { id: "thatch_ceiling", shape: "ceiling", tier: "thatch", health: 1600 },
    { id: "wood_wall", shape: "wall", tier: "wood", health: 10000 },
    { id: "campfire", shape: "campfire", tier: "thatch", health: 100 },
  ],
  rules: [
    { a: "floor", b: "floor" },
    { a: "base", b: "floor", mutual: false },
    { a: "base", b: "top", mutual: false },
    { a: "ceiling", b: "top", mutual: false },
    { a: "ceiling", b: "ceiling" },
    { a: "hinge", b: "slot", mutual: false },
  ],
};

const flat = () => 0;
const near = (a: readonly number[], b: readonly number[]) => a.every((value, index) => Math.abs(value - b[index]!) < 1e-6);

function hut() {
  const base = createBaseBuilding(config);
  const floor = base.place(base.plan("thatch_foundation", [0, 0, 0], { groundHeightAt: flat }))!;
  return { base, floor };
}

describe("base building", () => {
  test("a foundation stands on the ground and the next one snaps beside it", () => {
    const { base, floor } = hut();
    expect(floor.position).toEqual([0, 0.3, 0]);
    expect(floor.grounded).toBe(true);
    const next = base.plan("thatch_foundation", [3, 0.3, 0.2], { groundHeightAt: flat });
    expect(next.mode).toBe("snap");
    expect(near(next.position, [3, 0.3, 0])).toBe(true);
    expect(next.grounded).toBe(true);
  });

  test("a steep slope refuses a foundation", () => {
    const base = createBaseBuilding(config);
    const plan = base.plan("thatch_foundation", [0, 0, 0], { groundHeightAt: (x) => x });
    expect(plan).toMatchObject({ valid: false, reason: "too-steep" });
  });

  test("walls snap to a foundation edge, never twice to the same spot, and stack on each other", () => {
    const { base } = hut();
    const first = base.plan("thatch_wall", [1.5, 0.5, 0]);
    expect(first.valid).toBe(true);
    expect(near(first.position, [1.5, 0.3, 0])).toBe(true);
    base.place(first);
    expect(base.plan("thatch_wall", [1.5, 0.5, 0]).valid).toBe(false);
    const stacked = base.plan("thatch_wall", [1.5, 1.8, 0]);
    expect(stacked.valid).toBe(true);
    expect(near(stacked.position, [1.5, 3.3, 0])).toBe(true);
  });

  test("a wall with no foundation near has nothing to stand on", () => {
    const base = createBaseBuilding(config);
    expect(base.plan("thatch_wall", [20, 0, 20])).toMatchObject({ valid: false, reason: "no-support" });
  });

  test("a ceiling on a wall top reaches over the floor, and falls when its wall goes", () => {
    const { base, floor } = hut();
    const wall = base.place(base.plan("thatch_wall", [1.5, 0.5, 0]))!;
    const ceiling = base.place(base.plan("thatch_ceiling", [0.5, 3.3, 0]))!;
    expect(near(ceiling.position, [0, 3.3, 0])).toBe(true);
    const removed = base.remove(wall.id).removed.map((piece) => piece.id);
    expect(removed).toEqual([wall.id, ceiling.id]);
    expect(base.get(floor.id)).not.toBeNull();
  });

  test("taking out one ground foundation leaves its grounded neighbour standing", () => {
    const { base, floor } = hut();
    const next = base.place(base.plan("thatch_foundation", [3, 0.3, 0], { groundHeightAt: flat }))!;
    const wall = base.place(base.plan("thatch_wall", [4.5, 0.5, 0]))!;
    expect(base.remove(floor.id).removed.map((piece) => piece.id)).toEqual([floor.id]);
    expect(base.get(next.id)).not.toBeNull();
    expect(base.get(wall.id)).not.toBeNull();
  });

  test("a door fits its frame and swings open out of the way", () => {
    const { base } = hut();
    base.place(base.plan("thatch_doorframe", [1.5, 0.5, 0]));
    const door = base.place(base.plan("thatch_door", [1.5, 0.5, 0]))!;
    expect(near(door.position, [1.5, 0.3, 0])).toBe(true);
    const shut = base.solids().length;
    expect(base.toggle(door.id)).toBe(true);
    expect(base.solids().length).toBe(shut);
    const open = base.worldBoxes(base.get(door.id)!)[0]!;
    expect(Math.abs(open.center[0] - 1.5)).toBeGreaterThan(0.4);
    expect(base.toggle(base.list()[0]!.id)).toBeNull();
  });

  test("damage follows the tier: wood shrugs off fists, thatch breaks and drops what it held", () => {
    const { base, floor } = hut();
    const wood = base.place(base.plan("wood_wall", [1.5, 0.5, 0]))!;
    expect(base.damage(wood.id, 50, "fist").applied).toBe(0);
    expect(base.damage(wood.id, 50, "metal").applied).toBe(50);
    expect(base.damage(floor.id, 100, "ranged").applied).toBe(0);
    const broken = base.damage(floor.id, 5000, "fist");
    expect(broken.applied).toBe(2400);
    expect(broken.removed.map((piece) => piece.id)).toEqual([floor.id, wood.id]);
    expect(base.list()).toEqual([]);
  });

  test("a campfire sits on the floor it is put on and goes when the floor goes", () => {
    const { base, floor } = hut();
    const fire = base.place(base.plan("campfire", [0.5, 0.5, 0.5], { groundHeightAt: flat }))!;
    expect(fire.position[1]).toBeCloseTo(0.3);
    expect(fire.restsOn).toBe(floor.id);
    expect(base.remove(floor.id).removed).toHaveLength(2);
  });

  test("the ray finds the wall in front, and its solid stops a walker", () => {
    const { base } = hut();
    const wall = base.place(base.plan("thatch_wall", [0, 0.5, 1.5]))!;
    const hit = base.raycast([0, 1.5, -5], [0, 0, 1], 10);
    expect(hit?.id).toBe(wall.id);
    expect(hit?.distance).toBeCloseTo(6.35);
    const obstacles = base.solids().map(obstacleFromSolid);
    const step = slideStep([0, 0.5, 0.8], 0, 1, obstacles, 0.35, 0);
    expect(0.8 + step.stepZ).toBeLessThan(1.35);
  });

  test("snapshot and restore round-trip the base", () => {
    const { base } = hut();
    base.place(base.plan("thatch_wall", [1.5, 0.5, 0]));
    const saved = base.snapshot();
    const copy = createBaseBuilding(config);
    copy.restore(saved);
    expect(copy.list()).toEqual(base.list());
    expect(copy.plan("thatch_foundation", [3, 0.3, 0], { groundHeightAt: flat }).valid).toBe(true);
  });
});

describe("building on a moving frame", () => {
  // A walking carrier: origin on the ground, a 4 x 7 m deck 3 m up.
  const deck = { halfX: 2, halfZ: 3.5, height: 3 };
  const ground = () => -10;

  function carrierBase() {
    const base = createBaseBuilding(config);
    base.setFrame("hoover", { position: [10, 0, 0], yaw: 0 }, deck);
    return base;
  }

  test("a foundation planned over the deck stands on it and belongs to the frame", () => {
    const base = carrierBase();
    const plan = base.plan("thatch_foundation", [10, 3, 1.5], { groundHeightAt: ground });
    expect(plan).toMatchObject({ valid: true, mode: "ground", grounded: true, parent: "hoover" });
    expect(near(plan.position, [10, 3.3, 1.5])).toBe(true);
    const placed = base.place(plan)!;
    expect(placed.parent).toBe("hoover");
    expect(near(placed.position, [10, 3.3, 1.5])).toBe(true);
    // Stored in the frame: the save keeps it local to the deck.
    expect(near(base.snapshot().pieces[0]!.position, [0, 3.3, 1.5])).toBe(true);
  });

  test("a foundation half off the deck edge is refused, and off the deck it is a world piece", () => {
    const base = carrierBase();
    expect(base.plan("thatch_foundation", [12, 3, 0], { groundHeightAt: ground })).toMatchObject({ valid: false, reason: "too-steep" });
    const away = base.plan("thatch_foundation", [30, 0, 0], { groundHeightAt: flat });
    expect(away.parent ?? null).toBeNull();
  });

  test("pieces ride the frame as it walks and turns: snapped walls, world boxes and solids all follow", () => {
    const base = carrierBase();
    const floor = base.place(base.plan("thatch_foundation", [10, 3, 0], { groundHeightAt: ground }))!;
    const wallPlan = base.plan("thatch_wall", [11.5, 3.5, 0]);
    expect(wallPlan.parent).toBe("hoover");
    const wall = base.place(wallPlan)!;
    const version = base.version();
    base.setFrame("hoover", { position: [20, 1, 5], yaw: Math.PI / 2 }, deck);
    expect(base.version()).toBeGreaterThan(version);
    // A quarter turn: the frame's +X now points to world -Z.
    expect(near(base.get(floor.id)!.position, [20, 4.3, 5])).toBe(true);
    expect(near(base.get(wall.id)!.position, [20, 4.3, 3.5])).toBe(true);
    expect(base.get(wall.id)!.rotationY).toBeCloseTo(wall.rotationY + Math.PI / 2);
    const wallSolid = base.solids().find((solid) => Math.abs(solid.center[1] - (4.3 + 1.5)) < 1e-6)!;
    expect(near(wallSolid.center, [20, 5.8, 3.5])).toBe(true);
    // Building on keeps snapping where the pieces are now.
    const second = base.plan("thatch_wall", [18.5, 4.8, 5]);
    expect(second.valid).toBe(true);
    expect(second.parent).toBe("hoover");
    expect(near(second.position, [18.5, 4.3, 5])).toBe(true);
  });

  test("the same pose again changes nothing, and world pieces never move with a frame", () => {
    const base = carrierBase();
    const home = base.place(base.plan("thatch_foundation", [-20, 0, 0], { groundHeightAt: flat }))!;
    base.place(base.plan("thatch_foundation", [10, 3, 0], { groundHeightAt: ground }));
    const version = base.version();
    base.setFrame("hoover", { position: [10, 0, 0], yaw: 0 }, deck);
    expect(base.version()).toBe(version);
    base.setFrame("hoover", { position: [40, 0, 0], yaw: 1 }, deck);
    expect(base.get(home.id)!.position).toEqual(home.position);
  });

  test("when the frame goes, everything built on it falls and the world base stands", () => {
    const base = carrierBase();
    const home = base.place(base.plan("thatch_foundation", [-20, 0, 0], { groundHeightAt: flat }))!;
    const floor = base.place(base.plan("thatch_foundation", [10, 3, 0], { groundHeightAt: ground }))!;
    const wall = base.place(base.plan("thatch_wall", [11.5, 3.5, 0]))!;
    const removed = base.removeFrame("hoover").removed.map((piece) => piece.id).sort();
    expect(removed).toEqual([floor.id, wall.id].sort());
    expect(base.list().map((piece) => piece.id)).toEqual([home.id]);
  });

  test("a save restores the deck pieces local to their frame; they wait unseen until it is posed", () => {
    const base = carrierBase();
    base.place(base.plan("thatch_foundation", [10, 3, 0], { groundHeightAt: ground }));
    base.place(base.plan("thatch_wall", [11.5, 3.5, 0]));
    const copy = createBaseBuilding(config);
    copy.restore(base.snapshot());
    expect(copy.list()).toEqual([]);
    expect(copy.snapshot().pieces.length).toBe(2);
    copy.setFrame("hoover", { position: [-5, 0, 2], yaw: 0 }, deck);
    expect(copy.list().map((piece) => piece.position[0])).toEqual([-5, -3.5]);
  });
});
