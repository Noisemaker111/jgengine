import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { useEntityStat } from "@jgengine/react/hooks";
import { useGame } from "@jgengine/react/hooks";

import { hudStore, type HudSnapshot } from "../../hudStore";
import { BARRACKS_UNITS, BUILDINGS, COMBATANTS, TRAINABLE } from "../../catalog";
import { Minimap } from "./Minimap";

const BUILD_LABELS: Record<string, string> = { barracks: "Barracks", farm: "Farm", guard_tower: "Guard Tower" };

function useHud(): HudSnapshot {
  return useSyncExternalStore(hudStore.subscribe, hudStore.get, hudStore.get);
}

const PANEL = "border border-amber-800/50 bg-gradient-to-b from-slate-800/95 to-slate-950/95 shadow-[0_2px_10px_rgba(0,0,0,0.5)] backdrop-blur-sm";

function Meter({ value, max, tone }: { value: number; max: number; tone: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-black/60 ring-1 ring-black/50">
      <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${pct * 100}%`, background: tone }} />
    </div>
  );
}

function Resource({ icon, value, tone }: { icon: string; value: string; tone: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-base">{icon}</span>
      <span className={"min-w-[2.5ch] text-base font-bold tabular-nums " + tone}>{value}</span>
    </div>
  );
}

/** Slim top strip: gold · lumber · food, both keeps' vitals, and the live head-count. */
function TopStrip() {
  const hud = useHud();
  const foodTone = hud.foodUsed >= hud.foodCap ? "text-rose-300" : "text-emerald-200";
  return (
    <div className={"pointer-events-none absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-4 rounded-lg px-4 py-2 font-sans text-slate-100 " + PANEL}>
      <Resource icon="🪙" value={String(hud.gold)} tone="text-amber-300" />
      <Resource icon="🪵" value={String(hud.lumber)} tone="text-orange-200" />
      <Resource icon="🍖" value={`${hud.foodUsed}/${hud.foodCap}`} tone={foodTone} />
      <div className="h-7 w-px bg-amber-800/40" />
      <div className="flex w-36 flex-col gap-0.5">
        <div className="flex justify-between text-[10px] font-semibold uppercase tracking-wide text-rose-300"><span>Warcamp</span><span>{hud.enemyKeepHp}</span></div>
        <Meter value={hud.enemyKeepHp} max={hud.enemyKeepMax} tone="#ef5a3d" />
      </div>
      <div className="flex w-36 flex-col gap-0.5">
        <div className="flex justify-between text-[10px] font-semibold uppercase tracking-wide text-sky-300"><span>Ironhold</span><span>{hud.playerKeepHp}</span></div>
        <Meter value={hud.playerKeepHp} max={hud.playerKeepMax} tone="#4c8dff" />
      </div>
      <div className="h-7 w-px bg-amber-800/40" />
      <div className="flex gap-2 text-xs"><span className="text-sky-200">⚔ {hud.playerUnits}</span><span className="text-rose-300">☠ {hud.enemyUnits}</span></div>
    </div>
  );
}

function ConsoleButton({ label, sub, active, disabled, onClick }: { label: string; sub: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  const tone = disabled
    ? "cursor-not-allowed border-slate-700 bg-slate-800/60 text-slate-500"
    : active
      ? "border-amber-400 bg-amber-500/90 text-slate-900"
      : "border-amber-700/60 bg-slate-700/80 text-slate-100 hover:bg-slate-600/80";
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={"flex h-16 w-24 flex-col items-start justify-between rounded-md border-2 px-2 py-1.5 text-left transition " + tone}>
      <span className="text-xs font-bold leading-tight">{label}</span>
      <span className="text-[10px] opacity-80">{sub}</span>
    </button>
  );
}

function HeroPortrait() {
  const hp = useEntityStat("hero", "health");
  const alive = hp !== null && hp.current > 0;
  return (
    <div className="flex items-center gap-3">
      <div className={"flex h-16 w-16 items-center justify-center rounded-md border-2 " + (alive ? "border-amber-500/80 bg-gradient-to-b from-amber-700/40 to-slate-900/80" : "border-slate-700 bg-slate-900/80 grayscale")}>
        <span className="text-3xl">{alive ? "🛡️" : "💀"}</span>
      </div>
      <div className="flex w-32 flex-col gap-1">
        <span className="text-sm font-bold text-amber-200">Bram the Bold</span>
        <span className="text-[10px] uppercase tracking-wide text-slate-400">Vanguard Hero</span>
        {hp !== null ? <Meter value={hp.current} max={hp.max} tone="#46c85a" /> : null}
      </div>
    </div>
  );
}

function cost(gold?: number, lumber?: number): string {
  return [gold ? `🪙${gold}` : "", lumber ? `🪵${lumber}` : ""].filter(Boolean).join(" ");
}

function affordable(hud: HudSnapshot, unitId: string): boolean {
  const t = TRAINABLE[unitId];
  if (t === undefined || hud.phase !== "playing") return false;
  if (BARRACKS_UNITS.has(unitId) && !hud.hasBarracks) return false;
  if ((t.cost.gold ?? 0) > hud.gold) return false;
  if ((t.cost.lumber ?? 0) > hud.lumber) return false;
  return hud.foodUsed + (COMBATANTS[unitId]?.food ?? 0) <= hud.foodCap;
}

function buildAffordable(hud: HudSnapshot, type: string): boolean {
  const b = BUILDINGS[type];
  if (b === undefined || hud.phase !== "playing") return false;
  return (b.cost.gold ?? 0) <= hud.gold && (b.cost.lumber ?? 0) <= hud.lumber;
}

function costLabel(unitId: string): string {
  return cost(TRAINABLE[unitId]?.cost.gold, TRAINABLE[unitId]?.cost.lumber);
}

/** WC3-style bottom console: framed minimap · commander portrait · command card. */
function CommandConsole() {
  const hud = useHud();
  const { commands } = useGame();
  return (
    <div className={"pointer-events-auto absolute bottom-0 left-1/2 z-20 flex -translate-x-1/2 items-stretch gap-3 rounded-t-xl border-x-2 border-t-2 px-4 py-3 font-sans " + PANEL}>
      <div className="flex flex-col gap-1">
        <div className="rounded-md border border-amber-800/50 bg-black/40 p-1">
          <Minimap />
        </div>
        {hud.producing > 0 ? (
          <div className="flex items-center gap-2 px-1 text-[10px] text-amber-200">
            <span>Training ×{hud.producing}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/50">
              <div className="h-full bg-amber-400" style={{ width: `${Math.round(hud.trainProgress * 100)}%` }} />
            </div>
          </div>
        ) : null}
      </div>
      <div className="w-px bg-amber-800/40" />
      <div className="flex flex-col justify-center">
        <HeroPortrait />
      </div>
      <div className="w-px bg-amber-800/40" />
      <div className="flex flex-col justify-center gap-2">
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-amber-500/80">Train</div>
          <div className="flex gap-2">
            <ConsoleButton label="Peasant" sub={`${costLabel("peasant")} · gather`} disabled={!affordable(hud, "peasant")} onClick={() => commands.run("train.peasant", {})} />
            <ConsoleButton label="Footman" sub={hud.hasBarracks ? costLabel("footman") : "needs Barracks"} disabled={!affordable(hud, "footman")} onClick={() => commands.run("train.footman", {})} />
            <ConsoleButton label="Rifleman" sub={hud.hasBarracks ? costLabel("rifleman") : "needs Barracks"} disabled={!affordable(hud, "rifleman")} onClick={() => commands.run("train.rifleman", {})} />
            <ConsoleButton label="Attack-Move" sub={hud.attackMoveArmed ? "armed · RMB" : "arm · A"} active={hud.attackMoveArmed} disabled={hud.phase !== "playing"} onClick={() => commands.run("unit.attackMove", {})} />
          </div>
        </div>
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-amber-500/80">Build</div>
          <div className="flex gap-2">
            <ConsoleButton label="Barracks" sub={cost(BUILDINGS.barracks!.cost.gold, BUILDINGS.barracks!.cost.lumber)} active={hud.buildArmed === "barracks"} disabled={!buildAffordable(hud, "barracks")} onClick={() => commands.run("build.arm", { type: "barracks" })} />
            <ConsoleButton label="Farm +food" sub={cost(BUILDINGS.farm!.cost.gold, BUILDINGS.farm!.cost.lumber)} active={hud.buildArmed === "farm"} disabled={!buildAffordable(hud, "farm")} onClick={() => commands.run("build.arm", { type: "farm" })} />
            <ConsoleButton label="Guard Tower" sub={cost(BUILDINGS.guard_tower!.cost.gold, BUILDINGS.guard_tower!.cost.lumber)} active={hud.buildArmed === "guard_tower"} disabled={!buildAffordable(hud, "guard_tower")} onClick={() => commands.run("build.arm", { type: "guard_tower" })} />
          </div>
        </div>
      </div>
      {hud.buildArmed !== null ? (
        <div className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-amber-500/60 bg-amber-500/90 px-3 py-1 text-xs font-bold text-slate-900">
          Right-click a spot on your side to place the {BUILD_LABELS[hud.buildArmed] ?? "building"}
        </div>
      ) : null}
    </div>
  );
}

function ControlsHint() {
  return (
    <div className={"pointer-events-none absolute left-3 top-3 z-20 max-w-[15rem] rounded-lg px-3 py-2 font-sans text-[11px] leading-relaxed text-slate-300 " + PANEL}>
      <div className="mb-1 font-semibold text-amber-200">Command your Vanguard</div>
      <div>Drag to box-select · left-click a unit</div>
      <div>Right-click ground to move, an enemy to attack</div>
      <div>Raze the Marauder Warcamp to win</div>
      <div className="mt-1 border-t border-amber-800/30 pt-1 text-[10px] text-slate-400">A Warcraft III homage · art: KayKit &amp; Quaternius (CC0)</div>
    </div>
  );
}

function EndOverlay() {
  const hud = useHud();
  if (hud.phase === "playing") return null;
  const won = hud.phase === "won";
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
      <div className={"rounded-2xl border-2 px-12 py-8 text-center font-sans shadow-2xl backdrop-blur-sm " + (won ? "border-emerald-400/60 bg-emerald-800/85 text-white" : "border-rose-400/60 bg-rose-900/85 text-white")}>
        <div className="text-4xl font-black tracking-tight">{won ? "Victory" : "Defeat"}</div>
        <div className="mt-2 text-sm opacity-90">{won ? "The Marauder Warcamp lies in ruins." : "Ironhold Keep has fallen."}</div>
      </div>
    </div>
  );
}

export function RtsHud(): ReactNode {
  return (
    <>
      <TopStrip />
      <ControlsHint />
      <CommandConsole />
      <EndOverlay />
    </>
  );
}
