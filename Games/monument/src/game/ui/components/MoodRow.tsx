import type { ReactNode } from "react";

import { actionLabel } from "@jgengine/core/input/actionBindings";

import type { DistrictMood } from "../../catalog";
import { MOOD_DEFS } from "../../city/library";
import { keybinds } from "../../keybinds";
import { EYEBROW, HAIRLINE, PANEL } from "../theme";
import { Kbd } from "./Kbd";

type Run = (action: string, input?: unknown) => void;

export function MoodRow({ mood, run }: { mood: DistrictMood; run: Run }): ReactNode {
  const cycleKey = actionLabel(keybinds, "cycleMood") ?? "";
  return (
    <div className={PANEL}>
      <div className="flex items-center justify-between px-2.5 pb-1 pt-1.5">
        <span className={EYEBROW}>Mood</span>
        <span className="flex items-center gap-1 text-[8px] font-medium uppercase tracking-[0.08em] text-[#8a8d84]">
          cycle
          <Kbd label={cycleKey} />
        </span>
      </div>
      <div className={`flex border-t ${HAIRLINE}`}>
        {MOOD_DEFS.map((entry) => {
          const active = mood === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => run("site.mood", { mood: entry.id })}
              title={entry.label}
              className={`relative flex h-[46px] w-[64px] flex-col items-center justify-center gap-1.5 transition ${
                active ? "bg-[#171916] text-[#eeeae0]" : "text-[#171916] hover:bg-[rgba(20,22,18,0.08)]"
              }`}
            >
              {active && <span className="absolute left-0 top-0 h-[3px] w-full bg-[#d7ff43]" />}
              <span
                className="h-2.5 w-2.5 rounded-full border border-[rgba(20,22,18,0.35)]"
                style={{ background: entry.accent }}
              />
              <small className="text-[7px] font-medium uppercase tracking-[0.05em]">{entry.label}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}
