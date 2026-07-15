import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import { HUB_ZONE_ID, ZONES, zoneById } from "./zones";

export { WORLD_BOUNDS, ZONES, zoneAt, zoneById, zoneLevelAt, HUB_ZONE_ID } from "./zones";

const rustflat = zoneById("windshear_waste")!;
const hub = zoneById(HUB_ZONE_ID)!;

export const CORETOWN = hub.center;

export const PLAYER_SPAWN: EntityPosition = [rustflat.center.x + 18, 0, rustflat.center.z + 34];

export const BOLT_POS: EntityPosition = [rustflat.center.x + 8, 0, rustflat.center.z + 22];
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
