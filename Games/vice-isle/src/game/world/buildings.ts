export type BuildingStyle = "suburban" | "commercial" | "tower";

export interface BuildingSpec {
  id: string;
  glb: string;
  targetHeight: number;
  style: BuildingStyle;
  footprint: number;
}

const suburban: readonly (readonly [string, number])[] = [
  ["building-type-a", 11],
  ["building-type-b", 12],
  ["building-type-c", 11.5],
  ["building-type-e", 12.5],
  ["building-type-f", 13],
  ["building-type-g", 12],
  ["building-type-m", 13.5],
  ["building-type-n", 14],
  ["building-type-o", 11],
  ["building-type-t", 12.5],
];

const commercial: readonly (readonly [string, number])[] = [
  ["building-a", 16],
  ["building-b", 18],
  ["building-e", 17],
  ["building-f", 15],
  ["building-g", 19],
  ["building-i", 22],
  ["building-j", 20],
  ["building-l", 21],
  ["building-m", 18],
  ["building-n", 24],
];

const tower: readonly (readonly [string, number])[] = [
  ["building-skyscraper-a", 40],
  ["building-skyscraper-b", 46],
  ["building-skyscraper-c", 52],
  ["building-skyscraper-d", 48],
  ["building-skyscraper-e", 44],
];

function specs(style: BuildingStyle, pack: string, list: readonly (readonly [string, number])[], footprint: number): BuildingSpec[] {
  return list.map(([glb, targetHeight]) => ({
    id: `bld_${glb.replace(/^building-?/, "").replace(/-/g, "_")}`,
    glb: `${pack}/${glb}`,
    targetHeight,
    style,
    footprint,
  }));
}

export const BUILDING_SPECS: readonly BuildingSpec[] = [
  ...specs("suburban", "kenney-city-suburban", suburban, 12),
  ...specs("commercial", "kenney-city-commercial", commercial, 13),
  ...specs("tower", "kenney-city-commercial", tower, 17),
];

export const buildingsByStyle = (style: BuildingStyle): readonly BuildingSpec[] =>
  BUILDING_SPECS.filter((b) => b.style === style);
