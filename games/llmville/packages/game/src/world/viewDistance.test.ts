import { expect, test } from "bun:test";
import { MAX_WORLD_CHUNK_QUERY_RADIUS, WORLD_CHUNK_SIZE, worldChunkCenterOfKey, worldChunkKeyAt, worldChunkKeysInRadius } from "../datacenter/worldChunks";
import { WORLD_CAMERA_FAR, WORLD_FOG_FAR, WORLD_FOG_NEAR, WORLD_SCENERY_RADIUS } from "./viewDistance";

test("fog hides scenery and streamed-world boundaries while moving across a chunk", () => {
  expect(WORLD_FOG_NEAR).toBeLessThan(WORLD_FOG_FAR);
  expect(WORLD_CAMERA_FAR).toBeGreaterThan(WORLD_FOG_FAR);
  expect(WORLD_SCENERY_RADIUS - WORLD_CHUNK_SIZE).toBeGreaterThanOrEqual(WORLD_FOG_FAR);
  for (const position of [{ x: 0.01, z: 63.99 }, { x: -64.01, z: -0.01 }, { x: 129.9, z: 512.1 }]) {
    const center = worldChunkCenterOfKey(worldChunkKeyAt(position));
    const keys = new Set(worldChunkKeysInRadius(center, MAX_WORLD_CHUNK_QUERY_RADIUS));
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 16) {
      expect(keys.has(worldChunkKeyAt({ x: position.x + Math.cos(angle) * WORLD_FOG_FAR, z: position.z + Math.sin(angle) * WORLD_FOG_FAR }))).toBe(true);
    }
  }
});
