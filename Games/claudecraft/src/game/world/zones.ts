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

export const ZONES: readonly ZoneDef[] = [
  {
    id: "vale",
    name: "Eastbrook Vale",
    hubName: "Eastbrook",
    levelRange: [1, 7],
    zMin: -450,
    zMax: -150,
    hub: { x: 0, z: -300, radius: 26 },
    graveyard: { x: -34, z: -270 },
    tint: "#79a35c",
  },
  {
    id: "marsh",
    name: "Mirefen Marsh",
    hubName: "Fenbridge",
    levelRange: [6, 13],
    zMin: -150,
    zMax: 150,
    hub: { x: 0, z: 0, radius: 20 },
    graveyard: { x: 30, z: 32 },
    tint: "#5c7a52",
  },
  {
    id: "peaks",
    name: "Thornpeak Heights",
    hubName: "Highwatch",
    levelRange: [13, 20],
    zMin: 150,
    zMax: 450,
    hub: { x: 0, z: 300, radius: 20 },
    graveyard: { x: -28, z: 330 },
    tint: "#8a93a6",
  },
];

export const CRYPT = {
  name: "The Hollow Crypt",
  x: 110,
  z: 392,
  radius: 24,
  graveyard: { x: 86, z: 360 },
};

export const PLAYER_SPAWN: readonly [number, number] = [6, -288];

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
