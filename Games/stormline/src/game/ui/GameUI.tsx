import { SettingsTrigger } from "@jgengine/react";
import { CorridorMinimap } from "./components/CorridorMinimap";
import { GateSplits } from "./components/GateSplits";
import { LoseScreen } from "./components/LoseScreen";
import { RadioTicker } from "./components/RadioTicker";
import { Speedometer } from "./components/Speedometer";
import { StartScreen } from "./components/StartScreen";
import { StormLeadBar } from "./components/StormLeadBar";
import { WinScreen } from "./components/WinScreen";
import { useRunState } from "./hooks";

export function GameUI() {
  const run = useRunState();

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="pointer-events-auto">
          <RadioTicker />
        </div>
        <div className="pointer-events-auto mx-auto">
          <StormLeadBar />
        </div>
        <div className="pointer-events-auto flex flex-col items-end gap-1.5">
          <SettingsTrigger className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#3d4a5c] bg-[#1e2633]/85 text-[#9fb8c8] shadow-lg transition-colors hover:bg-[#3d4a5c]/40" />
          <CorridorMinimap />
        </div>
      </div>

      <div className="mt-auto flex items-end justify-between gap-3">
        <div className="pointer-events-auto">
          <GateSplits />
        </div>
        <div className="pointer-events-auto">
          <Speedometer />
        </div>
      </div>

      {run.status === "ready" ? <StartScreen /> : null}
      {run.status === "won" ? <WinScreen /> : null}
      {run.status === "lost" ? <LoseScreen /> : null}
    </div>
  );
}
