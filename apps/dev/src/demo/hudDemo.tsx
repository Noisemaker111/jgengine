import { Clock, Coins, Crosshair, HudCanvas, HudPanel, Hotbar, Speedometer, useEntityStat, useHudLayout, usePlayer } from "@jgengine/react";
import { KitWaveClock } from "@jgengine/react/hud/kitHud";
import { KitMeter } from "@jgengine/react/uiKitRoot";
import type { KitTone } from "@jgengine/react/uiKit";
import type { PlayableGame } from "@jgengine/shell/registry";

import { demoGame } from "./demoGame";

/**
 * Dev showcase of optional HUD building blocks (`@jgengine/react`) — not a template for shipped
 * game UI. Every real game owns custom chrome and art direction; this page only exercises the
 * stock widgets against demo gameplay data so layout/hooks stay testable in isolation.
 */
function PlayerStat({ stat, tone, label }: { stat: string; tone: KitTone; label: string }) {
  const value = useEntityStat(usePlayer().userId, stat);
  return value === null ? null : <KitMeter size="sm" label={label} value={value.current - value.min} max={value.max - value.min} tone={tone} readout style={{ width: 170 }} />;
}

function HudShowcaseUI() {
  const layout = useHudLayout({ storageKey: "hud-showcase" });
  return (
    <HudCanvas layout={layout} className="z-20">
      <HudPanel id="clock" anchor="top-left" interactive>
        <Clock controls showDay />
      </HudPanel>
      <HudPanel id="wave" anchor="top">
        <KitWaveClock text="Wave 3" detail="7 enemies left" />
      </HudPanel>
      <HudPanel id="coins" anchor="top-right">
        <Coins currencyId="gold" />
      </HudPanel>
      <HudPanel id="vitals" anchor="bottom-left">
        <div style={{ display: "grid", gap: 6 }}>
          <PlayerStat stat="health" tone="good" label="Health" />
          <PlayerStat stat="mana" tone="accent" label="Mana" />
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
