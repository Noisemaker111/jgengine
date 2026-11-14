/**
 * Dedicated boss loot: each boss has two heirlooms in its own pool, rolled on a stream of its
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
  { bossId: "old_tusk", boss: "Big Mulch", legendaries: ["Tax Season", "Infinite Memo"] },
  { bossId: "captain_rusk", boss: "The Leaf Blower King", legendaries: ["Gale Force Gertie", "Six-Pack"] },
  { bossId: "wreck_maw", boss: "The Compactor", legendaries: ["The Big Huff", "Chatterbox"] },
  { bossId: "foreman_maw", boss: "The HOA President", legendaries: ["Water Torture", "Snow Day"] },
  { bossId: "foundry_heart", boss: "Mother Router", legendaries: ["Wish Upon a Crumb", "Popcorn Apocalypse"] },
];

export function bossDropFor(bossId: string): BossDrop | undefined {
  return BOSS_DROPS.find((entry) => entry.bossId === bossId);
}

/** The boss that farms a named legendary, for the card's "Drops from" line. */
export function dropsFrom(legendaryName: string): string | undefined {
  return BOSS_DROPS.find((entry) => entry.legendaries.includes(legendaryName))?.boss;
}
