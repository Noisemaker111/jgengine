import { useState } from "react";

import { actionLabel } from "@jgengine/core/input/actionBindings";
import { useDisplayProfile } from "@jgengine/react/display";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react/hudLayout";
import { useGame } from "@jgengine/react/hooks";

import { keybinds } from "../keybinds";
import { shareUrl } from "../seedShare";
import { DIFFICULTIES, difficultyLabel, type Difficulty } from "../sudoku/difficulty";
import { digitCounts, elapsedSeconds, filledCount, formatTime, type Board } from "../sudoku/board";
import type { AppState, WinStats } from "../state";
import { BoardGrid } from "./components/BoardGrid";
import { NumberPad } from "./components/NumberPad";
import * as T from "./theme";
import { useApp } from "./useApp";

function difficultyCommand(d: Difficulty): string {
  return `difficulty${d[0].toUpperCase()}${d.slice(1)}`;
}

function KeyBadge({ action }: { action: string }) {
  const label = actionLabel(keybinds, action);
  if (label === null) return null;
  return (
    <span className="ml-1 rounded bg-black/10 px-1 text-[10px] font-bold leading-tight text-slate-600 ring-1 ring-black/5">
      {label}
    </span>
  );
}

function DifficultyPicker({ board, run }: { board: Board; run: (cmd: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {DIFFICULTIES.map((d) => {
        const active = board.difficulty === d;
        return (
          <button
            key={d}
            type="button"
            onClick={() => run(difficultyCommand(d))}
            className="rounded-md border px-2 py-1.5 text-sm font-semibold transition-colors"
            style={
              active
                ? { borderColor: T.INDIGO, background: T.INDIGO, color: "#fff" }
                : { borderColor: T.THIN_LINE, background: "#fff", color: T.INK }
            }
          >
            {difficultyLabel(d)}
          </button>
        );
      })}
    </div>
  );
}

function MenuPanel({ app, run }: { app: AppState; run: (cmd: string) => void }) {
  const [copied, setCopied] = useState(false);
  const board = app.board;
  const share = () => {
    const url = shareUrl(board.seed, board.difficulty);
    if (typeof navigator !== "undefined" && navigator.clipboard !== undefined) {
      void navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      });
    }
  };
  return (
    <div className="flex w-56 flex-col gap-3 rounded-xl p-3" style={T.cardStyle}>
      <div>
        <h1 className="text-xl font-black tracking-tight" style={{ color: T.INK }}>
          Sudoku
        </h1>
        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: T.INDIGO }}>
          Number Place
        </p>
      </div>
      <DifficultyPicker board={board} run={run} />
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => run("newGame")}
          className="flex items-center justify-center rounded-md px-2 py-1.5 text-sm font-bold text-white"
          style={{ background: T.INK }}
        >
          New puzzle
          <span className="ml-1 rounded bg-white/20 px-1 text-[10px] font-bold text-white">
            {actionLabel(keybinds, "newGame")}
          </span>
        </button>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => run("daily")}
            className="flex items-center justify-center rounded-md border px-2 py-1.5 text-sm font-semibold"
            style={{ borderColor: T.THIN_LINE, background: "#fff", color: T.INK }}
          >
            Daily
            <KeyBadge action="daily" />
          </button>
          <button
            type="button"
            onClick={share}
            className="rounded-md border px-2 py-1.5 text-sm font-semibold"
            style={{ borderColor: T.THIN_LINE, background: "#fff", color: T.INK }}
          >
            {copied ? "Copied!" : "Share"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatsPanel({ app }: { app: AppState }) {
  const board = app.board;
  return (
    <div className="flex w-48 flex-col gap-3 rounded-xl p-3" style={T.cardStyle}>
      <div>
        <h2 className="mb-1 text-xs font-bold uppercase tracking-wider" style={{ color: T.INDIGO }}>
          Best times
        </h2>
        <div className="flex flex-col gap-1">
          {DIFFICULTIES.map((d) => {
            const best = app.bests[d];
            return (
              <div key={d} className="flex items-center justify-between text-sm">
                <span style={{ color: T.INK }}>{difficultyLabel(d)}</span>
                <span className="font-mono font-bold" style={{ color: best === undefined ? T.NOTE : T.INDIGO }}>
                  {best === undefined ? "—" : formatTime(best)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="border-t pt-2" style={{ borderColor: T.THIN_LINE }}>
        <h2 className="mb-1 text-xs font-bold uppercase tracking-wider" style={{ color: T.INDIGO }}>
          This puzzle
        </h2>
        <div className="flex items-center justify-between text-sm">
          <span style={{ color: T.INK }}>Filled</span>
          <span className="font-mono font-bold" style={{ color: T.INK }}>
            {filledCount(board)}/81
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span style={{ color: T.INK }}>Hints</span>
          <span className="font-mono font-bold" style={{ color: T.INK }}>
            {board.hintsUsed}
          </span>
        </div>
      </div>
    </div>
  );
}

function ControlButton({
  label,
  action,
  active,
  disabled,
  onClick,
}: {
  label: string;
  action?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex flex-1 items-center justify-center rounded-md border px-2 py-2 text-sm font-semibold transition-colors disabled:opacity-30"
      style={
        active
          ? { borderColor: T.INDIGO, background: T.INDIGO, color: "#fff" }
          : { borderColor: T.THIN_LINE, background: "#fbf8f0", color: T.INK }
      }
    >
      <span className="whitespace-nowrap">{label}</span>
      {action !== undefined ? <KeyBadge action={action} /> : null}
    </button>
  );
}

function WinBanner({ win, onAgain }: { win: WinStats; onAgain: () => void }) {
  return (
    <div
      className="flex items-center gap-3 rounded-full px-4 py-2 shadow-lg ring-1"
      style={{ background: T.INDIGO, color: "#fff" }}
    >
      <span className="text-sm font-bold">
        Solved {difficultyLabel(win.difficulty)} in {formatTime(win.seconds)}
        {win.hintsUsed > 0 ? ` · ${win.hintsUsed} hint${win.hintsUsed === 1 ? "" : "s"}` : ""}
        {win.newBest ? " · personal best!" : ""}
      </span>
      <button
        type="button"
        onClick={onAgain}
        className="flex items-center rounded-full bg-black/25 px-2.5 py-1 text-xs font-bold text-white hover:bg-black/40"
      >
        New puzzle
        <span className="ml-1 rounded bg-white/20 px-1 text-[10px] font-bold">{actionLabel(keybinds, "newGame")}</span>
      </button>
    </div>
  );
}

export function GameUI() {
  const layout = useHudLayout({ storageKey: "sudoku:hud" });
  const app = useApp();
  const { commands } = useGame();
  const { compact } = useDisplayProfile();

  if (app === undefined) return null;
  const board = app.board;
  const run = (cmd: string) => commands.run(cmd, {});
  const size = compact ? 32 : 42;
  const counts = digitCounts(board);

  return (
    <div className="absolute inset-0" style={T.pageBackdrop}>
      <HudCanvas layout={layout}>
        <HudPanel id="menu" anchor="top-left" compact="chip" chip="Menu">
          <MenuPanel app={app} run={run} />
        </HudPanel>

        <HudPanel id="stats" anchor="top-right" compact="chip" chip="Stats">
          <StatsPanel app={app} />
        </HudPanel>

        {app.win !== null && (
          <HudPanel id="win" anchor="top" order={0} compact="keep">
            <WinBanner win={app.win} onAgain={() => run("newGame")} />
          </HudPanel>
        )}

        <HudPanel id="console" anchor="center" compact="keep">
          <div className="flex flex-col gap-2.5 rounded-xl p-3" style={T.cardStyle}>
            <div className="flex items-center justify-between px-0.5 text-sm font-semibold" style={{ color: T.INK }}>
              <span>
                {difficultyLabel(board.difficulty)}
                {board.isDaily ? " · Daily" : ""}
              </span>
              <span className="font-mono text-lg font-bold tabular-nums" style={{ color: T.INDIGO }}>
                {formatTime(elapsedSeconds(board))}
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: T.NOTE }}>
                {app.settings.notesMode ? "Notes" : "Enter"}
              </span>
            </div>

            <div className="flex justify-center">
              <BoardGrid board={board} settings={app.settings} size={size} onSelect={(i) => commands.run("select", { index: i })} />
            </div>

            <NumberPad counts={counts} notesMode={app.settings.notesMode} size={size} onDigit={(d) => run(`num${d}`)} />

            <div className="flex gap-1.5">
              <ControlButton
                label={`Notes ${app.settings.notesMode ? "On" : "Off"}`}
                action="toggleNotes"
                active={app.settings.notesMode}
                onClick={() => run("toggleNotes")}
              />
              <ControlButton label="Erase" action="erase" onClick={() => run("erase")} />
              <ControlButton label={`Hint (${board.hintsUsed})`} action="hint" onClick={() => run("hint")} />
              <ControlButton label="Undo" action="undo" disabled={app.past.length === 0} onClick={() => run("undo")} />
              <ControlButton
                label={`Errors ${app.settings.showErrors ? "On" : "Off"}`}
                action="toggleErrors"
                active={app.settings.showErrors}
                onClick={() => run("toggleErrors")}
              />
            </div>
          </div>
        </HudPanel>

        <HudPanel id="credit" anchor="bottom" compact="keep" interactive={false}>
          <p
            className="rounded-full px-3 py-1 text-center text-[11px] font-medium ring-1"
            style={{ background: "#fbf8f0cc", color: T.NOTE, boxShadow: `0 0 0 1px ${T.THIN_LINE}` }}
          >
            Number Place — Howard Garns (1979); popularized as Sudoku by Nikoli
          </p>
        </HudPanel>
      </HudCanvas>
    </div>
  );
}
