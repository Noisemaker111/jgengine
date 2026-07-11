import { useGame } from "@jgengine/react/hooks";

import { CELLS, SIZE } from "../../board";
import type { AppState } from "../../state";
import { COLORS, FLIP_STEP_MS, discGradient } from "../theme";
import { Disc } from "./Disc";

const KEYFRAMES = `
@keyframes reversiDrop { from { transform: scale(0.25); opacity: 0.15; } to { transform: scale(1); opacity: 1; } }
@keyframes reversiDot { 0%, 100% { opacity: 0.42; transform: scale(0.9); } 50% { opacity: 0.85; transform: scale(1.05); } }
@keyframes reversiBanner { from { opacity: 0; transform: translateY(-10px) scale(0.94); } to { opacity: 1; transform: none; } }
`;

function interactable(app: AppState): boolean {
  if (app.status !== "playing" || app.aiThinking) return false;
  return app.mode === "hotseat" || app.toMove !== app.aiSide;
}

export function Board({ app }: { app: AppState }): React.ReactElement {
  const { commands } = useGame();
  const canPlay = interactable(app);
  const showDots = app.status === "playing" && !app.aiThinking;
  const legal = new Set(app.legal);
  const flipDelays = new Map<number, number>();
  if (app.lastMove !== null) for (const f of app.lastMove.flips) flipDelays.set(f.index, f.step * FLIP_STEP_MS);
  const lastIndex = app.lastMove?.index ?? -1;

  return (
    <div
      style={{
        width: "min(76vmin, 560px)",
        aspectRatio: "1 / 1",
        padding: "clamp(10px, 2.4vmin, 20px)",
        borderRadius: "14px",
        background: `linear-gradient(150deg, ${COLORS.brassHi} 0%, ${COLORS.brass} 40%, ${COLORS.brassLo} 100%)`,
        boxShadow: "0 18px 40px rgba(0,0,0,0.55), inset 0 0 0 2px rgba(0,0,0,0.25)",
      }}
    >
      <style>{KEYFRAMES}</style>
      <div
        onContextMenu={(e) => e.preventDefault()}
        style={{
          width: "100%",
          height: "100%",
          display: "grid",
          gridTemplateColumns: `repeat(${SIZE}, 1fr)`,
          gridTemplateRows: `repeat(${SIZE}, 1fr)`,
          gap: "2px",
          padding: "2px",
          borderRadius: "6px",
          background: COLORS.gridLine,
          boxShadow: "inset 0 0 0 2px rgba(0,0,0,0.35)",
          touchAction: "none",
        }}
      >
        {Array.from({ length: CELLS }, (_, i) => {
          const owner = app.board[i];
          const isLegal = showDots && legal.has(i);
          const clickable = canPlay && legal.has(i);
          return (
            <button
              key={i}
              type="button"
              disabled={!clickable}
              onClick={clickable ? () => commands.run("place", { index: i }) : undefined}
              aria-label={`cell ${i}`}
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "none",
                padding: 0,
                borderRadius: "3px",
                cursor: clickable ? "pointer" : "default",
                background: `linear-gradient(145deg, ${COLORS.feltHi} 0%, ${COLORS.feltLo} 100%)`,
              }}
            >
              {owner !== 0 ? (
                <Disc owner={owner} isLast={i === lastIndex} flipDelayMs={flipDelays.get(i) ?? 0} />
              ) : null}
              {isLegal ? (
                <span
                  style={{
                    width: "30%",
                    height: "30%",
                    borderRadius: "9999px",
                    background: discGradient(app.toMove),
                    opacity: 0.7,
                    boxShadow: `0 0 0 2px ${app.toMove === 1 ? "rgba(255,255,255,0.35)" : "rgba(40,40,40,0.4)"}`,
                    animation: "reversiDot 1.6s ease-in-out infinite",
                    pointerEvents: "none",
                  }}
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
