export type BuildingStyle = "suburban" | "commercial" | "tower";

export interface BuildingSpec {
  id: string;
  model: string;
  fallbackModel?: string;
  targetHeight: number;
  style: BuildingStyle;
  footprint: number;
}

const CITY = "kaykit-city-builder";

const suburban: readonly (readonly [string, string | undefined, number])[] = [
  [`${CITY}/building_A`, `${CITY}/building_B`, 11],
  [`${CITY}/building_B`, `${CITY}/building_A`, 12],
  [`${CITY}/building_C`, `${CITY}/building_A`, 11.5],
  [`${CITY}/building_D`, `${CITY}/building_B`, 12.5],
  [`${CITY}/building_E`, `${CITY}/building_C`, 13],
  [`${CITY}/building_F`, `${CITY}/building_D`, 12],
  [`${CITY}/building_G`, `${CITY}/building_E`, 13.5],
  [`${CITY}/building_H`, `${CITY}/building_F`, 14],
  [`${CITY}/building_A_withoutBase`, `${CITY}/building_A`, 11],
  [`${CITY}/building_B_withoutBase`, `${CITY}/building_B`, 12.5],
];

const commercial: readonly (readonly [string, string | undefined, number])[] = [
  [`${CITY}/building_C`, `${CITY}/building_D`, 16],
  [`${CITY}/building_D`, `${CITY}/building_E`, 18],
  [`${CITY}/building_E`, `${CITY}/building_F`, 17],
  [`${CITY}/building_F`, `${CITY}/building_G`, 15],
  [`${CITY}/building_G`, `${CITY}/building_H`, 19],
  [`${CITY}/building_H`, `${CITY}/building_C`, 22],
  [`${CITY}/building_C_withoutBase`, `${CITY}/building_C`, 20],
  [`${CITY}/building_D_withoutBase`, `${CITY}/building_D`, 21],
  [`${CITY}/building_E_withoutBase`, `${CITY}/building_E`, 18],
  [`${CITY}/building_F_withoutBase`, `${CITY}/building_F`, 24],
];

const tower: readonly (readonly [string, string | undefined, number])[] = [
  [`${CITY}/watertower`, `${CITY}/building_H`, 40],
  [`${CITY}/building_G_withoutBase`, `${CITY}/building_G`, 46],
  [`${CITY}/building_H_withoutBase`, `${CITY}/building_H`, 52],
  [`${CITY}/building_H`, `${CITY}/building_G`, 48],
  [`${CITY}/building_G`, `${CITY}/watertower`, 44],
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
  }));
}

export const BUILDING_SPECS: readonly BuildingSpec[] = [
  ...specs("suburban", suburban, 12),
  ...specs("commercial", commercial, 13),
  ...specs("tower", tower, 17),
];

export const buildingsByStyle = (style: BuildingStyle): readonly BuildingSpec[] =>
  BUILDING_SPECS.filter((b) => b.style === style);
