export type BuildingStyle = "suburban" | "commercial" | "tower";

export interface BuildingSpec {
  id: string;
  /** Preferred catalog id (modular village / dungeon walls until city kit lands). */
  model: string;
  fallbackModel?: string;
  targetHeight: number;
  style: BuildingStyle;
  footprint: number;
}

const VILLAGE = "quaternius-medieval-village";
const DUNGEON = "kaykit-dungeon";

/** Placeholders until a free glTF city kit is mirrored — village walls stand in. */
const suburban: readonly (readonly [string, string | undefined, number])[] = [
  [`${VILLAGE}/Wall_Plaster_Straight`, `${VILLAGE}/Wall_UnevenBrick_Straight`, 11],
  [`${VILLAGE}/Wall_Plaster_Window_Wide_Flat`, `${VILLAGE}/Wall_Plaster_Straight`, 12],
  [`${VILLAGE}/Wall_Plaster_Door_Flat`, `${VILLAGE}/Wall_Plaster_Straight`, 11.5],
  [`${VILLAGE}/Wall_UnevenBrick_Straight`, `${VILLAGE}/Wall_Plaster_Straight`, 12.5],
  [`${VILLAGE}/Wall_UnevenBrick_Window_Wide_Flat`, `${VILLAGE}/Wall_UnevenBrick_Straight`, 13],
  [`${VILLAGE}/Wall_Plaster_WoodGrid`, `${VILLAGE}/Wall_Plaster_Straight`, 12],
  [`${VILLAGE}/Wall_Plaster_Straight_Base`, `${VILLAGE}/Wall_Plaster_Straight`, 13.5],
  [`${VILLAGE}/Wall_UnevenBrick_Door_Flat`, `${VILLAGE}/Wall_UnevenBrick_Straight`, 14],
  [`${VILLAGE}/Wall_Plaster_Window_Thin_Round`, `${VILLAGE}/Wall_Plaster_Straight`, 11],
  [`${VILLAGE}/Wall_UnevenBrick_Window_Thin_Round`, `${VILLAGE}/Wall_UnevenBrick_Straight`, 12.5],
];

const commercial: readonly (readonly [string, string | undefined, number])[] = [
  [`${DUNGEON}/wall`, `${VILLAGE}/Wall_Plaster_Straight`, 16],
  [`${DUNGEON}/wall_arched`, `${DUNGEON}/wall`, 18],
  [`${DUNGEON}/wall_window_open`, `${DUNGEON}/wall`, 17],
  [`${DUNGEON}/wall_doorway`, `${DUNGEON}/wall`, 15],
  [`${DUNGEON}/wall_corner`, `${DUNGEON}/wall`, 19],
  [`${DUNGEON}/wall_gated`, `${DUNGEON}/wall_arched`, 22],
  [`${DUNGEON}/wall_scaffold`, `${DUNGEON}/wall`, 20],
  [`${DUNGEON}/wall_Tsplit`, `${DUNGEON}/wall`, 21],
  [`${DUNGEON}/wall_crossing`, `${DUNGEON}/wall`, 18],
  [`${DUNGEON}/wall_archedwindow_open`, `${DUNGEON}/wall_window_open`, 24],
];

const tower: readonly (readonly [string, string | undefined, number])[] = [
  [`${DUNGEON}/wall_pillar`, `${DUNGEON}/pillar`, 40],
  [`${DUNGEON}/pillar_decorated`, `${DUNGEON}/wall_pillar`, 46],
  [`${DUNGEON}/wall_scaffold`, `${DUNGEON}/wall_arched`, 52],
  [`${DUNGEON}/wall_archedwindow_gated`, `${DUNGEON}/wall_corner_gated`, 48],
  [`${DUNGEON}/wall_corner_gated`, `${DUNGEON}/wall_corner`, 44],
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
