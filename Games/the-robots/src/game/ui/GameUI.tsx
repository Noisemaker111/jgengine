import { HudCanvas, HudPanel, SettingsTrigger, useHudLayout } from "@jgengine/react";
import { ToastStack } from "@jgengine/react/components";
import { itemNameById } from "../content";
import { DamageVignette, HitMarker, LevelUpBurst } from "./components/Feedback";
import { CashPlate, CreditBadge, MissionTracker } from "./components/Mission";
import { FfylOverlay, VendorPanel } from "./components/Overlays";
import { CharacterSelect, TalentsPanel } from "./components/Talents";
import { VitalsPlate } from "./components/Vitals";
import { AmmoPlate, Hotbar, ItemCard } from "./components/Weapon";
import { BlackMarketPanel, EchoBox, CoresPlate, TravelPanel, ReactorEnding, ZoneBanner } from "./components/World";

export function GameUI() {
  const layout = useHudLayout({ storageKey: "the-robots" });
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

      <HudPanel id="cores" anchor="top-right" order={2} compact="keep" interactive={false}>
        <CoresPlate />
      </HudPanel>

      <HudPanel id="zone-banner" anchor="top" order={1} compact="keep" interactive={false}>
        <ZoneBanner />
      </HudPanel>

      <HudPanel id="echo" anchor="left" order={1} compact="hide" interactive={false}>
        <EchoBox />
      </HudPanel>

      <HudPanel id="loot-toasts" anchor="top-right" order={3} compact="hide" interactive={false}>
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
              <div className="bl2-plate bg-black/70 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-amber-200">
                {text}
              </div>
            );
          }}
        />
      </HudPanel>

      <HudPanel id="credit" anchor="top" order={0} compact="hide" interactive={false}>
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

      <HitMarker />
      <DamageVignette />
      <FfylOverlay />
      <VendorPanel />
      <TalentsPanel />
      <TravelPanel />
      <BlackMarketPanel />
      <ReactorEnding />
      <LevelUpBurst />
      <CharacterSelect />
    </HudCanvas>
  );
}
