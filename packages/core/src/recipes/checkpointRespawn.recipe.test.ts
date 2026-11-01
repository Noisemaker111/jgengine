import { expect, test } from "bun:test";

import { changeStatPool, createSpawnPoints, createStatPool } from "../parts";

/**
 * @recipe Checkpoint respawn
 * Placement records where you may come back, and a Meter says when you are down; respawning refills the meter and moves you there.
 */
test("checkpoint respawn", () => {
  const spawns = createSpawnPoints();
  const poses = new Map<string, { position: { x: number; y: number; z: number } }>();
  let health = createStatPool({ max: 100 });
  spawns.record("camp", { x: 40, y: 0, z: -5 });
  const hurt = (amount: number, checkpoint: string) => {
    health = changeStatPool(health, -amount).pool;
    if (health.current > 0) return false;
    health = createStatPool({ max: health.max });
    return spawns.respawn({ setPose: (id, pose) => !!poses.set(id, pose) }, "player", checkpoint);
  };

  expect(hurt(60, "camp")).toBe(false);
  expect(hurt(60, "camp")).toBe(true);
  expect(poses.get("player")?.position).toEqual({ x: 40, y: 0, z: -5 });
  expect(health.current).toBe(100);
  expect(hurt(100, "missing")).toBe(false);
});
