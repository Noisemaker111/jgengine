/** Roster matchups are game rules; shared pursuit and entity effects still resolve combat. */
export function tacticalDamage(base: number, attacker: string, target: string, distance: number): number {
  if (attacker === "rifleman") {
    // Rifles need a screen. Closing on them is useful counterplay even with weapon research.
    const range = distance < 3 ? 0.45 : 1;
    const armor = target === "reaver" ? 0.55 : target.startsWith("keep_") ? 1.35 : 1;
    return base * range * armor;
  }
  if (attacker === "footman" && target === "reaver") return base * 1.5;
  return base;
}
