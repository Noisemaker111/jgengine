import { useDisplayProfile } from "@jgengine/react/display";
import { useEngineState } from "@jgengine/react/engineStore";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react/hudLayout";
import { useGame } from "@jgengine/react/hooks";
import { SettingsTrigger } from "@jgengine/react";

import type { BoardId } from "../peg/logic";
import { store } from "../peg/store";
import { Board } from "./components/Board";
import { BoardSelector, Brand, Controls, Credit, OverBanner, Records, Stats } from "./components/Panels";
import { KEYFRAMES } from "./theme";

export function GameUI() {
  const snapshot = useEngineState(store);
  const { commands } = useGame();
  const { coarsePointer } = useDisplayProfile();
  const layout = useHudLayout({ storageKey: "peg-solitaire" });

  const onPick = (r: number, c: number) => commands.run("pickHole", { r, c });
  const onBoard = (id: BoardId) => commands.run(id === "english" ? "selectEnglish" : "selectEuropean", {});
  const onUndo = () => commands.run("undoMove", {});
  const onHint = () => commands.run("showHint", {});
  const onRestart = () => commands.run("restartBoard", {});

  return (
    <>
      <style>{KEYFRAMES}</style>

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 92% at 50% 26%, #2a1e12 0%, #150f09 54%, #090603 100%)",
        }}
      />

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
        <div className="pointer-events-auto">
          <Board snapshot={snapshot} onPick={onPick} />
        </div>
      </div>

      <HudCanvas layout={layout} className="select-none text-[#efe6d2]">
        <HudPanel id="brand" anchor="top-left" compact="hide" interactive={false}>
          <Brand snapshot={snapshot} />
        </HudPanel>
        <HudPanel id="stats" anchor="top" compact="keep" interactive={false}>
          <Stats snapshot={snapshot} />
        </HudPanel>
        <HudPanel id="settings" anchor="top-right" order={-1} compact="keep">
          <SettingsTrigger className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-[#4a3620] bg-[#201810]/90 text-[#efd489] shadow-[0_10px_28px_rgba(0,0,0,0.55)] backdrop-blur-sm transition hover:bg-[#26201790]" />
        </HudPanel>
        <HudPanel id="records" anchor="top-right" compact="chip" chip="Best" interactive={false}>
          <Records snapshot={snapshot} />
        </HudPanel>
        <HudPanel id="boards" anchor="bottom-left" compact="keep">
          <BoardSelector snapshot={snapshot} onBoard={onBoard} />
        </HudPanel>
        <HudPanel id="controls" anchor="bottom" compact="keep">
          <Controls
            snapshot={snapshot}
            onUndo={onUndo}
            onHint={onHint}
            onRestart={onRestart}
            showKeyHint={!coarsePointer}
          />
        </HudPanel>
        <HudPanel id="credit" anchor="bottom-right" compact="chip" chip="Credit" interactive={false}>
          <Credit />
        </HudPanel>
      </HudCanvas>

      {snapshot.status === "over" ? <OverBanner snapshot={snapshot} onRestart={onRestart} /> : null}
    </>
  );
}
