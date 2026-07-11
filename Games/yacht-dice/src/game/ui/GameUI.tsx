import { useDisplayProfile } from "@jgengine/react/display";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react/hudLayout";

import { STORE_KEY } from "../../loop";
import type { YachtState } from "../state/game";
import { DiceTray } from "./components/DiceTray";
import { Header } from "./components/Header";
import { Results } from "./components/Results";
import { ScoreSheet } from "./components/ScoreSheet";
import { C, KEYFRAMES, SANS, leather, type Run } from "./theme";

export function GameUI() {
  const layout = useHudLayout({ storageKey: "yacht-dice-hud" });
  const { compact } = useDisplayProfile();
  const { commands } = useGame();
  const state = useGameStore((ctx) => ctx.game.store.get(STORE_KEY) as YachtState | undefined);

  if (state === undefined) return null;

  const run: Run = (name, input) => {
    commands.run(name, input ?? {});
  };
  const over = state.phase === "over";
  const dieSize = compact ? 44 : 56;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: C.baize,
        color: C.text,
        fontFamily: SANS,
      }}
    >
      <style>{KEYFRAMES}</style>
      <HudCanvas layout={layout}>
        <HudPanel id="board" anchor="center" compact="keep" interactive>
          <div
            style={{
              ...leather(compact ? 16 : 22, 18),
              width: compact ? "min(94vw, 560px)" : "min(96vw, 880px)",
              maxHeight: "92vh",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: compact ? 14 : 18,
            }}
          >
            <Header state={state} run={run} />
            <div style={{ borderTop: `1px solid ${C.line}` }} />
            {over ? (
              <Results state={state} run={run} />
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: compact ? "column" : "row",
                  gap: compact ? 18 : 28,
                  alignItems: compact ? "center" : "flex-start",
                  justifyContent: "center",
                }}
              >
                <DiceTray state={state} dieSize={dieSize} run={run} />
                <ScoreSheet state={state} run={run} compact={compact} />
              </div>
            )}
          </div>
        </HudPanel>

        <HudPanel id="credit" anchor="bottom" compact="keep" interactive={false}>
          <div
            style={{
              font: `600 11px/1.4 ${SANS}`,
              letterSpacing: "0.04em",
              color: C.textDim,
              textAlign: "center",
              padding: "6px 14px",
              background: "rgba(0,0,0,0.3)",
              borderRadius: 999,
              border: `1px solid ${C.line}`,
            }}
          >
            Yacht — traditional dice game; popularized as Yahtzee (E.S. Lowe, 1956)
          </div>
        </HudPanel>
      </HudCanvas>
    </div>
  );
}
