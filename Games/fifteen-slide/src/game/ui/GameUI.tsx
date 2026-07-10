import { useDisplayProfile } from "@jgengine/react/display";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react/hudLayout";
import { useEngineState } from "@jgengine/react/engineStore";
import { useGame } from "@jgengine/react/hooks";

import { store, type BoardSize } from "../puzzle/store";
import { Board } from "./components/Board";
import { Brand, Controls, Credit, Records, SizeSelector, SolvedOverlay, Stats } from "./components/Panels";

export function GameUI() {
  const snapshot = useEngineState(store);
  const { commands } = useGame();
  const { coarsePointer } = useDisplayProfile();
  const layout = useHudLayout({ storageKey: "fifteen-slide" });

  const onTile = (index: number) => commands.run("clickTile", { index });
  const newShuffle = () => commands.run("newShuffle", {});
  const restart = () => commands.run("restart", {});
  const onSize = (size: BoardSize) => commands.run(`size${size}`, {});

  return (
    <>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
        <div className="pointer-events-auto">
          <Board snapshot={snapshot} onTile={onTile} />
        </div>
      </div>

      <HudCanvas layout={layout} className="select-none text-[#ece0c8]">
        <HudPanel id="brand" anchor="top-left" compact="hide" interactive={false}>
          <Brand size={snapshot.size} />
        </HudPanel>
        <HudPanel id="stats" anchor="top" compact="keep" interactive={false}>
          <Stats snapshot={snapshot} />
        </HudPanel>
        <HudPanel id="records" anchor="top-right" compact="chip" chip="Best" interactive={false}>
          <Records snapshot={snapshot} />
        </HudPanel>
        <HudPanel id="sizes" anchor="bottom-left" compact="keep">
          <SizeSelector snapshot={snapshot} onSize={onSize} />
        </HudPanel>
        <HudPanel id="controls" anchor="bottom" compact="keep">
          <Controls
            snapshot={snapshot}
            onNew={newShuffle}
            onRestart={restart}
            showKeyHint={!coarsePointer}
          />
        </HudPanel>
        <HudPanel id="credit" anchor="bottom-right" compact="chip" chip="Credit" interactive={false}>
          <Credit />
        </HudPanel>
      </HudCanvas>

      {snapshot.status === "solved" ? <SolvedOverlay snapshot={snapshot} onNew={newShuffle} /> : null}
    </>
  );
}
