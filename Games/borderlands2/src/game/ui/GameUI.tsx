import { HudCanvas, HudPanel, SettingsTrigger, useHudLayout } from "@jgengine/react";
import { LevelUpFlash, ToastStack } from "@jgengine/react/components";
import { itemNameById } from "../content";
import { CashPlate, CreditBadge, MissionTracker } from "./components/Mission";
import { FfylOverlay, SkillsPanel, VendorPanel } from "./components/Overlays";
import { VitalsPlate } from "./components/Vitals";
import { AmmoPlate, Hotbar, ItemCard } from "./components/Weapon";
import { BlackMarketPanel, EchoBox, EridiumPlate, TravelPanel, VaultEnding, ZoneBanner } from "./components/World";

export function GameUI() {
  const layout = useHudLayout({ storageKey: "borderlands2" });
  return (
    <HudCanvas layout={layout} className="z-20 font-sans text-stone-100">
      <HudPanel id="missions" anchor="left" compact="hide" interactive={false}>
        <MissionTracker />
      </HudPanel>

      <HudPanel id="settings" anchor="top-right" order={-1} compact="keep" interactive={false}>
        <SettingsTrigger className="pointer-events-auto flex h-8 w-8 items-center justify-center border border-stone-600/60 bg-black/70 text-base text-stone-300 transition hover:bg-stone-800 hover:text-amber-200" />
      </HudPanel>

      <HudPanel id="cash" anchor="top-right" order={0} compact="keep" interactive={false}>
        <CashPlate />
      </HudPanel>

      <HudPanel id="eridium" anchor="top-right" order={2} compact="keep" interactive={false}>
        <EridiumPlate />
      </HudPanel>

      <HudPanel id="zone-banner" anchor="top" order={1} compact="keep" interactive={false}>
        <ZoneBanner />
      </HudPanel>

      <HudPanel id="echo" anchor="left" order={1} compact="hide" interactive={false}>
        <EchoBox />
      </HudPanel>

      <HudPanel id="loot-toasts" anchor="top-right" order={1} compact="hide" interactive={false}>
        <ToastStack
          action="loot.granted"
          className="flex flex-col items-end gap-1.5"
          renderToast={(entry) => {
            const data = entry.data as { drops?: { item?: string; currency?: string; count: number }[] };
            const text = (data.drops ?? [])
              .map((drop) => `+${drop.count} ${drop.item !== undefined ? itemNameById(drop.item) : "$"}`)
              .join("   ");
            if (text === "") return null;
            return (
              <div className="bg-black/60 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-amber-200">
                {text}
              </div>
            );
          }}
        />
      </HudPanel>

      <HudPanel id="credit" anchor="top" compact="hide" interactive={false}>
        <CreditBadge />
      </HudPanel>

      <HudPanel id="item-card" anchor="right" compact="hide" interactive={false}>
        <ItemCard />
      </HudPanel>

      <HudPanel id="vitals" anchor="bottom-left" order={0} compact="keep" interactive={false}>
        <VitalsPlate />
      </HudPanel>

      <HudPanel id="hotbar" anchor="bottom" order={0} compact="keep" interactive={false}>
        <Hotbar />
      </HudPanel>

      <HudPanel id="ammo" anchor="bottom-right" compact="keep" interactive={false}>
        <AmmoPlate />
      </HudPanel>

      <FfylOverlay />
      <VendorPanel />
      <SkillsPanel />
      <TravelPanel />
      <BlackMarketPanel />
      <VaultEnding />

      <LevelUpFlash className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
        <span className="text-3xl font-black uppercase tracking-[0.3em] text-amber-300 drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
          Level up
        </span>
      </LevelUpFlash>
    </HudCanvas>
  );
}
