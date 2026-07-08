import { DeathScreen, LevelUpFlash, ToastStack } from "@jgengine/react/components";
import { HealthFrame } from "./components/HealthFrame";
import { Hotbar } from "./components/Hotbar";

export function GameUI() {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 grid h-full w-full grid-cols-[minmax(0,18rem)_1fr_minmax(0,18rem)] grid-rows-[auto_1fr_auto] gap-3 p-4 font-sans text-slate-100">
      <div className="col-start-3 row-start-1 flex flex-col items-end gap-1.5 justify-self-end">
        <ToastStack
          action="loot.granted"
          className="flex flex-col items-end gap-1.5"
          renderToast={(entry) => {
            const data = entry.data as { drops?: { item?: string; currency?: string; count: number }[] };
            const text = (data.drops ?? [])
              .map((drop) => `+${drop.count} ${drop.item ?? drop.currency ?? "loot"}`)
              .join("   ");
            return (
              <div className="rounded border border-amber-400/50 bg-slate-950/85 px-3 py-1.5 text-sm font-semibold text-amber-200 shadow-lg backdrop-blur-sm">
                {text}
              </div>
            );
          }}
        />
      </div>

      <div className="col-start-1 row-start-3 justify-self-start self-end">
        <HealthFrame />
      </div>

      <div className="col-start-2 row-start-3 justify-self-center self-end pb-2">
        <Hotbar />
      </div>

      <LevelUpFlash className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
        <span className="rounded-lg border border-amber-300/60 bg-slate-950/70 px-8 py-4 text-4xl font-black uppercase tracking-widest text-amber-200 shadow-2xl drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
          Level Up
        </span>
      </LevelUpFlash>

      <DeathScreen className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
        <span className="text-6xl font-black uppercase tracking-widest text-rose-500 drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)]">
          You Died
        </span>
        <span className="mt-3 text-lg font-medium text-slate-300">Respawning…</span>
      </DeathScreen>
    </div>
  );
}
