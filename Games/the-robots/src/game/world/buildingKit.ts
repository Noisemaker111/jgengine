import { defineBuildingKit, type BuildingKit, type BuildingKitPart } from "@jgengine/core/world/buildingKit";

import { assets } from "../assets";

const SCIFI = "quaternius-modular-scifi";

function model(name: string): string {
  const ref = assets.resolve(`${SCIFI}/${name}`);
  if (ref === null) throw new Error(`the-robots: settlement kit references missing model "${SCIFI}/${name}"`);
  return ref.url;
}

const contained = (names: readonly string[]): BuildingKitPart[] =>
  names.map((name) => ({ model: model(name), fit: "contain" }));

const stretched = (names: readonly string[]): string[] => names.map((name) => model(name));

/**
 * Ferralon's settlements are prefab sci-fi panelling bolted onto scrap, so the facade generator's
 * part slots bind straight to the modular sci-fi pack. The `roof` slot is one slab spanning the
 * whole building rather than a tiled grid, so a stretched deck plate covers it in a single instance.
 */
export const DESERT_SETTLEMENT_KIT: BuildingKit = defineBuildingKit({
  id: "ferralon-settlement-desert",
  parts: {
    roof: stretched(["Platform_DarkPlates"]),
    wall: stretched(["WallAstra_Straight", "WallAstra_Straight_Flat", "WallBand_Straight"]),
    window: stretched([
      "WallAstra_Straight_Window",
      "WallAstra_Straight_Flat_Window",
      "WallWindow_Straight",
    ]),
    storefront: stretched(["Door_Metal", "Door_Simple"]),
    shutter: stretched(["Door_DarkMetal", "Door_Frame_Square_Blocked"]),
    awning: stretched(["TopAstra_Straight", "TopSimple_Straight", "TopPlastic_Straight"]),
    corner: stretched(["Column_Simple", "Column_MetalSupport"]),
    guardrail: stretched(["Prop_Rail_4", "Prop_Rail_3", "Prop_Rail_2"]),
    airConditioner: contained(["Prop_Vent_Big", "Prop_Vent_Small", "Prop_Vent_Wide"]),
    storeSign: contained(["Prop_Light_Wide"]),
    roofProp: contained(["Prop_Crate3", "Prop_Crate4", "Prop_Barrel_Large", "Prop_AccessPoint"]),
  },
  omit: ["clothesline"],
});

/**
 * The same generator with derelict art: split panels, blown-out windows, welded-shut fronts. No
 * awning — a ruined settlement has no intact canopy left — and, like the clean kit, no clothesline.
 */
export const RUIN_SETTLEMENT_KIT: BuildingKit = defineBuildingKit({
  id: "ferralon-settlement-ruin",
  parts: {
    roof: stretched(["Platform_Metal2"]),
    wall: stretched(["WallAstra_Straight_Broken", "WallBand_Straight_Broken", "WallAstra_Straight"]),
    window: stretched(["WallWindow_Straight", "WallAstra_Straight_Broken"]),
    storefront: stretched(["Door_Frame_Square_Blocked", "Door_Simple"]),
    shutter: stretched(["Door_Frame_Square_Blocked", "Door_DarkMetal"]),
    corner: stretched(["Column_MetalSupport", "Column_Pipes"]),
    guardrail: stretched(["Prop_Rail_2", "Prop_Rail_3"]),
    storeSign: contained(["Decal_Sign"]),
    airConditioner: contained(["Prop_Vent_Small", "Prop_Vent_Wide"]),
    roofProp: contained(["Prop_Barrel_Large", "Prop_Crate3", "Prop_Cable_3"]),
  },
  omit: ["clothesline", "awning"],
});

/** Settlement art per zone style; `ZoneDef.settlement.style` indexes it. */
export const SETTLEMENT_KITS: Record<"desert" | "ruin", BuildingKit> = {
  desert: DESERT_SETTLEMENT_KIT,
  ruin: RUIN_SETTLEMENT_KIT,
};
