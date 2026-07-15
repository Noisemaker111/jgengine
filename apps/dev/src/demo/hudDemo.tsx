import { Clock, Coins, Crosshair, HudCanvas, HudPanel, Hotbar, Speedometer, StatBar, WaveBanner, useHudLayout } from "@jgengine/react";
import type { PlayableGame } from "@jgengine/shell/registry";

import { demoGame } from "./demoGame";

/**
 * Showcase for the opt-in HUD component library (`@jgengine/react`) — every widget is a drop-in, self
 * styled, and reads the local player by default. This game reuses the demo's gameplay DATA (a hero
 * with health/mana, a hotbar, gold, a clock) purely so the widgets have something to display; the
 * engine imposes none of them — a game picks the pieces it wants and places them in `HudPanel`s.
 */
function HudShowcaseUI() {
  const layout = useHudLayout({ storageKey: "hud-showcase" });
  return (
    <HudCanvas layout={layout} className="z-20">
      <HudPanel id="clock" anchor="top-left" interactive>
        <Clock controls showDay />
      </HudPanel>
      <HudPanel id="wave" anchor="top">
        <WaveBanner wave={3} subtitle="7 enemies left" />
      </HudPanel>
      <HudPanel id="coins" anchor="top-right">
        <Coins currencyId="gold" />
      </HudPanel>
      <HudPanel id="vitals" anchor="bottom-left">
        <div style={{ display: "grid", gap: 6 }}>
          <StatBar statId="health" tone="health" label="Health" />
          <StatBar statId="mana" tone="mana" label="Mana" width={170} />
        </div>
      </HudPanel>
      <HudPanel id="hotbar" anchor="bottom">
        <Hotbar inventoryId="hotbar" activeSlot={0} keys={["1", "2", "3", "4"]} />
      </HudPanel>
      <HudPanel id="speed" anchor="bottom-right">
        <Speedometer />
      </HudPanel>
      <Crosshair />
    </HudCanvas>
  );
}

/** The demo's gameplay data + the opt-in HUD widgets as its `GameUI`. */
export const hudShowcaseGame: PlayableGame = { ...demoGame, GameUI: HudShowcaseUI };
