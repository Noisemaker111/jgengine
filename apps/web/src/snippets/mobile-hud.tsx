import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/shell/gameKit";
import type { TouchControlsConfig } from "@jgengine/core/input/touchScheme";

// Say where each panel goes and how much it matters. On a small screen the
// engine stacks them so nothing overlaps, folds the least important into a
// tap-to-open chip, then scales the HUD down. "critical" panels never fold.
export function GameUI() {
  const layout = useHudLayout({ storageKey: "tide-runner" });
  return (
    <HudCanvas layout={layout}>
      <HudPanel id="health" anchor="top-left" priority="critical">
        <progress value={72} max={100} />
      </HudPanel>
      <HudPanel id="quests" anchor="top-right" priority="tertiary">
        <p>Reach the lighthouse</p>
      </HudPanel>
      <HudPanel id="hotbar" anchor="bottom" priority="critical">
        <div>1 2 3 4</div>
      </HudPanel>
    </HudCanvas>
  );
}

// On a phone, each bound action gets a touch button and movement gets a
// stick. Curate them per context with modes: on foot vs in a car.
export const touch: TouchControlsConfig = {
  buttons: [
    { action: "jump", label: "Jump" },
    { action: "interact", label: "Use" },
  ],
  modes: {
    car: {
      buttons: [{ action: "jump", label: "Handbrake", shape: "lever" }],
    },
  },
};
