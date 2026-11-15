import type { ContentProgressionRule } from "@jgengine/core/game/contentValidation";
import type { SuiteContent, SuiteContentUse } from "@jgengine/core/suite/contentAudit";

import { AMMO_POOLS, type AmmoPool } from "../src/game/ammo";
import { BOSS_DROPS, FAMILY_BASES, LEGENDARY_NAMES, UNIQUE_GUNS, type GunFamily } from "../src/game/handroll";
import { gearItems } from "../src/game/items/gear/catalog";
import { RARITY_LEVELS, WEAPON_SLOTS } from "../src/game/progression/unlocks";
import { scrapQuests, zoneOpener } from "../src/game/quests/catalog";
import { ZONES } from "../src/game/world/zones";

/**
 * Junk Drawer's content, read from the game's own tables. Items are kinds a player holds: each body
 * (a rolled weapon of that body, any mod), each heirloom, each neighbour's unique, the ammo packs and
 * the porch's meds. Sources are the appliances of a neighbourhood (any body drops there), the bosses'
 * heirloom pools, the errands that hand out uniques, Hank's garage and Nana's porch on the cul-de-sac,
 * and the recycling bins. Neighbourhoods open through their story errand, one after another.
 */
const zoneFact = (zone: string) => `zone:${zone}`;
const bodyItem = (family: GunFamily) => `body:${family}`;
const heirloomItem = (name: string) => `heirloom:${name}`;
const uniqueItem = (name: string) => `unique:${name}`;
const ammoItem = (pool: AmmoPool) => gearItems.find((gear) => gear.kind === "ammo" && gear.ammo === pool)!.id;
const HUB = "arid_badlands";

const familyOfHeirloom = new Map(Object.entries(LEGENDARY_NAMES).flatMap(([family, list]) => list.map(([, name]) => [name, family as GunFamily] as const)));
const ammoOf = (family: GunFamily): readonly string[] => [ammoItem(FAMILY_BASES.find((base) => base.family === family)!.ammo)];

const zoneOrder: ContentProgressionRule[] = ZONES.slice(1).map((zone, index) => {
  const opener = zoneOpener(zone.id);
  return {
    id: `open:${zone.id}`,
    path: `src/game/quests/catalog.ts/${opener?.id ?? zone.id}`,
    requires: [zoneFact(ZONES[index]!.id)],
    provides: [zoneFact(zone.id)],
  };
});

// Any appliance in a neighbourhood can drop any body (its mod and condition rolled at the zone's level),
// and kills drop ammo for what the player carries.
const kills: ContentProgressionRule[] = ZONES.map((zone) => ({
  id: `kill:${zone.id}`,
  path: `src/loop.ts/dropLoot/${zone.id}`,
  requires: [zoneFact(zone.id)],
  provides: [...FAMILY_BASES.map((base) => bodyItem(base.family)), ...AMMO_POOLS.map(ammoItem)],
}));

// Heirlooms: every boss's pool, and from level 18 any heirloom of a body can roll from a drop.
const bossZone = (bossId: string): string => ZONES.find((zone) => zone.boss?.catalogId === bossId)?.id ?? "rustflat_waste";
const heirlooms: ContentProgressionRule[] = [
  ...BOSS_DROPS.map((drop) => ({ id: `boss:${drop.bossId}`, path: `src/game/handroll/bossDrops.ts/${drop.bossId}`, requires: [zoneFact(bossZone(drop.bossId))], provides: drop.legendaries.map(heirloomItem) })),
  { id: "drop:heirloom", path: "src/game/handroll/roll.ts/legendary", requires: [zoneFact(ZONES[ZONES.length - 1]!.id)], provides: [...familyOfHeirloom.keys()].map(heirloomItem) },
];

// Errands hand out the neighbours' uniques, and Nana's heirloom hunt (and The Cloud) hand out heirlooms.
const uniques: ContentProgressionRule[] = scrapQuests.flatMap((quest) => {
  const provides = [
    ...(quest.reward.gun === undefined ? [] : [uniqueItem(quest.reward.gun)]),
    ...(quest.reward.heirloom === undefined ? [] : [heirloomItem(quest.reward.heirloom)]),
  ];
  return provides.length === 0 ? [] : [{ id: `quest:${quest.id}`, path: `src/game/quests/catalog.ts/${quest.id}`, requires: [zoneFact(HUB)], provides }];
});

const shops: ContentProgressionRule[] = [
  { id: "shop:hank", path: "src/game/commands.ts/vendor.buyAmmo", requires: [zoneFact(HUB)], provides: AMMO_POOLS.map(ammoItem) },
  { id: "shop:nana", path: "src/game/commands.ts/vendor.buyGear", requires: [zoneFact(HUB)], provides: gearItems.filter((gear) => gear.trade !== undefined).map((gear) => gear.id) },
  { id: "bin:recycling", path: "src/game/items/ammoCrates.ts/openAmmoCrate", requires: [zoneFact(ZONES[0]!.id)], provides: AMMO_POOLS.map(ammoItem) },
];

const weapons = [
  ...FAMILY_BASES.map((base) => ({ id: bodyItem(base.family), ammo: ammoOf(base.family) })),
  ...[...familyOfHeirloom].map(([name, family]) => ({ id: heirloomItem(name), ammo: ammoOf(family) })),
  ...UNIQUE_GUNS.map((gun) => ({ id: uniqueItem(gun.name), ammo: ammoOf(gun.family) })),
];

const uses: SuiteContentUse[] = [
  // Every weapon fires, and every weapon goes on Hank's bench: salvaged, or merged into another.
  { id: "fire", path: "src/game/items/use-handlers.ts/fireGun", items: weapons.map((weapon) => weapon.id) },
  { id: "salvage", path: "src/game/items/vault.ts/salvageGun", items: weapons.map((weapon) => weapon.id) },
  { id: "merge", path: "src/game/items/vault.ts/mergeAtBench", items: weapons.map((weapon) => weapon.id) },
  { id: "heal", path: "src/game/items/use-handlers.ts/useHealthVial", items: gearItems.filter((gear) => gear.kind === "health").map((gear) => gear.id) },
  { id: "shield", path: "src/game/items/use-handlers.ts/useShieldBooster", items: gearItems.filter((gear) => gear.kind === "shield_mod").map((gear) => gear.id) },
];

const rarityUnlocks = RARITY_LEVELS.filter((tier) => tier.level > 1).map((tier) => ({ id: `rarity:${tier.rarity}`, at: tier.level }));
const zoneUnlocks = ZONES.slice(1).map((zone) => ({ id: zoneFact(zone.id), at: zone.level }));

export const content: SuiteContent = {
  items: [...weapons, ...gearItems.map((gear) => ({ id: gear.id }))],
  start: [zoneFact(ZONES[0]!.id)],
  sources: [...zoneOrder, ...kills, ...heirlooms, ...uniques, ...shops],
  uses,
  places: [],
  // Levels, 1 to 30: what a steady tinkerer opens on the way. Conditions and neighbourhoods by their
  // own tables; weapon slots with the story; the skill tree's tiers as points accrue (one a level,
  // tiers at 5/10/15/20 in a branch); the Block Party ladder past the last neighbourhood.
  runway: {
    axis: "level",
    cap: 30,
    unlocks: [
      { id: "skills", at: 2 },
      // Each neighbour's errand waits for its level: the side jobs are part of the runway too.
      ...scrapQuests.filter((quest) => quest.minLevel !== undefined).map((quest) => ({ id: `errand:${quest.id}`, at: quest.minLevel! })),
      ...rarityUnlocks,
      ...zoneUnlocks,
      ...Array.from({ length: WEAPON_SLOTS - 1 }, (_, index) => ({ id: `slot:${index + 2}`, at: [3, 6, 12][index] ?? 12 })),
      { id: "talent-tier:2", at: 6 },
      { id: "talent-tier:3", at: 11 },
      { id: "talent-tier:4", at: 16 },
      { id: "talent-capstone", at: 21 },
      { id: "block-party:V", at: 22 },
      { id: "block-party:X", at: 25 },
      { id: "talent-second-branch", at: 26 },
      { id: "block-party:XV", at: 28 },
      { id: "block-party:XX", at: 30 },
    ],
  },
};
