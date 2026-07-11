import { type ReactNode } from "react";

import { useGameContext } from "@jgengine/react/provider";

import type { Mode } from "../match/state";
import { getRecords } from "../match/store";
import { CREDIT_LINE } from "./credit";
import { FONT, PHOSPHOR, PHOSPHOR_BRIGHT, textGlow } from "./theme";

function MenuButton({ children, onClick, wide }: { children: ReactNode; onClick: () => void; wide?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pointer-events-auto rounded-sm border px-4 py-2 text-sm font-semibold uppercase tracking-[0.18em] transition-colors duration-150 hover:bg-[rgba(88,255,150,0.16)] focus:outline-none ${wide ? "w-full" : ""}`}
      style={{ borderColor: "rgba(88,255,150,0.5)", color: PHOSPHOR_BRIGHT, textShadow: textGlow(0.8) }}
    >
      {children}
    </button>
  );
}

export function Menu() {
  const ctx = useGameContext();
  const best = getRecords(ctx).best();
  const start = (mode: Mode) => {
    ctx.game.commands.run("setMode", { mode });
  };

  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/72 px-4"
      style={{ fontFamily: FONT }}
    >
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center" style={{ color: PHOSPHOR }}>
        <div className="flex flex-col items-center gap-1">
          <h1
            className="text-4xl font-black uppercase tracking-[0.32em] sm:text-5xl"
            style={{ color: PHOSPHOR_BRIGHT, textShadow: textGlow(1.4) }}
          >
            Paddle
          </h1>
          <h1
            className="text-4xl font-black uppercase tracking-[0.32em] sm:text-5xl"
            style={{ color: PHOSPHOR_BRIGHT, textShadow: textGlow(1.4) }}
          >
            Duel
          </h1>
          <p className="mt-1 text-[11px] uppercase tracking-[0.28em] opacity-70">First to 11 · win by 2</p>
        </div>

        <div className="flex w-full flex-col gap-3">
          <p className="text-[11px] uppercase tracking-[0.3em] opacity-60">Versus CPU</p>
          <div className="flex justify-center gap-2">
            <MenuButton onClick={() => start("ai-easy")}>Easy</MenuButton>
            <MenuButton onClick={() => start("ai-medium")}>Medium</MenuButton>
            <MenuButton onClick={() => start("ai-hard")}>Hard</MenuButton>
          </div>
          <MenuButton wide onClick={() => start("two-player")}>
            2 Players — W/S vs ↑/↓
          </MenuButton>
        </div>

        <div
          className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] uppercase tracking-[0.2em] opacity-75"
        >
          <span className="opacity-60">Match wins</span>
          <span>Easy {best.easy ?? 0}</span>
          <span>Medium {best.medium ?? 0}</span>
          <span>Hard {best.hard ?? 0}</span>
        </div>

        <p className="text-[10px] uppercase tracking-[0.24em] opacity-45">{CREDIT_LINE}</p>
      </div>
    </div>
  );
}
