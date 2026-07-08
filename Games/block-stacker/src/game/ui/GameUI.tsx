import { useDisplayProfile } from "@jgengine/react/display";
import { useGame } from "@jgengine/react/hooks";
import { useEngineState } from "@jgengine/react/engineStore";

import { blockStackerStore } from "../tetris/store";
import { Board } from "./components/Board";
import { ControlsPanel, HoldPanel, NextPanel, StatsPanel } from "./components/SidePanel";

export function GameUI() {
  const snapshot = useEngineState(blockStackerStore);
  const { commands } = useGame();
  const { compact, coarsePointer } = useDisplayProfile();
  const restart = () => commands.run("restart", {});

  const messageOverlay = snapshot.message !== null && snapshot.status === "playing" && (
    <div className="pointer-events-none absolute inset-x-0 top-14 text-center text-xl font-black uppercase tracking-wide text-amber-300 drop-shadow-lg">
      {snapshot.message}
    </div>
  );

  const gameOverOverlay = snapshot.status === "gameover" && (
    <div className="absolute inset-0 top-11 flex flex-col items-center justify-center gap-3 rounded-lg bg-black/80 backdrop-blur-sm">
      <div className="text-3xl font-black uppercase tracking-widest text-red-400">Game Over</div>
      <div className="font-mono text-lg text-slate-200">Score {snapshot.score}</div>
      <div className="font-mono text-sm text-slate-400">
        Lines {snapshot.lines} · Level {snapshot.level}
      </div>
      {snapshot.score === snapshot.best && snapshot.score > 0 && (
        <div className="text-xs font-bold uppercase tracking-widest text-amber-300">New Best!</div>
      )}
      <button
        type="button"
        onClick={restart}
        className="pointer-events-auto rounded-md border border-cyan-400/50 bg-cyan-500/20 px-5 py-2 text-sm font-bold uppercase tracking-wide text-cyan-200 transition hover:bg-cyan-500/40"
      >
        Restart
      </button>
    </div>
  );

  if (compact) {
    return (
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center gap-2 px-3 pb-[180px] pt-3 font-sans text-white select-none">
        <div className="pointer-events-none flex w-full items-start justify-center gap-6">
          <HoldPanel snapshot={snapshot} compact />
          <StatsPanel snapshot={snapshot} compact />
          <NextPanel snapshot={snapshot} compact limit={2} />
        </div>

        <div className="relative flex flex-1 items-center justify-center pointer-events-none">
          <Board snapshot={snapshot} compact />
          {messageOverlay}
          {gameOverOverlay}
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-6 p-6 font-sans text-white select-none">
      <div className="pointer-events-auto flex w-40 flex-col gap-4">
        <HoldPanel snapshot={snapshot} />
        <StatsPanel snapshot={snapshot} />
      </div>

      <div className="relative pointer-events-none">
        <div className="mb-3 text-center text-2xl font-black uppercase tracking-[0.3em] text-cyan-300 drop-shadow">
          Block Stacker
        </div>
        <Board snapshot={snapshot} />
        {messageOverlay}
        {gameOverOverlay}
      </div>

      <div className="pointer-events-auto flex w-44 flex-col gap-4">
        <NextPanel snapshot={snapshot} />
        {!coarsePointer && <ControlsPanel />}
      </div>
    </div>
  );
}
