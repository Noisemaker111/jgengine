export const RECIPES = [
    {
        id: "recipe_eastbrook_arming_sword",
        category: "weaponcrafting",
        inputs: [
            { itemId: "bone_fragments", count: 2 },
            { itemId: "linen_scrap", count: 1 },
        ],
        outputs: [{ itemId: "eastbrook_arming_sword", count: 1 }],
    },
    {
        id: "recipe_eastbrook_chain_vest",
        category: "armorcrafting",
        inputs: [{ itemId: "bone_fragments", count: 3 }],
        outputs: [{ itemId: "eastbrook_chain_vest", count: 1 }],
    },
    {
        id: "recipe_eastbrook_wool_trousers",
        category: "tailoring",
        inputs: [{ itemId: "linen_scrap", count: 3 }],
        outputs: [{ itemId: "eastbrook_wool_trousers", count: 1 }],
    },
    {
        id: "recipe_tanned_leather_jerkin",
        category: "leatherworking",
        inputs: [
            { itemId: "spider_leg", count: 2 },
            { itemId: "bone_fragments", count: 1 },
        ],
        outputs: [{ itemId: "tanned_leather_jerkin", count: 1 }],
    },
    {
        id: "recipe_tough_jerky",
        category: "cooking",
        inputs: [{ itemId: "spider_leg", count: 1 }],
        outputs: [{ itemId: "tough_jerky", count: 1 }],
    },
    {
        id: "recipe_minor_healing_potion",
        category: "alchemy",
        inputs: [
            { itemId: "linen_scrap", count: 1 },
            { itemId: "spider_leg", count: 1 },
        ],
        outputs: [{ itemId: "minor_healing_potion", count: 1 }],
    },
    {
        id: "recipe_thorium_mining_pick",
        category: "engineering",
        station: "forge",
        inputs: [
            { itemId: "thorium_ore", count: 4 },
            { itemId: "mithril_mining_pick", count: 1 },
        ],
        outputs: [{ itemId: "thorium_mining_pick", count: 1 }],
    },
    {
        id: "recipe_arcanite_mining_pick",
        category: "engineering",
        station: "forge",
        inputs: [
            { itemId: "arcanite_bar", count: 2 },
            { itemId: "thorium_mining_pick", count: 1 },
        ],
        outputs: [{ itemId: "arcanite_mining_pick", count: 1 }],
    },
    {
        id: "recipe_ashwood_axe",
        category: "engineering",
        station: "forge",
        inputs: [
            { itemId: "ashwood_log", count: 4 },
            { itemId: "ironbark_axe", count: 1 },
        ],
        outputs: [{ itemId: "ashwood_axe", count: 1 }],
    },
    {
        id: "recipe_elderwood_axe",
        category: "engineering",
        station: "forge",
        inputs: [
            { itemId: "elderwood_log", count: 2 },
            { itemId: "ashwood_axe", count: 1 },
        ],
        outputs: [{ itemId: "elderwood_axe", count: 1 }],
    },
    {
        id: "recipe_goldleaf_sickle",
        category: "engineering",
        station: "forge",
        inputs: [
            { itemId: "goldleaf_herb", count: 4 },
            { itemId: "silverleaf_sickle", count: 1 },
        ],
        outputs: [{ itemId: "goldleaf_sickle", count: 1 }],
    },
    {
        id: "recipe_sunpetal_sickle",
        category: "engineering",
        station: "forge",
        inputs: [
            { itemId: "sunpetal_herb", count: 2 },
            { itemId: "goldleaf_sickle", count: 1 },
        ],
        outputs: [{ itemId: "sunpetal_sickle", count: 1 }],
    },
    {
        id: "recipe_ironbound_warplate_helm",
        category: "armorcrafting",
        inputs: [
            { itemId: "bone_fragments", count: 4 },
            { itemId: "linen_scrap", count: 2 },
        ],
        outputs: [{ itemId: "boundstone_helm", count: 1 }],
    },
    {
        id: "recipe_forgeguard_bulwark_gauntlets",
        category: "weaponcrafting",
        inputs: [
            { itemId: "bone_fragments", count: 3 },
            { itemId: "linen_scrap", count: 3 },
        ],
        outputs: [{ itemId: "gravewyrm_gauntlets", count: 1 }],
    },
    {
        id: "recipe_volatile_flux_elixir",
        category: "alchemy",
        inputs: [
            { itemId: "linen_scrap", count: 2 },
            { itemId: "spider_leg", count: 2 },
        ],
        outputs: [{ itemId: "elixir_of_the_bear", count: 1 }],
    },
];
export const RECIPE_SKILL = {
    recipe_eastbrook_arming_sword: 0,
    recipe_eastbrook_chain_vest: 0,
    recipe_eastbrook_wool_trousers: 0,
    recipe_tanned_leather_jerkin: 0,
    recipe_tough_jerky: 0,
    recipe_minor_healing_potion: 0,
    recipe_thorium_mining_pick: 75,
    recipe_arcanite_mining_pick: 150,
    recipe_ashwood_axe: 75,
    recipe_elderwood_axe: 150,
    recipe_goldleaf_sickle: 75,
    recipe_sunpetal_sickle: 150,
    recipe_ironbound_warplate_helm: 25,
    recipe_forgeguard_bulwark_gauntlets: 25,
    recipe_volatile_flux_elixir: 25,
};
export const FISH_TABLE = [
    { itemId: "raw_mirror_trout", weight: 45, minSkill: 0 },
    { itemId: "raw_river_perch", weight: 30, minSkill: 0 },
    { itemId: "tangled_weed", weight: 12, minSkill: 0 },
    { itemId: "soggy_boot", weight: 8, minSkill: 0 },
    { itemId: "raw_marsh_pike", weight: 40, minSkill: 50 },
    { itemId: "raw_bog_eel", weight: 30, minSkill: 50 },
    { itemId: "raw_frostgill_trout", weight: 40, minSkill: 150 },
    { itemId: "raw_stonescale_carp", weight: 30, minSkill: 150 },
    { itemId: "glimmerfin_koi", weight: 3, minSkill: 150 },
];
export const FISHING_SPOTS = [
    { id: "fish_vale_west", zone: "vale", position: [-60, -340] },
    { id: "fish_vale_east", zone: "vale", position: [70, -250] },
    { id: "fish_marsh_west", zone: "marsh", position: [-70, 40] },
    { id: "fish_marsh_east", zone: "marsh", position: [60, -60] },
    { id: "fish_peaks_west", zone: "peaks", position: [-60, 320] },
    { id: "fish_peaks_east", zone: "peaks", position: [80, 260] },
];
