export interface ZoneDef {
  id: string;
  displayName: string;
  biome: string;
  bounds: { x: [number, number]; z: [number, number] };
  safeZone: boolean;
}

export const town_square: ZoneDef = {
  id: "zone:town_square",
  displayName: "Redridge Town",
  biome: "biome:town",
  bounds: { x: [-40, 40], z: [-40, 40] },
  safeZone: true,
};

export const kobold_forest: ZoneDef = {
  id: "zone:kobold_forest",
  displayName: "Kobold Forest",
  biome: "biome:forest",
  bounds: { x: [-60, 60], z: [40, 160] },
  safeZone: false,
};

export const zones: ZoneDef[] = [town_square, kobold_forest];
