export const ABILITY_MOD_NODES = {
    arms_imp_overpower: { perRank: { abilityId: "overpower", dmgPct: 0.08 } },
    arms_deep_wounds: { perRank: { abilityId: "rend", dmgPct: 0.1 } },
    arms_imp_slam: { perRank: { abilityId: "slam", costPct: -0.05, dmgPct: 0.06 } },
    arms_imp_mortal_strike: { perRank: { abilityId: "execute", dmgPct: 0.1 } },
    fury_whirlwind: { perRank: { abilityId: "cleave", dmgPct: 0.08 } },
    fury_imp_cleave: { perRank: { abilityId: "cleave", dmgPct: 0.1 } },
    fury_imp_bloodthirst: { perRank: { abilityId: "heroic_strike", dmgPct: 0.1 } },
    prot_anticipation: { perRank: { threatPct: 0.05 } },
    prot_imp_thunder_clap: { perRank: { abilityId: "thunder_clap", dmgPct: 0.1, cooldownPct: -0.05 } },
    prot_imp_sunder: { perRank: { abilityId: "sunder_armor", costPct: -0.1 } },
    prot_imp_shield_slam: { perRank: { abilityId: "taunt", cooldownPct: -0.08 } },
    holy_imp_holy_light: { perRank: { abilityId: "holy_light", healPct: 0.08 } },
    holy_flash_focus: { perRank: { abilityId: "flash_of_light", costPct: -0.06, castPct: -0.05 } },
    holy_lay_blessing: { perRank: { abilityId: "lay_on_hands", cooldownPct: -0.1 } },
    prot_imp_righteous_fury: { perRank: { threatPct: 0.08 } },
    prot_guardians_favor: { perRank: { abilityId: "divine_protection", cooldownPct: -0.08 } },
    prot_holy_shield: { perRank: { abilityId: "devotion_aura", costPct: -0.05 } },
    ret_benediction: { perRank: { abilityId: "seal_of_righteousness", costPct: -0.05 } },
    ret_imp_judgement: { perRank: { abilityId: "exorcism", dmgPct: 0.1, cooldownPct: -0.05 } },
    ret_seal_command: { perRank: { abilityId: "seal_of_righteousness", dmgPct: 0.08 } },
    ret_crusader_strikes: { perRank: { abilityId: "hammer_of_justice", dmgPct: 0.1 } },
    bm_imp_mend: { perRank: { abilityId: "aspect_of_the_hawk", costPct: -0.05 } },
    mm_imp_arcane_shot: { perRank: { abilityId: "arcane_shot", dmgPct: 0.1 } },
    mm_aimed_focus: { perRank: { abilityId: "aimed_shot", castPct: -0.08, dmgPct: 0.05 } },
    mm_barrage: { perRank: { abilityId: "volley", dmgPct: 0.08 } },
    mm_marksman_mastery: { perRank: { abilityId: "aimed_shot", dmgPct: 0.12 } },
    surv_imp_wing_clip: { perRank: { abilityId: "wing_clip", costPct: -0.1 } },
    surv_deterrence: { perRank: { abilityId: "rapid_fire", cooldownPct: -0.1 } },
    ass_imp_eviscerate: { perRank: { abilityId: "eviscerate", dmgPct: 0.1 } },
    ass_murder: { perRank: { meleeDmgPct: 0.04 } },
    ass_laceration: { perRank: { abilityId: "garrote", dmgPct: 0.1 } },
    ass_vigor: { perRank: { abilityId: "sinister_strike", costPct: -0.05 } },
    combat_imp_gouge: { perRank: { abilityId: "gouge", cooldownPct: -0.08 } },
    combat_imp_sprint: { perRank: { abilityId: "sprint", cooldownPct: -0.1 } },
    combat_dual_wield: { perRank: { meleeDmgPct: 0.04 } },
    sub_opportunity: { perRank: { abilityId: "backstab", dmgPct: 0.08 } },
    sub_elusiveness: { perRank: { abilityId: "vanish", cooldownPct: -0.1 } },
    sub_imp_ambush: { perRank: { abilityId: "ambush", dmgPct: 0.1 } },
    disc_twin_disciplines: { perRank: { spellDmgPct: 0.03, healPct: 0.03 } },
    disc_imp_shield: { perRank: { abilityId: "power_word_shield", costPct: -0.06 } },
    disc_mental_agility: { perRank: { abilityId: "power_word_shield", costPct: -0.05 } },
    disc_penance: { perRank: { abilityId: "smite", dmgPct: 0.1, healPct: 0.1 } },
    holy_healing_focus: { perRank: { healPct: 0.04 } },
    holy_renewal: { perRank: { abilityId: "renew", healPct: 0.1 } },
    holy_divine_fury: { perRank: { abilityId: "smite", castPct: -0.06 } },
    shadow_blackout: { perRank: { abilityId: "mind_blast", cooldownPct: -0.05 } },
    shadow_word_pain: { perRank: { abilityId: "shadow_word_pain", dmgPct: 0.1 } },
    shadow_mind_flay: { perRank: { abilityId: "mind_flay", dmgPct: 0.08 } },
    shadow_focus: { perRank: { abilityId: "mind_blast", costPct: -0.06 } },
    ele_concussion: { perRank: { abilityId: "lightning_bolt", dmgPct: 0.08 } },
    ele_call_flame: { perRank: { abilityId: "flame_shock", dmgPct: 0.1 } },
    ele_reverberation: { perRank: { abilityId: "earth_shock", cooldownPct: -0.08 } },
    ele_elemental_focus: { perRank: { spellDmgPct: 0.04 } },
    ele_lightning_mastery: { perRank: { abilityId: "lightning_bolt", castPct: -0.06 } },
    enh_imp_rockbiter: { perRank: { abilityId: "rockbiter_weapon", dmgPct: 0.08 } },
    enh_spirit_weapons: { perRank: { meleeDmgPct: 0.06 } },
    rest_tidal_focus: { perRank: { abilityId: "healing_wave", costPct: -0.05 } },
    rest_imp_healing_wave: { perRank: { abilityId: "healing_wave", healPct: 0.08 } },
    arc_imp_missiles: { perRank: { abilityId: "arcane_missiles", dmgPct: 0.08 } },
    arc_arcane_concentration: { perRank: { spellDmgPct: 0.03 } },
    arc_imp_polymorph: { perRank: { abilityId: "polymorph", castPct: -0.1 } },
    arc_netherwind: { perRank: { abilityId: "arcane_explosion", dmgPct: 0.1 } },
    fire_imp_fireball: { perRank: { abilityId: "fireball", dmgPct: 0.08, castPct: -0.04 } },
    fire_imp_blast: { perRank: { abilityId: "fire_blast", cooldownPct: -0.08 } },
    fire_incinerate: { perRank: { abilityId: "scorch", dmgPct: 0.1 } },
    fire_pyromancer: { perRank: { abilityId: "pyroblast", dmgPct: 0.1 } },
    frost_imp_frostbolt: { perRank: { abilityId: "frostbolt", dmgPct: 0.08 } },
    frost_imp_nova: { perRank: { abilityId: "frost_nova", cooldownPct: -0.08 } },
    aff_imp_agony: { perRank: { abilityId: "curse_of_agony", dmgPct: 0.1 } },
    aff_imp_corruption: { perRank: { abilityId: "corruption", dmgPct: 0.1 } },
    aff_fel_concentration: { perRank: { abilityId: "drain_life", dmgPct: 0.08 } },
    aff_amplify_curse: { perRank: { abilityId: "curse_of_agony", dmgPct: 0.08 } },
    aff_unstable_affliction: { perRank: { abilityId: "corruption", dmgPct: 0.12 } },
    demo_health_funnel: { perRank: { abilityId: "drain_life", healPct: 0.1 } },
    dest_cataclysm: { perRank: { abilityId: "shadow_bolt", costPct: -0.05 } },
    dest_bane: { perRank: { abilityId: "immolate", castPct: -0.06 } },
    dest_imp_searing: { perRank: { abilityId: "searing_pain", dmgPct: 0.1 } },
    dest_backdraft: { perRank: { abilityId: "shadow_bolt", castPct: -0.08 } },
    bal_imp_wrath: { perRank: { abilityId: "wrath", dmgPct: 0.08 } },
    bal_imp_moonfire: { perRank: { abilityId: "moonfire", dmgPct: 0.1 } },
    bal_natures_reach: { perRank: { spellDmgPct: 0.03 } },
    bal_starfire_mastery: { perRank: { abilityId: "wrath", dmgPct: 0.1 } },
    feral_ferocity: { perRank: { meleeDmgPct: 0.04 } },
    feral_brutal_impact: { perRank: { abilityId: "wrath", cooldownPct: -0.05 } },
    rest_imp_rejuv: { perRank: { abilityId: "rejuvenation", healPct: 0.1 } },
    rest_druid_naturalist: { perRank: { healPct: 0.04 } },
    rest_reflection: { perRank: { abilityId: "healing_touch", costPct: -0.05 } },
    rest_imp_regrowth: { perRank: { abilityId: "healing_touch", healPct: 0.08 } },
};
function isAbilityMod(mod) {
    return "abilityId" in mod && typeof mod.abilityId === "string";
}
export function resolveAbilityMods(ranks) {
    const byAbility = new Map();
    const global = {};
    for (const [nodeId, rank] of Object.entries(ranks)) {
        if (rank <= 0)
            continue;
        const effect = ABILITY_MOD_NODES[nodeId];
        if (effect === undefined)
            continue;
        const scaledRank = Math.min(rank, effect.maxRank ?? rank);
        const per = effect.perRank;
        if (isAbilityMod(per)) {
            const existing = byAbility.get(per.abilityId) ?? { abilityId: per.abilityId };
            existing.dmgPct = (existing.dmgPct ?? 0) + (per.dmgPct ?? 0) * scaledRank;
            existing.healPct = (existing.healPct ?? 0) + (per.healPct ?? 0) * scaledRank;
            existing.costPct = (existing.costPct ?? 0) + (per.costPct ?? 0) * scaledRank;
            existing.cooldownPct = (existing.cooldownPct ?? 0) + (per.cooldownPct ?? 0) * scaledRank;
            existing.castPct = (existing.castPct ?? 0) + (per.castPct ?? 0) * scaledRank;
            existing.flatDmg = (existing.flatDmg ?? 0) + (per.flatDmg ?? 0) * scaledRank;
            byAbility.set(per.abilityId, existing);
        }
        else {
            global.meleeDmgPct = (global.meleeDmgPct ?? 0) + (per.meleeDmgPct ?? 0) * scaledRank;
            global.spellDmgPct = (global.spellDmgPct ?? 0) + (per.spellDmgPct ?? 0) * scaledRank;
            global.healPct = (global.healPct ?? 0) + (per.healPct ?? 0) * scaledRank;
            global.threatPct = (global.threatPct ?? 0) + (per.threatPct ?? 0) * scaledRank;
        }
    }
    return { byAbility, global };
}
