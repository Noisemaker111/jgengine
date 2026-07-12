import { HudCanvas, HudPanel, SettingsTrigger, useGameStore, useGameLayoutMode, useHudLayout } from "@jgengine/react";
import { isMobileMode } from "@jgengine/core/ui/gameLayout";
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
  const layout = useHudLayout();
  const onMobile = isMobileMode(useGameLayoutMode());
  const selectedSeedId = useGameStore((ctx) => ctx.game.store.get(SELECTED_SEED_STORE_KEY) as string | undefined);

  if (run === undefined) return null;
  const playing = run.phase === "playing";

  return (
    <>
      {playing ? (
        <>
          <div className="pointer-events-none fixed inset-x-0 top-0 h-28 bg-gradient-to-b from-black/65 to-transparent" />
          <div className="pointer-events-none fixed inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/70 to-transparent" />
        </>
      ) : null}

      <HudCanvas layout={layout} className="font-sans text-[#f6e7cf]">
        {playing ? (
          <>
            <HudPanel id="pursuit-distance" anchor="top" priority="critical" interactive={false}>
              <DistanceBar gap={run.gap} gapDelta={run.gapDelta} tensionFraction={run.tensionFraction} />
            </HudPanel>

            <HudPanel id="system-settings" anchor="top-left" order={0}>
              <SettingsTrigger className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-[#ffc857]/30 bg-[#241a2c]/70 text-[#ffc857] backdrop-blur transition-colors hover:bg-[#ffc857]/15" />
            </HudPanel>
            <HudPanel id="border-distance" anchor="top-left" order={1} priority="secondary" interactive={false}>
              <BorderCountdown truckMainDistance={run.truck.mainDistance} />
            </HudPanel>

            <HudPanel id="survey-map" anchor="top-right" priority="secondary" mobileBehavior="hidden">
              {markers !== undefined ? (
                <CornerSurveyMap carPosition={run.car.position} carHeading={run.car.heading} markers={markers} />
              ) : null}
            </HudPanel>

            <HudPanel
              id="confidence"
              anchor={onMobile ? "top-right" : "bottom-right"}
              priority="secondary"
              interactive={false}
            >
              <ConfidenceMeter confidence={run.surge.confidence} surging={isSurging(run.surge, run.elapsed)} />
            </HudPanel>

            <HudPanel
              id="radio"
              anchor="bottom-left"
              priority="tertiary"
              mobileBehavior="transient"
              interactive={false}
            >
              <RadioTicker lines={run.radioLog} limit={onMobile ? 1 : 3} />
            </HudPanel>
          </>
        ) : null}
      </HudCanvas>

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
    </>
  );
}
