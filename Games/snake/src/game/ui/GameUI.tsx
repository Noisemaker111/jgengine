import type { ReactNode } from "react";

import { useEngineState } from "@jgengine/react/engineStore";
import { useGame } from "@jgengine/react/hooks";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react/hudLayout";

import { SPEEDUP_MS, START_INTERVAL_MS } from "../logic";
import { snakeStore } from "../store";
import { Board } from "./components/Board";
import { GameOverOverlay, PauseOverlay, StartOverlay } from "./components/Overlays";

const GLOW = "0 0 12px rgba(90, 255, 150, 0.5), 0 0 3px rgba(200, 255, 220, 0.75)";

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 font-mono ${className ?? ""}`}
      style={{
        background: "rgba(4, 18, 12, 0.72)",
        borderColor: "rgba(125, 255, 176, 0.28)",
        color: "#bdeccf",
        boxShadow: "0 0 16px rgba(0, 0, 0, 0.45)",
      }}
    >
      {children}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[10px] uppercase tracking-[0.3em]" style={{ color: "#5fbf8c" }}>
        {label}
      </span>
      <span className="text-sm font-bold uppercase tracking-widest" style={{ color: accent ?? "#bdeccf" }}>
        {value}
      </span>
    </div>
  );
}

export function GameUI(): ReactNode {
  const snap = useEngineState(snakeStore);
  const { commands } = useGame();
  const layout = useHudLayout();
  const speed = Math.round((START_INTERVAL_MS - snap.intervalMs) / SPEEDUP_MS) + 1;

  return (
    <div className="absolute inset-0 overflow-hidden font-mono" style={{ background: "#05100b" }}>
      <Board />

      <HudCanvas layout={layout} editChord={false}>
        <HudPanel id="score" anchor="top-left" compact="keep">
          <Card>
            <div className="text-[10px] uppercase tracking-[0.3em]" style={{ color: "#5fbf8c" }}>
              Score
            </div>
            <div className="text-4xl font-black leading-none" style={{ color: "#7dffb0", textShadow: GLOW }}>
              {snap.score}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.2em]" style={{ color: "#4f9c74" }}>
              Len {snap.length}
              {snap.streak > 1 ? ` · Streak x${snap.streak}` : ""}
            </div>
          </Card>
        </HudPanel>

        <HudPanel id="meta" anchor="top-right" compact="chip" chip="Stats">
          <Card className="flex min-w-[9rem] flex-col gap-1">
            <Stat label="Best" value={snap.best} accent="#ffcf5c" />
            <Stat label="Mode" value={snap.mode} />
            <Stat label="Speed" value={speed} />
          </Card>
        </HudPanel>

        <HudPanel id="controls" anchor="bottom-left" compact="hide">
          <Card className="text-[10px] uppercase leading-relaxed tracking-[0.2em]">
            <div style={{ color: "#4f9c74" }}>Steer — Arrows / WASD / swipe</div>
            <div style={{ color: "#4f9c74" }}>Space play · P pause · R restart · M mode</div>
          </Card>
        </HudPanel>

        <HudPanel id="credit" anchor="bottom" compact="keep" interactive={false}>
          <div className="font-mono text-[10px] tracking-[0.12em]" style={{ color: "rgba(159, 216, 187, 0.5)" }}>
            Lineage: Blockade (Gremlin, 1976) · Snake (Taneli Armanto, Nokia 1997)
          </div>
        </HudPanel>
      </HudCanvas>

      {snap.phase === "start" ? <StartOverlay snap={snap} commands={commands} /> : null}
      {snap.phase === "paused" ? <PauseOverlay commands={commands} /> : null}
      {snap.phase === "gameover" ? <GameOverOverlay snap={snap} commands={commands} /> : null}
    </div>
  );
}
