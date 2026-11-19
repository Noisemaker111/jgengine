/**
 * Stat points: each level earns points the player puts into stats, and each point adds a fixed
 * amount (a survivor's +10 health) or scales the stat by a fraction of itself (a tame's +5.4% health).
 * Sheets are plain `{ stat: points }` records, so they save as they are.
 */

export interface StatPointLine {
  base: number;
  perPoint: number;
  mode?: "add" | "scale";
}

export type StatPointSheet<S extends string> = Record<S, number>;

export interface StatPointsConfig<S extends string> {
  stats: Readonly<Record<S, StatPointLine>>;
  maxPerStat?: number;
}

export interface StatPoints<S extends string> {
  readonly ids: readonly S[];
  empty(): StatPointSheet<S>;
  normalize(saved: Partial<Record<string, number>>): StatPointSheet<S>;
  value(sheet: Readonly<StatPointSheet<S>>, stat: S, base?: number): number;
  gain(stat: S, base?: number): number;
  spent(sheet: Readonly<StatPointSheet<S>>): number;
  unspent(sheet: Readonly<StatPointSheet<S>>, earned: number): number;
  spend(sheet: StatPointSheet<S>, stat: S, earned: number): boolean;
}

/** @capability stat-points level-up points spent into stats, each adding an amount or scaling the stat, with per-owner bases and a per-stat cap */
export function createStatPoints<S extends string>(config: StatPointsConfig<S>): StatPoints<S> {
  const ids = Object.keys(config.stats) as S[];
  const cap = config.maxPerStat ?? Infinity;
  const gain = (stat: S, base?: number) => {
    const line = config.stats[stat];
    return line.mode === "scale" ? (base ?? line.base) * line.perPoint : line.perPoint;
  };
  const spent = (sheet: Readonly<StatPointSheet<S>>) => ids.reduce((sum, id) => sum + (sheet[id] ?? 0), 0);
  return {
    ids,
    empty: () => Object.fromEntries(ids.map((id) => [id, 0])) as StatPointSheet<S>,
    normalize: (saved) => Object.fromEntries(ids.map((id) => [id, Math.max(0, Math.floor(saved[id] ?? 0))])) as StatPointSheet<S>,
    value: (sheet, stat, base) => (base ?? config.stats[stat].base) + (sheet[stat] ?? 0) * gain(stat, base),
    gain,
    spent,
    unspent: (sheet, earned) => Math.max(0, earned - spent(sheet)),
    spend(sheet, stat, earned) {
      if (!(stat in config.stats) || spent(sheet) >= earned || (sheet[stat] ?? 0) >= cap) return false;
      sheet[stat] = (sheet[stat] ?? 0) + 1;
      return true;
    },
  };
}
