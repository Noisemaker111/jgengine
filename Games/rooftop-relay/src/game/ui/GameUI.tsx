import { useGame, useGameStore } from "@jgengine/react/hooks";

import { getSession } from "../../loop";
import { currentLegSpec } from "../relay/state";
import { legProgressFraction } from "../route/progress";
import { runnerByLegIndex } from "../runners/catalog";
import { EndScreen } from "./components/EndScreen";
import { KeybindLegend } from "./components/KeybindLegend";
import { RelayClock } from "./components/RelayClock";
import { RouteRibbon } from "./components/RouteRibbon";
import { StaminaBar } from "./components/StaminaBar";
import { StartScreen } from "./components/StartScreen";
import { ToastBanner } from "./components/ToastBanner";

export function GameUI() {
  const session = useGameStore(getSession);
  const activePosition = useGameStore((ctx) => {
    const id = ctx.player.possession.active(ctx.player.userId);
    return ctx.scene.entity.get(id)?.position ?? null;
  });
  const { commands } = useGame();

  const { relay } = session;
  const runnerName = runnerByLegIndex(Math.min(relay.legIndex, 4)).name;
  const legProgress = activePosition === null ? 0 : legProgressFraction(relay.legIndex, activePosition[2]);

  return (
    <div className="pointer-events-none fixed inset-0 select-none font-sans">
      {relay.phase === "menu" ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
          <StartScreen onStart={() => commands.run("start", {})} />
        </div>
      ) : null}

      {relay.phase === "won" || relay.phase === "lost" ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
          <EndScreen
            won={relay.phase === "won"}
            elapsedSeconds={relay.elapsedSeconds}
            fallCount={relay.fallCount}
            splits={relay.splits}
            onRestart={() => commands.run("restart", {})}
          />
        </div>
      ) : null}

      {relay.phase === "running" ? (
        <>
          <div className="absolute left-1/2 top-4 -translate-x-1/2">
            <RelayClock
              legIndex={relay.legIndex}
              legName={currentLegSpec(relay).name}
              runnerName={runnerName}
              elapsedSeconds={relay.elapsedSeconds}
              paceStreakSeconds={relay.baton.paceStreakSeconds}
            />
          </div>

          <div className="absolute right-3 top-4 w-[min(60vw,16rem)]">
            <RouteRibbon legIndex={relay.legIndex} legProgress={legProgress} />
          </div>

          <div className="absolute left-1/2 top-24 flex -translate-x-1/2 justify-center">
            <ToastBanner toast={relay.toast} />
          </div>

          <div className="absolute bottom-4 left-1/2 flex w-full -translate-x-1/2 flex-col items-center gap-2 px-4">
            <StaminaBar fraction={session.stamina.fraction()} />
          </div>

          <div className="pointer-events-none absolute bottom-4 left-3 hidden w-40 rounded-md border border-[#c9c4b8]/30 bg-black/40 p-2 sm:block">
            <KeybindLegend className="flex flex-col gap-1" />
          </div>
        </>
      ) : null}
    </div>
  );
}
