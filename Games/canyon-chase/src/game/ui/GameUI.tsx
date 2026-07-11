import { useGameStore } from "@jgengine/react";
import { SELECTED_SEED_STORE_KEY } from "../run/storeKeys";
import { isSurging } from "../run/surge";
import { useRunState } from "../run/useRunState";
import { useCanyonMarkers } from "../world/useCanyonMarkers";
import { BorderCountdown, ConfidenceMeter, DistanceBar, RadioTicker } from "./components/PursuitHud";
import { LoseScreen, StartScreen, WinScreen } from "./components/Screens";
import { CornerSurveyMap, LargeSurveyMap } from "./components/SurveyMinimap";

export function GameUI() {
  const run = useRunState();
  const markers = useCanyonMarkers();
  const selectedSeedId = useGameStore((ctx) => ctx.game.store.get(SELECTED_SEED_STORE_KEY) as string | undefined);

  if (run === undefined) return null;

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden font-sans text-[#f6e7cf]">
      {run.phase === "playing" ? (
        <>
          <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/65 to-transparent" />
          <div className="absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] sm:left-5 sm:top-5">
            <BorderCountdown truckMainDistance={run.truck.mainDistance} />
          </div>
          <div className="absolute left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] w-[min(32rem,52vw)] -translate-x-1/2 sm:top-5">
            <DistanceBar gap={run.gap} gapDelta={run.gapDelta} tensionFraction={run.tensionFraction} />
          </div>
          <div className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] sm:right-5 sm:top-5">
            {markers !== undefined ? <CornerSurveyMap carPosition={run.car.position} carHeading={run.car.heading} markers={markers} /> : null}
          </div>

          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 max-w-[min(28rem,72vw)] sm:bottom-5 sm:left-5">
            <RadioTicker lines={run.radioLog} />
          </div>
          <div className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-3 sm:bottom-5 sm:right-5">
            <ConfidenceMeter confidence={run.surge.confidence} surging={isSurging(run.surge, run.elapsed)} />
          </div>
        </>
      ) : null}

      {run.mapSlow.active && markers !== undefined ? (
        <div className="pointer-events-none fixed inset-0 flex items-center justify-center bg-[#08050a]/72 backdrop-blur-[2px]">
          <LargeSurveyMap markers={markers} />
        </div>
      ) : null}

      {run.phase === "idle" ? (
        <div className="pointer-events-auto fixed inset-0">
          <StartScreen selectedSeedId={selectedSeedId ?? run.seedId} />
        </div>
      ) : null}
      {run.phase === "won" && run.result !== null ? (
        <div className="pointer-events-auto fixed inset-0">
          <WinScreen result={run.result} />
        </div>
      ) : null}
      {run.phase === "lost" && run.result !== null ? (
        <div className="pointer-events-auto fixed inset-0">
          <LoseScreen result={run.result} />
        </div>
      ) : null}
    </div>
  );
}
