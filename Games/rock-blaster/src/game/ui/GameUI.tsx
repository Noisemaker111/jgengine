import type { CSSProperties, ReactNode } from "react";

import { SettingsTrigger } from "@jgengine/react";
import { useDisplayProfile } from "@jgengine/react/display";
import { useEngineState } from "@jgengine/react/engineStore";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react/hudLayout";

import { blasterStore } from "../blaster/store";
import { Playfield } from "./components/Playfield";
import { GameOverOverlay, PauseOverlay, StartOverlay } from "./components/Overlays";
import { TouchControls } from "./components/TouchControls";

const CARD: CSSProperties = {
  background: "rgba(2, 8, 20, 0.6)",
  border: "1px solid rgba(150, 190, 255, 0.28)",
  borderRadius: 10,
  boxShadow: "0 0 18px rgba(0, 0, 0, 0.5)",
  padding: "8px 12px",
};

const GLOW = "0 0 12px rgba(150, 210, 255, 0.55)";

function ShipGlyph({ dim }: { dim: boolean }) {
  return (
    <svg width="16" height="20" viewBox="-12 -17 24 32" style={{ opacity: dim ? 0.28 : 1 }}>
      <path
        d="M0 -16 L11 12 L5 7 L-5 7 L-11 12 Z"
        fill="none"
        stroke="#f4f8ff"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.3em]" style={{ color: "#6f93c8" }}>
      {children}
    </div>
  );
}

export function GameUI(): ReactNode {
  const snap = useEngineState(blasterStore);
  const layout = useHudLayout();
  const { coarsePointer } = useDisplayProfile();
  const livesShown = Math.max(0, snap.lives);

  return (
    <div className="absolute inset-0 overflow-hidden font-mono" style={{ background: "#000000" }}>
      <Playfield />

      <HudCanvas layout={layout} editChord={false}>
        <HudPanel id="score" anchor="top-left" compact="keep">
          <div style={CARD}>
            <Label>Score</Label>
            <div className="text-3xl font-black leading-none" style={{ color: "#f4f8ff", textShadow: GLOW }}>
              {snap.score.toLocaleString()}
            </div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.18em]" style={{ color: "#ffcf6a" }}>
              Hi {snap.best.toLocaleString()}
            </div>
          </div>
        </HudPanel>

        <HudPanel id="lives" anchor="top-left" order={1} compact="keep">
          <div style={{ ...CARD, display: "flex", alignItems: "center", gap: 6 }}>
            {Array.from({ length: Math.max(livesShown, 1) }).map((_, i) => (
              <ShipGlyph key={i} dim={i >= livesShown} />
            ))}
          </div>
        </HudPanel>

        <HudPanel id="wave" anchor="top-right" compact="chip" chip="Wave">
          <div style={{ ...CARD, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ textAlign: "right" }}>
              <Label>Wave</Label>
              <div className="text-2xl font-black leading-none" style={{ color: "#bfe0ff", textShadow: GLOW }}>
                {snap.wave}
              </div>
            </div>
            <SettingsTrigger className="flex h-7 w-7 items-center justify-center rounded-md border border-[rgba(150,190,255,0.35)] text-[#bfe0ff] transition-colors hover:bg-[rgba(150,190,255,0.12)]" />
          </div>
        </HudPanel>

        <HudPanel id="controls" anchor="bottom-left" compact="hide">
          <div style={{ ...CARD, padding: "6px 10px" }}>
            <div className="text-[10px] uppercase leading-relaxed tracking-[0.16em]" style={{ color: "#6f93c8" }}>
              ← → rotate · ↑ thrust · Space fire
              <br />
              Shift hyperspace · P pause · R restart
            </div>
          </div>
        </HudPanel>

        <HudPanel id="credit" anchor="bottom" compact="keep" interactive={false}>
          <div className="text-[10px] tracking-[0.12em]" style={{ color: "rgba(175, 200, 240, 0.5)" }}>
            Homage to Asteroids — Lyle Rains &amp; Ed Logg, Atari (1979)
          </div>
        </HudPanel>
      </HudCanvas>

      {snap.phase === "start" ? <StartOverlay snap={snap} /> : null}
      {snap.phase === "paused" ? <PauseOverlay /> : null}
      {snap.phase === "gameover" ? <GameOverOverlay snap={snap} /> : null}
      {coarsePointer && snap.phase === "playing" ? <TouchControls /> : null}
    </div>
  );
}
