import { actionLabel } from "@jgengine/core/input/actionBindings";
import { useGame } from "@jgengine/react/hooks";
import { GATES, SEED } from "../../course/catalog";
import { keybinds } from "../../keybinds";

const CONTROL_ROWS: readonly { action: string; label: string }[] = [
  { action: "throttle", label: "Throttle" },
  { action: "brake", label: "Brake" },
  { action: "steerLeft", label: "Steer left" },
  { action: "steerRight", label: "Steer right" },
  { action: "handbrake", label: "Handbrake" },
  { action: "restart", label: "Restart" },
];

export function StartScreen() {
  const { commands } = useGame();

  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-[#1e2633]/90 p-4">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-[#3d4a5c] bg-[#1e2633] p-6 shadow-2xl">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[#f25c05]">Big Sky Thunder Western</p>
          <h1 className="text-3xl font-bold text-[#d9a441]">Stormline</h1>
          <p className="mt-1 text-sm text-[#9fb8c8]">
            Route: Cutbank Run · Seed {SEED} · {GATES.length} gates to shelter
          </p>
        </div>
        <p className="text-sm leading-relaxed text-[#9fb8c8]">
          "Storm wall's building behind you, driver. Every fork gives you a fast road that hugs the
          storm and a slow road that stays dry. Ride the line — she's closing."
        </p>
        <div className="grid grid-cols-2 gap-2">
          {CONTROL_ROWS.map((row) => (
            <div
              key={row.action}
              className="flex items-center justify-between rounded border border-[#3d4a5c] bg-[#141b23] px-2 py-1 text-xs text-[#9fb8c8]"
            >
              <span>{row.label}</span>
              <span className="rounded border border-[#d9a441]/60 px-1.5 py-0.5 font-semibold text-[#d9a441]">
                {actionLabel(keybinds, row.action) ?? "-"}
              </span>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => commands.run("confirm", undefined)}
          className="mt-1 rounded-lg bg-[#f25c05] px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-[#1e2633] shadow transition-transform hover:scale-[1.02] active:scale-95"
        >
          Roll out — {actionLabel(keybinds, "confirm") ?? "Enter"}
        </button>
      </div>
    </div>
  );
}
