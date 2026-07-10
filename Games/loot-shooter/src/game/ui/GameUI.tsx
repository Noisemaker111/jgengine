import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react";
import { DeathScreen, LevelUpFlash, ToastStack } from "@jgengine/react/components";
import { HealthFrame } from "./components/HealthFrame";
import { Hotbar } from "./components/Hotbar";

export function GameUI() {
  const layout = useHudLayout({ storageKey: "loot-shooter" });
  return (
    <HudCanvas layout={layout} className="z-20 font-sans text-slate-100">
      <HudPanel id="loot-toasts" anchor="top-right" inset={{ x: 16, y: 16 }} className="flex flex-col items-end gap-1.5">
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
      </HudPanel>

      <HudPanel id="health-frame" anchor="bottom-left" inset={{ x: 16, y: 16 }}>
        <HealthFrame />
      </HudPanel>

      <HudPanel id="hotbar" anchor="bottom" inset={{ x: 0, y: 24 }}>
        <Hotbar />
      </HudPanel>

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
    </HudCanvas>
  );
}
