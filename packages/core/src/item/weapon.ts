export interface WeaponEntry {
  weapon?: Record<string, unknown>;
}

export function getWeaponStat(entry: WeaponEntry | null | undefined, stat: string): number | null {
  if (!entry?.weapon) return null;

  let value: unknown = entry.weapon;
  for (const key of stat.split(".")) {
    if (typeof value !== "object" || value === null) return null;
    value = (value as Record<string, unknown>)[key];
  }

  return typeof value === "number" ? value : null;
}

export interface WeaponStats {
  getStat(itemId: string, stat: string): number | null;
}

export function createWeaponStats(
  resolveEntry: (itemId: string) => WeaponEntry | null | undefined,
): WeaponStats {
  return {
    getStat(itemId, stat) {
      return getWeaponStat(resolveEntry(itemId), stat);
    },
  };
}
