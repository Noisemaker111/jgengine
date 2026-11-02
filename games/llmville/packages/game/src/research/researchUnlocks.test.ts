import { describe, expect, test } from "bun:test";
import { decideResearchUnlock } from "@llmville/game/economy/storeTransition";
import { RESEARCH_CATALOG, meetsResearchRequirement } from "@llmville/game/research/researchUnlocks";

const TOKEN_COSTS: readonly (readonly [string, number])[] = [["gpu_1",0],["gpu_2",75],["gpu_3",280],["gpu_4",320],["gpu_5",360],["gpu_6",400],["gpu_7",440],["gpu_8",480],["gpu_9",520],["gpu_10",1520],["gpu_11",1600],["gpu_12",1680],["gpu_13",1760],["gpu_14",1840],["gpu_15",1920],["gpu_16",2000],["gpu_25",2080],["gpu_17",2160],["gpu_18",5700],["gpu_19",5850],["gpu_20",6000],["gpu_21",6150],["gpu_22",6300],["gpu_23",6450],["gpu_24",22000],["gpu_34",22500],["gpu_26",6900],["gpu_27",23500],["gpu_28",7200],["gpu_29",24500],["gpu_30",25000],["gpu_31",25500],["gpu_33",26000],["gpu_32",26500],["gpu_35",27000],["appliance_jetson_thor",925],["appliance_dgx_spark",1640],["appliance_mac_studio",1680],["appliance_tinybox_pro",3840],["appliance_dgx_b200",29500],["appliance_cerebras_cs3",30000],["appliance_groq_lpu",9150],["neon_sign",0],["llmville_banner",44],["holo_poster",48],["motivational_poster",30],["ethernet_art_display",38],["potted_plant",38],["office_plant_large",66],["fiber_optic_tree",74],["cable_tidy_bin",25],["beanbag_corner",64],["folding_chair",25],["rug_corner",52],["yoga_mat_corner",25],["coffee_cart",84],["snack_fridge",96],["energy_drink_crate",26],["side_table",34],["whiteboard_wall",72],["monitor_stand",28],["bookshelf_unit",78],["trophy_shelf",50],["server_plushie",25],["wall_clock",25],["desk_lamp",36],["rusty_case_fan",0],["basic_rack_fan",500],["small_water_cooler",2000],["large_fan",5000],["medium_water_cooler",15000],["basic_ln2",50000],["starter_rack",0],["air_rack_4",300],["air_rack_6",800],["water_rack_4",1500],["server_rack_8_water",3000],["server_rack_12",6000],["water_server_rack_12",12000],["ln2_rack_16",25000],["medium_server_rack_24",50000]];

describe("research tiers", () => {
  test("every catalog item keeps its data-token price", () => {
    expect(RESEARCH_CATALOG.map((entry) => [entry.id, entry.unlockDataTokens])).toEqual(TOKEN_COSTS.map(([id, cost]) => [id, cost]));
  });

  test("the data-token Requirement holds at the price and fails one token short", () => {
    expect(meetsResearchRequirement({ unlockDataTokens: 75 }, 75)).toBe(true);
    expect(meetsResearchRequirement({ unlockDataTokens: 75 }, 74)).toBe(false);
    expect(meetsResearchRequirement({ unlockDataTokens: 0 }, 0)).toBe(true);
  });

  test("research decisions keep their reasons", () => {
    expect(decideResearchUnlock({ itemId: "gpu_2", researchUnlocks: {}, dataTokens: 74 })).toEqual({ unlocked: false, reason: "Insufficient data tokens: need 75" });
    expect(decideResearchUnlock({ itemId: "gpu_2", researchUnlocks: {}, dataTokens: 75 })).toEqual({ unlocked: true, tokenCost: 75 });
    expect(decideResearchUnlock({ itemId: "gpu_1", researchUnlocks: {}, dataTokens: 0 })).toEqual({ unlocked: true, tokenCost: 0 });
  });
});
