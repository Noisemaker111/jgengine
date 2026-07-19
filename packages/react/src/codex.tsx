import { useMemo, useState, type CSSProperties, type ReactNode } from "react";

import type { CodexEntryView } from "@jgengine/core/game/codex";

/** Props for {@link Codex}. */
export interface CodexProps {
  entries: readonly CodexEntryView[];
  title?: string;
  columns?: number;
  /** Mask name/description of secret + undiscovered entries as "???". Default true. */
  maskSecrets?: boolean;
  /** Optional per-entry icon; falls back to the def `icon` glyph, a lock, or a silhouette dot. */
  renderIcon?: (entry: CodexEntryView) => ReactNode;
  onSelect?: (id: string) => void;
  emptyLabel?: string;
  className?: string;
  style?: CSSProperties;
}

const ALL = "__all";
const MASK = "???";

/**
 * Codex / bestiary gallery — category tabs, a responsive grid of entry cards
 * (discovered vs. locked, secret entries masked until found), and a header
 * summarizing completion. Feed it `codex.list()`; wire `onSelect` to a detail
 * pane.
 *
 * @capability codex-gallery codex/bestiary gallery with category tabs, discovered/locked cards, secret masking, and a completion header
 */
export function Codex({
  entries,
  title = "Codex",
  columns = 3,
  maskSecrets = true,
  renderIcon,
  onSelect,
  emptyLabel = "Nothing discovered yet.",
  className,
  style,
}: CodexProps): ReactNode {
  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const entry of entries) if (entry.category !== undefined && !seen.includes(entry.category)) seen.push(entry.category);
    return seen;
  }, [entries]);
  const [tab, setTab] = useState<string>(ALL);
  const shown = tab === ALL ? entries : entries.filter((entry) => entry.category === tab);
  const discovered = entries.reduce((count, entry) => (entry.discovered ? count + 1 : count), 0);

  const tabStyle = (active: boolean): CSSProperties => ({
    borderRadius: 6,
    border: `1px solid ${active ? "rgba(56,189,248,0.6)" : "rgba(148,163,184,0.35)"}`,
    background: active ? "rgba(56,189,248,0.2)" : "transparent",
    color: active ? "#bae6fd" : "rgba(226,232,240,0.75)",
    padding: "3px 9px",
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
  });

  return (
    <div
      className={className}
      data-codex
      style={{
        width: columns * 116 + 28,
        borderRadius: 14,
        padding: 14,
        background: "linear-gradient(160deg, rgba(20,24,32,0.97), rgba(11,14,19,0.97))",
        border: "1px solid var(--jg-ring, rgba(148,163,184,0.32))",
        color: "#e2e8f0",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase" }}>{title}</span>
        <span style={{ fontSize: 11, color: "rgba(203,213,225,0.75)", fontVariantNumeric: "tabular-nums" }}>
          {discovered}/{entries.length} discovered
        </span>
      </div>
      {categories.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
          <button type="button" data-codex-tab={ALL} style={tabStyle(tab === ALL)} onClick={() => setTab(ALL)}>All</button>
          {categories.map((category) => (
            <button key={category} type="button" data-codex-tab={category} style={tabStyle(tab === category)} onClick={() => setTab(category)}>
              {category}
            </button>
          ))}
        </div>
      ) : null}
      {shown.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: "rgba(148,163,184,0.8)" }}>{emptyLabel}</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 8 }}>
          {shown.map((entry) => {
            const masked = maskSecrets && entry.secret === true && !entry.discovered;
            const name = masked ? MASK : entry.name;
            const icon = renderIcon?.(entry) ?? (masked ? "🔒" : entry.discovered ? entry.icon ?? "📖" : "◻");
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  data-codex-entry={entry.id}
                  data-discovered={entry.discovered}
                  onClick={() => onSelect?.(entry.id)}
                  style={{
                    width: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    padding: "12px 6px",
                    borderRadius: 10,
                    border: `1px solid ${entry.discovered ? "rgba(56,189,248,0.35)" : "rgba(148,163,184,0.2)"}`,
                    background: entry.discovered ? "rgba(56,189,248,0.08)" : "rgba(148,163,184,0.05)",
                    color: "#e2e8f0",
                    cursor: onSelect !== undefined ? "pointer" : "default",
                    opacity: entry.discovered ? 1 : 0.7,
                  }}
                >
                  <span style={{ fontSize: 24, filter: entry.discovered ? "none" : "grayscale(1) brightness(0.7)" }}>{icon}</span>
                  <span style={{ fontSize: 11, fontWeight: entry.discovered ? 700 : 500, textAlign: "center" }}>{name}</span>
                  {entry.discovered && entry.description !== undefined ? (
                    <span style={{ fontSize: 10, color: "rgba(203,213,225,0.7)", textAlign: "center" }}>{entry.description}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
