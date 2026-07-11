import type { ReactNode } from "react";

import type { GameContext } from "@jgengine/core/runtime/gameContext";

import type { Mode } from "../../logic";
import type { SnakeSnapshot } from "../../store";

type Commands = GameContext["game"]["commands"];

const PHOSPHOR = "#7dffb0";
const GLOW = "0 0 12px rgba(90, 255, 150, 0.55), 0 0 3px rgba(200, 255, 220, 0.8)";

function Backdrop({ children }: { children: ReactNode }) {
  return (
    <div
      className="pointer-events-auto absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 px-6 text-center font-mono"
      style={{ background: "radial-gradient(circle at 50% 45%, rgba(5,25,16,0.72), rgba(3,12,8,0.92))", backdropFilter: "blur(2px)" }}
    >
      {children}
    </div>
  );
}

function PrimaryButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border px-8 py-3 text-lg font-bold uppercase tracking-[0.3em] transition-colors"
      style={{
        color: "#04150d",
        background: PHOSPHOR,
        borderColor: PHOSPHOR,
        boxShadow: "0 0 22px rgba(90, 255, 150, 0.5)",
      }}
    >
      {label}
    </button>
  );
}

function GhostButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border px-6 py-2 text-sm font-semibold uppercase tracking-[0.25em] transition-colors hover:bg-emerald-400/10"
      style={{ color: PHOSPHOR, borderColor: "rgba(125, 255, 176, 0.45)" }}
    >
      {label}
    </button>
  );
}

function ModeToggle({ mode, commands }: { mode: Mode; commands: Commands }) {
  const option = (value: Mode, label: string, hint: string) => {
    const active = mode === value;
    return (
      <button
        type="button"
        onClick={() => commands.run(value === "walled" ? "setModeWalled" : "setModeWrap", {})}
        className="flex w-32 flex-col items-center gap-1 rounded-lg border px-3 py-2 transition-colors"
        style={{
          color: active ? "#04150d" : PHOSPHOR,
          background: active ? PHOSPHOR : "transparent",
          borderColor: active ? PHOSPHOR : "rgba(125, 255, 176, 0.35)",
          boxShadow: active ? "0 0 18px rgba(90, 255, 150, 0.45)" : "none",
        }}
      >
        <span className="text-sm font-bold uppercase tracking-[0.25em]">{label}</span>
        <span className="text-[10px] uppercase tracking-wide opacity-80">{hint}</span>
      </button>
    );
  };
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-[11px] uppercase tracking-[0.35em]" style={{ color: "#5fbf8c" }}>
        Mode
      </span>
      <div className="flex gap-3">
        {option("walled", "Walled", "edges kill")}
        {option("wrap", "Wrap", "edges loop")}
      </div>
    </div>
  );
}

function Title({ text, color = PHOSPHOR }: { text: string; color?: string }) {
  return (
    <h1
      className="text-5xl font-black uppercase tracking-[0.35em] sm:text-6xl"
      style={{ color, textShadow: GLOW }}
    >
      {text}
    </h1>
  );
}

export function StartOverlay({ snap, commands }: { snap: SnakeSnapshot; commands: Commands }) {
  return (
    <Backdrop>
      <Title text="Snake" />
      <p className="max-w-sm text-xs uppercase tracking-[0.3em]" style={{ color: "#7fcfa4" }}>
        Eat · grow · do not bite yourself
      </p>
      <ModeToggle mode={snap.mode} commands={commands} />
      <PrimaryButton label="Play" onClick={() => commands.run("confirm", {})} />
      <p className="text-[11px] uppercase tracking-[0.25em]" style={{ color: "#4f9c74" }}>
        Arrows / WASD or swipe to steer · Space play · P pause · R restart · M mode
      </p>
    </Backdrop>
  );
}

export function PauseOverlay({ commands }: { commands: Commands }) {
  return (
    <Backdrop>
      <Title text="Paused" color="#ffcf5c" />
      <div className="flex gap-3">
        <PrimaryButton label="Resume" onClick={() => commands.run("pauseToggle", {})} />
        <GhostButton label="Restart" onClick={() => commands.run("restart", {})} />
      </div>
      <p className="text-[11px] uppercase tracking-[0.25em]" style={{ color: "#4f9c74" }}>
        Press P to resume
      </p>
    </Backdrop>
  );
}

export function GameOverOverlay({ snap, commands }: { snap: SnakeSnapshot; commands: Commands }) {
  const newBest = snap.score > 0 && snap.score >= snap.best;
  const cause = snap.won
    ? "Board cleared — perfect run"
    : snap.deathCause === "wall"
      ? "Crashed into the wall"
      : "Bit your own tail";
  return (
    <Backdrop>
      <Title text={snap.won ? "You Win" : "Game Over"} color={snap.won ? PHOSPHOR : "#ff7a7a"} />
      <p className="text-xs uppercase tracking-[0.3em]" style={{ color: "#7fcfa4" }}>
        {cause}
      </p>
      <div className="flex items-end gap-10">
        <div className="flex flex-col items-center">
          <span className="text-[10px] uppercase tracking-[0.3em]" style={{ color: "#5fbf8c" }}>
            Score
          </span>
          <span className="text-5xl font-black" style={{ color: PHOSPHOR, textShadow: GLOW }}>
            {snap.score}
          </span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[10px] uppercase tracking-[0.3em]" style={{ color: "#5fbf8c" }}>
            Best · {snap.mode}
          </span>
          <span className="text-3xl font-bold" style={{ color: "#ffcf5c" }}>
            {snap.best}
          </span>
        </div>
      </div>
      {newBest ? (
        <span
          className="rounded-full border px-4 py-1 text-xs font-bold uppercase tracking-[0.3em]"
          style={{ color: "#ffcf5c", borderColor: "#ffcf5c", textShadow: "0 0 10px rgba(255,207,92,0.6)" }}
        >
          ★ New Best
        </span>
      ) : null}
      <ModeToggle mode={snap.mode} commands={commands} />
      <PrimaryButton label="Play Again" onClick={() => commands.run("confirm", {})} />
      <p className="text-[11px] uppercase tracking-[0.25em]" style={{ color: "#4f9c74" }}>
        Space / tap to play again
      </p>
    </Backdrop>
  );
}
