/** @jsxImportSource @jgengine/core/ui/jsx */
import type { RuneTheme } from "@jgengine/core/ui/rune/primitives";
import { RuneLabel, RuneRoot, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import type { TouchControlsConfig } from "@jgengine/core/input/touchScheme";
import { useGameContext } from "@jgengine/ui/provider";

const theme = {
  colors: { panel: "#10202ae6" },
  text: { body: { size: 14, color: "#e6f4f1" } },
  variants: { panel: { padding: 12, gap: 6, fill: "#10202ae6", radius: 10 } },
  motion: { duration: 160, distance: 8, bounce: 0 },
} satisfies RuneTheme;

// Anchor each panel to the screen and inside the safe area. `responsive` restyles a panel per screen
// size: on a phone the quest log shrinks and the hotbar narrows, so nothing covers the thumbs.
export function GameUI() {
  const ctx = useGameContext();
  return (
    <RuneRoot context={ctx} theme={theme}>
      <RuneView anchor="top-left" safe inset={12} variant="panel"><RuneLabel value="Health 72 / 100" /></RuneView>
      <RuneView anchor="top-right" safe inset={12} variant="panel" width={260} responsive={{ phone: { width: 160, size: 12 } }}>
        <RuneLabel value="Reach the lighthouse" />
      </RuneView>
      <RuneView anchor="bottom" safe inset={12} variant="panel" width={360} responsive={{ phone: { width: 220 } }}>
        <RuneLabel value="1  2  3  4" />
      </RuneView>
    </RuneRoot>
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
