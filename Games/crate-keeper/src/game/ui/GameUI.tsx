import { useDisplayProfile } from "@jgengine/react/display";
import { useEngineState } from "@jgengine/react/engineStore";
import { useGame } from "@jgengine/react/hooks";

import type { Dir } from "../sokoban";
import { keeperStore } from "../store";
import { Board } from "./components/Board";
import { Controls } from "./components/Controls";
import { LevelSelect } from "./components/LevelSelect";
import { PlayHud } from "./components/PlayHud";
import { WinBanner } from "./components/WinBanner";

const CREDIT = "Sokoban — Hiroyuki Imabayashi, Thinking Rabbit (1982); original levels";

const MOVE_COMMAND: Record<Dir, string> = { U: "up", D: "down", L: "left", R: "right" };

export function GameUI() {
  const snapshot = useEngineState(keeperStore);
  const { commands } = useGame();
  const { coarsePointer } = useDisplayProfile();

  const move = (dir: Dir) => commands.run(MOVE_COMMAND[dir], {});
  const onUndo = () => commands.run("undo", {});
  const onRestart = () => commands.run("restart", {});
  const onMenu = () => commands.run("select", {});
  const onNext = () => commands.run("nextLevel", {});
  const onContinue = () => commands.run("continue", {});
  const onSelect = (index: number) => commands.run("selectLevel", { index });

  const inPlay = snapshot.screen === "play" && snapshot.active !== null;

  return (
    <div className="fixed inset-0 flex flex-col bg-gradient-to-b from-[#1d1710] via-[#140f09] to-[#0c0906] font-sans text-white select-none">
      <div className="flex min-h-0 flex-1 flex-col">
        {inPlay && snapshot.active !== null ? (
          <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-3 px-3 pt-3 pb-1">
            <PlayHud active={snapshot.active} onMenu={onMenu} />
            <Board active={snapshot.active} />
            <Controls
              coarse={coarsePointer}
              canUndo={snapshot.active.canUndo}
              onMove={move}
              onUndo={onUndo}
              onRestart={onRestart}
            />
          </div>
        ) : (
          <LevelSelect snapshot={snapshot} onSelect={onSelect} onContinue={onContinue} />
        )}
      </div>

      <footer className="shrink-0 border-t border-amber-950/40 bg-black/20 py-2 text-center text-[10px] tracking-wide text-amber-200/35">
        {CREDIT}
      </footer>

      {snapshot.win !== null ? (
        <WinBanner win={snapshot.win} onNext={onNext} onRetry={onRestart} onMenu={onMenu} />
      ) : null}
    </div>
  );
}
