import { onboardingOf } from "@jgengine/core/onboarding/onboardingSystem";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { activeCharacter, CHARACTERS } from "../characters";
import { FAMILY_BASES, gunById, LEGENDARY_NAMES, MANUFACTURERS } from "../handroll";
import { session } from "../session";
import { AMMO_STAT_IDS } from "../ammo";
import { gearById } from "../items/gear/catalog";
import { scrapQuests } from "../quests/catalog";
import { npcDialogStore } from "../quests/givers";
import { questWaypoint, type WaypointKind } from "../quests/waypoint";
import { SIDE_POIS } from "../world/level";
import { ZONES } from "../world/zones";
import { talentRanksStore } from "../stores";
import { discoveryStore } from "./discovery";
import { openWeaponSlots, unlockCount } from "./unlocks";

/** Every gun model: each maker's take on each family, and each named legendary. */
export const GUN_MODEL_COUNT = MANUFACTURERS.length * FAMILY_BASES.length + Object.values(LEGENDARY_NAMES).flat().length;

/** Every enemy type a zone camp, a side camp, a zone boss or a quest puts in the world. */
export const ENEMY_TYPES: readonly string[] = [
  ...new Set([
    ...ZONES.flatMap((zone) => [...zone.clusters.map((cluster) => cluster.catalogId), ...(zone.boss === undefined ? [] : [zone.boss.catalogId])]),
    ...SIDE_POIS.flatMap((poi) => poi.spawns.map((spawn) => spawn.catalogId)),
    ...scrapQuests.flatMap((quest) => (quest.spawn === undefined ? [] : [quest.spawn.catalogId])),
  ]),
];

/** `goalKind` in the probe is the marker kind's index here; -1 when there is no marker. */
export const WAYPOINT_KINDS: readonly WaypointKind[] = ["npc", "chest", "loot", "enemy", "place"];

/** How hard a gun hits per trigger pull: what a player reads off the card to compare two guns. */
function hitPower(itemId: string): number {
  const gun = gunById(itemId);
  return gun === undefined ? 0 : gun.weapon.damage * (gun.weapon.pellets ?? 1);
}

/** Reach for loot the way a player would: guns on the ground near you worth taking. */
const LOOT_REACH = 30;

/**
 * The nearest drop worth walking to: a gun that fills an open slot or hits harder than the gun in
 * hand, or ammo for a pool that is not full.
 */
function nearestWorthTaking(ctx: GameContext, from: readonly [number, number, number]): readonly [number, number, number] | null {
  const slots = ctx.player.inventory.state("hotbar").slots;
  const open = openWeaponSlots(ctx);
  const room = slots.some((slot, index) => index < Math.max(1, open) && slot === null);
  const held = slots[session.selectedSlot()];
  const bar = room || held === null || held === undefined ? 0 : hitPower(held.itemId);
  const worth = (itemId: string): boolean => {
    if (gunById(itemId) !== undefined) return hitPower(itemId) > bar;
    const pool = gearById(itemId)?.ammo;
    const stat = pool === undefined ? null : ctx.scene.entity.stats.get(ctx.player.userId, AMMO_STAT_IDS[pool]);
    return stat !== null && stat.current < stat.max;
  };
  let best: readonly [number, number, number] | null = null;
  let bestDistance = LOOT_REACH;
  for (const item of ctx.scene.worldItem.list()) {
    if (!worth(item.itemId)) continue;
    const at = ctx.scene.entity.get(item.instanceId)?.position;
    if (at === undefined) continue;
    const distance = Math.hypot(at[0] - from[0], at[2] - from[2]);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = at;
    }
  }
  return best;
}

/**
 * What a from-zero run measures: the brief's start state and content budget (`<kind>Seen` against
 * `<kind>Total`), its systems, the hints taught and the unlocks earned, plus where the player and the
 * quest marker are, so a flow can walk to the marker like a player reading the HUD.
 */
export function depthProbe(ctx: GameContext) {
  const userId = ctx.player.userId;
  const seen = discoveryStore.read(ctx);
  const ranks = Object.values(talentRanksStore.read(ctx));
  const character = activeCharacter() ?? CHARACTERS[0];
  const me = ctx.scene.entity.get(userId);
  const goal = me === null ? null : questWaypoint(ctx);
  const stat = (id: string): number => ctx.scene.entity.stats.get(userId, id)?.current ?? 0;
  const hotbar = ctx.player.inventory.state("hotbar").slots;
  const loot = me === null ? null : nearestWorthTaking(ctx, me.position);
  return {
    taught: onboardingOf(ctx)?.run(userId).snapshot().done.length ?? 0,
    unlocks: unlockCount(ctx),
    gunsSeen: seen.guns.length,
    gunsTotal: GUN_MODEL_COUNT,
    questsSeen: ctx.game.quest?.list(userId).length ?? 0,
    questsTotal: scrapQuests.length,
    enemiesSeen: seen.enemies.length,
    enemiesTotal: ENEMY_TYPES.length,
    skillsSeen: ranks.filter((rank) => rank > 0).length,
    skillsTotal: character?.nodes.length ?? 0,
    zonesSeen: seen.zones.length,
    zonesTotal: ZONES.length,
    kills: seen.kills,
    questsDone: ctx.game.quest?.list(userId).filter((entry) => entry.status === "completed").length ?? 0,
    gunsLooted: seen.gunsLooted,
    xp: stat("xp"),
    skillsLearned: ranks.reduce((sum, rank) => sum + rank, 0),
    cash: ctx.game.economy.balance(userId, "cash"),
    playSeconds: ctx.time.now(),
    level: stat("level"),
    health: stat("health"),
    skillPoints: stat("skillPoints"),
    gunsHeld: hotbar.filter((slot) => slot !== null).length,
    dialogOpen: npcDialogStore.read(ctx) === null ? 0 : 1,
    playerX: me?.position[0] ?? 0,
    playerZ: me?.position[2] ?? 0,
    goalKind: goal === null ? -1 : WAYPOINT_KINDS.indexOf(goal.kind),
    goalX: goal?.x ?? 0,
    goalZ: goal?.z ?? 0,
    goalDistance: goal === null || me === null ? -1 : Math.hypot(goal.x - me.position[0], goal.z - me.position[2]),
    lootX: loot?.[0] ?? 0,
    lootZ: loot?.[2] ?? 0,
    lootDistance: loot === null || me === null ? -1 : Math.hypot(loot[0] - me.position[0], loot[2] - me.position[2]),
  };
}
