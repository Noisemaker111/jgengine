import { useEffect } from "react";
import { HudSlots } from "@jgengine/core/hud/hudLayout.view";
import { useGameFonts } from "@jgengine/core/ui/fonts.view";
import { HARBOR_FONTS } from "./theme";
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

/** Pickups speak through the kit's toasts, like every other notice. */
function useLootNotices() {
  const ctx = useGameContext();
  useEffect(() => ctx.game.events.on("loot.granted", ({ userId, drops }) => {
    if (userId !== ctx.player.userId) return;
    for (const drop of drops) ctx.game.notices.push({ text: `+ ${drop.item === undefined ? `$${drop.count}` : (ITEM_LABELS[drop.item] ?? drop.item)}`, tone: "success" });
  }), [ctx]);
}

export function GameUI() {
  useGameFonts(HARBOR_FONTS);
  const started = useGameStarted();
  const compact = useRoom() !== "wide";
  const paused = useStore(sessionStore, (session) => session.paused);
  useLootNotices();
  return (
    <>
      <HarborMenu />
      <SessionUI />
      {started && !paused ? (
        <HudSlots
          storageKey="harbor-heat"
          showDuring={null}
          className={`z-20 hh-hud ${compact ? "hh-hud-compact" : ""}`}
          panels={{
            topLeft: [{ id: "objective", content: <Objective /> }],
            top: [{ id: "wanted", content: <WantedStars />, interactive: false }],
            topRight: [
              { id: "pause", content: <div className="hh-hudkeys"><PhoneButton /><PauseButton /></div>, order: -1, priority: "critical" },
              { id: "status", content: <StatusPanel />, priority: "critical", interactive: false },
            ],
            right: [{ id: "phone", content: <PhonePanel />, priority: "critical" }],
            bottomLeft: [{ id: "minimap", content: <CityMinimap />, chip: "map", interactive: false }],
            bottom: [{ id: "hotbar", content: <BeltHotbar />, priority: "critical" }],
            bottomRight: [
              { id: "radio", content: <RadioReadout />, order: -1, priority: "tertiary" },
              { id: "speedo", content: <Speedo />, priority: "tertiary", interactive: false },
            ],
          }}
        />
      ) : null}
      {/* Counters and talk are full-screen moments over the HUD, laid out at their own phone sizes. */}
      {started && !paused ? <Counters /> : null}
    </>
  );
}
