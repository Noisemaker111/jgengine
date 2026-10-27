import { useState } from "react";
import { HudCanvas, HudPanel, useDisplayProfile, useHudLayout } from "@jgengine/react";
import { useGameFonts } from "@jgengine/core/ui/fonts.view";
import { useGamePhase } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { lootDropsOf } from "@jgengine/core/game/events";
import { ToastStack } from "@jgengine/core/notifications/toastStack.view";
import { itemNameById } from "../content";
import { DamageVignette, HitMarker, LevelUpBurst } from "./components/Feedback";
import { CashPlate, MissionTracker } from "./components/Mission";
import { ReserveOverlay, VendorPanel } from "./components/Overlays";
import { NpcDialog } from "./components/NpcDialog";
import { TalentsPanel } from "./components/Talents";
import { ScrapMenu } from "./menu/ScrapMenu";
import { VitalsPlate } from "./components/Vitals";
import { AmmoPlate, WeaponHotbar, ItemCard } from "./components/Weapon";
import { BlackMarketPanel, EchoBox, CoresPlate, TravelPanel, ReactorEnding, ZoneBanner } from "./components/World";
import { Operations } from "./components/Operations";
import { FieldGearPanel } from "./components/FieldGearPanel";
import { OverdriveCard, OverdriveTerminal } from "./components/Overdrive";
import { riftStore } from "../rift/rift";
import { GAME_FONTS } from "../../art/fonts/fonts";
import { useHostilesNear } from "./fiction/useHostilesNear";
import { OverlayHostContext } from "./fiction/OverlayHost";

/**
 * The reclaimer’s rig: everything the HUD shows is a piece of salvaged kit at the edge of the view.
 * The wrist unit, the magazine counter and the weapon cartridges sit along the foot; the contract
 * and mission log hang top-left; the wallet counters and the pause key top-right. Each piece dims
 * when nothing on it is changing and comes back the moment it does.
 */
export function GameUI() {
  useGameFonts(GAME_FONTS);
  const layout = useHudLayout({ storageKey: "scrap-signal" });
  const profile = useDisplayProfile();
  const combat = useHostilesNear();
  const [overlay, setOverlay] = useState<HTMLElement | null>(null);
  const { phase } = useGamePhase();
  const riftRun = useStore(riftStore).run;
  const inRun = riftRun !== null && (riftRun.phase === "running" || riftRun.phase === "intermission");
  // The front end replaces the field: the menu is the only surface a boot shows, and no run overlay
  // paints through it. A run's HUD mounts when the player leaves the menu.
  if (phase === "menu") return <ScrapMenu />;
  return (
    <OverlayHostContext.Provider value={overlay}>
    <HudCanvas layout={layout} className={`ss-hud ${profile.compact ? "compact" : ""}`}>
      <Operations />
      <HudPanel id="overdrive" anchor="left" order={-1} chip="overdrive" interactive={true}>
        <OverdriveCard />
      </HudPanel>

      {/* A live Overdrive run takes the mission log's place: the clock is the only objective. */}
      {inRun ? null : (
        <HudPanel id="missions" anchor="left" chip="missions" interactive={false}>
          <MissionTracker />
        </HudPanel>
      )}

      <HudPanel id="field-loot" anchor="left" order={1} chip="stash" interactive={true}>
        <FieldGearPanel />
      </HudPanel>

      <HudPanel id="cash" anchor="top-right" order={0} priority="critical" interactive={false}>
        <CashPlate />
      </HudPanel>

      <HudPanel id="cores" anchor="top-right" order={2} priority="critical" interactive={false}>
        <CoresPlate />
      </HudPanel>

      <HudPanel id="zone-banner" anchor="top" order={1} interactive={false}>
        <ZoneBanner />
      </HudPanel>

      <HudPanel id="echo" anchor="bottom" order={1} priority="tertiary" chip="echo" interactive={false}>
        <EchoBox />
      </HudPanel>

      <HudPanel id="loot-toasts" anchor="top-right" order={3} priority="tertiary" chip="loot" interactive={false}>
        <ToastStack
          action="loot.granted"
          className="ss-toasts"
          renderToast={(entry) => {
            const text = lootDropsOf(entry.data)
              .map((drop) => `+${drop.count} ${drop.item !== undefined ? itemNameById(drop.item) : "$"}`)
              .join("   ");
            if (text === "") return null;
            return (
              <div className="ss-toast">
                {text}
              </div>
            );
          }}
        />
      </HudPanel>

      <HudPanel id="item-card" anchor="right" priority="tertiary" chip="item" interactive={false}>
        <ItemCard />
      </HudPanel>

      <HudPanel id="vitals" anchor="bottom-left" priority="critical" interactive={false}>
        <VitalsPlate combat={combat} />
      </HudPanel>

      <HudPanel id="hotbar" anchor="bottom" order={0} priority="critical" interactive={false}>
        <WeaponHotbar combat={combat} />
      </HudPanel>

      <HudPanel id="ammo" anchor="bottom-right" priority="critical" interactive={false}>
        <AmmoPlate combat={combat} />
      </HudPanel>

      <HitMarker />
      <DamageVignette />
      <ReserveOverlay />
      <VendorPanel />
      <NpcDialog />
      <TalentsPanel />
      <TravelPanel />
      <BlackMarketPanel />
      <OverdriveTerminal />
      <ReactorEnding />
      <LevelUpBurst />
    </HudCanvas>
    <div ref={setOverlay} className="ss-overlay-host" />
    </OverlayHostContext.Provider>
  );
}
