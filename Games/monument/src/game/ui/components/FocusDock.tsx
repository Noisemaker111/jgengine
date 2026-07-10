import type { ReactNode } from "react";

import { actionLabel } from "@jgengine/core/input/actionBindings";

import { keybinds } from "../../keybinds";

type Run = (action: string, input?: unknown) => void;

const DIVIDER = "border-l border-[rgba(255,255,255,0.12)]";

export function FocusDock({
  paused,
  speed,
  speeds,
  day,
  hour,
  minute,
  run,
  onSetSpeed,
}: {
  paused: boolean;
  speed: number;
  speeds: readonly number[];
  day: number;
  hour: number;
  minute: number;
  run: Run;
  onSetSpeed: (speed: number) => void;
}): ReactNode {
  const focusKey = actionLabel(keybinds, "focusToggle") ?? "";
  const clock = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return (
    <div
      aria-label="Focus controls"
      className="pointer-events-auto flex items-stretch border border-[rgba(255,255,255,0.14)] bg-[rgba(23,25,22,0.92)] text-[#eeeae0] shadow-[0_16px_44px_rgba(0,0,0,0.4)] backdrop-blur-[14px]"
    >
      <button
        type="button"
        onClick={() => run("focusToggle", {})}
        title="Exit focus mode"
        aria-label="Exit focus mode"
        className="flex items-center gap-2 px-3.5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition hover:bg-[rgba(215,255,67,0.14)]"
      >
        <span className="text-[13px] leading-none">✛</span>
        Edit
        <span className="grid h-5 min-w-[1.25rem] place-items-center border border-[rgba(215,255,67,0.5)] px-1 text-[11px] font-medium leading-none text-[#d7ff43]">
          {focusKey}
        </span>
      </button>

      <button
        type="button"
        onClick={() => run("pauseToggle", {})}
        aria-label={paused ? "Play city" : "Pause city"}
        className={`flex w-[52px] items-center justify-center text-[13px] text-[#d7ff43] transition hover:bg-[rgba(215,255,67,0.14)] ${DIVIDER}`}
      >
        {paused ? "▶" : "❚❚"}
      </button>

      <div className={`flex flex-col justify-center px-3.5 py-2 ${DIVIDER}`}>
        <span className="text-[8px] font-medium uppercase tracking-[0.1em] text-[#9a9d93]">Day {day}</span>
        <b className="mt-0.5 text-[12px] font-semibold tabular-nums leading-none text-[#eeeae0]">{clock}</b>
      </div>

      <div className={`flex items-center gap-1 px-2.5 ${DIVIDER}`}>
        {speeds.map((value) => {
          const active = !paused && value === speed;
          return (
            <button
              key={value}
              type="button"
              onClick={() => onSetSpeed(value)}
              className={`h-7 w-8 border text-[11px] font-semibold tabular-nums transition ${
                active
                  ? "border-[#d7ff43] bg-[#d7ff43] text-[#171916]"
                  : "border-[rgba(255,255,255,0.22)] text-[#c3c6bc] hover:bg-[rgba(255,255,255,0.1)]"
              }`}
            >
              {value}×
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => run("city.save", {})}
        title="Save city"
        aria-label="Save city"
        className={`flex items-center gap-1.5 px-3.5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition hover:bg-[rgba(215,255,67,0.14)] ${DIVIDER}`}
      >
        <span className="text-[12px] leading-none">↧</span>
        Save
      </button>
    </div>
  );
}
