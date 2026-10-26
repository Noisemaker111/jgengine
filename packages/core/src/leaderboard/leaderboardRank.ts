import type { LeaderboardRow } from "./leaderboard";

/**
 * A single input score to rank. Accepts the raw shape produced by
 * {@link LeaderboardRow} (a `LeaderboardRow` is assignable to this) as well as a
 * minimal `{ userId, value }` pair with an optional display `label` the game owns.
 */
export interface RankableRow {
  /** Stable identity of the scoring player/profile. */
  userId: string;
  /** The numeric score to rank on. */
  value: number;
  /** Optional display name the UI shows instead of `userId`. Free string the game owns. */
  label?: string;
}

/**
 * How equal scores share ranks:
 * - `"standard"` (competition ranking): ties share a rank and the next distinct
 *   score skips ahead — `1, 2, 2, 4`.
 * - `"dense"`: ties share a rank and the next distinct score is the very next
 *   integer — `1, 2, 2, 3`.
 */
export type TieMode = "standard" | "dense";

/** Options for {@link rankLeaderboard}. All optional. */
export interface RankLeaderboardOptions {
  /**
   * `userId` of the local player. The matching entry gets `isLocal: true` so the
   * renderer can highlight "you" in the table. No effect on ordering.
   */
  highlightUserId?: string;
  /** Tie handling for equal scores. Default `"standard"`. */
  tieMode?: TieMode;
  /** Keep only the first N ranked entries (applied after ranking). Default: keep all. */
  limit?: number;
  /** Sort direction on `value`. `"desc"` (default) ranks the highest score #1; `"asc"` ranks the lowest #1. */
  order?: "desc" | "asc";
}

/** One render-ready row of the ranked table produced by {@link rankLeaderboard}. */
export interface RankedEntry {
  /** 1-based rank after tie handling. */
  rank: number;
  /** Carried through from the input row. */
  userId: string;
  /** Carried through from the input row. */
  value: number;
  /** The display label if the input row carried one, else `undefined`. */
  label: string | undefined;
  /** `true` when this row shares its `value` with at least one other ranked row. */
  isTie: boolean;
  /** `true` when `userId === options.highlightUserId` — the local "you" row. */
  isLocal: boolean;
}

/**
 * Turn raw leaderboard rows into a render-ready ranked table. Pure and
 * allocation-bounded: it sorts a copy by `value` (descending by default), assigns
 * 1-based ranks with correct tie handling (`"standard"` → `1, 2, 2, 4`; `"dense"`
 * → `1, 2, 2, 3`), flags rows that share a score (`isTie`), marks the local player
 * (`isLocal`, via `highlightUserId`), and finally applies `limit`. Sorting is
 * stable, so rows with equal scores keep their input order. Nothing here styles or
 * branches on game meaning — pair it with {@link medalFor} and a game-owned theme
 * to render a reskinnable scoreboard. Accepts a {@link LeaderboardRow}`[]` straight
 * from `leaderboard.snapshot()`/`getTop()` since those satisfy {@link RankableRow}.
 *
 * @capability scoreboard pure tie-aware ranking selector over the leaderboard model — standard/dense ranks, local-entry highlight, top-N, medal tokens for a reskinnable table
 */
export function rankLeaderboard(
  rows: readonly RankableRow[],
  options: RankLeaderboardOptions = {},
): RankedEntry[] {
  const { highlightUserId, tieMode = "standard", limit, order = "desc" } = options;
  const dir = order === "asc" ? 1 : -1;

  // Stable sort on value in the requested direction; equal values keep input order.
  const sorted = rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const byValue = (a.row.value - b.row.value) * dir;
      return byValue !== 0 ? byValue : a.index - b.index;
    })
    .map((entry) => entry.row);

  const ranked: RankedEntry[] = [];
  let lastValue: number | undefined;
  let lastRank = 0;
  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i]!;
    let rank: number;
    if (lastValue !== undefined && row.value === lastValue) {
      // Tie: share the previous rank regardless of mode.
      rank = lastRank;
    } else if (tieMode === "dense") {
      rank = lastRank + 1;
    } else {
      // Standard/competition: skip ahead by the count of rows already placed.
      rank = i + 1;
    }
    // isTie: shares value with a neighbor in the sorted list.
    const prev = sorted[i - 1];
    const next = sorted[i + 1];
    const isTie = (prev !== undefined && prev.value === row.value) || (next !== undefined && next.value === row.value);
    ranked.push({
      rank,
      userId: row.userId,
      value: row.value,
      label: row.label,
      isTie,
      isLocal: highlightUserId !== undefined && row.userId === highlightUserId,
    });
    lastValue = row.value;
    lastRank = rank;
  }

  return limit !== undefined && limit >= 0 ? ranked.slice(0, limit) : ranked;
}

/**
 * A free-string medal token for the top-three ranks — `"gold"` (1), `"silver"`
 * (2), `"bronze"` (3) — or `null` for any other rank. It is a semantic token, not
 * a color: the UI maps it to an icon/color/theme, and the model never styles. Feed
 * it a {@link RankedEntry.rank}.
 */
export function medalFor(rank: number): "gold" | "silver" | "bronze" | null {
  switch (rank) {
    case 1:
      return "gold";
    case 2:
      return "silver";
    case 3:
      return "bronze";
    default:
      return null;
  }
}
