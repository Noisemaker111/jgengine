import { actionLabel } from "@jgengine/core/input/actionBindings";
import { ControlsList, SettingsTrigger, StartScreen as MenuScreen } from "@jgengine/react";

import { keybinds } from "../../keybinds";
import { PARTS, PART_SLOTS } from "../../parts/catalog";
import { PartIcon } from "./PartIcon";

interface StartScreenProps {
  onStart: () => void;
}

export function StartScreen({ onStart }: StartScreenProps) {
  return (
    <MenuScreen
      className="pointer-events-auto absolute inset-0 flex items-center justify-center overflow-y-auto bg-[#1c1a17]/90 p-4"
      settings={<SettingsTrigger className="flex h-9 w-9 items-center justify-center rounded border-2 border-[#8d99a6]/50 bg-[#1c1a17] text-[#f0c419] transition hover:bg-[#2a251e]" />}
      settingsWrapperClassName="absolute right-4 top-4 z-10"
    >
      <div className="w-full max-w-3xl rounded-lg border-2 border-[#b7410e] bg-[#241f19] p-6 shadow-[0_0_40px_rgba(0,0,0,0.6)] sm:p-8">
        <p className="text-xs font-black tracking-[0.3em] text-[#f0c419]">PIT RADIO — CHANNEL 6</p>
        <h1 className="mt-1 text-4xl font-black tracking-tight text-[#fef3e0] sm:text-6xl">WRECKWAY</h1>
        <p className="mt-3 max-w-xl text-sm text-[#c9b8a4] sm:text-base">
          The compactor line is crushing the yard behind you. Bolt on whatever you drive over, keep her ahead of the crushers,
          and hit the exit gate before Row Six catches up.
        </p>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <h2 className="text-xs font-black tracking-[0.2em] text-[#f0c419]">CONTROLS</h2>
            <ControlsList
              bindings={keybinds}
              controls={[
                { action: "throttle", label: "Throttle" },
                { action: "brake", label: "Brake" },
                { action: "steerLeft", label: "Steer left" },
                { action: "steerRight", label: "Steer right" },
                { action: "jumpHop", label: "Jump (springs for real air)" },
                { action: "plowBrace", label: "Plow brace (with plow)" },
                { action: "restart", label: "Restart" },
                { action: "startRun", label: "Start" },
              ]}
              className="mt-2 flex flex-col gap-1.5"
              rowClassName="flex items-center gap-2 text-sm text-[#e7ddce]"
              renderKey={(key) => (
                <span className="flex min-w-[2.4rem] items-center justify-center rounded border border-[#8d99a6]/50 bg-[#1c1a17] px-2 py-0.5 text-xs font-bold text-[#f0c419]">
                  {key}
                </span>
              )}
            />
          </div>

          <div>
            <h2 className="text-xs font-black tracking-[0.2em] text-[#f0c419]">PART LEGEND</h2>
            <div className="mt-2 grid max-h-56 grid-cols-2 gap-x-3 gap-y-1.5 overflow-y-auto pr-1">
              {PART_SLOTS.map((slot) =>
                PARTS.filter((part) => part.category === slot).map((part) => (
                  <div key={part.id} className="flex items-center gap-1.5 text-xs text-[#c9b8a4]">
                    <PartIcon partId={part.id} className="h-4 w-4 shrink-0" />
                    <span className="truncate">{part.label}</span>
                  </div>
                )),
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onStart}
          className="mt-7 w-full rounded border-2 border-[#f0c419] bg-[#b7410e] py-3 text-lg font-black tracking-widest text-[#fef3e0] transition hover:bg-[#d94f14] sm:w-auto sm:px-10"
        >
          BOLT IT ON, GO GO — {actionLabel(keybinds, "startRun") ?? "ENTER"}
        </button>
      </div>
    </MenuScreen>
  );
}
