import type { GameContext } from "@jgengine/core/runtime/gameContext";

import type { Rarity } from "../handroll";

/** Unlock ids. A weapon slot, a zone's road, a rarity tier, the skill tree. */
export const unlock = {
  slot: (index: number) => `slot:${index}`,
  zone: (zoneId: string) => `zone:${zoneId}`,
  rarity: (rarity: Rarity) => `rarity:${rarity}`,
  skills: "skills",
} as const;

export const WEAPON_SLOTS = 4;

/** The level each rarity starts dropping at. Common always drops. */
export const RARITY_LEVELS: readonly { rarity: Rarity; level: number }[] = [
  { rarity: "common", level: 1 },
  { rarity: "uncommon", level: 3 },
  { rarity: "rare", level: 6 },
  { rarity: "epic", level: 12 },
  { rarity: "legendary", level: 18 },
];

/** The rarest tier a drop may roll at `level`. */
export function rarityCapFor(level: number): Rarity {
  let cap: Rarity = "common";
  for (const tier of RARITY_LEVELS) if (level >= tier.level) cap = tier.rarity;
  return cap;
}

/** The level the skill tree opens at: the first skill point. */
export const SKILLS_LEVEL = 2;

/** Whether the player has unlock `id`, through the engine's unlock ledger. */
export function isUnlocked(ctx: GameContext, id: string): boolean {
  return ctx.game.unlocks?.has(ctx.player.userId, id) ?? false;
}

/** Give the player unlock `id`. Returns whether it was new. */
export function award(ctx: GameContext, id: string): boolean {
  if (isUnlocked(ctx, id)) return false;
  ctx.game.unlocks?.grant(ctx.player.userId, id);
  return true;
}

export function unlockCount(ctx: GameContext): number {
  return ctx.game.unlocks?.list(ctx.player.userId).length ?? 0;
}

/** The zone a new game starts in: the only one open before the story opens the rest. */
export const START_ZONE = "rustflat_waste";

export function zoneOpen(ctx: GameContext, zoneId: string): boolean {
  return zoneId === START_ZONE || isUnlocked(ctx, unlock.zone(zoneId));
}

/** How many weapon slots the player can use: slot 1 opens with the first gun. */
export function openWeaponSlots(ctx: GameContext): number {
  let open = 0;
  for (let index = 1; index <= WEAPON_SLOTS; index += 1) if (isUnlocked(ctx, unlock.slot(index))) open = index;
  return open;
}

/** Grant what reaching `level` opens: the skill tree and the rarity tiers. Returns what was new. */
export function grantLevelUnlocks(ctx: GameContext, level: number): string[] {
  const opened: string[] = [];
  if (level >= SKILLS_LEVEL && award(ctx, unlock.skills)) opened.push("SKILL TREE [K]");
  for (const tier of RARITY_LEVELS) {
    if (tier.rarity === "common" || level < tier.level) continue;
    if (award(ctx, unlock.rarity(tier.rarity))) opened.push(`${tier.rarity.toUpperCase()} GUNS`);
  }
  return opened;
}
