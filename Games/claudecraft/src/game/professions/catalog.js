export const GATHER_NODES = [
    { id: "ore_eastbrook", name: "Eastbrook Ore Vein", profession: "mining", zone: "vale", skillReq: 0, skillUpTo: 50, count: 10, respawnSec: 45, materials: [{ itemId: "bone_fragments", min: 1, max: 3 }] },
    { id: "wood_eastbrook", name: "Eastbrook Timber Stand", profession: "logging", zone: "vale", skillReq: 0, skillUpTo: 50, count: 8, respawnSec: 50, materials: [{ itemId: "linen_scrap", min: 1, max: 3 }] },
    { id: "herb_eastbrook", name: "Eastbrook Herb Patch", profession: "herbalism", zone: "vale", skillReq: 0, skillUpTo: 50, count: 9, respawnSec: 60, materials: [{ itemId: "spider_leg", min: 1, max: 3 }] },
    { id: "ore_mirefen", name: "Mirefen Ore Vein", profession: "mining", zone: "marsh", skillReq: 100, skillUpTo: 150, count: 8, respawnSec: 60, materials: [{ itemId: "thorium_ore", min: 1, max: 2 }] },
    { id: "wood_mirefen", name: "Mirefen Timber Stand", profession: "logging", zone: "marsh", skillReq: 100, skillUpTo: 150, count: 7, respawnSec: 65, materials: [{ itemId: "ashwood_log", min: 1, max: 2 }] },
    { id: "herb_mirefen", name: "Mirefen Herb Patch", profession: "herbalism", zone: "marsh", skillReq: 100, skillUpTo: 150, count: 6, respawnSec: 70, materials: [{ itemId: "goldleaf_herb", min: 1, max: 2 }] },
    { id: "ore_highwatch", name: "Highwatch Ore Vein", profession: "mining", zone: "peaks", skillReq: 200, skillUpTo: 250, count: 6, respawnSec: 75, materials: [{ itemId: "arcanite_bar", min: 1, max: 2 }] },
    { id: "wood_highwatch", name: "Highwatch Timber Stand", profession: "logging", zone: "peaks", skillReq: 200, skillUpTo: 250, count: 5, respawnSec: 80, materials: [{ itemId: "elderwood_log", min: 1, max: 2 }] },
    { id: "herb_highwatch", name: "Highwatch Herb Patch", profession: "herbalism", zone: "peaks", skillReq: 200, skillUpTo: 250, count: 4, respawnSec: 90, materials: [{ itemId: "sunpetal_herb", min: 1, max: 2 }] },
];
export const PROFESSIONS = [
    { id: "mining", name: "Mining", icon: "pickaxe", maxSkill: 300 },
    { id: "logging", name: "Logging", icon: "axe", maxSkill: 300 },
    { id: "herbalism", name: "Herbalism", icon: "leaf", maxSkill: 300 },
    { id: "fishing", name: "Fishing", icon: "fish", maxSkill: 300 },
    { id: "crafting", name: "Crafting", icon: "hammer", maxSkill: 300 },
];
