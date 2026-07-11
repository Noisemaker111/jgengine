import { useEffect, useState } from "react";
import { SettingsTrigger } from "@jgengine/react";
import { useGame, useGameStore } from "@jgengine/react/hooks";

import type { RunController } from "../rail/controller";
import { CONTROLLER_STORE_KEY } from "../rail/storeKeys";
import { ClockRace } from "./components/ClockRace";
import { DispatcherDiagram } from "./components/DispatcherDiagram";
import { EndScreen } from "./components/EndScreen";
import { JunctionIndicator } from "./components/JunctionIndicator";
import { PumpMeter } from "./components/PumpMeter";
import { StartScreen } from "./components/StartScreen";
import { TelegraphTicker } from "./components/TelegraphTicker";

function SettingsGear() {
  return (
    <div className="pointer-events-auto fixed right-3 top-3 z-10">
      <SettingsTrigger className="flex h-9 w-9 items-center justify-center rounded-sm border-2 border-[#a98467] bg-[#211d14]/88 text-[#f2e8cf] shadow-[0_4px_0_rgba(0,0,0,0.4)] transition-colors hover:bg-[#a98467]/25" />
    </div>
  );
}

export function GameUI() {
  const [expanded, setExpanded] = useState(false);
  const controller = useGameStore((ctx) => ctx.game.store.get(CONTROLLER_STORE_KEY) as RunController | undefined);
  const { commands } = useGame();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.code === "KeyM" && !event.repeat) setExpanded((value) => !value);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (controller === undefined) return null;
  const snapshot = controller.snapshot();

  if (snapshot.phase === "start") {
    return <StartScreen deadlineSeconds={snapshot.session.deadlineSeconds} onStart={() => commands.run("confirm", undefined)} />;
  }

  if (snapshot.phase === "finished") {
    return (
      <EndScreen outcome={snapshot.session.outcome} session={snapshot.session} onRestart={() => commands.run("restart", undefined)} />
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between gap-3 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <JunctionIndicator session={snapshot.session} />
        <div className="flex flex-col items-end gap-2">
          <ClockRace session={snapshot.session} />
          <DispatcherDiagram
            session={snapshot.session}
            now={snapshot.now}
            expanded={expanded}
            onToggleExpand={() => setExpanded((value) => !value)}
            onThrowJunction={(nodeId) => commands.run("throwJunction", { nodeId })}
          />
        </div>
      </div>
      <div className="flex flex-col items-center gap-2">
        <TelegraphTicker entries={snapshot.telegraph} />
        <PumpMeter session={snapshot.session} />
      </div>
    </div>
  );
}
