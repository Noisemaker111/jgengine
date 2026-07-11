import { type ReactNode } from "react";

import { useGameContext } from "@jgengine/react/provider";

import type { MatchState } from "../match/state";
import { getMatch } from "../match/store";
import { FONT, PHOSPHOR, PHOSPHOR_BRIGHT, textGlow } from "./theme";

function WinButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="pointer-events-auto rounded-sm border px-5 py-2 text-sm font-semibold uppercase tracking-[0.2em] transition-colors duration-150 hover:bg-[rgba(88,255,150,0.16)] focus:outline-none"
      style={{ borderColor: "rgba(88,255,150,0.5)", color: PHOSPHOR_BRIGHT, textShadow: textGlow(0.8) }}
    >
      {children}
    </button>
  );
}

function headline(m: MatchState): string {
  if (m.winner === null) return "";
  if (m.mode === "two-player") return m.winner === "L" ? "Left Wins" : "Right Wins";
  return m.winner === "L" ? "You Win" : "CPU Wins";
}

export function WinScreen() {
  const ctx = useGameContext();
  const m = getMatch(ctx);

  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/78 px-4"
      style={{ fontFamily: FONT }}
    >
      <div className="flex flex-col items-center gap-6 text-center" style={{ color: PHOSPHOR }}>
        <h1
          className="text-4xl font-black uppercase tracking-[0.3em] sm:text-5xl"
          style={{ color: PHOSPHOR_BRIGHT, textShadow: textGlow(1.4) }}
        >
          {headline(m)}
        </h1>
        <div
          className="text-5xl font-black tabular-nums tracking-[0.12em] sm:text-6xl"
          style={{ color: PHOSPHOR_BRIGHT, textShadow: textGlow(1) }}
        >
          {m.scoreL} <span className="opacity-40">–</span> {m.scoreR}
        </div>
        <div className="flex gap-3">
          <WinButton onClick={() => ctx.game.commands.run("rematch", {})}>Rematch</WinButton>
          <WinButton onClick={() => ctx.game.commands.run("backToMenu", {})}>Menu</WinButton>
        </div>
      </div>
    </div>
  );
}
