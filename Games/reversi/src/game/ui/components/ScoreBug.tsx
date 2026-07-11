import { DARK, LIGHT } from "../../board";
import type { Player } from "../../board";
import type { AppState } from "../../state";
import { COLORS, discGradient } from "../theme";

function Pip({ player, count, active, label }: { player: Player; count: number; active: boolean; label: string }): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "8px 14px",
        borderRadius: "10px",
        background: active ? "rgba(198,154,67,0.18)" : "rgba(255,255,255,0.03)",
        boxShadow: active ? `inset 0 0 0 1.5px ${COLORS.brass}` : "inset 0 0 0 1px rgba(255,255,255,0.06)",
        transition: "background 160ms ease, box-shadow 160ms ease",
      }}
    >
      <span
        style={{
          width: "26px",
          height: "26px",
          borderRadius: "9999px",
          background: discGradient(player),
          boxShadow: "0 2px 4px rgba(0,0,0,0.5), inset 0 2px 3px rgba(255,255,255,0.25)",
        }}
      />
      <div style={{ lineHeight: 1.1 }}>
        <div style={{ fontSize: "22px", fontWeight: 700, color: COLORS.text, fontVariantNumeric: "tabular-nums" }}>{count}</div>
        <div style={{ fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.subtext }}>{label}</div>
      </div>
    </div>
  );
}

export function ScoreBug({ app }: { app: AppState }): React.ReactElement {
  const darkTurn = app.status === "playing" && app.toMove === DARK;
  const lightTurn = app.status === "playing" && app.toMove === LIGHT;
  const darkLabel = app.mode === "ai" && app.aiSide === DARK ? "AI" : app.mode === "ai" ? "You" : "Dark";
  const lightLabel = app.mode === "ai" && app.aiSide === LIGHT ? "AI" : app.mode === "ai" ? "You" : "Light";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <Pip player={DARK} count={app.counts.dark} active={darkTurn} label={darkLabel} />
      <span style={{ fontSize: "12px", color: COLORS.subtext, fontWeight: 600 }}>vs</span>
      <Pip player={LIGHT} count={app.counts.light} active={lightTurn} label={lightLabel} />
    </div>
  );
}
