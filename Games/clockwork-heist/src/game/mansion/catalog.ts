export const WALL_CATALOG_ID = "mansion_wall";
export const DOOR_BARRIER_CATALOG_ID = "mansion_door_barrier";
export const CAMERA_CATALOG_ID = "mansion_camera_eye";
export const TREASURE_CATALOG_ID = "mansion_treasure";
export const SIDE_LOOT_CATALOG_ID = "mansion_side_loot";
export const EXIT_MARKER_CATALOG_ID = "mansion_exit_marker";

export function wallInstanceId(id: string): string {
  return `wall:${id}`;
}

export function doorBarrierInstanceId(doorId: string): string {
  return `doorbarrier:${doorId}`;
}

export function cameraInstanceId(cameraId: string): string {
  return `camera:${cameraId}`;
}

export function treasureInstanceId(treasureId: string): string {
  return `treasure:${treasureId}`;
}

export function lootInstanceId(lootId: string): string {
  return `loot:${lootId}`;
}
