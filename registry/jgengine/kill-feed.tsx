import type { ReactNode } from "react";

export interface KillFeedEntry {
  id: string;
  left: string;
  verb?: ReactNode;
  right: string;
  highlight?: boolean;
}

const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

function SkullGlyph({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} fill={color} aria-hidden>
      <path d="M12 2C7 2 3.4 5.4 3.4 10c0 2.9 1.5 5.1 3.4 6.5V19c0 .6.4 1 1 1h1.4v-1.6h1.2V20h1.2v-1.6h1.2V20h1.2v-1.6H16c.6 0 1-.4 1-1v-2.5c1.9-1.4 3.4-3.6 3.4-6.5C20.4 5.4 17 2 12 2zm-3.2 9.4a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2zm6.4 0a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2z" />
    </svg>
  );
}

export function KillFeedRow({ entry, className }: { entry: KillFeedEntry; className?: string }) {
  return (
    <div
      className={className}
      data-jg="kill-feed-row"
      data-highlight={entry.highlight ?? false}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 8px 2px 10px",
        fontFamily: "var(--jg-font-body)",
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: "nowrap",
        animation: "jg-slide-down 0.28s ease-out",
        background:
          entry.highlight === true
            ? "linear-gradient(90deg, var(--jg-accent-glow) 0%, transparent 60%)"
            : "none",
        textShadow:
          entry.highlight === true
            ? `0 0 6px var(--jg-accent-glow), ${HUD_TEXT_SHADOW}`
            : HUD_TEXT_SHADOW,
      }}
    >
      {entry.highlight === true && (
        <span
          style={{
            position: "absolute",
            left: 0,
            top: 1,
            bottom: 1,
            width: 2,
            background: "var(--jg-accent)",
            boxShadow: "0 0 6px var(--jg-accent-glow)",
          }}
        />
      )}
      <span style={{ color: "var(--jg-friendly)" }}>{entry.left}</span>
      {entry.verb ?? <SkullGlyph color="var(--jg-text-dim)" />}
      <span style={{ color: "var(--jg-hostile)" }}>{entry.right}</span>
    </div>
  );
}

export function KillFeed({
  entries,
  limit = 5,
  className,
}: {
  entries: readonly KillFeedEntry[];
  limit?: number;
  className?: string;
}) {
  const shown = entries.slice(Math.max(0, entries.length - limit));
  return (
    <div
      className={className}
      data-jg="kill-feed"
      style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-end" }}
    >
      {shown.map((entry) => (
        <KillFeedRow key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
