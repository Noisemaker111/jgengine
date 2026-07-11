import { actionLabel } from "@jgengine/core/input/actionBindings";
import { SettingsTrigger } from "@jgengine/react";
import { useGame } from "@jgengine/react/hooks";
import { GATES, LAPS, WORLD_SEED } from "../../course/track";
import { keybinds } from "../../keybinds";

const CONTROL_ROWS: readonly { action: string; text: string }[] = [
  { action: "throttleUp", text: "throttle up" },
  { action: "throttleReverse", text: "throttle astern" },
  { action: "rudderLeft", text: "rudder to port" },
  { action: "rudderRight", text: "rudder to starboard" },
  { action: "brakeBrace", text: "brace turn" },
  { action: "restartRace", text: "restart" },
];

export function StartScreen() {
  const { commands } = useGame();
  return (
    <div className="relative w-full max-w-md rounded-sm border border-[#f2c14e]/40 bg-[#14505c] p-6 text-[#e6f2ef] shadow-[0_0_40px_rgba(0,0,0,0.5)]">
      <SettingsTrigger className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-sm border border-[#f2c14e]/30 bg-[#0e2a30]/75 text-[#f2c14e] transition-colors hover:bg-[#f2c14e]/15" />
      <p className="text-xs uppercase tracking-[0.35em] text-[#f2c14e]">Race Committee</p>
      <h1 className="mt-1 text-4xl font-black tracking-tight text-[#e6f2ef]">TIDEWAY</h1>
      <p className="mt-2 text-sm text-[#e6f2ef]/80">
        Harbor Regatta &middot; seed <span className="text-[#f2c14e]">{WORLD_SEED}</span> &middot; {GATES.length}{" "}
        gates &middot; {LAPS} laps
      </p>
      <p className="mt-4 text-sm leading-relaxed text-[#e6f2ef]/90">
        Read the water, ride the push. The current swings on a schedule — the wide channel that's fast this lap can
        turn to sludge the next.
      </p>
      <div className="mt-5 grid grid-cols-1 gap-1.5 border-t border-[#e6f2ef]/15 pt-4">
        {CONTROL_ROWS.map((row) => (
          <div key={row.action} className="flex items-center justify-between text-sm">
            <span className="text-[#e6f2ef]/80">{row.text}</span>
            <span className="min-w-[2.5rem] rounded-sm border border-[#f2c14e]/50 bg-[#0e2a30] px-2 py-0.5 text-center text-xs font-bold text-[#f2c14e]">
              {actionLabel(keybinds, row.action) ?? "?"}
            </span>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => commands.run("startRace", undefined)}
        className="mt-6 w-full rounded-sm bg-[#c74a34] py-3 text-base font-bold uppercase tracking-wide text-[#e6f2ef] transition hover:bg-[#c74a34]/85 active:scale-[0.99]"
      >
        Start Race &middot; Enter
      </button>
    </div>
  );
}
