import { findEditorMarker } from "@jgengine/core/editor/document";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import { authoredScene } from "./level";
import { HUB_ZONE_ID, ZONES, zoneById } from "./zones";

export { WORLD_BOUNDS, ZONES, zoneAt, zoneById, zoneLevelAt, HUB_ZONE_ID } from "./zones";

const hub = zoneById(HUB_ZONE_ID)!;

function requiredSite(id: string) {
  const marker = findEditorMarker(authoredScene, id);
  if (!marker) throw new Error(`The authored scene is missing required site "${id}".`);
  return marker;
}

const playerSpawn = requiredSite("player_spawn");
const bolt = requiredSite("bolt");
const riggVendor = requiredSite("vendor_rigg");
const sparxVendor = requiredSite("vendor_zed");
const blackMarket = requiredSite("vendor_black_market");
const newU = requiredSite("new_u_station");

export const CORETOWN = hub.center;

export const PLAYER_SPAWN: EntityPosition = [
  playerSpawn.position.x,
  playerSpawn.position.y,
  playerSpawn.position.z,
];
export const PLAYER_SPAWN_YAW = playerSpawn.rotationY ?? 0;

export const BOLT_POS: EntityPosition = [bolt.position.x, bolt.position.y, bolt.position.z];
export const BOLT_YAW = bolt.rotationY ?? 0;

export const RIGG_VENDOR_POS: EntityPosition = [
  riggVendor.position.x,
  riggVendor.position.y,
  riggVendor.position.z,
];
export const SPARX_VENDOR_POS: EntityPosition = [
  sparxVendor.position.x,
  sparxVendor.position.y,
  sparxVendor.position.z,
];
export const BLACK_MARKET_POS: EntityPosition = [
  blackMarket.position.x,
  blackMarket.position.y,
  blackMarket.position.z,
];

export const NEW_U_STATION: EntityPosition = [newU.position.x, newU.position.y, newU.position.z];

export const TRAVEL_STATIONS: readonly { zoneId: string; name: string; x: number; z: number }[] = ZONES.map(
  (zone) => ({ zoneId: zone.id, name: zone.name, x: zone.travelStation.x, z: zone.travelStation.z }),
);
