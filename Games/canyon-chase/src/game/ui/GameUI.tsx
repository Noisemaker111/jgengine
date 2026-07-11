import { useGameStore, SettingsTrigger } from "@jgengine/react";
import { SELECTED_SEED_STORE_KEY } from "../run/storeKeys";
import { isSurging } from "../run/surge";
import { useRunState } from "../run/useRunState";
import { useCanyonMarkers } from "../world/useCanyonMarkers";
import { BorderCountdown, ConfidenceMeter, DistanceBar, KeybindLegend, RadioTicker } from "./components/PursuitHud";
import { LoseScreen, StartScreen, WinScreen } from "./components/Screens";
import { CornerSurveyMap, LargeSurveyMap } from "./components/SurveyMinimap";

export function GameUI() {
  const run = useRunState();
  const markers = useCanyonMarkers();
  const selectedSeedId = useGameStore((ctx) => ctx.game.store.get(SELECTED_SEED_STORE_KEY) as string | undefined);

  if (run === undefined) return null;

  return (
    <div className="pointer-events-none fixed inset-0 flex flex-col justify-between p-3 font-sans sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          {run.phase === "playing" ? (
            <>
              <SettingsTrigger className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-[#ffc857]/30 bg-[#241a2c]/70 text-[#ffc857] backdrop-blur transition-colors hover:bg-[#ffc857]/15" />
              <BorderCountdown truckMainDistance={run.truck.mainDistance} />
            </>
          ) : null}
        </div>
        <div className="flex flex-1 justify-center">
          {run.phase === "playing" ? <DistanceBar gap={run.gap} gapDelta={run.gapDelta} tensionFraction={run.tensionFraction} /> : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          {run.phase === "playing" && markers !== undefined ? (
            <CornerSurveyMap carPosition={run.car.position} carHeading={run.car.heading} markers={markers} />
          ) : null}
        </div>
      </div>

      {run.mapSlow.active && markers !== undefined ? (
        <div className="pointer-events-none fixed inset-0 flex items-center justify-center bg-black/45">
          <LargeSurveyMap markers={markers} />
        </div>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">{run.phase === "playing" ? <KeybindLegend /> : null}</div>
        <div className="flex flex-1 justify-center">{run.phase === "playing" ? <RadioTicker lines={run.radioLog} /> : null}</div>
        <div className="flex flex-col items-end gap-2">
          {run.phase === "playing" ? (
            <ConfidenceMeter confidence={run.surge.confidence} surging={isSurging(run.surge, run.elapsed)} />
          ) : null}
        </div>
      </div>

      {run.phase === "idle" ? (
        <div className="pointer-events-auto fixed inset-0 flex items-center justify-center bg-black/65 p-4">
          <StartScreen selectedSeedId={selectedSeedId ?? run.seedId} />
        </div>
      ) : null}
      {run.phase === "won" && run.result !== null ? (
        <div className="pointer-events-auto fixed inset-0 flex items-center justify-center bg-black/65 p-4">
          <WinScreen result={run.result} />
        </div>
      ) : null}
      {run.phase === "lost" && run.result !== null ? (
        <div className="pointer-events-auto fixed inset-0 flex items-center justify-center bg-black/65 p-4">
          <LoseScreen result={run.result} />
        </div>
      ) : null}
    </div>
  );
}
