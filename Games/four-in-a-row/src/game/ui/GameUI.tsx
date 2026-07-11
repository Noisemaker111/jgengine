import { useState } from "react";

import { actionLabel } from "@jgengine/core/input/actionBindings";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react/hudLayout";
import { useGame } from "@jgengine/react/hooks";
import { useDisplayProfile } from "@jgengine/react/display";
import { SettingsTrigger } from "@jgengine/react/settings";

import { COLS, type Board } from "../logic/board";
import { keybinds } from "../keybinds";
import { HUMAN_PLAYER, isAiMode, type AppState, type Mode } from "../state";
import { DISCS, HUD_STYLES, studioBackdrop, studioVignette } from "./theme";
import { useApp } from "./useApp";
import { BoardGrid } from "./components/Board";
import { MoveHistory } from "./components/MoveHistory";
import { Scoreboard } from "./components/Scoreboard";

const MODES: { id: Mode; label: string }[] = [
  { id: "easy", label: "Easy" },
  { id: "medium", label: "Medium" },
  { id: "hard", label: "Hard" },
  { id: "hotseat", label: "Hotseat" },
];

function KeyBadge({ action }: { action: string }) {
  const label = actionLabel(keybinds, action);
  if (label === null) return null;
  return (
    <span className="ml-1 rounded bg-black/40 px-1 text-[10px] font-bold leading-tight text-slate-200 ring-1 ring-white/10">
      {label}
    </span>
  );
}

function cellSizeFor(compact: boolean): number {
  return compact ? 34 : 52;
}

function ModeSelector({ mode, onPick }: { mode: Mode; onPick: (mode: Mode) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {MODES.map((entry) => {
        const active = mode === entry.id;
        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => onPick(entry.id)}
            className={`rounded-md border px-2 py-1.5 text-sm font-semibold transition-colors ${
              active
                ? "border-sky-400/70 bg-sky-500/20 text-sky-50"
                : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
            }`}
          >
            {entry.label}
          </button>
        );
      })}
    </div>
  );
}

function ResultBanner({ board, mode, outcome, newBest, onRematch }: {
  board: Board;
  mode: Mode;
  outcome: AppState["outcome"];
  newBest: boolean;
  onRematch: () => void;
}) {
  const draw = board.status === "draw";
  const winner = board.winner;
  let title: string;
  let tone: string;
  if (draw) {
    title = "Draw — board full";
    tone = "bg-slate-700/90 ring-slate-300/40";
  } else if (winner !== null) {
    if (isAiMode(mode)) {
      title = outcome === "win" ? "You win!" : `${DISCS[winner].name} (AI) wins`;
    } else {
      title = `${DISCS[winner].name} wins!`;
    }
    tone = outcome === "loss" ? "bg-rose-800/90 ring-rose-300/40" : "bg-emerald-700/90 ring-emerald-300/40";
  } else {
    return null;
  }
  return (
    <div className={`flex items-center gap-3 rounded-full px-4 py-2 shadow-xl ring-1 ${tone}`}>
      <span className="text-sm font-bold text-white">{title}</span>
      {newBest ? <span className="text-xs font-bold text-amber-200">★ best streak</span> : null}
      <button
        type="button"
        onClick={onRematch}
        className="flex items-center rounded-full bg-black/30 px-2.5 py-1 text-xs font-bold text-white hover:bg-black/50"
      >
        Rematch
        <KeyBadge action="rematch" />
      </button>
    </div>
  );
}

export function GameUI() {
  const layout = useHudLayout({ storageKey: "four-in-a-row:hud" });
  const app = useApp();
  const { commands } = useGame();
  const { compact } = useDisplayProfile();
  const [hoveredCol, setHoveredCol] = useState<number | null>(null);

  if (app === undefined) return null;
  const board = app.board;
  const run = (command: string) => commands.run(command, {});
  const humanTurn = board.status === "playing" && (!isAiMode(app.mode) || board.current === HUMAN_PLAYER);
  const columnLabels = Array.from({ length: COLS }, (_, col) => actionLabel(keybinds, `dropColumn${col + 1}`) ?? String(col + 1));

  return (
    <>
      <div aria-hidden className="absolute inset-0" style={{ zIndex: 0, ...studioBackdrop }} />
      <div aria-hidden className="absolute inset-0" style={{ zIndex: 0, ...studioVignette }} />

      <HudCanvas layout={layout} className="select-none text-slate-100">
        <style>{HUD_STYLES}</style>

        <HudPanel id="menu" anchor="top-left" compact="chip" chip="Match">
          <div className="flex w-56 flex-col gap-3 rounded-xl border border-white/10 bg-slate-900/85 p-3 shadow-xl backdrop-blur">
            <div>
              <h1 className="text-lg font-black tracking-tight text-slate-50">Four in a Row</h1>
              <p className="text-[11px] font-medium uppercase tracking-wider text-sky-300/80">Drop · connect · win</p>
            </div>
            <ModeSelector mode={app.mode} onPick={(mode) => commands.run("setMode", { mode })} />
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => run("rematch")}
                className="flex flex-1 items-center justify-center rounded-md bg-slate-100 px-2 py-1.5 text-sm font-bold text-slate-900 hover:bg-white"
              >
                Rematch
                <KeyBadge action="rematch" />
              </button>
              <button
                type="button"
                onClick={() => run("undoMove")}
                disabled={board.moves.length === 0}
                className="flex flex-1 items-center justify-center rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm font-semibold text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Undo
                <KeyBadge action="undoMove" />
              </button>
            </div>
          </div>
        </HudPanel>

        <HudPanel id="status" anchor="top-right" compact="chip" chip="Players">
          <div className="w-64 rounded-xl border border-white/10 bg-slate-900/85 p-3 shadow-xl backdrop-blur">
            <div className="mb-2 flex items-center justify-end">
              <SettingsTrigger className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-slate-200 transition-colors hover:bg-white/10" />
            </div>
            <Scoreboard board={board} mode={app.mode} aiThinking={app.aiThinking} records={app.records} />
            {isAiMode(app.mode) ? (
              <button
                type="button"
                onClick={() => run("resetRecords")}
                className="mt-2 w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-slate-300 hover:bg-white/10"
              >
                Reset records
              </button>
            ) : null}
          </div>
        </HudPanel>

        {board.status !== "playing" ? (
          <HudPanel id="result" anchor="top" order={0} compact="keep">
            <ResultBanner
              board={board}
              mode={app.mode}
              outcome={app.outcome}
              newBest={app.newBestStreak}
              onRematch={() => run("rematch")}
            />
          </HudPanel>
        ) : null}

        <HudPanel id="board" anchor="center" compact="keep">
          <BoardGrid
            board={board}
            cellSize={cellSizeFor(compact)}
            hoveredCol={hoveredCol}
            interactive={humanTurn}
            ghostPlayer={board.current}
            columnLabels={columnLabels}
            onHoverCol={setHoveredCol}
            onDrop={(col) => commands.run("drop", { col })}
          />
        </HudPanel>

        <HudPanel id="history" anchor="bottom" order={1} compact="keep">
          <div className="w-[min(92vw,560px)] rounded-xl border border-white/10 bg-slate-900/85 px-3 py-2 shadow-lg backdrop-blur">
            <MoveHistory moves={board.moves} />
          </div>
        </HudPanel>

        <HudPanel id="credit" anchor="bottom" order={0} compact="keep" interactive={false}>
          <p className="max-w-[92vw] rounded-full bg-slate-950/70 px-3 py-1 text-center text-[11px] font-medium text-slate-300 ring-1 ring-white/10">
            The Captain&apos;s Mistress — traditional; popularized as Connect Four (Howard Wexler &amp; Ned Strongin, 1974)
          </p>
        </HudPanel>
      </HudCanvas>
    </>
  );
}
