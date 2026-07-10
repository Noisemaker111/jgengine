import type { ReactNode } from "react";
import { useGame } from "@jgengine/react/hooks";
import { TREASURE_DEFS } from "../../items/treasures";
import { mansionClockAt, RUN_SECONDS } from "../../schedule/mansionClock";

export function StartScreen(): ReactNode {
  const { commands } = useGame();
  const dawn = mansionClockAt(RUN_SECONDS);

  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-[#0b0f1c]/90 p-4">
      <div className="w-full max-w-2xl rounded-lg border-2 border-[#c9a227]/70 bg-gradient-to-b from-[#1d2b4a] to-[#0b0f1c] p-6 shadow-2xl sm:p-8">
        <p className="font-serif text-xs uppercase tracking-[0.35em] text-[#c9a227]">A Gentleman's Occupation</p>
        <h1 className="mt-2 font-serif text-3xl font-bold text-[#f2e3c2] sm:text-4xl">Clockwork Heist</h1>
        <p className="mt-3 text-sm leading-relaxed text-[#e5d9c3]/90">
          The house runs like a watch — every guard, every door, every sweeping light keeps its published time.
          Memorize the score. Dance between its beats. We are gone before {dawn.label}.
        </p>

        <div className="mt-5 rounded border border-[#c9a227]/40 bg-black/25 p-4">
          <p className="font-serif text-sm uppercase tracking-wide text-[#c9a227]">The five marks</p>
          <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-[#f2e3c2]/90 sm:grid-cols-2">
            {TREASURE_DEFS.map((treasure) => (
              <li key={treasure.id} className="flex justify-between gap-2">
                <span>{treasure.name}</span>
                <span className="text-[#c9a227]">{treasure.value}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 text-xs text-[#e5d9c3]/85 sm:grid-cols-3">
          <Control k="WASD" label="Move" />
          <Control k="Shift" label="Sneak" />
          <Control k="E" label="Hold to grab" />
          <Control k="Tab" label="Schedule" />
          <Control k="M" label="Scrub minimap" />
          <Control k="R" label="Restart" />
        </div>

        <button
          type="button"
          onClick={() => commands.run("startHeist", {})}
          className="mt-6 w-full rounded border border-[#c9a227] bg-[#7a1f2b] px-4 py-3 font-serif text-base font-semibold uppercase tracking-wide text-[#f2e3c2] transition hover:bg-[#8a2530]"
        >
          Begin the Job — Enter
        </button>
      </div>
    </div>
  );
}

function Control({ k, label }: { k: string; label: string }): ReactNode {
  return (
    <div className="flex items-center gap-2 rounded border border-[#c9a227]/30 bg-black/20 px-2 py-1.5">
      <kbd className="rounded border border-[#c9a227]/60 bg-[#1d2b4a] px-1.5 py-0.5 font-mono text-[11px] text-[#f2e3c2]">
        {k}
      </kbd>
      <span>{label}</span>
    </div>
  );
}
