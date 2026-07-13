import { actionLabel, bindingLabel } from "@jgengine/core/input/actionBindings";
import { SettingsTrigger } from "@jgengine/react";
import { useGame } from "@jgengine/react/hooks";
import { keybinds } from "../../keybinds";
import { DIFFICULTY_PRESETS } from "../../match/difficulty";
import { useSelectedDifficulty } from "../../match/hooks";

const RULES = [
  "Nobody touches the ball — arm a blast charge and detonate it beside the ball to launch it.",
  "Max 2 charges armed at once; SPACE detonates, or let the short fuse finish the job.",
  "First to 5 goals, or the higher score at the final horn — tied scores go to sudden death.",
];

const CONTROLS: readonly [string, string][] = [
  ["Move", `${actionLabel(keybinds, "moveForward") ?? "W"}${actionLabel(keybinds, "moveLeft") ?? "A"}${actionLabel(keybinds, "moveBack") ?? "S"}${actionLabel(keybinds, "moveRight") ?? "D"}`],
  ["Aim", "Mouse"],
  ["Arm Charge", bindingLabel("mouse0")],
  ["Arm Toward Facing", actionLabel(keybinds, "throwFacing") ?? "F"],
  ["Detonate", actionLabel(keybinds, "detonateCharges") ?? "Space"],
  ["Dodge Roll", actionLabel(keybinds, "dodgeRoll") ?? "Shift"],
  ["Restart", actionLabel(keybinds, "restart") ?? "R"],
];

export function StartScreen() {
  const { commands } = useGame();
  const selected = useSelectedDifficulty();

  return (
    <div data-jg-menu className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-[#0c0806]/85 px-4">
      <div className="relative flex w-full max-w-lg flex-col gap-5 rounded-2xl border border-[#ff6b35]/30 bg-[#160f0c]/95 p-6 shadow-2xl shadow-black/60 sm:p-8">
        <SettingsTrigger className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg border border-[#cdb891]/25 bg-black/25 text-[#ff6b35] transition-colors hover:border-[#cdb891]/40" />
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-4xl font-black uppercase tracking-wide text-[#ff6b35] drop-shadow-[0_0_16px_rgba(255,107,53,0.5)] sm:text-5xl">
            Craterball
          </h1>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#cdb891]/70">
            The pitch remembers every blast
          </p>
        </div>

        <ul className="flex flex-col gap-1.5 text-sm text-[#e8ddca]">
          {RULES.map((rule) => (
            <li key={rule} className="flex gap-2">
              <span className="text-[#ff6b35]">▸</span>
              <span>{rule}</span>
            </li>
          ))}
        </ul>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border border-[#cdb891]/15 bg-black/25 p-3 text-xs text-[#cdb891]">
          {CONTROLS.map(([label, key]) => (
            <div key={label} className="flex items-center justify-between gap-2">
              <span className="text-[#cdb891]/70">{label}</span>
              <span className="rounded bg-black/60 px-1.5 py-0.5 font-bold text-[#ffd7ba]">{key}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-center text-xs font-bold uppercase tracking-widest text-[#cdb891]/60">
            AI Difficulty
          </span>
          <div className="grid grid-cols-3 gap-2">
            {DIFFICULTY_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => commands.run("selectDifficulty", { difficulty: preset.id })}
                className={`flex flex-col items-center gap-0.5 rounded-lg border-2 px-2 py-2 text-center transition-colors ${
                  selected === preset.id
                    ? "border-[#ff6b35] bg-[#2b1710] text-[#ffd7ba]"
                    : "border-[#cdb891]/20 bg-black/20 text-[#cdb891]/70 hover:border-[#cdb891]/40"
                }`}
              >
                <span className="text-xs font-bold uppercase">{preset.label}</span>
              </button>
            ))}
          </div>
          <p className="text-center text-[11px] italic text-[#cdb891]/50">
            {DIFFICULTY_PRESETS.find((preset) => preset.id === selected)?.tagline}
          </p>
        </div>

        <button
          type="button"
          onClick={() => commands.run("start", { difficulty: selected })}
          className="rounded-lg bg-[#ff6b35] px-6 py-3 text-center text-lg font-black uppercase tracking-widest text-[#160f0c] shadow-lg shadow-[#ff6b35]/30 transition-transform hover:scale-[1.02] active:scale-95"
        >
          Start — {actionLabel(keybinds, "start") ?? "Enter"}
        </button>
      </div>
    </div>
  );
}
