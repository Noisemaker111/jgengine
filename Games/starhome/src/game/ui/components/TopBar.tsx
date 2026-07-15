import type { ReactNode } from "react";

import { useGame, useGameClock } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";

import { householdStore } from "../../session/store";

export function TopBar(): ReactNode {
  const clock = useGameClock();
  const { commands } = useGame();
  const household = useStore(householdStore);
  const cal = clock.calendar;
  const hour = Math.floor(cal.hour);
  const minute = Math.floor((cal.hour - hour) * 60);
  const isDay = cal.hour >= 7 && cal.hour < 19;
  const speeds: readonly number[] = clock.speeds.length > 0 ? clock.speeds : [1, 2, 4];

  return (
    <div className="pointer-events-auto flex items-center gap-3 rounded-xl bg-slate-950/78 px-4 py-2 shadow-lg ring-1 ring-white/10 backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="text-lg">{isDay ? "☀️" : "🌙"}</span>
        <div className="leading-tight">
          <div className="text-sm font-bold text-slate-100">Day {cal.day + 1}</div>
          <div className="text-[11px] tabular-nums text-slate-400">
            {String(hour).padStart(2, "0")}:{String(minute).padStart(2, "0")}
          </div>
        </div>
      </div>

      <div className="h-8 w-px bg-white/10" />

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => commands.run("pauseToggle", {})}
          className="rounded-md bg-white/10 px-2 py-1 text-xs font-bold text-slate-100 hover:bg-white/20"
          title="Pause / resume (Space)"
        >
          {clock.paused ? "▶" : "❚❚"}
        </button>
        {speeds.map((mult) => (
          <button
            key={mult}
            type="button"
            onClick={() => commands.run("time.speed", { mult })}
            className={`rounded-md px-2 py-1 text-xs font-bold ${
              !clock.paused && clock.speed === mult
                ? "bg-emerald-400/90 text-slate-900"
                : "bg-white/10 text-slate-200 hover:bg-white/20"
            }`}
          >
            {mult}×
          </button>
        ))}
      </div>

      <div className="h-8 w-px bg-white/10" />

      <div className="flex items-center gap-1.5">
        <span className="text-base">🪙</span>
        <span className="text-sm font-bold tabular-nums text-amber-200">{Math.floor(household.credits)}</span>
      </div>
    </div>
  );
}
