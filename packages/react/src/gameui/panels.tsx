import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { QuestInstance } from "@jgengine/core/game/quest";
import type { LeaderboardScope } from "@jgengine/core/game/leaderboard";
import type { FeedEntry } from "@jgengine/core/game/feed";
import { rollCheck, type CheckResult } from "@jgengine/core/stats/rollCheck";
import type { DialogueChoice, DialogueDef } from "../components";
import { useFeed, useLeaderboard, useQuestJournal } from "../hooks";
import {
  HudLabel,
  HudPanel,
  chamfer,
  clampFraction,
  edgeNotch,
  hudTextShadow,
  slantBar,
  surfaceTexture,
} from "./chrome";
import { rarityColor, useGameUiTheme, type GameUiTheme, type RarityTierName } from "./theme";

function HoverButton({
  onClick,
  disabled,
  style,
  hoverStyle,
  dataJgui,
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  style: CSSProperties;
  hoverStyle: CSSProperties;
  dataJgui?: string;
  children?: ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      data-jgui={dataJgui}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ ...style, ...(hovered && disabled !== true ? hoverStyle : {}) }}
    >
      {children}
    </button>
  );
}

function IconWell({ size, theme, children }: { size: number; theme: GameUiTheme; children?: ReactNode }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        clipPath: chamfer(5),
        border: `1px solid ${theme.edgeBright}`,
        background: `linear-gradient(180deg, ${theme.surface} 0%, ${theme.surfaceDeep} 100%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

export interface TrackedObjective {
  id: string;
  label: string;
  count?: number;
  target?: number;
  complete?: boolean;
}

export interface TrackedQuest {
  id: string;
  title: string;
  objectives: readonly TrackedObjective[];
}

function ObjectiveRow({ objective }: { objective: TrackedObjective }) {
  const theme = useGameUiTheme();
  const complete = objective.complete ?? false;
  return (
    <div data-jgui="objective-row" style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 12 }}>
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          flexShrink: 0,
          transform: "rotate(45deg)",
          background: complete ? theme.success : "transparent",
          border: complete ? "none" : `1px solid ${theme.edgeBright}`,
          boxShadow: complete ? `0 0 4px ${theme.success}aa` : "none",
        }}
      />
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontFamily: theme.fontBody,
          fontSize: 11.5,
          color: complete ? theme.textDim : theme.textPrimary,
          textDecoration: complete ? "line-through" : "none",
          textShadow: hudTextShadow(),
        }}
      >
        {objective.label}
      </span>
      {objective.target !== undefined && (
        <span style={{ flexShrink: 0, fontFamily: theme.fontNumeric, fontSize: 10.5, color: theme.textDim }}>
          {objective.count ?? 0}/{objective.target}
        </span>
      )}
    </div>
  );
}

export function ObjectiveList({ quest, className }: { quest: TrackedQuest; className?: string }) {
  const theme = useGameUiTheme();
  return (
    <div className={className} data-jgui="objective-list" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          aria-hidden
          style={{
            display: "inline-block",
            width: 3,
            height: 12,
            transform: "skewX(-14deg)",
            background: theme.accent,
            boxShadow: `0 0 6px ${theme.accentGlow}`,
          }}
        />
        <span
          style={{
            fontFamily: theme.fontDisplay,
            fontSize: 12,
            fontWeight: 700,
            color: theme.accent,
            textShadow: hudTextShadow(),
          }}
        >
          {quest.title}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {quest.objectives.map((objective) => (
          <ObjectiveRow key={objective.id} objective={objective} />
        ))}
      </div>
    </div>
  );
}

export function QuestTracker({
  quests,
  width = 240,
  className,
}: {
  quests: readonly TrackedQuest[];
  width?: number;
  className?: string;
}) {
  return (
    <div className={className} data-jgui="quest-tracker" style={{ width, display: "flex", flexDirection: "column", gap: 10 }}>
      {quests.map((quest) => (
        <ObjectiveList key={quest.id} quest={quest} />
      ))}
    </div>
  );
}

export function JournalQuestTracker({
  describe,
  width,
  className,
}: {
  describe: (quest: QuestInstance) => TrackedQuest | null;
  width?: number;
  className?: string;
}) {
  const journal = useQuestJournal();
  const quests = journal
    .map((instance) => describe(instance))
    .filter((quest): quest is TrackedQuest => quest !== null);
  return <QuestTracker quests={quests} width={width} className={className} />;
}

export interface ScoreboardColumn {
  key: string;
  header: string;
  width?: number;
  align?: "left" | "right";
}

export interface ScoreboardRow {
  id: string;
  values: Record<string, string | number>;
  highlight?: boolean;
  teamColor?: string;
}

function looksNumeric(value: string | number): boolean {
  if (typeof value === "number") return true;
  return /^-?\d+(\.\d+)?$/.test(value.trim());
}

export function ScoreboardOverlay({
  title,
  columns,
  rows,
  open = true,
  width = 560,
  className,
}: {
  title?: string;
  columns: readonly ScoreboardColumn[];
  rows: readonly ScoreboardRow[];
  open?: boolean;
  width?: number;
  className?: string;
}) {
  const theme = useGameUiTheme();
  if (!open) return null;
  return (
    <div
      className={className}
      data-jgui="scoreboard-overlay"
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.55)",
        pointerEvents: "auto",
      }}
    >
      <HudPanel title={title} width={width}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", paddingBottom: 6, marginBottom: 4, borderBottom: `1px solid ${theme.edge}` }}>
            {columns.map((column) => (
              <div
                key={column.key}
                style={{ width: column.width, flex: column.width === undefined ? 1 : "0 0 auto", textAlign: column.align ?? "left" }}
              >
                <HudLabel>{column.header}</HudLabel>
              </div>
            ))}
          </div>
          {rows.map((row, index) => {
            const alt = index % 2 === 1;
            const edge = row.highlight === true ? `2px solid ${theme.accent}` : row.teamColor !== undefined ? `3px solid ${row.teamColor}` : "2px solid transparent";
            return (
              <div
                key={row.id}
                data-jgui="scoreboard-row"
                style={{
                  boxSizing: "border-box",
                  display: "flex",
                  alignItems: "center",
                  padding: "5px 0",
                  paddingLeft: 6,
                  borderLeft: edge,
                  background: row.highlight === true ? `${theme.accent}1a` : alt ? "rgba(255,255,255,0.025)" : "transparent",
                }}
              >
                {columns.map((column) => {
                  const value = row.values[column.key];
                  const numeric = value !== undefined && looksNumeric(value);
                  return (
                    <div
                      key={column.key}
                      style={{
                        width: column.width,
                        flex: column.width === undefined ? 1 : "0 0 auto",
                        textAlign: column.align ?? (numeric ? "right" : "left"),
                        fontFamily: numeric ? theme.fontNumeric : theme.fontBody,
                        fontSize: 12,
                        color: theme.textPrimary,
                      }}
                    >
                      {value}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </HudPanel>
    </div>
  );
}

export interface RankEntry {
  id: string;
  rank: number;
  name: string;
  value: string | number;
  highlight?: boolean;
}

function RankStar({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" width={10} height={10} fill={color} aria-hidden>
      <path d="M12 2 L14.5 9.5 L22 12 L14.5 14.5 L12 22 L9.5 14.5 L2 12 L9.5 9.5 Z" />
    </svg>
  );
}

export function RankList({
  entries,
  title,
  width = 300,
  className,
}: {
  entries: readonly RankEntry[];
  title?: string;
  width?: number;
  className?: string;
}) {
  const theme = useGameUiTheme();
  return (
    <div className={className} data-jgui="rank-list">
      <HudPanel title={title} width={width}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {entries.map((entry, index) => {
            const rankColor = entry.rank === 1 ? theme.accent : entry.rank === 2 || entry.rank === 3 ? theme.textPrimary : theme.textDim;
            return (
              <div
                key={entry.id}
                data-jgui="rank-row"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 2px",
                  background: entry.highlight === true ? `${theme.accent}1a` : index % 2 === 1 ? "rgba(255,255,255,0.025)" : "transparent",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 3,
                    width: 26,
                    flexShrink: 0,
                    fontFamily: theme.fontNumeric,
                    fontWeight: 700,
                    fontSize: 12,
                    color: rankColor,
                  }}
                >
                  {entry.rank === 1 && <RankStar color={theme.accent} />}
                  {entry.rank}
                </span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontFamily: theme.fontBody,
                    fontSize: 12,
                    color: theme.textPrimary,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {entry.name}
                </span>
                <span style={{ flexShrink: 0, fontFamily: theme.fontNumeric, fontSize: 12, color: theme.textPrimary, textAlign: "right" }}>
                  {entry.value}
                </span>
              </div>
            );
          })}
        </div>
      </HudPanel>
    </div>
  );
}

export function StatLeaderboard({
  stat,
  scope,
  title,
  resolveName,
  limit,
  width,
  className,
}: {
  stat: string;
  scope: LeaderboardScope;
  title?: string;
  resolveName?: (userId: string) => string;
  limit?: number;
  width?: number;
  className?: string;
}) {
  const rows = useLeaderboard(stat, { scope, limit });
  const entries: RankEntry[] = rows.map((row, index) => ({
    id: row.userId,
    rank: index + 1,
    name: resolveName?.(row.userId) ?? row.userId,
    value: row.value,
  }));
  return <RankList entries={entries} title={title} width={width} className={className} />;
}

export interface CombatLogLine {
  id: string;
  text: string;
  tone?: "normal" | "damage" | "heal" | "system";
}

function combatLogColor(theme: GameUiTheme, tone: CombatLogLine["tone"]): string {
  switch (tone ?? "normal") {
    case "damage":
      return theme.danger;
    case "heal":
      return theme.success;
    case "system":
      return theme.accent;
    default:
      return theme.textDim;
  }
}

export function CombatLogPanel({
  lines,
  title = "Combat Log",
  width = 320,
  height = 180,
  className,
}: {
  lines: readonly CombatLogLine[];
  title?: string;
  width?: number;
  height?: number;
  className?: string;
}) {
  const theme = useGameUiTheme();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = scrollRef.current;
    if (node !== null) node.scrollTop = node.scrollHeight;
  }, [lines.length]);
  return (
    <div className={className} data-jgui="combat-log-panel">
      <HudPanel title={title} width={width}>
        <div
          ref={scrollRef}
          data-jgui="combat-log-scroll"
          style={{ height, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}
        >
          {lines.map((line, index) => {
            const age = lines.length - 1 - index;
            return (
              <span
                key={line.id}
                style={{
                  fontFamily: theme.fontNumeric,
                  fontSize: 10.5,
                  color: combatLogColor(theme, line.tone),
                  opacity: Math.max(0.45, 1 - age * 0.05),
                }}
              >
                {line.text}
              </span>
            );
          })}
        </div>
      </HudPanel>
    </div>
  );
}

export function FeedCombatLog({
  action,
  limit = 30,
  mapLine,
  title,
  width,
  height,
  className,
}: {
  action: string;
  limit?: number;
  mapLine: (entry: FeedEntry<unknown>, index: number) => CombatLogLine | null;
  title?: string;
  width?: number;
  height?: number;
  className?: string;
}) {
  const entries = useFeed({ action, limit });
  const lines = entries
    .map((entry, index) => mapLine(entry, index))
    .filter((line): line is CombatLogLine => line !== null);
  return <CombatLogPanel lines={lines} title={title} width={width} height={height} className={className} />;
}

export interface VendorListing {
  id: string;
  icon?: ReactNode;
  name: string;
  rarity?: RarityTierName;
  price: number;
  priceIcon?: ReactNode;
  affordable?: boolean;
  stock?: number;
}

function CoinGlyph({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} aria-hidden>
      <circle cx="12" cy="12" r="9" fill={color} />
      <circle cx="12" cy="12" r="8.2" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={1} />
    </svg>
  );
}

export function VendorPanel({
  title = "Vendor",
  listings,
  balance,
  onBuy,
  width = 340,
  className,
}: {
  title?: string;
  listings: readonly VendorListing[];
  balance?: { amount: number; icon?: ReactNode };
  onBuy?: (id: string) => void;
  width?: number;
  className?: string;
}) {
  const theme = useGameUiTheme();
  return (
    <div className={className} data-jgui="vendor-panel">
      <HudPanel
        title={title}
        width={width}
        actions={
          balance !== undefined ? (
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {balance.icon ?? <CoinGlyph color={theme.accent} />}
              <span style={{ fontFamily: theme.fontNumeric, fontSize: 12, fontWeight: 700, color: theme.textPrimary }}>
                {balance.amount}
              </span>
            </span>
          ) : undefined
        }
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          {listings.map((listing, index) => {
            const color = rarityColor(theme, listing.rarity);
            const affordable = listing.affordable ?? true;
            return (
              <HoverButton
                key={listing.id}
                dataJgui="vendor-row"
                disabled={!affordable}
                onClick={onBuy === undefined ? undefined : () => onBuy(listing.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "6px 4px",
                  border: "none",
                  background: index % 2 === 1 ? "rgba(255,255,255,0.025)" : "transparent",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                  cursor: affordable ? "pointer" : "not-allowed",
                  textAlign: "left",
                  color: theme.textPrimary,
                  fontFamily: theme.fontBody,
                }}
                hoverStyle={{ background: "rgba(255,255,255,0.04)" }}
              >
                <IconWell size={34} theme={theme}>
                  {listing.icon}
                </IconWell>
                <span style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span
                    style={{
                      fontFamily: theme.fontBody,
                      fontSize: 12,
                      fontWeight: 600,
                      color,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {listing.name}
                  </span>
                  {listing.stock !== undefined && (
                    <span style={{ flexShrink: 0, fontFamily: theme.fontNumeric, fontSize: 10.5, color: theme.textDim }}>
                      ×{listing.stock}
                    </span>
                  )}
                </span>
                <span
                  style={{
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontFamily: theme.fontNumeric,
                    fontSize: 12,
                    fontWeight: 700,
                    color: affordable ? theme.accent : `${theme.danger}99`,
                  }}
                >
                  {listing.priceIcon ?? <CoinGlyph color={theme.accent} />}
                  {listing.price}
                </span>
              </HoverButton>
            );
          })}
        </div>
      </HudPanel>
    </div>
  );
}

export interface CraftingRecipeRow {
  id: string;
  icon?: ReactNode;
  name: string;
  inputs: readonly { icon?: ReactNode; label: string; have: number; need: number }[];
  craftable?: boolean;
  craftFraction?: number;
}

export function CraftingPanel({
  title = "Crafting",
  recipes,
  onCraft,
  width = 360,
  className,
}: {
  title?: string;
  recipes: readonly CraftingRecipeRow[];
  onCraft?: (id: string) => void;
  width?: number;
  className?: string;
}) {
  const theme = useGameUiTheme();
  return (
    <div className={className} data-jgui="crafting-panel">
      <HudPanel title={title} width={width}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {recipes.map((recipe) => {
            const craftable = recipe.craftable ?? true;
            const showProgress = recipe.craftFraction !== undefined && recipe.craftFraction > 0 && recipe.craftFraction < 1;
            return (
              <div
                key={recipe.id}
                data-jgui="crafting-recipe"
                style={{ display: "flex", flexDirection: "column", gap: 4, paddingBottom: 6, borderBottom: "1px solid rgba(255,255,255,0.05)" }}
              >
                <HoverButton
                  dataJgui="crafting-recipe-header"
                  disabled={!craftable}
                  onClick={onCraft === undefined ? undefined : () => onCraft(recipe.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    padding: 4,
                    border: "none",
                    background: "transparent",
                    cursor: craftable ? "pointer" : "not-allowed",
                    textAlign: "left",
                  }}
                  hoverStyle={{ background: "rgba(255,255,255,0.04)" }}
                >
                  <IconWell size={30} theme={theme}>
                    {recipe.icon}
                  </IconWell>
                  <span style={{ fontFamily: theme.fontBody, fontSize: 12, fontWeight: 700, color: craftable ? theme.textPrimary : theme.textDim }}>
                    {recipe.name}
                  </span>
                </HoverButton>
                <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 38, flexWrap: "wrap" }}>
                  {recipe.inputs.map((input, index) => (
                    <span key={index} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {index > 0 && (
                        <span aria-hidden style={{ width: 4, height: 4, flexShrink: 0, transform: "rotate(45deg)", background: theme.edgeBright }} />
                      )}
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 3,
                          fontFamily: theme.fontNumeric,
                          fontSize: 10,
                          color: input.have >= input.need ? theme.success : theme.danger,
                        }}
                      >
                        {input.icon}
                        {input.label} {input.have}/{input.need}
                      </span>
                    </span>
                  ))}
                </div>
                {showProgress && (
                  <div style={{ marginLeft: 38, height: 3, clipPath: slantBar(3), background: theme.surfaceDeep, overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${clampFraction(recipe.craftFraction ?? 0) * 100}%`,
                        background: theme.accent,
                        boxShadow: `0 0 6px ${theme.accentGlow}`,
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </HudPanel>
    </div>
  );
}

export function DialoguePanel({
  dialogue,
  speakerPortrait,
  onChoice,
  rng,
  width = 560,
  className,
}: {
  dialogue: DialogueDef;
  speakerPortrait?: ReactNode;
  onChoice?: (choice: DialogueChoice, result: CheckResult | null) => void;
  rng?: () => number;
  width?: number;
  className?: string;
}) {
  const theme = useGameUiTheme();
  const speakerLine = dialogue.lines.find((line) => "speaker" in line) as { speaker: string; text: string } | undefined;
  return (
    <div
      className={className}
      data-jgui="dialogue-panel"
      style={{
        position: "relative",
        width,
        marginTop: 12,
        clipPath: edgeNotch(12),
        background: surfaceTexture(theme),
        border: `1px solid ${theme.edge}`,
        borderTop: `2px solid ${theme.accent}`,
        boxShadow: "0 10px 30px rgba(0,0,0,0.65), inset 0 0 40px rgba(0,0,0,0.45)",
        color: theme.textPrimary,
        fontFamily: theme.fontBody,
        display: "flex",
        gap: 12,
        padding: 14,
      }}
    >
      {speakerPortrait !== undefined && (
        <div
          style={{
            width: 64,
            height: 64,
            flexShrink: 0,
            clipPath: chamfer(6),
            border: `1px solid ${theme.edgeBright}`,
            background: `linear-gradient(180deg, ${theme.surface} 0%, ${theme.surfaceDeep} 100%)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {speakerPortrait}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {speakerLine !== undefined && (
          <span
            style={{
              position: "absolute",
              top: -10,
              left: speakerPortrait !== undefined ? 76 : 14,
              background: `linear-gradient(135deg, ${theme.accentDeep} 0%, ${theme.surfaceDeep} 100%)`,
              border: `1px solid ${theme.accent}`,
              fontFamily: theme.fontDisplay,
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              padding: "2px 10px",
              clipPath: chamfer(3),
              color: theme.textPrimary,
              textShadow: hudTextShadow(),
            }}
          >
            {speakerLine.speaker}
          </span>
        )}
        {dialogue.lines.map((line, index) =>
          "choices" in line ? (
            <div key={index} data-jgui="dialogue-choices" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {line.choices.map((choice) => (
                <HoverButton
                  key={choice.label}
                  dataJgui="dialogue-choice"
                  onClick={() => onChoice?.(choice, choice.check === undefined ? null : rollCheck(choice.check, rng))}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    width: "100%",
                    padding: "6px 8px",
                    border: "none",
                    background: "transparent",
                    color: theme.textPrimary,
                    fontFamily: theme.fontBody,
                    fontSize: 12.5,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  hoverStyle={{ background: "rgba(255,255,255,0.05)" }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span aria-hidden style={{ color: theme.accent }}>
                      {"‣"}
                    </span>
                    <span>{choice.label}</span>
                  </span>
                  {choice.check !== undefined && (
                    <span style={{ flexShrink: 0, fontFamily: theme.fontNumeric, fontSize: 11, color: theme.warning }}>
                      [{choice.check.label ?? "Check"} DC {choice.check.dc}]
                    </span>
                  )}
                </HoverButton>
              ))}
            </div>
          ) : (
            <p key={index} style={{ margin: 0, fontFamily: theme.fontBody, fontSize: 13, lineHeight: 1.55, color: theme.textPrimary }}>
              {line.text}
            </p>
          ),
        )}
      </div>
    </div>
  );
}
