import { useEffect } from "react";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react";
import { useGameFonts } from "@jgengine/react/gameFonts";
import { useGameContext } from "@jgengine/react/provider";
import { useStore } from "@jgengine/react/store";
import { ITEM_LABELS } from "../content";
import { sessionStore } from "../session";
import { CityMinimap } from "./components/CityMinimap";
import { Counters } from "./components/Counters";
import { Hotbar } from "./components/Hotbar";
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
  const room = useRoom();
  const compact = room !== "wide";
  const short = room === "short";
  const paused = useStore(sessionStore, (session) => session.paused);
  useLootNotices();
  return (
    <>
      <HarborMenu />
      <SessionUI />
      {started && !paused ? (
        <HudCanvas layout={layout} className={`z-20 hh-hud ${compact ? "hh-hud-compact" : ""} ${short ? "hh-hud-short" : ""}`}>
          <HudPanel id="objective" anchor="top-left" compact="keep"><Objective /></HudPanel>
          <HudPanel id="pause" anchor="top-right" order={-1} compact="keep"><div className="hh-hudkeys"><PhoneButton /><PauseButton /></div></HudPanel>
          <HudPanel id="status" anchor="top-right" compact="keep" interactive={false}><StatusPanel /></HudPanel>
          {/* On a phone the top edge belongs to the pager, so the scanner hangs under the cash instead. */}
          <HudPanel id="wanted" anchor={compact ? "top-right" : "top"} order={compact ? 1 : 0} compact="keep" interactive={false}><WantedStars /></HudPanel>
          {/* A landscape phone gives most of its height to the thumb controls, so there the chart, belt and dash hang from the top edge. */}
          <HudPanel id="minimap" anchor={short ? "top-left" : "bottom-left"} order={short ? 1 : 0} compact="keep" interactive={false}><CityMinimap /></HudPanel>
          <HudPanel id="hotbar" anchor={short ? "top" : "bottom"} compact="keep"><Hotbar /></HudPanel>
          <HudPanel id="speedo" anchor={short ? "top-right" : "bottom-right"} order={short ? 2 : 0} compact="keep" interactive={false}><Speedo /></HudPanel>
          <HudPanel id="radio" anchor={short ? "top-right" : "bottom-right"} order={short ? 3 : -1} compact="keep"><RadioReadout /></HudPanel>
          <HudPanel id="phone" anchor="right" compact="keep"><PhonePanel /></HudPanel>
        </HudCanvas>
      ) : null}
      {/* Counters and talk are full-screen moments over the HUD, laid out at their own phone sizes. */}
      {started && !paused ? <Counters /> : null}
    </>
  );
}
