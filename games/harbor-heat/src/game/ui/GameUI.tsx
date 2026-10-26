import { useEffect } from "react";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react";
import { useGameFonts } from "@jgengine/core/ui/fonts.view";
import { useGameContext } from "@jgengine/react/provider";
import { useStore } from "@jgengine/react/store";
import { ITEM_LABELS } from "../content";
import { sessionStore } from "../session";
import { CityMinimap } from "./components/CityMinimap";
import { Counters } from "./components/Counters";
import { BeltHotbar } from "./components/Hotbar";
import { Objective } from "./components/Objective";
import { PauseButton, PhoneButton, PhonePanel } from "./components/PhonePanel";
import { SessionUI } from "./components/SessionUI";
import { RadioReadout } from "./components/RadioReadout";
import { Speedo } from "./components/Speedo";
import { StatusPanel } from "./components/StatusPanel";
import { WantedStars } from "./components/WantedStars";
import { useRoom } from "./fiction/kit";
import { HarborMenu, useGameStarted } from "./menu/HarborMenu";
import { GAME_FONTS } from "../../art/fonts/fonts";

/** Pickups speak through the kit's toasts, like every other notice. */
function useLootNotices() {
  const ctx = useGameContext();
  useEffect(() => ctx.game.events.on("loot.granted", ({ userId, drops }) => {
    if (userId !== ctx.player.userId) return;
    for (const drop of drops) ctx.game.notices.push({ text: `+ ${drop.item === undefined ? `$${drop.count}` : (ITEM_LABELS[drop.item] ?? drop.item)}`, tone: "success" });
  }), [ctx]);
}

export function GameUI() {
  useGameFonts(GAME_FONTS);
  const layout = useHudLayout({ storageKey: "harbor-heat" });
  const started = useGameStarted();
  const compact = useRoom() !== "wide";
  const paused = useStore(sessionStore, (session) => session.paused);
  useLootNotices();
  return (
    <>
      <HarborMenu />
      <SessionUI />
      {started && !paused ? (
        <HudCanvas layout={layout} className={`z-20 hh-hud ${compact ? "hh-hud-compact" : ""}`}>
          <HudPanel id="objective" anchor="top-left"><Objective /></HudPanel>
          <HudPanel id="pause" anchor="top-right" order={-1} priority="critical"><div className="hh-hudkeys"><PhoneButton /><PauseButton /></div></HudPanel>
          <HudPanel id="status" anchor="top-right" priority="critical" interactive={false}><StatusPanel /></HudPanel>
          <HudPanel id="wanted" anchor="top" interactive={false}><WantedStars /></HudPanel>
          <HudPanel id="minimap" anchor="bottom-left" chip="map" interactive={false}><CityMinimap /></HudPanel>
          <HudPanel id="hotbar" anchor="bottom" priority="critical"><BeltHotbar /></HudPanel>
          <HudPanel id="speedo" anchor="bottom-right" priority="tertiary" interactive={false}><Speedo /></HudPanel>
          <HudPanel id="radio" anchor="bottom-right" order={-1} priority="tertiary"><RadioReadout /></HudPanel>
          <HudPanel id="phone" anchor="right" priority="critical"><PhonePanel /></HudPanel>
        </HudCanvas>
      ) : null}
      {/* Counters and talk are full-screen moments over the HUD, laid out at their own phone sizes. */}
      {started && !paused ? <Counters /> : null}
    </>
  );
}
