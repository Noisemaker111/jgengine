import PlacementController from "@/runtime/components/PlacementController";
import type { BuildViewModel } from "@/build/buildSession";
import type { RackHardwareViewModel } from "@/infrastructure/rackHardwareSession";
import type { ReadyWorldViewModel } from "@/runtime/worldViewModel";
import { findPlacedRackById } from "@/infrastructure/infrastructure";
import { useWorldModelDiagnostics } from "@/scene/worldModelDiagnostics";
import type { TutorialViewModel } from "@/tutorial/tutorialRuntime";
import { useTabletNavContext } from "@/tablet/components/tabletNav";

import { Toast } from "@/components/ui/toast";
import { RackMenuOverlay } from "@/infrastructure/components/RackMenuOverlay";
import { LabGuide, type LabGoalSelection } from "@/tutorial/components/LabGuide";
import TweetNotification from "@/economy/components/TweetNotification";

function LaunchCelebration() {
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/4 z-30 -translate-x-1/2">
      <Toast variant="achievement" title="Model ready to serve" className="animate-in zoom-in p-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-brand-teal to-brand-teal-deep shadow-[var(--glow-teal)]">
            <svg className="h-10 w-10 text-[#0e231e]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
              />
            </svg>
          </div>
          <p className="text-sm font-medium text-[#4a3f32]">Assign its GPUs in GPU jobs to start earning.</p>
        </div>
      </Toast>
    </div>
  );
}

interface GameplayChromeProps {
  world: ReadyWorldViewModel;
  build: BuildViewModel;
  rackHardware: RackHardwareViewModel;
  tutorial: TutorialViewModel;
  isTouch: boolean;
  chatOpen?: boolean;
  goalSelection?: LabGoalSelection;
}

/** Shared in-world overlays: hints, rack menu, placement, and notifications. */
export function GameplayChrome({ world, build, rackHardware, tutorial, isTouch, chatOpen = false, goalSelection }: GameplayChromeProps) {
  const { rackMenuOverlayRackId, closeMenu, tabletOpen } = useTabletNavContext();
  const worldModelDiagnostics = useWorldModelDiagnostics();
  const rackMenuRack = findPlacedRackById(world.racks, rackMenuOverlayRackId);

  return (
    <>
      <div className="game-crosshair" />

      {worldModelDiagnostics.length > 0 && (
        <div className="pointer-events-none absolute left-4 top-28 z-20 flex w-[min(14rem,calc(100vw-2rem))] flex-col gap-2" data-ui-layer="diagnostics">
          {worldModelDiagnostics.map((diagnostic) => (
            <Toast key={diagnostic.key} variant="terminal-alert">
              <p className="text-[10px] font-bold uppercase tracking-wide text-brand-amber">{diagnostic.label}</p>
              <p className="mt-1 line-clamp-3 text-[10px] leading-snug text-brand-amber/80">{diagnostic.message}</p>
            </Toast>
          ))}
        </div>
      )}

      {!chatOpen && !tabletOpen && !rackMenuRack && !build.buildPlacementModeActive && (
        <div className="pointer-events-auto absolute right-3 top-28 z-20 max-h-[calc(100dvh-15rem)] w-[min(19rem,calc(100vw-1.5rem))] overflow-y-auto max-sm:max-h-[32dvh]" data-no-pointer-lock="true">
          <LabGuide world={world} tutorial={tutorial} compact selection={goalSelection} />
        </div>
      )}

      {rackMenuRack && (
        <RackMenuOverlay
          rack={rackMenuRack}
          hardwareInventory={world.hardwareInventory}
          coolingInventory={world.coolingInventory}
          onMoveHardware={rackHardware.moveHardware}
          onInstallCooler={rackHardware.onInstallCoolerToRack}
          onUninstallCooler={rackHardware.onUninstallCoolerFromRack}
          onClose={closeMenu}
        />
      )}

      {world.tweetNotification && (
        <TweetNotification
          message={world.tweetNotification.message}
          avatarName={world.tweetNotification.avatarName}
          onDismiss={world.onDismissTweet}
          className="absolute bottom-24 left-1/2 z-30 w-[min(22rem,calc(100vw-1.5rem))] -translate-x-1/2"
        />
      )}

      {world.launchCelebrationActive && <LaunchCelebration />}

      {build.buildPlacementModeActive && (
        <div
          data-ui-layer="placement-controls"
          className={
            isTouch
              ? "game-ui-interactive absolute bottom-[calc(env(safe-area-inset-bottom)+11rem)] left-4 z-20 max-sm:right-4 max-sm:w-auto"
              : "game-ui-interactive absolute right-12 top-24 z-20"
          }
        >
          <PlacementController
            facingLabel={build.placementFacingLabel}
            onRotate={build.onRotatePlacement}
            onPlace={build.onConfirmPlacement}
            canPlace={build.placementPreview?.isValid ?? false}
            claimHint={build.placementClaimHint}
            isTouch={isTouch}
          />
        </div>
      )}
    </>
  );
}
