import type { Puzzle } from "../../logic/types";
import type { AppState } from "../../state/types";
import { formatTime } from "../format";
import { GOOD, WARN } from "../theme";

interface StatsProps {
  app: AppState;
  puzzle: Puzzle;
}

export function Stats({ app, puzzle }: StatsProps) {
  const strikesLeft = app.maxStrikes - app.strikes;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "8px 16px" }}>
      <span
        style={{
          padding: "3px 10px",
          borderRadius: 999,
          background: "rgba(20,184,166,0.16)",
          border: "1px solid rgba(20,184,166,0.35)",
          color: "#5eead4",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.04em",
        }}
      >
        {puzzle.group}
      </span>
      <span style={{ fontSize: 26, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: "#f1f5f9" }}>
        {formatTime(app.elapsedMs)}
      </span>
      {app.mistakesMode && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, color: "#cbd5e1" }}>
          <span style={{ color: "#94a3b8" }}>strikes</span>
          {Array.from({ length: app.maxStrikes }, (_, i) => (
            <span key={i} style={{ color: i < app.strikes ? WARN : "rgba(148,163,184,0.35)", fontSize: 15, fontWeight: 800 }}>
              ✕
            </span>
          ))}
          <span style={{ color: strikesLeft > 0 ? GOOD : WARN, fontWeight: 700 }}>
            {strikesLeft} left
          </span>
        </span>
      )}
    </div>
  );
}
