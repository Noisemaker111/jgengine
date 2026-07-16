import { FIESTA_ALLY_CATALOG, FIESTA_ENEMY_MOBS } from "./arena/catalog";
import { CLASSES } from "./classes/catalog";
import { DELVE_COMPANION_CATALOG } from "./delves/systems";
import { MOBS } from "./entities/enemies/catalog";
import { NPCS } from "./entities/npcs/catalog";
import { classEntityId, CLASS_ENTITY_ID } from "./model";
import { PETS } from "./pets/catalog";
const PLAYERS = "/models/claudecraft/players";
const ENEMIES = "/models/claudecraft/enemies";
const CREATURES = "/models/claudecraft/creatures";
const HUMANOID_H = 2.6;
const KAYKIT_CLIPS = { idle: "Idle", walk: "Walking_A", run: "Running_A", runSpeed: 6 };
const CREATURE_RUN = { idle: "Idle", walk: "Walk", run: "Run", runSpeed: 6 };
const CREATURE_GALLOP = { idle: "Idle", walk: "Walk", run: "Gallop", runSpeed: 6 };
function humanoid(file, tint) {
    return {
        url: `${PLAYERS}/${file}.glb`,
        targetHeight: HUMANOID_H,
        animation: { states: { ...KAYKIT_CLIPS } },
        ...(tint === undefined ? {} : { material: { color: tint } }),
    };
}
function skeleton(file, height = 2.5) {
    return {
        url: `${ENEMIES}/${file}.glb`,
        targetHeight: height,
        animation: { states: { ...KAYKIT_CLIPS } },
    };
}
function creature(file, height, clips = CREATURE_RUN) {
    return {
        url: `${CREATURES}/${file}.glb`,
        targetHeight: height,
        ...(clips === null
            ? { animation: { clip: "Flying_Idle" } }
            : { animation: { states: { ...clips } } }),
    };
}
const CLASS_MODEL = {
    warrior: humanoid("knight"),
    paladin: humanoid("paladin"),
    hunter: humanoid("ranger"),
    rogue: humanoid("rogue"),
    priest: humanoid("mage", "#f0e9d6"),
    shaman: humanoid("barbarian", "#a8bcd9"),
    mage: humanoid("mage"),
    warlock: humanoid("mage", "#b596dd"),
    druid: humanoid("druid"),
};
function mobModel(def) {
    const id = def.id;
    if (/wolf|prowler/.test(id))
        return creature("wolf_basic", 1.6, CREATURE_GALLOP);
    if (/greyjaw/.test(id))
        return creature("greyjaw", 2.2, CREATURE_GALLOP);
    if (/boar/.test(id))
        return creature("wild_boar", 1.45, CREATURE_GALLOP);
    if (/rat/.test(id))
        return creature("fox", 0.7, CREATURE_GALLOP);
    if (/fox/.test(id))
        return creature("fox", 1.0, CREATURE_GALLOP);
    if (/stag/.test(id))
        return creature("stag", 1.9, CREATURE_GALLOP);
    if (/bear|cragmaw/.test(id))
        return creature("yetialt", 2.2);
    if (/spider|widow|brood/.test(id))
        return creature("spider", def.boss === true ? 2 : 1.4, { idle: "Spider_Idle", walk: "Spider_Walk" });
    if (/murloc|mudfin|deepfen|bloat|mirejaw|sloomtooth/.test(id))
        return creature("frog", 1.7);
    if (/troll|grubjaw/.test(id))
        return creature("orc", 2.4);
    if (/ogre|drogmar|brutok/.test(id))
        return creature("giant", 2.8, { idle: "Idle", walk: "Walk" });
    if (/kobold|sapper|foreman|tunnel|grix/.test(id))
        return creature("goblin", 2.1, { idle: "Idle", walk: "Walk" });
    if (/elemental|storm|shardlord/.test(id))
        return creature("golelingevolved", 2.2, null);
    if (/ghost|drowned|wraith/.test(id))
        return creature("ghost", 1.6, null);
    if (/shambler/.test(id))
        return skeleton("skeleton_rogue");
    if (/morthen/.test(id))
        return skeleton("skeleton_mage");
    if (/necromancer|maldrec/.test(id))
        return skeleton("necromancer");
    if (/cultist|acolyte|zealot|summoner|mender|nhalia|voss|caller|caster/.test(id))
        return humanoid("mage", "#b39ddb");
    if (/bones|marrow|crypt|revenant|boneguard|bulwark|verlan/.test(id))
        return skeleton(def.boss === true ? "skeleton_warrior" : "skeleton_minion");
    if (def.family === "undead")
        return skeleton("skeleton_minion");
    if (def.family === "demon")
        return creature("demonalt", 2.1);
    if (def.family === "elemental")
        return creature("golelingevolved", 2.2, null);
    if (/gorrak|mogger/.test(id))
        return humanoid("barbarian");
    if (def.family === "humanoid")
        return humanoid("rogue_hooded", "#8a5a4e");
    return creature("wolf_basic", 1.6, CREATURE_GALLOP);
}
function npcModel(def) {
    if (/marshal|warden|captain|guard/.test(def.id))
        return humanoid("knight");
    if (/smith|armorer|foreman/.test(def.id))
        return humanoid("barbarian");
    if (/scout/.test(def.id))
        return humanoid("rogue");
    if (/apothecary|herbalist|loremaster|brother|sister|priest/.test(def.id))
        return humanoid("mage", "#c9b98a");
    if (def.kind === "vendor")
        return humanoid("rogue");
    return humanoid("rogue");
}
const PET_MODEL = {
    pet_wolf: creature("wolf_basic", 1.45, CREATURE_GALLOP),
    pet_boar: creature("wild_boar", 1.45, CREATURE_GALLOP),
    pet_imp: { ...creature("demonalt", 1.15), material: { color: "#ff7a2a" } },
    pet_voidwalker: { ...creature("demonalt", 2.3), material: { color: "#5a5a9e" } },
    pet_felhunter: { ...creature("demonalt", 2.0), material: { color: "#4a7d4a" } },
    pet_succubus: { ...creature("demonalt", 1.9), material: { color: "#c6469b" } },
};
export const entityModels = {
    [CLASS_ENTITY_ID]: CLASS_MODEL.warrior,
    ...Object.fromEntries(CLASSES.map((cls) => [classEntityId(cls.id), CLASS_MODEL[cls.id]])),
    ...Object.fromEntries(MOBS.map((mob) => [mob.id, mobModel(mob)])),
    ...Object.fromEntries(NPCS.map((npc) => [npc.id, npcModel(npc)])),
    ...PET_MODEL,
    [DELVE_COMPANION_CATALOG]: humanoid("mage", "#ebedef"),
    [FIESTA_ALLY_CATALOG]: humanoid("paladin"),
    fiesta_bot_botzo: humanoid("mage", "#b06bff"),
    fiesta_bot_sneakbot: humanoid("rogue_hooded"),
};
