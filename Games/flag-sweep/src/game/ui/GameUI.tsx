import { useState } from "react";

import { actionLabel } from "@jgengine/core/input/actionBindings";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react/hudLayout";
import { useGame } from "@jgengine/react/hooks";
import { useDisplayProfile } from "@jgengine/react/display";

import {
  DIFFICULTIES,
  elapsedSeconds,
  minesRemaining,
  type Board,
  type Difficulty,
  type StandardDifficulty,
} from "../board";
import { keybinds } from "../keybinds";
import type { AppState, GameResult } from "../state";
import { shareUrl } from "../seedShare";
import { BoardGrid } from "./components/Board";
import { ConsoleBar } from "./components/ConsoleBar";
import type { FaceMood } from "./icons";
import { boardFrame } from "./theme";
import { useApp } from "./useApp";

const STANDARD: { id: StandardDifficulty; label: string; command: string; badge: string }[] = [
  { id: "beginner", label: "Beginner", command: "difficultyBeginner", badge: "difficultyBeginner" },
  { id: "intermediate", label: "Intermediate", command: "difficultyIntermediate", badge: "difficultyIntermediate" },
  { id: "expert", label: "Expert", command: "difficultyExpert", badge: "difficultyExpert" },
];

function tileSize(board: Board, compact: boolean): number {
  if (board.cols > 16) return compact ? 16 : 26;
  return compact ? 24 : 30;
}

function faceMood(board: Board, pressing: boolean): FaceMood {
  if (board.status === "won") return "cool";
  if (board.status === "lost") return "dead";
  if (pressing && (board.status === "playing" || board.status === "ready")) return "worried";
  return "smile";
}

function KeyBadge({ action }: { action: string }) {
  const label = actionLabel(keybinds, action);
  if (label === null) return null;
  return (
    <span className="ml-1 rounded bg-black/30 px-1 text-[10px] font-bold leading-tight text-slate-200 ring-1 ring-white/10">
      {label}
    </span>
  );
}

function DifficultyRow({ board, run }: { board: Board; run: (command: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      {STANDARD.map((entry) => {
        const active = board.difficulty === entry.id;
        const config = DIFFICULTIES[entry.id];
        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => run(entry.command)}
            className={`flex items-center justify-between rounded-md border px-2.5 py-1.5 text-left transition-colors ${
              active
                ? "border-rose-400/70 bg-rose-500/15 text-rose-50"
                : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
            }`}
          >
            <span className="flex items-center text-sm font-semibold">
              {entry.label}
              <KeyBadge action={entry.badge} />
            </span>
            <span className="font-mono text-[11px] text-slate-400">
              {config.cols}×{config.rows}·{config.mines}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function CustomForm({ board, run }: { board: Board; run: (command: string, input: unknown) => void }) {
  const [open, setOpen] = useState(board.difficulty === "custom");
  const [cols, setCols] = useState(String(board.difficulty === "custom" ? board.cols : 16));
  const [rows, setRows] = useState(String(board.difficulty === "custom" ? board.rows : 16));
  const [mines, setMines] = useState(String(board.difficulty === "custom" ? board.mines : 40));

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full rounded-md border px-2.5 py-1.5 text-sm font-semibold transition-colors ${
          board.difficulty === "custom"
            ? "border-rose-400/70 bg-rose-500/15 text-rose-50"
            : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
        }`}
      >
        Custom {open ? "▴" : "▾"}
      </button>
      {open && (
        <form
          className="mt-1.5 grid grid-cols-3 gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            run("custom", { cols: Number(cols), rows: Number(rows), mines: Number(mines) });
          }}
        >
          <Field label="Cols" value={cols} onChange={setCols} />
          <Field label="Rows" value={rows} onChange={setRows} />
          <Field label="Mines" value={mines} onChange={setMines} />
          <button
            type="submit"
            className="col-span-3 rounded-md bg-sky-500/80 px-2 py-1 text-sm font-semibold text-white hover:bg-sky-500"
          >
            Start custom
          </button>
        </form>
      )}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
      {label}
      <input
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/[^0-9]/g, ""))}
        className="w-full rounded border border-white/10 bg-slate-950/60 px-1.5 py-1 text-center font-mono text-sm text-slate-100 focus:border-sky-400 focus:outline-none"
      />
    </label>
  );
}

function BestTimes({ bests }: { bests: Partial<Record<StandardDifficulty, number>> }) {
  return (
    <div className="flex flex-col gap-1">
      {STANDARD.map((entry) => {
        const best = bests[entry.id];
        return (
          <div key={entry.id} className="flex items-center justify-between text-sm">
            <span className="text-slate-300">{entry.label}</span>
            <span className="font-mono font-bold text-amber-300">{best === undefined ? "—" : `${best}s`}</span>
          </div>
        );
      })}
    </div>
  );
}

function RecordsPanel({
  app,
  run,
}: {
  app: AppState;
  run: (command: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const board = app.board;

  const share = () => {
    const url = shareUrl(board.seed, board.difficulty, { cols: board.cols, rows: board.rows, mines: board.mines });
    if (typeof navigator !== "undefined" && navigator.clipboard !== undefined) {
      void navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      });
    }
  };

  return (
    <div className="flex w-52 flex-col gap-3">
      <div>
        <h2 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">Best times</h2>
        <BestTimes bests={app.bests} />
      </div>
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => run("daily")}
          className="flex items-center justify-center rounded-md border border-emerald-400/40 bg-emerald-500/15 px-2 py-1.5 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/25"
        >
          Daily board
          <KeyBadge action="daily" />
        </button>
        <button
          type="button"
          onClick={share}
          className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm font-semibold text-slate-200 hover:bg-white/10"
        >
          {copied ? "Link copied!" : "Share seed"}
        </button>
        <button
          type="button"
          onClick={() => run("toggleQuestions")}
          className="flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm font-semibold text-slate-200 hover:bg-white/10"
        >
          <span className="flex items-center">
            Question marks
            <KeyBadge action="toggleQuestions" />
          </span>
          <span className={app.settings.questionsEnabled ? "text-emerald-300" : "text-slate-500"}>
            {app.settings.questionsEnabled ? "On" : "Off"}
          </span>
        </button>
      </div>
    </div>
  );
}

function ResultBanner({ result, onAgain }: { result: GameResult; onAgain: () => void }) {
  const won = result.won;
  return (
    <div
      className={`flex items-center gap-3 rounded-full px-4 py-2 shadow-lg ring-1 ${
        won ? "bg-emerald-600/90 ring-emerald-300/40" : "bg-rose-700/90 ring-rose-300/40"
      }`}
    >
      <span className="text-sm font-bold text-white">
        {won ? `Swept in ${result.seconds}s` : "Detonated"}
        {won && result.newBest ? " — personal best!" : ""}
      </span>
      <button
        type="button"
        onClick={onAgain}
        className="flex items-center rounded-full bg-black/25 px-2.5 py-1 text-xs font-bold text-white hover:bg-black/40"
      >
        Again
        <KeyBadge action="newGame" />
      </button>
    </div>
  );
}

function difficultyName(difficulty: Difficulty): string {
  return difficulty === "custom" ? "Custom" : difficulty[0]!.toUpperCase() + difficulty.slice(1);
}

export function GameUI() {
  const layout = useHudLayout({ storageKey: "flag-sweep:hud" });
  const app = useApp();
  const { commands } = useGame();
  const { compact } = useDisplayProfile();
  const [pressing, setPressing] = useState(false);

  if (app === undefined) return null;
  const board = app.board;
  const run = (command: string) => commands.run(command, {});
  const runInput = (command: string, input: unknown) => commands.run(command, input);
  const size = tileSize(board, compact);

  return (
    <HudCanvas layout={layout} className="text-slate-100">
      <HudPanel id="menu" anchor="top-left" compact="chip" chip="Menu">
        <div className="flex w-56 flex-col gap-3 rounded-xl border border-white/10 bg-slate-900/85 p-3 shadow-xl backdrop-blur">
          <div>
            <h1 className="text-lg font-black tracking-tight text-slate-50">Flag Sweep</h1>
            <p className="text-[11px] font-medium uppercase tracking-wider text-rose-300/80">Classic mine hunt</p>
          </div>
          <DifficultyRow board={board} run={run} />
          <CustomForm board={board} run={runInput} />
          <button
            type="button"
            onClick={() => run("newGame")}
            className="flex items-center justify-center rounded-md bg-slate-100 px-2 py-1.5 text-sm font-bold text-slate-900 hover:bg-white"
          >
            New game
            <span className="ml-1 rounded bg-slate-800 px-1 text-[10px] font-bold text-slate-100">
              {actionLabel(keybinds, "newGame")}
            </span>
          </button>
        </div>
      </HudPanel>

      <HudPanel id="records" anchor="top-right" compact="chip" chip="Records">
        <div className="rounded-xl border border-white/10 bg-slate-900/85 p-3 shadow-xl backdrop-blur">
          <RecordsPanel app={app} run={run} />
        </div>
      </HudPanel>

      {app.result !== null && (
        <HudPanel id="result" anchor="top" order={0} compact="keep">
          <ResultBanner result={app.result} onAgain={() => run("newGame")} />
        </HudPanel>
      )}

      <HudPanel id="console" anchor="center" compact="keep">
        <div className="rounded-xl p-3" style={boardFrame}>
          <div className="mb-1 flex items-center justify-between px-1 text-[11px] font-semibold text-slate-600">
            <span>
              {difficultyName(board.difficulty)}
              {board.isDaily ? " · Daily" : ""}
            </span>
            <span className="font-mono">{board.cols}×{board.rows}</span>
          </div>
          <ConsoleBar
            minesRemaining={minesRemaining(board)}
            seconds={elapsedSeconds(board)}
            mood={faceMood(board, pressing)}
            onReset={() => run("newGame")}
            resetKey={actionLabel(keybinds, "newGame")}
          />
          <div className="max-h-[62vh] max-w-[92vw] overflow-auto rounded">
            <BoardGrid board={board} size={size} onPressChange={setPressing} />
          </div>
        </div>
      </HudPanel>

      <HudPanel id="credit" anchor="bottom" compact="keep" interactive={false}>
        <p className="rounded-full bg-slate-950/70 px-3 py-1 text-center text-[11px] font-medium text-slate-400 ring-1 ring-white/5">
          Lineage: Microsoft Minesweeper — Robert Donner &amp; Curt Johnson (1990)
        </p>
      </HudPanel>
    </HudCanvas>
  );
}
