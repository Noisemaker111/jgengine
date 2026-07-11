import { SettingsTrigger } from "@jgengine/react";
import { useDisplayProfile } from "@jgengine/react/display";
import { useEngineState } from "@jgengine/react/engineStore";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react/hudLayout";

import { store } from "../state";
import { Board } from "./components/Board";
import { Brand, Controls, Credit, PlayStats } from "./components/Panels";
import { LevelSelect } from "./components/LevelSelect";
import { WinPanel } from "./components/WinPanel";
import { consoleBackdropStyle } from "./theme";

export function GameUI() {
  const snapshot = useEngineState(store);
  const { coarsePointer } = useDisplayProfile();
  const layout = useHudLayout({ storageKey: "lights-out" });
  const playing = snapshot.screen === "play";

  return (
    <>
      <div className="absolute inset-0" style={consoleBackdropStyle} />

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
        <div className="pointer-events-auto flex w-full items-center justify-center">
          {playing ? (
            <Board board={snapshot.board} hintCell={snapshot.hintCell} onCell={(cell) => store.press(cell)} />
          ) : (
            <LevelSelect
              snapshot={snapshot}
              onLevel={(level) => store.startLevel(level)}
              onRandom={() => store.startRandom()}
            />
          )}
        </div>
      </div>

      <HudCanvas layout={layout} className="select-none text-[#ece0c8]">
        <HudPanel id="brand" anchor="top-left" compact="hide" interactive={false}>
          <Brand />
        </HudPanel>
        <HudPanel id="settings" anchor="top-right" compact="keep">
          <SettingsTrigger className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-lg border border-[#4a4030] bg-[#211b12] text-base text-[#e8d7ad] shadow-[0_2px_6px_rgba(0,0,0,0.4)] transition hover:border-[#6a5a3c] hover:bg-[#2a2318]" />
        </HudPanel>
        {playing ? (
          <HudPanel id="stats" anchor="top" compact="keep" interactive={false}>
            <PlayStats snapshot={snapshot} />
          </HudPanel>
        ) : null}
        {playing ? (
          <HudPanel id="controls" anchor="bottom" compact="keep">
            <Controls
              snapshot={snapshot}
              showKeys={!coarsePointer}
              onHint={() => store.hint()}
              onUndo={() => store.undo()}
              onRestart={() => store.restart()}
              onLevels={() => store.openLevels()}
            />
          </HudPanel>
        ) : null}
        <HudPanel id="credit" anchor="bottom-right" compact="chip" chip="Credit" interactive={false}>
          <Credit />
        </HudPanel>
      </HudCanvas>

      {snapshot.solved ? (
        <WinPanel
          snapshot={snapshot}
          onNext={() => store.next()}
          onRetry={() => store.restart()}
          onLevels={() => store.openLevels()}
        />
      ) : null}
    </>
  );
}
