import { actionLabel } from "@jgengine/core/input/actionBindings";
import { useGame, useGameStore, usePlayer } from "@jgengine/react/hooks";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react";

import { keybinds } from "../keybinds";
import { COMPANION_IDS, type Phase } from "../tuning";
import { roundSnapshot } from "../../loop";

interface Hud {
  phase: Phase;
  safeRemaining: number;
  revealed: number;
  bombs: number;
  flags: number;
  totalSafe: number;
}

function useHud(): Hud {
  return useGameStore((ctx): Hud => {
    const snap = roundSnapshot();
    const total = snap.boardN * snap.boardN;
    return {
      phase: snap.phase,
      safeRemaining: snap.safeRemaining,
      revealed: snap.revealed,
      bombs: snap.bombs,
      flags: snap.flags,
      totalSafe: total - snap.bombs,
    };
  });
}

function Kbd({ label }: { label: string }) {
  return (
    <kbd className="inline-flex min-w-[1.6rem] items-center justify-center rounded border border-amber-200/40 bg-black/40 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-100 shadow-inner">
      {label}
    </kbd>
  );
}

const CREW_DOTS = ["#f4c04e", "#2563eb", "#b45309"];
const CREW_NAMES = ["You", "Pib", "Tuck"];

function ObjectivePanel({ hud }: { hud: Hud }) {
  const cleared = hud.totalSafe - hud.safeRemaining;
  const pct = hud.totalSafe > 0 ? Math.round((cleared / hud.totalSafe) * 100) : 0;
  return (
    <div className="rounded-xl border border-amber-300/30 bg-gradient-to-b from-amber-950/85 to-stone-950/85 px-4 py-3 shadow-2xl backdrop-blur-sm">
      <p className="text-sm font-black uppercase tracking-[0.22em] text-amber-200">Mine&nbsp;Drop</p>
      <p className="mt-0.5 text-[11px] text-amber-100/60">giant minesweeper · jump a tile to dig it</p>
      <div className="mt-3 flex items-end gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-amber-100/50">Cleared</p>
          <p className="tabular-nums text-lg font-bold text-amber-100">
            {cleared}
            <span className="text-amber-100/40">/{hud.totalSafe}</span>
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-rose-200/60">Bombs</p>
          <p className="tabular-nums text-lg font-bold text-rose-300">{hud.bombs}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-amber-100/50">Flags</p>
          <p className="tabular-nums text-lg font-bold text-amber-200">{hud.flags}</p>
        </div>
      </div>
      <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-black/40">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-400 transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function CrewPanel() {
  return (
    <div className="rounded-xl border border-amber-300/25 bg-stone-950/80 px-4 py-3 shadow-xl backdrop-blur-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-100/60">Your crew</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {CREW_NAMES.map((name, i) => (
          <li key={COMPANION_IDS[i - 1] ?? name} className="flex items-center gap-2 text-sm text-amber-50">
            <span
              className="h-2.5 w-2.5 rounded-full ring-2 ring-black/40"
              style={{ backgroundColor: CREW_DOTS[i] }}
            />
            {name}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] text-amber-100/40">Friends who join share this board.</p>
    </div>
  );
}

function Banner({ hud }: { hud: Hud }) {
  if (hud.phase === "falling") {
    return (
      <span className="rounded-full bg-black/55 px-6 py-2 text-2xl font-black uppercase tracking-[0.3em] text-sky-200 drop-shadow-[0_3px_12px_rgba(0,0,0,0.9)]">
        Falling&hellip;
      </span>
    );
  }
  if (hud.phase === "revealing") {
    return (
      <span className="rounded-full border border-emerald-300/50 bg-emerald-950/70 px-6 py-2 text-2xl font-black uppercase tracking-[0.25em] text-emerald-200 shadow-2xl">
        Safe! Climb back up
      </span>
    );
  }
  if (hud.phase === "ready") {
    const jump = actionLabel(keybinds, "jump") ?? "Space";
    return (
      <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-amber-300/20 bg-black/45 px-6 py-3 backdrop-blur-sm">
        <p className="text-sm font-semibold text-amber-100">Stand on a covered tile with your crew.</p>
        <p className="flex items-center gap-2 text-xs text-amber-100/70">
          Press <Kbd label={jump} /> to dig it &mdash; everyone drops together.
        </p>
      </div>
    );
  }
  return null;
}

function ControlBar() {
  return (
    <div className="flex items-center gap-3 rounded-full border border-amber-200/15 bg-black/50 px-4 py-1.5 text-[11px] text-amber-100/75 shadow-lg backdrop-blur-sm">
      <span className="flex items-center gap-1.5">
        <Kbd label={actionLabel(keybinds, "jump") ?? "Space"} /> dig / jump
      </span>
      <span className="flex items-center gap-1.5">
        <Kbd label={actionLabel(keybinds, "flag") ?? "Q"} /> flag
      </span>
      <span className="text-amber-100/40">WASD move · drag to look</span>
    </div>
  );
}

function EndOverlay({ hud }: { hud: Hud }) {
  const { commands } = useGame();
  if (hud.phase !== "boom" && hud.phase !== "win") return null;
  const won = hud.phase === "win";
  const restart = actionLabel(keybinds, "restart") ?? "R";
  return (
    <div
      className={`pointer-events-auto absolute inset-0 z-40 flex flex-col items-center justify-center backdrop-blur-sm ${
        won ? "bg-emerald-950/55" : "bg-rose-950/60"
      }`}
    >
      <span
        className={`text-7xl font-black uppercase tracking-[0.18em] drop-shadow-[0_4px_18px_rgba(0,0,0,0.95)] ${
          won ? "text-emerald-300" : "text-rose-400"
        }`}
      >
        {won ? "Board Cleared!" : "💥 Boom"}
      </span>
      <p className="mt-3 max-w-md text-center text-base text-white/80">
        {won
          ? "Every safe tile uncovered. The minefield is beaten."
          : "You dug a bomb. The board blows and the crew is flung across the living room."}
      </p>
      <button
        type="button"
        onClick={() => commands.run("restart", {})}
        className="mt-6 inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-6 py-2 text-sm font-bold uppercase tracking-wide text-white transition hover:bg-white/20"
      >
        New Board
        <Kbd label={restart} />
      </button>
    </div>
  );
}

export function GameUI() {
  usePlayer();
  const hud = useHud();
  const layout = useHudLayout({ storageKey: "mine-drop" });
  return (
    <HudCanvas layout={layout} className="z-20 font-sans text-white">
      <HudPanel id="objective-panel" anchor="top-left" inset={{ x: 16, y: 16 }}>
        <ObjectivePanel hud={hud} />
      </HudPanel>
      <HudPanel id="crew-panel" anchor="top-right" inset={{ x: 16, y: 16 }}>
        <CrewPanel />
      </HudPanel>
      <div className="absolute inset-x-0 top-[22%] flex justify-center px-4 text-center">
        <Banner hud={hud} />
      </div>
      <HudPanel id="control-bar" anchor="bottom" inset={{ x: 0, y: 24 }}>
        <ControlBar />
      </HudPanel>
      <EndOverlay hud={hud} />
    </HudCanvas>
  );
}
