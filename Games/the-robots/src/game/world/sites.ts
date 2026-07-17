import { findEditorMarker } from "@jgengine/core/editor/document";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import { authoredScene } from "./level";
import { HUB_ZONE_ID, ZONES, zoneById } from "./zones";

export { WORLD_BOUNDS, ZONES, zoneAt, zoneById, zoneLevelAt, HUB_ZONE_ID } from "./zones";

const hub = zoneById(HUB_ZONE_ID)!;
const rustflat = zoneById("windshear_waste")!;

function requiredSite(id: string) {
  const marker = findEditorMarker(authoredScene, id);
  if (!marker) throw new Error(`The authored scene is missing required site "${id}".`);
  return marker;
}

const playerSpawn = requiredSite("player_spawn");
const bolt = requiredSite("bolt");

export const CORETOWN = hub.center;

export const PLAYER_SPAWN: EntityPosition = [
  playerSpawn.position.x,
  playerSpawn.position.y,
  playerSpawn.position.z,
];
export const PLAYER_SPAWN_YAW = playerSpawn.rotationY ?? 0;

export const BOLT_POS: EntityPosition = [bolt.position.x, bolt.position.y, bolt.position.z];
export const BOLT_YAW = bolt.rotationY ?? 0;
export const RIGG_VENDOR_POS: EntityPosition = [hub.center.x - 8, 0, hub.center.z - 6];
export const SPARX_VENDOR_POS: EntityPosition = [hub.center.x + 14, 0, hub.center.z - 8];
export const BLACK_MARKET_POS: EntityPosition = [hub.center.x + 4, 0, hub.center.z + 16];

export const NEW_U_STATION: EntityPosition = [
  rustflat.travelStation.x + 4,
  0,
  rustflat.travelStation.z + 4,
];

export const TRAVEL_STATIONS: readonly { zoneId: string; name: string; x: number; z: number }[] = ZONES.map(
  (zone) => ({ zoneId: zone.id, name: zone.name, x: zone.travelStation.x, z: zone.travelStation.z }),
);
