/**
 * Dedicated boss loot: each boss has two named legendaries in its own pool, rolled on a stream of its
 * own on top of the normal drop (so the drop stream the roll tests pin never moves). Content only —
 * the roll itself is `rollGun(rng, level, { legendary })`, which pins the generation seam's maker step.
 */
export const BOSS_DROP_CHANCE = 0.22;

export interface BossDrop {
  bossId: string;
  boss: string;
  legendaries: readonly [string, string];
}

export const BOSS_DROPS: readonly BossDrop[] = [
  { bossId: "captain_rusk", boss: "Captain Rusk", legendaries: ["Sixgun", "Vandal"] },
  { bossId: "wreck_maw", boss: "Wreck-Maw", legendaries: ["Sledgehammer", "Chatterbox"] },
  { bossId: "foreman_maw", boss: "The Foreman", legendaries: ["Piledriver", "Flakcannon"] },
  { bossId: "foundry_heart", boss: "Foundry Heart", legendaries: ["Starfall", "Ashfall"] },
];

export function bossDropFor(bossId: string): BossDrop | undefined {
  return BOSS_DROPS.find((entry) => entry.bossId === bossId);
}

/** The boss that farms a named legendary, for the card's "Drops from" line. */
export function dropsFrom(legendaryName: string): string | undefined {
  return BOSS_DROPS.find((entry) => entry.legendaries.includes(legendaryName))?.boss;
}
