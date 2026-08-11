export type BuildingStyle = "suburban" | "commercial" | "tower";

export interface BuildingSpec {
  id: string;
  model: string;
  fallbackModel?: string;
  targetHeight: number;
  style: BuildingStyle;
  footprint: number;
  /** Wardrobe tint multiplied over the kit's own facade atlas — pastel, so the stucco stays lit. */
  tint: string;
}

const CITY = "kaykit-city-builder";

/**
 * Art-deco seafront pastels. These multiply the city kit's facade texture rather than replacing it,
 * so window frames, ledges and trim survive; the values stay close to white on purpose, because a
 * saturated multiply over an already-coloured atlas turns a block into mud. Each style walks the
 * list by index, so a whole street never repeats the same colour twice running.
 */
const VICE_PASTELS: readonly string[] = [
  "#ffdcc9",
  "#d6f0e6",
  "#ffe9c2",
  "#f6d8e8",
  "#dbe6f7",
  "#fff2dd",
  "#cfe9dd",
  "#ffd2c4",
  "#e8dcf2",
  "#f2ecd6",
];

/**
 * Only the based variants are cast. The kit's `*_withoutBase` meshes are the middle floors of a
 * stack: dropped straight onto terrain they meet the ground on a bare cut edge, which read as a
 * slab with no doorway. Variety comes from eight distinct facades × height × pastel instead.
 */
const suburban: readonly (readonly [string, string | undefined, number])[] = [
  [`${CITY}/building_A`, `${CITY}/building_B`, 10.5],
  [`${CITY}/building_B`, `${CITY}/building_A`, 12],
  [`${CITY}/building_C`, `${CITY}/building_A`, 11.5],
  [`${CITY}/building_D`, `${CITY}/building_B`, 13],
  [`${CITY}/building_E`, `${CITY}/building_C`, 12.5],
  [`${CITY}/building_F`, `${CITY}/building_D`, 11],
  [`${CITY}/building_G`, `${CITY}/building_E`, 14],
  [`${CITY}/building_H`, `${CITY}/building_F`, 13.5],
];

const commercial: readonly (readonly [string, string | undefined, number])[] = [
  [`${CITY}/building_C`, `${CITY}/building_D`, 16],
  [`${CITY}/building_D`, `${CITY}/building_E`, 18],
  [`${CITY}/building_E`, `${CITY}/building_F`, 17],
  [`${CITY}/building_F`, `${CITY}/building_G`, 15],
  [`${CITY}/building_G`, `${CITY}/building_H`, 19],
  [`${CITY}/building_H`, `${CITY}/building_C`, 22],
  [`${CITY}/building_A`, `${CITY}/building_C`, 20],
  [`${CITY}/building_B`, `${CITY}/building_D`, 21],
];

const tower: readonly (readonly [string, string | undefined, number])[] = [
  [`${CITY}/watertower`, `${CITY}/building_H`, 34],
  [`${CITY}/building_G`, `${CITY}/building_H`, 46],
  [`${CITY}/building_H`, `${CITY}/building_G`, 52],
  [`${CITY}/building_D`, `${CITY}/building_G`, 40],
  [`${CITY}/building_E`, `${CITY}/watertower`, 44],
];

function specs(
  style: BuildingStyle,
  list: readonly (readonly [string, string | undefined, number])[],
  footprint: number,
): BuildingSpec[] {
  return list.map(([model, fallbackModel, targetHeight], index) => ({
    id: `bld_${style}_${index}`,
    model,
    fallbackModel,
    targetHeight,
    style,
    footprint,
    tint: VICE_PASTELS[index % VICE_PASTELS.length]!,
  }));
}

export const BUILDING_SPECS: readonly BuildingSpec[] = [
  ...specs("suburban", suburban, 12),
  ...specs("commercial", commercial, 13),
  ...specs("tower", tower, 17),
];

export const buildingsByStyle = (style: BuildingStyle): readonly BuildingSpec[] =>
  BUILDING_SPECS.filter((b) => b.style === style);
