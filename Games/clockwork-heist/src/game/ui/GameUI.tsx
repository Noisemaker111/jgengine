import type { ReactNode } from "react";
import { useGameContext } from "@jgengine/react/provider";
import { useActivePrompt } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { SettingsTrigger, useDisplayProfile } from "@jgengine/react";
import { heistPrompts } from "../prompts";
import { heistStore } from "../state/heistState";
import { StartScreen } from "./components/StartScreen";
import { EndScreens } from "./components/EndScreens";
import { DawnClockHud } from "./components/DawnClockHud";
import { MinimapPanel } from "./components/MinimapPanel";
import { SchedulePanel } from "./components/SchedulePanel";
import { RoomLabel } from "./components/RoomLabel";
import { GrabGauge } from "./components/GrabGauge";
import { ToastList } from "./components/ToastList";
import { ControlDock } from "./components/ControlDock";

function ActivePromptHint(): ReactNode {
  const ctx = useGameContext();
  const { coarsePointer } = useDisplayProfile();
  const prompt = useActivePrompt(heistPrompts(ctx));
  if (prompt === null) return null;
  const display = prompt.prompt.display;
  const hold = coarsePointer ? "Hold to" : "Hold E to";
  const text =
    display.kind === "label"
      ? display.text
      : display.kind === "gauge" && display.gaugeId === "grabTreasure"
        ? `${hold} lift`
        : `${hold} pocket`;
  return (
    <div className="pointer-events-none rounded border border-[#c9a227]/60 bg-[#0b0f1c]/85 px-3 py-1.5 text-center font-serif text-sm text-[#f2e3c2]">
      {text}
    </div>
  );
}

export function GameUI(): ReactNode {
  const status = useStore(heistStore, (heist) => heist.status);

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col text-[#f2e3c2]">
      {status === "intro" ? <StartScreen /> : null}
      <EndScreens />

      {status === "playing" ? (
        <>
          <div className="flex justify-center">
            <DawnClockHud />
          </div>

          <div className="pointer-events-none absolute left-3 top-3">
            <SettingsTrigger className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-[#c9a227]/60 bg-[#0b0f1c]/85 text-[#c9a227] transition hover:bg-[#1d2b4a]" />
          </div>

          <div className="pointer-events-none absolute right-3 top-3">
            <MinimapPanel />
          </div>

          <SchedulePanel />

          <div className="mt-auto flex items-end justify-between gap-3 p-3">
            <RoomLabel />
            <div className="flex flex-1 flex-col items-center gap-2">
              <ActivePromptHint />
              <GrabGauge />
              <ToastList />
            </div>
            <ControlDock />
          </div>
        </>
      ) : null}
    </div>
  );
}
