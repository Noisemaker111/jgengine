/** @jsxImportSource @jgengine/core/ui/jsx */
import { Clock, Coins, Crosshair, HudCanvas, HudPanel, Hotbar, Speedometer, useEntityStat, useHudLayout, usePlayer } from "@jgengine/ui";
import { KitWaveClock } from "@jgengine/core/hud/kitHud.view";
import { KitMeter } from "@jgengine/core/ui/kit/uiKitRoot.view";
import type { KitTone } from "@jgengine/core/ui/kit/uiKit.view";
import type { PlayableGame } from "@jgengine/shell/registry";

import { demoGame } from "./demoGame";

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

export const hudShowcaseGame: PlayableGame = { ...demoGame, GameUI: HudShowcaseUI };
