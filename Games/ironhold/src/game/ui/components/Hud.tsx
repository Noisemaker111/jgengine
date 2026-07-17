import { useSyncExternalStore } from "react";
import { useGame } from "@jgengine/react/hooks";

import { hudStore, type HudSnapshot } from "../../hudStore";
import { FOOTMAN_COST } from "../../tuning";

function useHud(): HudSnapshot {
  return useSyncExternalStore(hudStore.subscribe, hudStore.get, hudStore.get);
}

function KeepBar({ label, hp, max, tone }: { label: string; hp: number; max: number; tone: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-300">
        <span>{label}</span>
        <span>{hp}</span>
      </div>
      <div className="h-2 w-36 overflow-hidden rounded-full bg-slate-800/80 ring-1 ring-black/40">
        <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${pct * 100}%`, background: tone }} />
      </div>
    </div>
  );
}

function TopBar() {
  const hud = useHud();
  return (
    <div className="pointer-events-none absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-5 rounded-xl border border-slate-500/40 bg-slate-900/80 px-5 py-2.5 font-sans text-slate-100 shadow-lg backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <span className="text-lg">🪙</span>
        <span className="min-w-[3ch] text-lg font-bold tabular-nums text-amber-300">{hud.gold}</span>
      </div>
      <div className="h-8 w-px bg-slate-600/60" />
      <KeepBar label="Enemy Warcamp" hp={hud.enemyKeepHp} max={hud.enemyKeepMax} tone="#ef5a3d" />
      <KeepBar label="Ironhold Keep" hp={hud.playerKeepHp} max={hud.playerKeepMax} tone="#4c8dff" />
      <div className="h-8 w-px bg-slate-600/60" />
      <div className="flex gap-3 text-xs text-slate-300">
        <span>⚔ {hud.playerUnits}</span>
        <span className="text-rose-300">☠ {hud.enemyUnits}</span>
      </div>
    </div>
  );
}

function CommandBar() {
  const hud = useHud();
  const { commands } = useGame();
  const canTrain = hud.phase === "playing" && hud.gold >= FOOTMAN_COST;
  return (
    <div className="pointer-events-auto absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-stretch gap-2 rounded-xl border border-slate-500/40 bg-slate-900/80 p-2 font-sans text-slate-100 shadow-xl backdrop-blur-sm">
      <button
        type="button"
        disabled={!canTrain}
        onClick={() => commands.run("train.footman", {})}
        className={
          "flex w-32 flex-col items-start rounded-lg px-3 py-2 text-left transition " +
          (canTrain ? "bg-blue-600/80 hover:bg-blue-500" : "cursor-not-allowed bg-slate-700/60 text-slate-400")
        }
      >
        <span className="text-sm font-bold">Train Footman</span>
        <span className="text-[11px] opacity-80">🪙 {FOOTMAN_COST} · [F]</span>
      </button>
      <button
        type="button"
        disabled={hud.phase !== "playing"}
        onClick={() => commands.run("unit.attackMove", {})}
        className={
          "flex w-32 flex-col items-start rounded-lg px-3 py-2 text-left transition " +
          (hud.attackMoveArmed ? "bg-amber-500 text-slate-900" : "bg-slate-700/70 hover:bg-slate-600")
        }
      >
        <span className="text-sm font-bold">Attack-Move</span>
        <span className="text-[11px] opacity-80">{hud.attackMoveArmed ? "armed — right-click" : "arm · [A]"}</span>
      </button>
    </div>
  );
}

function ControlsHint() {
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-20 max-w-[15rem] rounded-lg border border-slate-500/30 bg-slate-900/70 px-3 py-2 font-sans text-[11px] leading-relaxed text-slate-300 shadow backdrop-blur-sm">
      <div className="mb-1 font-semibold text-slate-100">Command your Vanguard</div>
      <div>Drag to box-select · left-click a unit</div>
      <div>Right-click ground to move, an enemy to attack</div>
      <div>Raze the Marauder Warcamp to win</div>
      <div className="mt-1 border-t border-slate-500/20 pt-1 text-[10px] text-slate-400">
        A Warcraft III homage · art: KayKit &amp; Quaternius (CC0)
      </div>
    </div>
  );
}

function EndOverlay() {
  const hud = useHud();
  if (hud.phase === "playing") return null;
  const won = hud.phase === "won";
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
      <div
        className={
          "rounded-2xl border px-12 py-8 text-center font-sans shadow-2xl backdrop-blur-sm " +
          (won ? "border-emerald-400/50 bg-emerald-700/85 text-white" : "border-rose-400/50 bg-rose-800/85 text-white")
        }
      >
        <div className="text-4xl font-black tracking-tight">{won ? "Victory" : "Defeat"}</div>
        <div className="mt-2 text-sm opacity-90">
          {won ? "The Marauder Warcamp lies in ruins." : "Ironhold Keep has fallen."}
        </div>
      </div>
    </div>
  );
}

export function RtsHud() {
  return (
    <>
      <TopBar />
      <CommandBar />
      <ControlsHint />
      <EndOverlay />
    </>
  );
}
