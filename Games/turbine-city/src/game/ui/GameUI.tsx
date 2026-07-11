import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { SettingsTrigger } from "@jgengine/react";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react/hudLayout";

import { SESSION_STORE_KEY, type RaceSession, type SessionSnapshot } from "../race/session";
import { BuffetVignette } from "./components/BuffetVignette";
import { CenteringHud } from "./components/CenteringHud";
import { ControllerToastLayer } from "./components/ControllerToast";
import { CountdownOverlay } from "./components/CountdownOverlay";
import { FanBoard } from "./components/FanBoard";
import { FlightDeck } from "./components/FlightDeck";
import { Minimap } from "./components/Minimap";
import { RaceHud } from "./components/RaceHud";
import { ResultsScreen } from "./components/ResultsScreen";
import { RingPointer } from "./components/RingPointer";
import { StartScreen } from "./components/StartScreen";

function readSnapshot(ctx: GameContext): SessionSnapshot | null {
  const session = ctx.game.store.get(SESSION_STORE_KEY) as RaceSession | undefined;
  return session === undefined ? null : session.snapshot();
}

export function GameUI() {
  const snapshot = useGameStore(readSnapshot);
  const { commands } = useGame();
  const layout = useHudLayout({ storageKey: "turbine-city" });

  if (snapshot === null) return null;

  const racingHud = snapshot.phase === "racing" || snapshot.phase === "countdown";

  return (
    <div className="pointer-events-none absolute inset-0 font-sans">
      {snapshot.phase === "start" && <StartScreen snapshot={snapshot} onStart={() => commands.run("start", {})} />}

      <HudCanvas layout={layout}>
        {racingHud && (
          <>
            <BuffetVignette snapshot={snapshot} />
            <HudPanel id="settings" anchor="top-left">
              <SettingsTrigger className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-lg border border-[#5d737e]/35 bg-[#0f1d1e]/90 text-[#4ecdc4] transition-colors hover:bg-[#5d737e]/25" />
            </HudPanel>
            <HudPanel id="race" anchor="top" interactive={false}>
              <RaceHud snapshot={snapshot} />
            </HudPanel>
            <HudPanel id="minimap" anchor="top-right" interactive={false}>
              <Minimap snapshot={snapshot} />
            </HudPanel>
            <HudPanel id="fans" anchor="top-right" order={1} compact="chip" chip="Fans" interactive={false}>
              <FanBoard snapshot={snapshot} />
            </HudPanel>
            <HudPanel id="flight" anchor="bottom-left" interactive={false}>
              <FlightDeck snapshot={snapshot} />
            </HudPanel>
            <HudPanel id="toast" anchor="bottom" interactive={false}>
              <ControllerToastLayer toast={snapshot.toast} />
            </HudPanel>
            {snapshot.phase === "racing" && <CenteringHud snapshot={snapshot} />}
            {snapshot.phase === "racing" && <RingPointer snapshot={snapshot} />}
            <CountdownOverlay snapshot={snapshot} />
          </>
        )}
      </HudCanvas>

      {snapshot.phase === "finished" && <ResultsScreen snapshot={snapshot} onRestart={() => commands.run("restart", {})} />}
    </div>
  );
}
