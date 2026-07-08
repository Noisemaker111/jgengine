import { describe, expect, test } from "bun:test";
import { resolveMovementIntent, createEmptyMovementKeys } from "./movementModel";
import {
  advanceVoxelPlayer,
  createVoxelPlayerBody,
  DEFAULT_VOXEL_DIMS,
  type SolidQuery,
} from "./voxelController";

function solidFrom(cells: Iterable<readonly [number, number, number]>): {
  isSolid: SolidQuery;
  set: Set<string>;
} {
  const set = new Set<string>();
  for (const [x, y, z] of cells) set.add(`${x},${y},${z}`);
  const isSolid: SolidQuery = (x, y, z) => set.has(`${x},${y},${z}`);
  return { isSolid, set };
}

/** A wide solid floor at cell y (top face at y+1) centred on the origin. */
function floorLayer(y: number, radius = 24): [number, number, number][] {
  const cells: [number, number, number][] = [];
  for (let x = -radius; x <= radius; x += 1)
    for (let z = -radius; z <= radius; z += 1) cells.push([x, y, z]);
  return cells;
}

const idle = resolveMovementIntent(createEmptyMovementKeys(), true);

function forwardIntent() {
  const keys = createEmptyMovementKeys();
  keys.w = true;
  return resolveMovementIntent(keys, true);
}

function jumpIntent() {
  const keys = createEmptyMovementKeys();
  keys.space = true;
  return resolveMovementIntent(keys, true);
}

const DT = 1 / 60;

describe("advanceVoxelPlayer", () => {
  test("rests on the surface without sinking or floating", () => {
    const { isSolid } = solidFrom(floorLayer(-1));
    const body = createVoxelPlayerBody(0, 0, 0);
    for (let frame = 0; frame < 120; frame += 1) {
      advanceVoxelPlayer(body, idle, 0, -1, 2.5, DT, isSolid);
    }
    expect(body.y).toBeCloseTo(0, 5);
    expect(body.grounded).toBe(true);
  });

  test("walks forward across the floor", () => {
    const { isSolid } = solidFrom(floorLayer(-1));
    const body = createVoxelPlayerBody(0, 0, 0);
    // Face -Z; hold forward. Expect the body to travel along -Z.
    for (let frame = 0; frame < 60; frame += 1) {
      advanceVoxelPlayer(body, forwardIntent(), 0, -1, 2.5, DT, isSolid);
    }
    expect(body.z).toBeLessThan(-1);
    expect(body.y).toBeCloseTo(0, 5);
  });

  test("falls into a dug hole and lands on the block below", () => {
    // Surface floor at y=-1, but the single cell under the player is missing,
    // exposing a lower floor at y=-3 (top face -2).
    const cells = floorLayer(-1).filter(([x, , z]) => !(x === 0 && z === 0));
    cells.push(...floorLayer(-3));
    const { isSolid } = solidFrom(cells);
    const body = createVoxelPlayerBody(0, 0, 0);
    for (let frame = 0; frame < 120; frame += 1) {
      advanceVoxelPlayer(body, idle, 0, -1, 2.5, DT, isSolid);
    }
    expect(body.y).toBeCloseTo(-2, 3);
    expect(body.grounded).toBe(true);
  });

  test("digging the block underfoot drops the player one level", () => {
    const { isSolid, set } = solidFrom([...floorLayer(-1), ...floorLayer(-2)]);
    const body = createVoxelPlayerBody(0, 0, 0);
    advanceVoxelPlayer(body, idle, 0, -1, 2.5, DT, isSolid);
    expect(body.y).toBeCloseTo(0, 5);
    // Mine the surface cell the player stands on.
    set.delete("0,-1,0");
    for (let frame = 0; frame < 60; frame += 1) {
      advanceVoxelPlayer(body, idle, 0, -1, 2.5, DT, isSolid);
    }
    expect(body.y).toBeCloseTo(-1, 3);
    expect(body.grounded).toBe(true);
  });

  test("a two-tall wall stops forward movement", () => {
    const cells = floorLayer(-1);
    // Wall two cells tall directly ahead (-Z) of the player.
    cells.push([0, 0, -1], [0, 1, -1]);
    const { isSolid } = solidFrom(cells);
    const body = createVoxelPlayerBody(0, 0, 0);
    for (let frame = 0; frame < 90; frame += 1) {
      advanceVoxelPlayer(body, forwardIntent(), 0, -1, 2.5, DT, isSolid);
    }
    // Blocked before entering the wall cell (front face at z=-0.5, minus half width).
    expect(body.z).toBeGreaterThan(-0.5);
    expect(body.y).toBeCloseTo(0, 5);
  });

  test("jumping rises then settles back on the floor", () => {
    const { isSolid } = solidFrom(floorLayer(-1));
    const body = createVoxelPlayerBody(0, 0, 0);
    // One jump press, then release (held jump must not re-trigger).
    advanceVoxelPlayer(body, jumpIntent(), 0, -1, 2.5, DT, isSolid);
    let peak = body.y;
    for (let frame = 0; frame < 90; frame += 1) {
      advanceVoxelPlayer(body, idle, 0, -1, 2.5, DT, isSolid);
      peak = Math.max(peak, body.y);
    }
    expect(peak).toBeGreaterThan(0.9);
    expect(body.y).toBeCloseTo(0, 3);
    expect(body.grounded).toBe(true);
  });

  test("walking off a ledge falls to the ground below", () => {
    // A pillar top at y=0 (cell -1) with a lower plain at y=-3 (cell -4) around.
    const cells: [number, number, number][] = [[0, -1, 0], ...floorLayer(-4)];
    const { isSolid } = solidFrom(cells);
    const body = createVoxelPlayerBody(0, 0, 0);
    for (let frame = 0; frame < 120; frame += 1) {
      advanceVoxelPlayer(body, forwardIntent(), 0, -1, 2.5, DT, isSolid);
    }
    expect(body.y).toBeCloseTo(-3, 3);
    expect(body.grounded).toBe(true);
  });

  test("a jumpVelocity override reaches a higher peak than the default", () => {
    const { isSolid } = solidFrom(floorLayer(-1));
    const defaultBody = createVoxelPlayerBody(0, 0, 0);
    advanceVoxelPlayer(defaultBody, jumpIntent(), 0, -1, 2.5, DT, isSolid);
    let defaultPeak = defaultBody.y;
    for (let frame = 0; frame < 90; frame += 1) {
      advanceVoxelPlayer(defaultBody, idle, 0, -1, 2.5, DT, isSolid);
      defaultPeak = Math.max(defaultPeak, defaultBody.y);
    }

    const boostedBody = createVoxelPlayerBody(0, 0, 0);
    const tuning = { jumpVelocity: 14 };
    advanceVoxelPlayer(boostedBody, jumpIntent(), 0, -1, 2.5, DT, isSolid, DEFAULT_VOXEL_DIMS, tuning);
    let boostedPeak = boostedBody.y;
    for (let frame = 0; frame < 90; frame += 1) {
      advanceVoxelPlayer(boostedBody, idle, 0, -1, 2.5, DT, isSolid, DEFAULT_VOXEL_DIMS, tuning);
      boostedPeak = Math.max(boostedPeak, boostedBody.y);
    }

    expect(boostedPeak).toBeGreaterThan(defaultPeak);
  });

  test("respects a wide footprint against a diagonal gap it cannot fit", () => {
    // Two solid columns leaving a 0.0-wide seam at the cell boundary; a body of
    // half-width 0.3 should not tunnel through the shared edge downward.
    const { isSolid } = solidFrom(floorLayer(-1));
    const body = createVoxelPlayerBody(0.49, 0, 0.49);
    for (let frame = 0; frame < 60; frame += 1) {
      advanceVoxelPlayer(body, idle, 0, -1, 2.5, DT, isSolid, DEFAULT_VOXEL_DIMS);
    }
    expect(body.y).toBeCloseTo(0, 5);
    expect(body.grounded).toBe(true);
  });
});
