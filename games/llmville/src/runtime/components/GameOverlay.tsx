/**
 * In-world HUD: the kit's edge slots (resources, model warnings, news tweets), the tablet, hints and chat.
 * Walk/look input lives in the shell, not here.
 */

import { useState } from "react";

import { HudSlots } from "@jgengine/core/hud/hudLayout.view";
import { KitToast } from "@jgengine/core/ui/kit/uiKitRoot.view";
import type { BuildViewModel } from "@/build/buildSession";
import TweetNotification from "@/economy/components/TweetNotification";
import { useTweetFeed } from "@/economy/tweetFeed";
import type { RackHardwareViewModel } from "@/infrastructure/rackHardwareSession";
import { cn } from "@/kit/cn";
import { WorldChat, type WorldChatMessage } from "@/multiplayer/components/WorldChat";
import { GameplayChrome } from "@/runtime/components/GameplayChrome";
import { ResourceHud } from "@/runtime/components/ResourceHud";
import type { ReadyWorldViewModel } from "@/runtime/worldViewModel";
import { useWorldModelDiagnostics } from "@/scene/worldModelDiagnostics";
import { GameTablet } from "@/tablet/components/GameTablet";
import type { TutorialViewModel } from "@/tutorial/tutorialRuntime";

/** The key the player's moved HUD panels are remembered under. */
const HUD_LAYOUT_KEY = "llmville";

interface GameOverlayProps {
  world: ReadyWorldViewModel;
  build: BuildViewModel;
  rackHardware: RackHardwareViewModel;
  tutorial: TutorialViewModel;
  isTouch: boolean;
  /** When true, HUD is rendered inside a dev preview frame instead of the browser viewport. */
  embedded?: boolean;
  chatFixtureMessages?: readonly WorldChatMessage[];
}

export function GameOverlay({
  world,
  build,
  rackHardware,
  tutorial,
  isTouch,
  embedded = false,
  chatFixtureMessages,
}: GameOverlayProps) {
  const [chatOpen, setChatOpen] = useState(false);
  const [goalId, setGoalId] = useState<string | null>(null);
  const goalSelection = { id: goalId, select: setGoalId };
  const diagnostics = useWorldModelDiagnostics();
  const tweets = useTweetFeed(world.tweetNotification, world.onDismissTweet);

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

      <HudSlots
        storageKey={HUD_LAYOUT_KEY}
        showDuring={null}
        className="llm-hud"
        slots={{
          topLeft: <ResourceHud money={world.money} dataTokens={world.dataTokens} servingIncomeRate={world.servingIncomeRate} />,
          left:
            diagnostics.length === 0 ? null : (
              <div className="flex w-[14rem] flex-col gap-2" data-ui-layer="diagnostics">
                {diagnostics.map((diagnostic) => (
                  <KitToast key={diagnostic.key} tone="warn" className="llm-toast--terminal-alert" title={diagnostic.label}>
                    <p className="mt-1 line-clamp-3 text-[10px] leading-snug text-brand-amber/80">{diagnostic.message}</p>
                  </KitToast>
                ))}
              </div>
            ),
        }}
        panels={{
          bottom:
            tweets.current === null
              ? []
              : [{ id: "news", interactive: true, content: <TweetNotification key={tweets.current.id} tweet={tweets.current} onDismiss={tweets.dismiss} /> }],
        }}
      />

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
    </div>
  );
}

export default GameOverlay;
