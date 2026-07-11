import { type ReactNode } from "react";

import { useEngineState } from "@jgengine/react/engineStore";
import { useGame } from "@jgengine/react/hooks";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react/hudLayout";

import { roadHopperStore } from "../hopper/store";
import type { HopperSnapshot } from "../hopper/store";
import { Playfield } from "./components/Playfield";
import { GameOverScreen, PauseOverlay, StartScreen } from "./components/Overlays";
import { FONT, PALETTE, textGlow } from "./theme";

const CREDIT_LINE = "Homage to Frogger — Konami (1981)";

const SWIPE_TO_COMMAND: Record<"up" | "down" | "left" | "right", string> = {
  up: "hopUp",
  down: "hopDown",
  left: "hopLeft",
  right: "hopRight",
};

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] font-semibold uppercase tracking-[0.22em]" style={{ color: PALETTE.textDim }}>
        {label}
      </span>
      <span className="font-mono text-lg font-bold leading-tight" style={{ color: accent, textShadow: textGlow(0.5) }}>
        {value}
      </span>
    </div>
  );
}

function panelBox(children: ReactNode): ReactNode {
  return (
    <div
      className="rounded-lg border px-3 py-2"
      style={{
        fontFamily: FONT,
        borderColor: "rgba(95,208,255,0.28)",
        background: "rgba(9,10,32,0.66)",
        backdropFilter: "blur(2px)",
      }}
    >
      {children}
    </div>
  );
}

function timeColor(frac: number): string {
  if (frac > 0.5) return PALETTE.hopper;
  if (frac > 0.25) return PALETTE.gold;
  return PALETTE.danger;
}

function TimeBar({ snapshot }: { snapshot: HopperSnapshot }) {
  const frac = snapshot.timeFrac;
  return (
    <div className="mt-2 w-40 max-w-[46vw]">
      <div className="flex justify-between text-[8px] font-semibold uppercase tracking-[0.2em]" style={{ color: PALETTE.textDim }}>
        <span>Time</span>
        <span>{Math.ceil(snapshot.timeLeft)}</span>
      </div>
      <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.1)" }}>
        <div
          className="h-full rounded-full transition-[width] duration-100"
          style={{ width: `${frac * 100}%`, background: timeColor(frac), boxShadow: `0 0 8px ${timeColor(frac)}` }}
        />
      </div>
    </div>
  );
}

function Lives({ lives }: { lives: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: Math.max(lives, 0) }).map((_, i) => (
        <span
          key={i}
          className="inline-block h-3 w-3 rounded-full"
          style={{ background: PALETTE.hopper, boxShadow: "0 0 6px rgba(124,252,90,0.6)" }}
        />
      ))}
      {lives === 0 ? <span style={{ color: PALETTE.textDim }}>—</span> : null}
    </div>
  );
}

export function GameUI() {
  const snapshot = useEngineState(roadHopperStore);
  const { commands } = useGame();
  const layout = useHudLayout({ storageKey: "road-hopper" });

  const run = (name: string) => commands.run(name, {});

  return (
    <div
      className="absolute inset-0 select-none overflow-hidden"
      style={{
        fontFamily: FONT,
        background: `radial-gradient(circle at 50% -8%, ${PALETTE.skyTop} 0%, ${PALETTE.skyBottom} 70%)`,
      }}
    >
      <div className="absolute inset-0 flex items-center justify-center p-2 sm:p-4">
        <Playfield onSwipe={(dir) => run(SWIPE_TO_COMMAND[dir])} />
      </div>

      <HudCanvas layout={layout} className="select-none">
        <HudPanel id="stats" anchor="top-left" order={0} compact="keep" inset={{ x: 14, y: 14 }}>
          {panelBox(
            <div>
              <div className="flex items-end gap-4">
                <Stat label="Score" value={snapshot.score.toLocaleString()} accent={PALETTE.hopper} />
                <Stat label="Best" value={snapshot.best.toLocaleString()} accent={PALETTE.gold} />
                <Stat label="Level" value={String(snapshot.level)} accent={PALETTE.accent} />
              </div>
              <TimeBar snapshot={snapshot} />
            </div>,
          )}
        </HudPanel>

        <HudPanel id="status" anchor="top-right" order={0} compact="keep" inset={{ x: 14, y: 14 }}>
          {panelBox(
            <div className="flex flex-col items-end gap-2">
              <div className="flex flex-col items-end">
                <span className="text-[9px] font-semibold uppercase tracking-[0.22em]" style={{ color: PALETTE.textDim }}>
                  Lives
                </span>
                <Lives lives={snapshot.lives} />
              </div>
              <button
                type="button"
                onClick={() => run("pauseToggle")}
                className="pointer-events-auto rounded-md border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] transition-colors"
                style={{ borderColor: "rgba(95,208,255,0.4)", color: PALETTE.accent }}
              >
                {snapshot.phase === "paused" ? "Resume" : "Pause"}
              </button>
            </div>,
          )}
        </HudPanel>

        {snapshot.banner !== null ? (
          <HudPanel id="banner" anchor="top" order={0} compact="keep" interactive={false} inset={{ x: 0, y: 16 }}>
            <div
              className="rounded-full border px-6 py-2 text-center text-sm font-black uppercase tracking-[0.2em]"
              style={{
                borderColor: "rgba(255,207,90,0.4)",
                background: "rgba(9,7,26,0.7)",
                color: PALETTE.gold,
                textShadow: "0 0 12px rgba(255,207,90,0.6)",
              }}
            >
              {snapshot.banner}
            </div>
          </HudPanel>
        ) : null}

        <HudPanel id="credit" anchor="bottom" order={0} compact="keep" interactive={false} inset={{ x: 0, y: 10 }}>
          <div className="text-center text-[10px] uppercase tracking-[0.22em]" style={{ color: PALETTE.textDim, opacity: 0.72 }}>
            {CREDIT_LINE}
          </div>
        </HudPanel>
      </HudCanvas>

      {snapshot.phase === "ready" ? <StartScreen best={snapshot.best} onStart={() => run("confirm")} /> : null}
      {snapshot.phase === "paused" ? (
        <PauseOverlay onResume={() => run("pauseToggle")} onRestart={() => run("restart")} />
      ) : null}
      {snapshot.phase === "gameover" ? <GameOverScreen snapshot={snapshot} onRestart={() => run("restart")} /> : null}
    </div>
  );
}
