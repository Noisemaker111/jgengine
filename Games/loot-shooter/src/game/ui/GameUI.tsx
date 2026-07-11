import { HudCanvas, HudPanel, SettingsTrigger, useHudLayout } from "@jgengine/react";
import { LevelUpFlash, ToastStack } from "@jgengine/react/components";
import { itemNameById } from "../content";
import { AmmoPanel } from "./components/AmmoPanel";
import { ChallengeTracker } from "./components/ChallengeTracker";
import { GearRow } from "./components/GearRow";
import { ShopPanel } from "./components/ShopPanel";
import { HealthFrame } from "./components/HealthFrame";
import { Hotbar } from "./components/Hotbar";
import { KillFeed } from "./components/KillFeed";
import { PickupPrompt } from "./components/PickupPrompt";
import { ScorePanel } from "./components/ScorePanel";
import { RunScreens } from "./components/Screens";
import { IntermissionBanner, WaveStatus } from "./components/WaveStatus";

export function GameUI() {
  const layout = useHudLayout({ storageKey: "loot-shooter" });
  return (
    <HudCanvas layout={layout} className="z-20 font-sans text-slate-100">
      <HudPanel id="wave-status" anchor="top" compact="keep" interactive={false}>
        <WaveStatus />
      </HudPanel>

      <HudPanel id="settings" anchor="top-right" order={-1} compact="keep" interactive={false}>
        <SettingsTrigger className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-md border border-slate-600/50 bg-slate-950/70 text-base text-slate-300 transition hover:bg-slate-800/80 hover:text-cyan-100" />
      </HudPanel>

      <HudPanel id="score" anchor="top-right" order={0} compact="keep" interactive={false}>
        <ScorePanel />
      </HudPanel>

      <HudPanel id="loot-toasts" anchor="top-right" order={1} compact="hide" interactive={false}>
        <ToastStack
          action="loot.granted"
          className="flex flex-col items-end gap-1.5"
          renderToast={(entry) => {
            const data = entry.data as { drops?: { item?: string; currency?: string; count: number }[] };
            const text = (data.drops ?? [])
              .map((drop) => `+${drop.count} ${drop.item !== undefined ? itemNameById(drop.item) : (drop.currency ?? "loot")}`)
              .join("   ");
            if (text === "") return null;
            return (
              <div className="rounded-sm bg-black/60 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-amber-200">
                {text}
              </div>
            );
          }}
        />
      </HudPanel>

      <HudPanel id="kill-feed" anchor="right" compact="hide" interactive={false}>
        <KillFeed />
      </HudPanel>

      <HudPanel id="challenges" anchor="left" compact="hide" interactive={false}>
        <ChallengeTracker />
      </HudPanel>

      <HudPanel id="health" anchor="bottom-left" order={0} compact="keep" interactive={false}>
        <HealthFrame />
      </HudPanel>

      <HudPanel id="gear" anchor="bottom-left" order={1} compact="chip" chip="Gear" interactive={false}>
        <GearRow />
      </HudPanel>

      <HudPanel id="pickup" anchor="bottom" order={1} compact="keep" interactive={false}>
        <PickupPrompt />
      </HudPanel>

      <HudPanel id="hotbar" anchor="bottom" order={0} compact="keep" interactive={false}>
        <Hotbar />
      </HudPanel>

      <HudPanel id="ammo" anchor="bottom-right" compact="keep" interactive={false}>
        <AmmoPanel />
      </HudPanel>

      <IntermissionBanner />
      <ShopPanel />

      <LevelUpFlash className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
        <span className="text-3xl font-black uppercase tracking-[0.3em] text-amber-300 drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
          Level up
        </span>
      </LevelUpFlash>

      <RunScreens />
    </HudCanvas>
  );
}
