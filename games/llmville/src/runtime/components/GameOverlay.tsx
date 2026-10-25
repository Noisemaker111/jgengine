/**
 * In-world HUD: stats, tablet, hints, and notifications.
 * Walk/look input lives in features/movement — not here.
 */

import type { BuildViewModel } from "@/build/buildSession";
import { useState } from "react";
import type { RackHardwareViewModel } from "@/infrastructure/rackHardwareSession";
import type { ReadyWorldViewModel } from "@/runtime/worldViewModel";
import type { TutorialViewModel } from "@/tutorial/tutorialRuntime";
import type { Movement } from "@/movement/useMovement";
import { cn } from "@/components/ui/cn";
import { MovementHud } from "@/movement/components/MovementHud";
import { WorldChat, type WorldChatMessage } from "@/multiplayer/components/WorldChat";

import { GameResourcePanel } from "@/runtime/components/GameResourcePanel";
import { GameHudBar } from "@/runtime/components/GameHudBar";
import { GameTablet } from "@/tablet/components/GameTablet";
import { GameplayChrome } from "@/runtime/components/GameplayChrome";
import { UiHitTestOverlay, useShowUiHitTest } from "@/runtime/components/UiHitTestOverlay";
import { PerformanceDiagnosticOverlay } from "@/runtime/components/PerformanceDiagnosticOverlay";
import { useProfiledRender } from "@/runtime/useProfiledRender";
import { PROFILE_SECTION } from "@/runtime/runtimePerformanceProfiler";

interface GameOverlayProps {
  world: ReadyWorldViewModel;
  build: BuildViewModel;
  rackHardware: RackHardwareViewModel;
  tutorial: TutorialViewModel;
  movement: Movement;
  /** When true, HUD is rendered inside a dev preview frame instead of the browser viewport. */
  embedded?: boolean;
  chatFixtureMessages?: readonly WorldChatMessage[];
}

export function GameOverlay({
  world,
  build,
  rackHardware,
  tutorial,
  movement,
  embedded = false,
  chatFixtureMessages,
}: GameOverlayProps) {
  useProfiledRender(PROFILE_SECTION.reactGameOverlay);
  const { isTouch } = movement;
  const [chatOpen, setChatOpen] = useState(false);
  const [goalId, setGoalId] = useState<string | null>(null);
  const goalSelection = { id: goalId, select: setGoalId };
  const showUiHitTest = useShowUiHitTest();

  return (
    <div
      className={cn(
        "game-ui-layer pointer-events-none select-none font-sans text-white",
        embedded ? "absolute inset-0" : "h-dvh w-full overflow-hidden",
      )}
    >
      {world.hasSessionConflict && (
        <div className="pointer-events-auto absolute left-1/2 top-3 z-[100] -translate-x-1/2 rounded bg-black/80 px-3 py-1 text-xs text-amber-300 border border-amber-400/50">
          Another session started on this account. This one is now read-only.
        </div>
      )}

      {isTouch ? (
        <div
          className="pointer-events-none absolute left-4 top-4 z-[26] sm:left-5 sm:top-5"
          data-ui-layer="resource-panel"
        >
          <GameResourcePanel
            money={world.money}
            dataTokens={world.dataTokens}
            servingIncomeRate={world.servingIncomeRate}
          />
        </div>
      ) : (
        <GameHudBar world={world} className="pointer-events-none absolute left-4 top-4 z-[26] sm:left-5 sm:top-5" />
      )}

      {isTouch && !chatOpen && <MovementHud controls={movement.controls} />}

      <GameTablet
        world={world}
        build={build}
        tutorial={tutorial}
        isTouch={isTouch}
        embedded={embedded}
        goalSelection={goalSelection}
      />
      <GameplayChrome world={world} build={build} rackHardware={rackHardware} tutorial={tutorial} isTouch={isTouch} chatOpen={chatOpen} goalSelection={goalSelection} />
      <WorldChat world={world} placing={build.buildPlacementModeActive} open={chatOpen} setOpen={setChatOpen} fixtureMessages={chatFixtureMessages} />
      <PerformanceDiagnosticOverlay world={world} className="absolute right-4 top-4" />

      {showUiHitTest && <UiHitTestOverlay />}
    </div>
  );
}

export default GameOverlay;
