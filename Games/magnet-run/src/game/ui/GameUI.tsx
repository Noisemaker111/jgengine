import { LaneIndicator } from "./components/LaneIndicator";
import { LoseScreen } from "./components/LoseScreen";
import { PolarityChip } from "./components/PolarityChip";
import { ProgressStrip } from "./components/ProgressStrip";
import { RetriesIndicator } from "./components/RetriesIndicator";
import { SectorClearScreen } from "./components/SectorClearScreen";
import { SpeedReadout } from "./components/SpeedReadout";
import { StartScreen } from "./components/StartScreen";
import { TelemetryToasts } from "./components/TelemetryToasts";
import { WinScreen } from "./components/WinScreen";
import { useRunState } from "./useRunState";

export function GameUI() {
  const run = useRunState();
  const running = run.phase === "running";

  return (
    <div className="pointer-events-none fixed inset-0 flex flex-col items-center justify-between gap-3 p-3 font-sans sm:p-5">
      {running && (
        <div className="pointer-events-auto flex w-full max-w-3xl justify-center">
          <ProgressStrip />
        </div>
      )}

      {running && (
        <div className="pointer-events-none absolute left-3 top-16 flex flex-col gap-1 sm:left-5 sm:top-20">
          <TelemetryToasts />
        </div>
      )}

      {running ? (
        <div className="pointer-events-none flex w-full max-w-3xl items-end justify-between gap-4">
          <div className="pointer-events-auto flex flex-col gap-2">
            <SpeedReadout />
            <LaneIndicator />
          </div>
          <div className="pointer-events-auto">
            <PolarityChip />
          </div>
          <div className="pointer-events-auto">
            <RetriesIndicator />
          </div>
        </div>
      ) : (
        <div className="pointer-events-auto flex w-full flex-1 items-center justify-center">
          {run.phase === "menu" && <StartScreen />}
          {run.phase === "sectorClear" && <SectorClearScreen />}
          {run.phase === "won" && <WinScreen />}
          {run.phase === "lost" && <LoseScreen />}
        </div>
      )}
    </div>
  );
}
