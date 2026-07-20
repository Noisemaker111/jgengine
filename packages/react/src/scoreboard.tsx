import { type CSSProperties, type ReactNode } from "react";

import {
  medalFor,
  rankLeaderboard,
  type RankableRow,
  type RankedEntry,
  type RankLeaderboardOptions,
} from "@jgengine/core/game/leaderboardRank";

import { GameIcon, type GameIconName } from "./gameIcons";

/** The medal tokens {@link medalFor} emits for the podium. */
export type MedalToken = "gold" | "silver" | "bronze";

/** Reskin tokens for {@link Scoreboard}. Every color/spacing value reads a `--jg-*` token first. */
export interface ScoreboardTheme {
  /** Panel background. Default reads `--jg-frame-bg`. */
  bg?: string;
  /** Panel border. Default reads `--jg-frame-border`. */
  border?: string;
  /** Panel corner radius. Default reads `--jg-frame-radius`. */
  radius?: string;
  /** Row / header text color. */
  text?: string;
  /** Muted text (rank column, header labels). */
  muted?: string;
  /** Accent used for the local-row highlight. Default reads `--jg-accent`. */
  accent?: string;
  /** Background wash behind the local ("you") row. */
  localBg?: string;
  /** Font family. */
  fontFamily?: string;
  /** Podium medal colors keyed by token. */
  medals?: Record<MedalToken, string>;
}

function resolveTheme(theme: ScoreboardTheme | undefined): Required<Omit<ScoreboardTheme, "medals">> & {
  medals: Record<MedalToken, string>;
} {
  return {
    bg: theme?.bg ?? "var(--jg-frame-bg, linear-gradient(180deg, rgba(20,24,32,0.92), rgba(10,12,16,0.95)))",
    border: theme?.border ?? "var(--jg-frame-border, 1px solid rgba(255,255,255,0.12))",
    radius: theme?.radius ?? "var(--jg-frame-radius, 12px)",
    text: theme?.text ?? "#f1f5f9",
    muted: theme?.muted ?? "rgba(203,213,225,0.65)",
    accent: theme?.accent ?? "var(--jg-accent, #38bdf8)",
    localBg: theme?.localBg ?? "rgba(56,189,248,0.16)",
    fontFamily: theme?.fontFamily ?? "ui-sans-serif, system-ui, sans-serif",
    medals: theme?.medals ?? { gold: "#f5c542", silver: "#cbd5e1", bronze: "#cd7f32" },
  };
}

/** Props for {@link Scoreboard}. Pass either `entries` (already ranked) or `rows` + `options`. */
export interface ScoreboardProps {
  /** Already-ranked entries from {@link rankLeaderboard}. Takes precedence over `rows`. */
  entries?: readonly RankedEntry[];
  /** Raw rows to rank in-component. Ignored when `entries` is given. */
  rows?: readonly RankableRow[];
  /** Ranking options applied to `rows`. Ignored when `entries` is given. */
  options?: RankLeaderboardOptions;
  /** Optional heading rendered above the table (e.g. "TOP RUNNERS"). */
  title?: ReactNode;
  /** Label for the score column header. Default `"Score"`. */
  scoreLabel?: string;
  /**
   * Map a `userId` to a display name. Falls back to the entry's `label`, then the
   * raw `userId`. The model never carries display names it does not own.
   */
  nameFor?: (entry: RankedEntry) => ReactNode;
  /** Format a raw score for display. Default `String(value)`. */
  formatScore?: (value: number) => ReactNode;
  /**
   * Podium icon for a medal token. Default: a filled star tinted by the medal
   * color. Return `null` to render just the numeric rank.
   */
  medalIcon?: (medal: MedalToken) => GameIconName | null;
  /** Reskin tokens. */
  theme?: ScoreboardTheme;
  className?: string;
  style?: CSSProperties;
}

/**
 * A reskinnable ranked-score table for the {@link rankLeaderboard} selector: a rank
 * column (medal icon/color for the top three via {@link medalFor}, otherwise the
 * number), a name column, and a score column. The local player's row (`isLocal`) is
 * washed and accented so "you" stands out. Feed it already-ranked `entries`, or raw
 * `rows` plus `options` and it ranks them for you. All colors and spacing come from
 * {@link ScoreboardTheme} / HudTheme `--jg-*` tokens — the component reads the model
 * and never styles by game meaning.
 *
 * @capability scoreboard-table reskinnable ranked-score / leaderboard table over the rankLeaderboard selector — medal-colored podium, local-row highlight, HudTheme-token driven
 */
export function Scoreboard({
  entries,
  rows,
  options,
  title,
  scoreLabel = "Score",
  nameFor,
  formatScore,
  medalIcon,
  theme,
  className,
  style,
}: ScoreboardProps): ReactNode {
  const t = resolveTheme(theme);
  const ranked = entries ?? rankLeaderboard(rows ?? [], options ?? {});

  const cell: CSSProperties = { padding: "0.5em 0.75em", textAlign: "left", whiteSpace: "nowrap" };
  const headCell: CSSProperties = {
    ...cell,
    fontSize: "0.72em",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: t.muted,
  };

  return (
    <div
      className={className}
      data-jgui="scoreboard"
      style={{
        display: "inline-flex",
        flexDirection: "column",
        gap: "0.5em",
        background: t.bg,
        border: t.border,
        borderRadius: t.radius,
        padding: "0.75em",
        color: t.text,
        fontFamily: t.fontFamily,
        minWidth: 280,
        ...style,
      }}
    >
      {title !== undefined ? (
        <div
          data-jgui="scoreboard-title"
          style={{ fontSize: "0.95em", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", padding: "0 0.25em" }}
        >
          {title}
        </div>
      ) : null}
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.95em" }}>
        <thead>
          <tr>
            <th style={{ ...headCell, textAlign: "center", width: "3em" }}>#</th>
            <th style={headCell}>Name</th>
            <th style={{ ...headCell, textAlign: "right" }}>{scoreLabel}</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((entry, index) => {
            const medal = medalFor(entry.rank);
            const medalColor = medal !== null ? t.medals[medal] : undefined;
            const icon = medal !== null ? (medalIcon ? medalIcon(medal) : "star") : null;
            const name = nameFor ? nameFor(entry) : entry.label ?? entry.userId;
            const rowKey = `${entry.userId}:${index}`;
            return (
              <tr
                key={rowKey}
                data-scoreboard-row={entry.userId}
                data-rank={entry.rank}
                data-local={entry.isLocal ? "" : undefined}
                data-tie={entry.isTie ? "" : undefined}
                style={{
                  background: entry.isLocal ? t.localBg : "transparent",
                  boxShadow: entry.isLocal ? `inset 3px 0 0 ${t.accent}` : undefined,
                }}
              >
                <td style={{ ...cell, textAlign: "center" }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.25em",
                      color: medalColor ?? t.muted,
                      fontWeight: medal !== null ? 800 : 600,
                    }}
                  >
                    {icon !== null ? <GameIcon name={icon} size={16} color={medalColor} /> : null}
                    {entry.rank}
                  </span>
                </td>
                <td style={{ ...cell, color: entry.isLocal ? t.accent : t.text, fontWeight: entry.isLocal ? 700 : 500 }}>
                  {name}
                </td>
                <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                  {formatScore ? formatScore(entry.value) : entry.value}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
