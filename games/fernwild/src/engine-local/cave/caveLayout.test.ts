// framework-ok: only Fernwild uses this; the second adopter extracts it (#2837)
import { describe, expect, test } from "bun:test";

import { resolveObstacleStep } from "@jgengine/core/movement/movementModel";
import { obstacleFromSolid } from "@jgengine/core/movement/solidObstacles";
import { caveLayout } from "./caveLayout";
import { caveMesh } from "./caveMesh";

const flat = () => 0;
/** A cave heading +z from the origin for 40 m, then a 12 m chamber. */
const STRAIGHT = caveLayout({ path: [[0, 0], [0, 40]], width: 7, height: 6, chamber: 12, cover: 6 }, flat);

/** Whether any of the cave's solids overlaps a walker standing at (x, z). */
function blocked(x: number, z: number, radius = 0.4): boolean {
  return STRAIGHT.solids.some((solid) => {
    const yaw = solid.rotationY ?? 0;
    const dx = x - solid.center[0];
    const dz = z - solid.center[2];
    // Into the solid's frame: local +x is (cos, -sin) in XZ.
    const localX = dx * Math.cos(yaw) - dz * Math.sin(yaw);
    const localZ = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    return Math.abs(localX) < solid.halfExtents[0] + radius && Math.abs(localZ) < solid.halfExtents[2] + radius && solid.center[1] - solid.halfExtents[1] < 1;
  });
}

describe("caveLayout", () => {
  test("the tunnel is open down its middle and walled either side, into a chamber walled all round but where it comes in", () => {
    for (let z = 1; z < 46; z += 1) expect(blocked(0, z)).toBe(false);
    for (let z = 2; z < 26; z += 4) {
      expect(blocked(4.5, z)).toBe(true);
      expect(blocked(-4.5, z)).toBe(true);
    }
    // Round the chamber: every way out but back down the tunnel is rock.
    for (let k = 0; k < 24; k += 1) {
      const angle = (k / 24) * Math.PI * 2;
      const x = Math.cos(angle) * 14;
      const z = 40 + Math.sin(angle) * 14;
      const towardTunnel = Math.abs(x) < 3.5 && z < 40;
      expect(blocked(x, z)).toBe(!towardTunnel);
    }
    // The inside is open from wall to wall across the chamber.
    expect(blocked(8, 40)).toBe(false);
    expect(blocked(-8, 44)).toBe(false);
  });

  test("a walker can walk from the mouth to the chamber, and cannot walk out through a wall", () => {
    const obstacles = STRAIGHT.solids.map(obstacleFromSolid);
    let at: [number, number, number] = [0, 0, -2];
    for (let i = 0; i < 400; i += 1) {
      const step = resolveObstacleStep(at, 0, 0.12, obstacles, 0.4);
      at = [at[0] + step.stepX, 0, at[2] + step.stepZ];
    }
    expect(at[2]).toBeGreaterThan(45);
    // Sideways from the middle of the tunnel: stopped at the wall.
    let side: [number, number, number] = [0, 0, 15];
    for (let i = 0; i < 200; i += 1) {
      const step = resolveObstacleStep(side, 0.12, 0, obstacles, 0.4);
      side = [side[0] + step.stepX, 0, side[2] + step.stepZ];
    }
    expect(side[0]).toBeLessThan(3.6);
    expect(side[0]).toBeGreaterThan(2.5);
  });

  test("inside, depth and spots follow the tunnel", () => {
    expect(STRAIGHT.inside(0, 10)).toBe(true);
    expect(STRAIGHT.inside(10, 10)).toBe(false);
    expect(STRAIGHT.inside(5, 42)).toBe(true);
    expect(STRAIGHT.depth(0, 10)).toBeCloseTo(10, 5);
    expect(STRAIGHT.depth(3, 45)).toBeCloseTo(40, 5);
    expect(STRAIGHT.depth(-20, 0)).toBeNull();
    // Just in front of the mouth, on the centreline, is still outside.
    expect(STRAIGHT.inside(0, -2)).toBe(false);
    expect(STRAIGHT.depth(0, 0.5)).toBeCloseTo(0.5, 5);
    expect(STRAIGHT.spots.at(-1)).toEqual([0, 40]);
    for (const spot of STRAIGHT.spots) expect(STRAIGHT.inside(spot[0], spot[1])).toBe(true);
  });

  test("the floor follows the ground: walls stand on a slope", () => {
    const slope = (_x: number, z: number) => z * 0.25;
    const cave = caveLayout({ path: [[0, 0], [0, 40]] }, slope);
    const near = cave.solids.find((solid) => Math.abs(solid.center[2] - 10) < 2)!;
    expect(near.center[1] - near.halfExtents[1]).toBeLessThan(slope(0, 10) - 1);
    expect(near.center[1] + near.halfExtents[1]).toBeGreaterThan(slope(0, 10) + 6);
  });

  test("its rock is a closed-over tunnel: every inside vertex is within the walls and under the roof, the same seed gives the same rock", () => {
    const mesh = caveMesh(STRAIGHT, flat);
    expect(mesh.inner.indices.length).toBeGreaterThan(0);
    expect(mesh.outer.indices.length).toBeGreaterThan(0);
    for (const part of [mesh.inner, mesh.outer]) for (const index of part.indices) expect(index).toBeLessThan(part.positions.length / 3);
    let roof = 0;
    for (let i = 0; i < mesh.inner.positions.length; i += 3) roof = Math.max(roof, mesh.inner.positions[i + 1]!);
    expect(roof).toBeGreaterThan(6);
    // Above the middle of the tunnel there is rock: some inner triangle passes over (0, 20).
    const over = (x: number, z: number) => {
      const p = mesh.inner.positions;
      for (let t = 0; t < mesh.inner.indices.length; t += 3) {
        const [a, b, c] = [mesh.inner.indices[t]!, mesh.inner.indices[t + 1]!, mesh.inner.indices[t + 2]!];
        const ax = p[a * 3]!, az = p[a * 3 + 2]!, bx = p[b * 3]!, bz = p[b * 3 + 2]!, cx = p[c * 3]!, cz = p[c * 3 + 2]!;
        const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
        const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
        if (u >= 0 && v >= 0 && u + v <= 1 && Math.min(p[a * 3 + 1]!, p[b * 3 + 1]!, p[c * 3 + 1]!) > 3) return true;
      }
      return false;
    };
    expect(over(0, 20)).toBe(true);
    expect(over(0, 40)).toBe(true);
    expect(over(0, -5)).toBe(false);
    expect(caveMesh(STRAIGHT, flat).inner.positions).toEqual(mesh.inner.positions);
  });

  test("its floor covers the tunnel and the chamber, lying just above the ground it follows and nowhere outside", () => {
    const hill = (x: number, z: number) => 0.1 * z + 0.05 * x;
    const { floor } = caveMesh(STRAIGHT, hill);
    for (let i = 0; i < floor.positions.length; i += 3) {
      const [x, y, z] = [floor.positions[i]!, floor.positions[i + 1]!, floor.positions[i + 2]!];
      expect(y - hill(x, z)).toBeCloseTo(0.04, 5);
      // Every floor point is in the cave: on the straight tunnel's width, or within the chamber.
      const [cx, cz] = STRAIGHT.chamber.center;
      const inTunnel = z >= -1e-6 && z <= 40 + 1e-6 && Math.abs(x) <= 3.5 + 1e-6;
      expect(inTunnel || Math.hypot(x - cx, z - cz) <= STRAIGHT.chamber.radius + 1e-6).toBe(true);
    }
    const covered = (x: number, z: number) => {
      const p = floor.positions;
      for (let t = 0; t < floor.indices.length; t += 3) {
        const [a, b, c] = [floor.indices[t]!, floor.indices[t + 1]!, floor.indices[t + 2]!];
        const ax = p[a * 3]!, az = p[a * 3 + 2]!, bx = p[b * 3]!, bz = p[b * 3 + 2]!, cx = p[c * 3]!, cz = p[c * 3 + 2]!;
        const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
        const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
        if (u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6) return true;
      }
      return false;
    };
    const [cx, cz] = STRAIGHT.chamber.center;
    for (const [x, z] of [[0, 1], [3, 10], [-3, 25], [cx, cz], [cx + 8, cz], [cx, cz - 8]] as const) expect(covered(x, z)).toBe(true);
    expect(covered(0, -3)).toBe(false);
    expect(covered(10, 10)).toBe(false);
  });
});
