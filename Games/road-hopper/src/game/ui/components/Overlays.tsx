import { type ReactNode } from "react";

import type { HopperSnapshot } from "../../hopper/store";
import { FONT, PALETTE, textGlow } from "../theme";

function Btn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="pointer-events-auto rounded-lg border px-7 py-2.5 text-sm font-bold uppercase tracking-[0.22em] transition-colors"
      style={{
        fontFamily: FONT,
        color: PALETTE.text,
        borderColor: "rgba(95,208,255,0.55)",
        background: "rgba(95,208,255,0.14)",
        textShadow: textGlow(0.7),
      }}
    >
      {label}
    </button>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div
      className="pointer-events-auto absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 text-center"
      style={{ fontFamily: FONT, background: "rgba(9,7,26,0.82)", backdropFilter: "blur(3px)" }}
    >
      {children}
    </div>
  );
}

export function StartScreen({ best, onStart }: { best: number; onStart: () => void }) {
  return (
    <div data-jg-menu className="contents">
      <Shell>
      <div
        className="text-5xl font-black uppercase tracking-[0.18em]"
        style={{ color: PALETTE.hopper, textShadow: "0 0 22px rgba(124,252,90,0.55)" }}
      >
        Road Hopper
      </div>
      <div className="text-xs uppercase tracking-[0.34em]" style={{ color: PALETTE.accent }}>
        Cross the road · ride the river · fill all 5 homes
      </div>
      <div className="mt-2 font-mono text-lg" style={{ color: PALETTE.gold }}>
        Best {best.toLocaleString()}
      </div>
      <div className="mt-3">
        <Btn label="Start" onClick={onStart} />
      </div>
      <div className="mt-2 text-[11px] uppercase tracking-[0.24em]" style={{ color: PALETTE.textDim }}>
        Arrows / WASD to hop · swipe on touch · P pause
      </div>
      </Shell>
    </div>
  );
}

export function PauseOverlay({ onResume, onRestart }: { onResume: () => void; onRestart: () => void }) {
  return (
    <Shell>
      <div
        className="text-4xl font-black uppercase tracking-[0.3em]"
        style={{ color: PALETTE.accent, textShadow: textGlow(1.1) }}
      >
        Paused
      </div>
      <div className="mt-2 flex gap-3">
        <Btn label="Resume" onClick={onResume} />
        <Btn label="Restart" onClick={onRestart} />
      </div>
    </Shell>
  );
}

export function GameOverScreen({ snapshot, onRestart }: { snapshot: HopperSnapshot; onRestart: () => void }) {
  return (
    <Shell>
      <div
        className="text-4xl font-black uppercase tracking-[0.24em]"
        style={{ color: PALETTE.danger, textShadow: "0 0 18px rgba(255,107,138,0.5)" }}
      >
        Game Over
      </div>
      <div className="font-mono text-2xl" style={{ color: PALETTE.text }}>
        Score {snapshot.score.toLocaleString()}
      </div>
      <div className="font-mono text-sm" style={{ color: PALETTE.textDim }}>
        Best {snapshot.best.toLocaleString()} · Reached Level {snapshot.level}
      </div>
      {snapshot.newBest ? (
        <div
          className="text-xs font-black uppercase tracking-[0.3em]"
          style={{ color: PALETTE.gold, textShadow: "0 0 12px rgba(255,207,90,0.6)" }}
        >
          New Best!
        </div>
      ) : null}
      <div className="mt-3">
        <Btn label="Play Again" onClick={onRestart} />
      </div>
    </Shell>
  );
}
