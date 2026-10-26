/**
 * Stat points: each level earns points the player puts into stats, and each point adds a fixed
 * amount (a survivor's +10 health) or scales the stat by a fraction of itself (a tame's +5.4% health).
 * Sheets are plain `{ stat: points }` records, so they save as they are.
 */

/** One stat points can go into. */
export interface StatPointLine {
  /** The stat with no points in it. A sheet can override it per owner (a tame's stat at its level). */
  base: number;
  /** What one point adds: an amount (`"add"`) or a fraction of the base (`"scale"`). */
  perPoint: number;
  /** Default `"add"`. */
  mode?: "add" | "scale";
}

/** Points spent per stat. Plain data, JSON round-trips. */
export type StatPointSheet<S extends string> = Record<S, number>;

/** Knobs: the stats, and how many points any one stat may hold (default unlimited). */
export interface StatPointsConfig<S extends string> {
  stats: Readonly<Record<S, StatPointLine>>;
  maxPerStat?: number;
}

/** Reads and spends stat points on plain sheets. */
export interface StatPoints<S extends string> {
  readonly ids: readonly S[];
  /** A sheet with nothing spent. */
  empty(): StatPointSheet<S>;
  /** A saved sheet with any stats it lacks set to zero and unknown ones dropped. */
  normalize(saved: Partial<Record<string, number>>): StatPointSheet<S>;
  /** The stat with its points in it; `base` overrides the line's base for this owner. */
  value(sheet: Readonly<StatPointSheet<S>>, stat: S, base?: number): number;
  /** What one more point would add to the stat. */
  gain(stat: S, base?: number): number;
  spent(sheet: Readonly<StatPointSheet<S>>): number;
  /** Points earned and not yet spent. */
  unspent(sheet: Readonly<StatPointSheet<S>>, earned: number): number;
  /** Put one point into `stat` when one is unspent and the stat is below its cap. Mutates the sheet. */
  spend(sheet: StatPointSheet<S>, stat: S, earned: number): boolean;
}

/**
 * Create a stat-point sheet reader for a set of stats.
 * @capability stat-points level-up points spent into stats, each adding an amount or scaling the stat, with per-owner bases and a per-stat cap
 */
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
