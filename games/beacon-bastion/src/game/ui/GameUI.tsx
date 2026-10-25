import { useGameFonts } from "@jgengine/react/gameFonts";
import { useGameContext } from "@jgengine/react/provider";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/shell/gameKit";

import { GAME_FONTS } from "../../art/fonts/fonts";
import { pauseRun } from "../menu";
import { BuildBar } from "./components/BuildBar";
import { EndScreens } from "./components/EndScreens";
import { AbilityStones, KeepSigns, ReleaseHorn, WaveBoard } from "./components/Hud";
import { TowerPanel } from "./components/TowerPanel";
import { BeaconMenu, PauseSigil } from "./menu/BeaconMenu";

/**
 * Beacon's HUD is the keep's own signage at the screen edges - the brazier and purse sign top-left,
 * the wave board top-centre, the builder's rack along the foot - and the front end is carved stone,
 * timber and a war banner. Live-play chrome is gated to the play phases, so a title or pause screen
 * owns the frame alone.
 */
export function GameUI() {
  useGameFonts(GAME_FONTS);
  const ctx = useGameContext();
  const layout = useHudLayout({ storageKey: "beacon-bastion" });
  return (
    <>
      <HudCanvas layout={layout} showDuring={["playing", "ended"]}>
        <HudPanel id="keep" anchor="top-left" inset={{ x: 16, y: 12 }}>
          <KeepSigns />
        </HudPanel>
        <HudPanel id="horn" anchor="top-left" order={1} inset={{ x: 16, y: 12 }}>
          <ReleaseHorn />
        </HudPanel>
        <HudPanel id="wave" anchor="top" inset={{ x: 0, y: 0 }}>
          <WaveBoard />
        </HudPanel>
        <HudPanel id="pause" anchor="top-right" inset={{ x: 16, y: 12 }}>
          <PauseSigil onPress={() => pauseRun(ctx)} />
        </HudPanel>
        <HudPanel id="build-bar" anchor="bottom" inset={{ x: 0, y: 14 }}>
          <BuildBar />
        </HudPanel>
        <HudPanel id="rites" anchor="bottom-right" inset={{ x: 16, y: 14 }}>
          <AbilityStones />
        </HudPanel>
        <HudPanel id="tower" anchor="right" inset={{ x: 16, y: 0 }}>
          <TowerPanel />
        </HudPanel>
        <EndScreens />
      </HudCanvas>
      <BeaconMenu />
    </>
  );
}
