import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import { HUB_ZONE_ID, ZONES, zoneById } from "./zones";

export { WORLD_BOUNDS, ZONES, zoneAt, zoneById, zoneLevelAt, HUB_ZONE_ID } from "./zones";

const windshear = zoneById("windshear_waste")!;
const hub = zoneById(HUB_ZONE_ID)!;

export const FYRESTONE = hub.center;

export const PLAYER_SPAWN: EntityPosition = [windshear.center.x + 18, 0, windshear.center.z + 34];

export const CLAPTRAP_POS: EntityPosition = [windshear.center.x + 8, 0, windshear.center.z + 22];
export const MARCUS_VENDOR_POS: EntityPosition = [hub.center.x - 8, 0, hub.center.z - 6];
export const ZED_VENDOR_POS: EntityPosition = [hub.center.x + 14, 0, hub.center.z - 8];
export const BLACK_MARKET_POS: EntityPosition = [hub.center.x + 4, 0, hub.center.z + 16];

export const NEW_U_STATION: EntityPosition = [
  windshear.travelStation.x + 4,
  0,
  windshear.travelStation.z + 4,
];

export const TRAVEL_STATIONS: readonly { zoneId: string; name: string; x: number; z: number }[] = ZONES.map(
  (zone) => ({ zoneId: zone.id, name: zone.name, x: zone.travelStation.x, z: zone.travelStation.z }),
);
