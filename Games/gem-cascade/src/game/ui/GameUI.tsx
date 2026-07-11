import { useRef } from "react";

import { actionLabel } from "@jgengine/core/input/actionBindings";
import { useGame } from "@jgengine/react/hooks";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react/hudLayout";
import { SettingsTrigger } from "@jgengine/react";

import type { Cell } from "../board";
import { keybinds } from "../keybinds";
import { TIMED_SECONDS, type Mode, type Snapshot } from "../store";
import { GemJewel } from "./GemJewel";
import { useGameState } from "./useGameState";

const CREDIT = "Lineage: Shariki (Eugene Alemzhin, 1994) · Bejeweled (PopCap, 2001)";

const GC_STYLES = `
.gc-board {
  touch-action: none;
  user-select: none;
}
.gc-gem {
  position: absolute;
  transition:
    left 0.2s ease,
    top 0.26s cubic-bezier(0.34, 1.12, 0.62, 1),
    transform 0.12s ease;
  will-change: left, top;
}
.gc-gem.gc-selected {
  transform: translateY(-7%) scale(1.05);
  z-index: 6;
}
.gc-gem-inner {
  position: absolute;
  inset: 6%;
  display: flex;
  align-items: center;
  justify-content: center;
  filter: drop-shadow(0 3px 5px rgba(0, 0, 0, 0.55));
}
.gc-gem-inner.gc-drop {
  animation: gc-drop 0.36s cubic-bezier(0.28, 0.9, 0.45, 1.18);
}
.gc-gem-inner.gc-clearing {
  animation: gc-clear 0.28s ease-in forwards;
}
@keyframes gc-drop {
  0% { transform: translateY(-165%); opacity: 0; }
  55% { opacity: 1; }
  100% { transform: translateY(0); opacity: 1; }
}
@keyframes gc-clear {
  0% { transform: scale(1); filter: drop-shadow(0 0 0 rgba(255, 255, 255, 0)); }
  35% { transform: scale(1.3); filter: drop-shadow(0 0 14px rgba(255, 255, 255, 0.9)) brightness(1.7); }
  100% { transform: scale(0.08); opacity: 0; filter: drop-shadow(0 0 24px rgba(255, 255, 255, 0.75)) brightness(2); }
}
.gc-cell-hi {
  position: absolute;
  pointer-events: none;
  border-radius: 22%;
}
.gc-selected-ring {
  box-shadow:
    0 0 0 3px rgba(255, 255, 255, 0.92),
    inset 0 0 18px rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.05);
  z-index: 4;
}
.gc-hint-ring {
  z-index: 4;
  animation: gc-hint 0.85s ease-in-out infinite;
}
@keyframes gc-hint {
  0%, 100% { box-shadow: 0 0 0 2px rgba(255, 214, 102, 0.45); }
  50% {
    box-shadow:
      0 0 0 4px rgba(255, 214, 102, 0.95),
      0 0 20px rgba(255, 214, 102, 0.7);
  }
}
.gc-float {
  position: absolute;
  pointer-events: none;
  z-index: 10;
  animation: gc-float 0.95s ease-out forwards;
}
@keyframes gc-float {
  0% { opacity: 0; transform: translate(-50%, -30%) scale(0.7); }
  20% { opacity: 1; }
  100% { opacity: 0; transform: translate(-50%, -165%) scale(1.12); }
}
.gc-callout {
  position: absolute;
  pointer-events: none;
  z-index: 11;
  animation: gc-callout 1s ease-out forwards;
}
@keyframes gc-callout {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0.4) rotate(-6deg); }
  25% { opacity: 1; transform: translate(-50%, -50%) scale(1.18) rotate(2deg); }
  70% { opacity: 1; transform: translate(-50%, -78%) scale(1.05); }
  100% { opacity: 0; transform: translate(-50%, -128%) scale(1); }
}
.gc-toast {
  animation: gc-toast 2.4s ease forwards;
}
@keyframes gc-toast {
  0% { opacity: 0; transform: translateY(-10px); }
  12%, 78% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-10px); }
}
`;

function pct(i: number, size: number): string {
  return `${(i / size) * 100}%`;
}

function tierColor(tier: number): string {
  if (tier >= 4) return "#f472b6";
  if (tier === 3) return "#fb923c";
  if (tier === 2) return "#fcd34d";
  return "#e2e8f0";
}

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function BoardView({
  snap,
  onSelect,
  onSwap,
}: {
  snap: Snapshot;
  onSelect: (cell: Cell) => void;
  onSwap: (a: Cell, b: Cell) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const originRef = useRef<Cell | null>(null);
  const size = snap.size;
  const sel = snap.selected;

  const cellFromEvent = (event: { clientX: number; clientY: number }): Cell | null => {
    const el = ref.current;
    if (el === null) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * size);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * size);
    if (x < 0 || y < 0 || x >= size || y >= size) return null;
    return { x, y };
  };

  return (
    <div
      ref={ref}
      className="gc-board relative rounded-2xl border border-white/10 bg-black/55 p-0 shadow-[0_0_70px_rgba(120,60,200,0.28)]"
      style={{ width: "min(90vw, 62vh, 32rem)", aspectRatio: "1 / 1" }}
      onPointerDown={(event) => {
        if (!snap.interactive) return;
        const cell = cellFromEvent(event);
        if (cell === null) return;
        originRef.current = cell;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerUp={(event) => {
        const origin = originRef.current;
        originRef.current = null;
        if (origin === null || !snap.interactive) return;
        const target = cellFromEvent(event);
        if (target === null) {
          onSelect(origin);
          return;
        }
        if (target.x === origin.x && target.y === origin.y) {
          onSelect(origin);
          return;
        }
        if (Math.abs(target.x - origin.x) + Math.abs(target.y - origin.y) === 1) {
          onSwap(origin, target);
          return;
        }
        onSelect(target);
      }}
      onPointerCancel={() => {
        originRef.current = null;
      }}
    >
      {Array.from({ length: size * size }).map((_, i) => {
        const x = i % size;
        const y = Math.floor(i / size);
        return (
          <div
            key={`well-${i}`}
            className="absolute rounded-[22%]"
            style={{
              left: pct(x, size),
              top: pct(y, size),
              width: pct(1, size),
              height: pct(1, size),
              background: (x + y) % 2 === 0 ? "rgba(255,255,255,0.055)" : "rgba(255,255,255,0.025)",
            }}
          />
        );
      })}

      {snap.hintCells.map((c, i) => (
        <div
          key={`hint-${i}`}
          className="gc-cell-hi gc-hint-ring"
          style={{ left: pct(c.x, size), top: pct(c.y, size), width: pct(1, size), height: pct(1, size) }}
        />
      ))}

      {sel !== null && (
        <div
          className="gc-cell-hi gc-selected-ring"
          style={{ left: pct(sel.x, size), top: pct(sel.y, size), width: pct(1, size), height: pct(1, size) }}
        />
      )}

      {snap.sprites.map((s) => {
        const selected = sel !== null && sel.x === s.x && sel.y === s.y;
        return (
          <div
            key={s.id}
            className={`gc-gem${selected ? " gc-selected" : ""}`}
            style={{ left: pct(s.x, size), top: pct(s.y, size), width: pct(1, size), height: pct(1, size) }}
          >
            <div
              className={`gc-gem-inner ${s.clearing ? "gc-clearing" : "gc-drop"}`}
              style={s.clearing ? undefined : { animationDelay: `${(s.x % 4) * 30}ms` }}
            >
              <GemJewel kind={s.kind} />
            </div>
          </div>
        );
      })}

      {snap.floats.map((f) =>
        f.variant === "chain" ? (
          <div
            key={f.id}
            className="gc-callout text-2xl font-black tracking-tight sm:text-3xl"
            style={{
              left: `${((f.gx + 0.5) / size) * 100}%`,
              top: `${((f.gy + 0.5) / size) * 100}%`,
              color: tierColor(f.tier),
              textShadow: "0 2px 14px rgba(0,0,0,0.85)",
            }}
          >
            {f.text}
          </div>
        ) : (
          <div
            key={f.id}
            className="gc-float text-base font-extrabold sm:text-lg"
            style={{
              left: `${((f.gx + 0.5) / size) * 100}%`,
              top: `${((f.gy + 0.5) / size) * 100}%`,
              color: tierColor(f.tier),
              textShadow: "0 2px 8px rgba(0,0,0,0.9)",
            }}
          >
            {f.text}
          </div>
        ),
      )}
    </div>
  );
}

function ModeButton({
  label,
  hint,
  active,
  onClick,
}: {
  label: string;
  hint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-lg border px-3 py-1.5 text-sm font-bold transition-colors",
        active
          ? "border-fuchsia-300/70 bg-fuchsia-600/80 text-white shadow-lg shadow-fuchsia-950/50"
          : "border-white/15 bg-white/5 text-slate-300 hover:bg-white/10",
      ].join(" ")}
    >
      {label}
      <span className="ml-1.5 rounded bg-black/30 px-1 text-[10px] font-mono text-slate-200/80">{hint}</span>
    </button>
  );
}

function ModePanel({
  mode,
  onMode,
  onNewGame,
  newGameKey,
}: {
  mode: Mode;
  onMode: (mode: Mode) => void;
  onNewGame: () => void;
  newGameKey: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/55 px-3 py-2.5 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <span className="text-lg font-black tracking-tight text-fuchsia-200">Gem Cascade</span>
      </div>
      <div className="flex items-center gap-2">
        <ModeButton label="Endless" hint="1" active={mode === "endless"} onClick={() => onMode("endless")} />
        <ModeButton label="Timed" hint="2" active={mode === "timed"} onClick={() => onMode("timed")} />
        <button
          type="button"
          onClick={onNewGame}
          className="rounded-lg border border-amber-300/50 bg-amber-500/80 px-3 py-1.5 text-sm font-bold text-slate-950 transition-colors hover:bg-amber-400"
        >
          New
          <span className="ml-1.5 rounded bg-black/25 px-1 text-[10px] font-mono">{newGameKey}</span>
        </button>
      </div>
    </div>
  );
}

function ScorePanel({ snap }: { snap: Snapshot }) {
  const best = snap.mode === "timed" ? snap.best.timed : snap.best.endless;
  return (
    <div className="flex flex-col items-end gap-1 rounded-xl border border-white/10 bg-black/55 px-4 py-2.5 backdrop-blur-sm">
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Score</span>
      <span className="text-3xl font-black tabular-nums leading-none text-white drop-shadow">{snap.score}</span>
      <span className="text-xs font-semibold text-amber-200/90">Best {best ?? 0}</span>
    </div>
  );
}

function TimerPanel({ snap }: { snap: Snapshot }) {
  const fraction = Math.max(0, Math.min(1, snap.secondsLeft / TIMED_SECONDS));
  const low = snap.secondsLeft <= 15;
  return (
    <div className="flex w-44 flex-col items-center gap-1 rounded-xl border border-white/10 bg-black/60 px-4 py-2 backdrop-blur-sm">
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Sprint</span>
      <span
        className={[
          "text-2xl font-black tabular-nums leading-none drop-shadow",
          low ? "text-rose-300" : "text-cyan-200",
        ].join(" ")}
      >
        {formatClock(snap.secondsLeft)}
      </span>
      <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={["h-full rounded-full transition-[width] duration-500", low ? "bg-rose-400" : "bg-cyan-400"].join(" ")}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
    </div>
  );
}

function ControlsPanel({
  snap,
  onHint,
  hintKey,
}: {
  snap: Snapshot;
  onHint: () => void;
  hintKey: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/55 px-3 py-2.5 backdrop-blur-sm">
      <button
        type="button"
        onClick={onHint}
        disabled={!snap.hintReady}
        className={[
          "rounded-lg border px-3 py-1.5 text-sm font-bold transition-colors",
          snap.hintReady
            ? "border-emerald-300/60 bg-emerald-600/80 text-white hover:bg-emerald-500"
            : "cursor-not-allowed border-white/10 bg-white/5 text-slate-500",
        ].join(" ")}
      >
        {snap.hintCooldown > 0 ? `Hint ${snap.hintCooldown}s` : "Hint"}
        <span className="ml-1.5 rounded bg-black/30 px-1 text-[10px] font-mono text-slate-200/80">{hintKey}</span>
      </button>
      <div className="flex flex-col items-center">
        <span className="text-[10px] uppercase tracking-widest text-slate-400">Moves</span>
        <span className="text-lg font-black tabular-nums text-slate-100">{snap.moves}</span>
      </div>
      {snap.chain >= 2 && (
        <div className="flex flex-col items-center rounded-lg border border-fuchsia-300/40 bg-fuchsia-900/50 px-2 py-0.5">
          <span className="text-[10px] uppercase tracking-widest text-fuchsia-200/80">Chain</span>
          <span className="text-lg font-black leading-none" style={{ color: tierColor(snap.chain) }}>
            ×{snap.chain}
          </span>
        </div>
      )}
    </div>
  );
}

function Toasts({ snap }: { snap: Snapshot }) {
  if (snap.toasts.length === 0) return null;
  return (
    <div className="pointer-events-none absolute left-1/2 top-24 z-30 flex -translate-x-1/2 flex-col items-center gap-2">
      {snap.toasts.map((t) => (
        <div
          key={t.id}
          className="gc-toast rounded-full border border-amber-300/50 bg-black/80 px-4 py-1.5 text-sm font-semibold text-amber-100 shadow-xl"
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

function GameOverOverlay({ snap, onPlayAgain }: { snap: Snapshot; onPlayAgain: () => void }) {
  if (snap.status !== "gameover") return null;
  const best = snap.best.timed;
  const isBest = best !== null && snap.score >= best;
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-black/78 backdrop-blur-sm">
      <h1 className="text-5xl font-black tracking-tight text-cyan-200 drop-shadow sm:text-6xl">Time!</h1>
      <div className="flex flex-col items-center gap-1">
        <span className="text-sm uppercase tracking-widest text-slate-400">Final Score</span>
        <span className="text-6xl font-black tabular-nums text-white drop-shadow">{snap.score}</span>
        {isBest ? (
          <span className="text-sm font-bold text-amber-300">New best!</span>
        ) : (
          <span className="text-sm text-slate-300">Best {best ?? 0}</span>
        )}
        <span className="text-xs text-slate-400">Longest chain ×{snap.bestChain}</span>
      </div>
      <button
        type="button"
        onClick={onPlayAgain}
        className="rounded-lg border border-cyan-300/60 bg-cyan-600/90 px-6 py-2 text-lg font-bold text-slate-950 transition-colors hover:bg-cyan-500"
      >
        Play Again
      </button>
    </div>
  );
}

export function GameUI() {
  const snap = useGameState();
  const { commands } = useGame();
  const layout = useHudLayout({ storageKey: "gem-cascade" });

  const onSelect = (cell: Cell) => commands.run("select", { x: cell.x, y: cell.y });
  const onSwap = (a: Cell, b: Cell) =>
    commands.run("swap", { fromX: a.x, fromY: a.y, toX: b.x, toY: b.y });
  const onMode = (mode: Mode) => commands.run(mode === "timed" ? "setTimed" : "setEndless", {});
  const onHint = () => commands.run("hint", {});
  const onNewGame = () => commands.run("newGame", {});

  const hintKey = actionLabel(keybinds, "hint") ?? "H";
  const newGameKey = actionLabel(keybinds, "newGame") ?? "N";

  return (
    <HudCanvas layout={layout} className="select-none overflow-hidden text-slate-100">
      <style>{GC_STYLES}</style>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,#241a3d_0%,#140f24_45%,#07050d_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(168,85,247,0.10),transparent_60%)]" />

      <div className="absolute inset-0 flex items-center justify-center px-2 pt-16 pb-10">
        <BoardView snap={snap} onSelect={onSelect} onSwap={onSwap} />
      </div>

      <HudPanel id="mode" anchor="top-left" inset={{ x: 20, y: 18 }} compact="keep" style={{ zIndex: 20 }}>
        <ModePanel mode={snap.mode} onMode={onMode} onNewGame={onNewGame} newGameKey={newGameKey} />
      </HudPanel>

      <HudPanel id="score" anchor="top-right" inset={{ x: 20, y: 18 }} compact="keep" style={{ zIndex: 20 }}>
        <div className="flex flex-col items-end gap-2">
          <SettingsTrigger className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/55 text-slate-300 backdrop-blur-sm transition-colors hover:bg-white/10 hover:text-white" />
          <ScorePanel snap={snap} />
        </div>
      </HudPanel>

      {snap.timed && (
        <HudPanel id="timer" anchor="top" inset={{ x: 0, y: 18 }} compact="keep" style={{ zIndex: 20 }}>
          <TimerPanel snap={snap} />
        </HudPanel>
      )}

      <HudPanel id="controls" anchor="bottom-left" inset={{ x: 20, y: 44 }} compact="keep" style={{ zIndex: 20 }}>
        <ControlsPanel snap={snap} onHint={onHint} hintKey={hintKey} />
      </HudPanel>

      <HudPanel id="credit" anchor="bottom" inset={{ x: 0, y: 12 }} compact="keep" interactive={false} style={{ zIndex: 20 }}>
        <span className="rounded-full bg-black/45 px-3 py-1 text-center text-[11px] font-medium tracking-wide text-slate-400">
          {CREDIT}
        </span>
      </HudPanel>

      <Toasts snap={snap} />
      <GameOverOverlay snap={snap} onPlayAgain={onNewGame} />
    </HudCanvas>
  );
}
