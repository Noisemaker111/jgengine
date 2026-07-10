import type { ReactNode } from "react";

import { EYEBROW, HAIRLINE, PANEL } from "../theme";

export function TimeBar({
  paused,
  speed,
  speeds,
  day,
  hour,
  minute,
  pauseKey,
  onPauseToggle,
  onSetSpeed,
}: {
  paused: boolean;
  speed: number;
  speeds: readonly number[];
  day: number;
  hour: number;
  minute: number;
  pauseKey: string;
  onPauseToggle: () => void;
  onSetSpeed: (speed: number) => void;
}): ReactNode {
  const clock = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return (
    <div className={`flex items-stretch ${PANEL}`}>
      <button
        type="button"
        onClick={onPauseToggle}
        className="flex w-[58px] flex-col items-center justify-center gap-1 bg-[#171916] py-2 text-[#d7ff43] transition hover:bg-[#2a2c26]"
      >
        <span className="text-[13px] leading-none">{paused ? "▶" : "❚❚"}</span>
        <span className="text-[9px] font-medium uppercase tracking-[0.08em] text-[rgba(215,255,67,0.7)]">
          {pauseKey}
        </span>
      </button>
      <div className={`flex flex-col justify-center border-r px-3 py-2 ${HAIRLINE}`}>
        <span className={EYEBROW}>Clock</span>
        <span className="mt-0.5 text-[12px] font-medium tabular-nums text-[#171916]">
          Day {day} · {clock}
        </span>
      </div>
      <div className="flex items-center gap-1 px-2.5">
        {speeds.map((value) => {
          const active = !paused && value === speed;
          return (
            <button
              key={value}
              type="button"
              onClick={() => onSetSpeed(value)}
              className={`h-7 w-8 border text-[11px] font-semibold tabular-nums transition ${
                active
                  ? "border-[#171916] bg-[#d7ff43] text-[#171916]"
                  : "border-[rgba(20,22,18,0.25)] text-[#4b4e47] hover:bg-[rgba(20,22,18,0.08)]"
              }`}
            >
              {value}×
            </button>
          );
        })}
      </div>
    </div>
  );
}
