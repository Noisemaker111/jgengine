import type { EntityPose } from "../scene/entityStore";

export interface SpawnPointPose {
  x: number;
  y: number;
  z: number;
  rotationY?: number;
}

export interface RespawnTarget {
  setPose(id: string, pose: EntityPose): boolean;
}

export interface SpawnPoints {
  record(id: string, pose: SpawnPointPose): void;
  get(id: string): SpawnPointPose | undefined;
  list(): readonly (SpawnPointPose & { id: string })[];
  respawn(entities: RespawnTarget, entityId: string, spawnId: string): boolean;
}

/**
 * Register spawn locations and choose where entities spawn or respawn.
 *
 * @capability spawn-points register spawn locations and pick where entities respawn
 */
export function createSpawnPoints(): SpawnPoints {
  const points = new Map<string, SpawnPointPose>();

  return {
    record(id, pose) {
      points.set(id, { ...pose });
    },
    get(id) {
      return points.get(id);
    },
    list() {
      return Array.from(points, ([id, pose]) => ({ id, ...pose }));
    },
    respawn(entities, entityId, spawnId) {
      const pose = points.get(spawnId);
      if (pose === undefined) return false;
      return entities.setPose(entityId, {
        position: { x: pose.x, y: pose.y, z: pose.z },
        ...(pose.rotationY === undefined ? {} : { rotationY: pose.rotationY }),
      });
    },
  };
}
