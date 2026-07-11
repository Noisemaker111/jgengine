import { actionLabel } from "@jgengine/core/input/actionBindings";
import { SettingsTrigger } from "@jgengine/react";
import { useGame } from "@jgengine/react/hooks";
import { keybinds } from "../../keybinds";
import { REQUIRED_DELIVERIES } from "../../delivery/catalog";
import { COMMAND_START } from "../../run/session";
import { RADIO_VOICE } from "../palette";
import { useRunState } from "../useRunView";

function ControlRow({ action, label }: { action: string; label: string }) {
  const key = actionLabel(keybinds, action);
  return (
    <div className="flex items-center justify-between rounded-lg border border-[#e8d5a3]/20 bg-[#0f1f1c]/60 px-3 py-1.5">
      <span className="text-xs text-[#e8d5a3]/80">{label}</span>
      <kbd className="rounded border border-[#e8d5a3]/40 bg-[#26413c] px-2 py-0.5 text-[11px] font-bold text-[#e8d5a3]">
        {key}
      </kbd>
    </div>
  );
}

export function StartScreen() {
  const run = useRunState();
  const { commands } = useGame();
  if (run.status !== "start") return null;

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-[#0f1f1c]/85">
      <div className="relative flex w-[26rem] max-w-[92vw] flex-col gap-5 rounded-2xl border border-[#2a9d8f]/50 bg-[#26413c]/95 p-7 text-center shadow-2xl">
        <SettingsTrigger className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-xl border border-[#2a9d8f]/50 bg-[#0f1f1c]/60 text-[#e8d5a3] transition hover:bg-[#2a9d8f]/20" />
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#2a9d8f]">Island Dispatch Radio</span>
          <h1 className="text-3xl font-black tracking-tight text-[#e8d5a3]">Courier Zero</h1>
          <p className="text-sm text-[#e8d5a3]/75">
            The island's last courier. Deliver {REQUIRED_DELIVERIES} parcels between the four villages before the
            tide swallows every road.
          </p>
        </div>
        <p className="text-xs italic text-[#e76f51]">"{RADIO_VOICE.start}"</p>
        <div className="flex flex-col gap-1.5">
          <ControlRow action="moveForward" label="Move" />
          <ControlRow action="sprint" label="Sprint (stamina)" />
          <ControlRow action="interact" label="Pick up / deliver" />
          <ControlRow action="toggleMap" label="Toggle flood chart" />
          <ControlRow action="restartRun" label="Restart" />
        </div>
        <button
          type="button"
          onClick={() => commands.run(COMMAND_START, undefined)}
          className="rounded-xl bg-[#e76f51] px-6 py-3 text-sm font-bold uppercase tracking-wide text-[#26413c] shadow-lg transition hover:brightness-110"
        >
          Start Run ({actionLabel(keybinds, "startRun")})
        </button>
      </div>
    </div>
  );
}
