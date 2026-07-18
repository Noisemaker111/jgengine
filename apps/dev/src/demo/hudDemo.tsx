import { Clock, Coins, Crosshair, HudCanvas, HudPanel, Hotbar, Speedometer, StatBar, WaveBanner, useHudLayout } from "@jgengine/react";
import type { PlayableGame } from "@jgengine/shell/registry";

import { demoGame } from "./demoGame";

/**
 * Dev showcase of optional HUD building blocks (`@jgengine/react`) — not a template for shipped
 * game UI. Every real game owns custom chrome and art direction; this page only exercises the
 * stock widgets against demo gameplay data so layout/hooks stay testable in isolation.
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
