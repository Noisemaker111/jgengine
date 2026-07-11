import { useGame } from "@jgengine/react/hooks";

import { DARK, LIGHT } from "../../board";
import type { AppState } from "../../state";
import { COLORS, discGradient } from "../theme";

function headline(app: AppState): string {
  const result = app.result;
  if (result === null) return "";
  if (result.winner === 0) return "Draw";
  if (app.mode === "ai") {
    const humanWon = result.winner !== app.aiSide;
    return humanWon ? "You win" : "Computer wins";
  }
  return result.winner === DARK ? "Dark wins" : "Light wins";
}

export function GameOverPanel({ app }: { app: AppState }): React.ReactElement | null {
  const { commands } = useGame();
  const result = app.result;
  if (result === null) return null;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(4, 10, 7, 0.6)",
        backdropFilter: "blur(3px)",
        pointerEvents: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "16px",
          padding: "28px 36px",
          borderRadius: "16px",
          background: COLORS.panelBg,
          boxShadow: `0 20px 50px rgba(0,0,0,0.6), inset 0 0 0 1.5px ${COLORS.panelBorder}`,
          animation: "reversiBanner 240ms ease-out",
        }}
      >
        <div style={{ fontSize: "26px", fontWeight: 800, color: COLORS.text, letterSpacing: "0.01em" }}>{headline(app)}</div>
        <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
          <Tally player={DARK} count={result.dark} />
          <span style={{ fontSize: "16px", color: COLORS.subtext }}>–</span>
          <Tally player={LIGHT} count={result.light} />
        </div>
        <button
          type="button"
          onClick={() => commands.run("rematch", {})}
          style={{
            padding: "10px 26px",
            borderRadius: "10px",
            border: `1.5px solid ${COLORS.brass}`,
            background: `linear-gradient(150deg, ${COLORS.brass}, ${COLORS.brassLo})`,
            color: "#20160a",
            fontSize: "14px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Rematch
        </button>
      </div>
    </div>
  );
}

function Tally({ player, count }: { player: 1 | 2; count: number }): React.ReactElement {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <span
        style={{
          width: "24px",
          height: "24px",
          borderRadius: "9999px",
          background: discGradient(player),
          boxShadow: "0 2px 4px rgba(0,0,0,0.5), inset 0 2px 3px rgba(255,255,255,0.25)",
        }}
      />
      <span style={{ fontSize: "24px", fontWeight: 700, color: COLORS.text, fontVariantNumeric: "tabular-nums" }}>{count}</span>
    </div>
  );
}
