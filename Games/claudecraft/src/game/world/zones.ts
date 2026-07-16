import { sceneMarkerRadius, sceneMarkerXZ, sceneZoneBand } from "../../editorLayers";
import type { ZoneId } from "../model";

export const WORLD_WIDTH = 360;
export const WORLD_DEPTH = 900;

export interface ZoneDef {
  id: ZoneId;
  name: string;
  hubName: string;
  levelRange: readonly [number, number];
  zMin: number;
  zMax: number;
  hub: { x: number; z: number; radius: number };
  graveyard: { x: number; z: number };
  tint: string;
}

interface ZoneMeta {
  id: ZoneId;
  name: string;
  hubName: string;
  levelRange: readonly [number, number];
  tint: string;
}

const ZONE_META: readonly ZoneMeta[] = [
  { id: "vale", name: "Eastbrook Vale", hubName: "Eastbrook", levelRange: [1, 7], tint: "#79a35c" },
  { id: "marsh", name: "Mirefen Marsh", hubName: "Fenbridge", levelRange: [6, 13], tint: "#5c7a52" },
  { id: "peaks", name: "Thornpeak Heights", hubName: "Highwatch", levelRange: [13, 20], tint: "#8a93a6" },
];

/** Zones — metadata in code, spatial placement (hub/graveyard/band) read from `editor.scene.json`. */
export const ZONES: readonly ZoneDef[] = ZONE_META.map((meta) => {
  const [hubX, hubZ] = sceneMarkerXZ(`hub:${meta.id}`);
  const [graveX, graveZ] = sceneMarkerXZ(`graveyard:${meta.id}`);
  const { zMin, zMax } = sceneZoneBand(meta.id);
  return {
    ...meta,
    zMin,
    zMax,
    hub: { x: hubX, z: hubZ, radius: sceneMarkerRadius(`hub:${meta.id}`) },
    graveyard: { x: graveX, z: graveZ },
  };
});

const [cryptX, cryptZ] = sceneMarkerXZ("hub:crypt");
const [cryptGraveX, cryptGraveZ] = sceneMarkerXZ("graveyard:crypt");

export const CRYPT = {
  name: "The Hollow Crypt",
  x: cryptX,
  z: cryptZ,
  radius: sceneMarkerRadius("hub:crypt"),
  graveyard: { x: cryptGraveX, z: cryptGraveZ },
};

export const PLAYER_SPAWN: readonly [number, number] = sceneMarkerXZ("spawn:player");

export function zoneAt(z: number): ZoneDef {
  const found = ZONES.find((zone) => z >= zone.zMin && z < zone.zMax);
  return found ?? ZONES[z < 0 ? 0 : ZONES.length - 1];
}

export function zoneById(id: ZoneId): ZoneDef {
  const found = ZONES.find((zone) => zone.id === id);
  if (found === undefined) throw new Error(`zones: unknown zone ${id}`);
  return found;
}

export function inCrypt(x: number, z: number): boolean {
  const dx = x - CRYPT.x;
  const dz = z - CRYPT.z;
  return dx * dx + dz * dz <= CRYPT.radius * CRYPT.radius;
}
