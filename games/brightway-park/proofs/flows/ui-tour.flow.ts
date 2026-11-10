import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";
import { uiTour } from "@jgengine/core/play/uiTour";

const has = (text: string): string => `document.body.textContent.includes(${JSON.stringify(text)})`;
const control = (label: string): string => `document.querySelector('[aria-label="${label}"]') !== null`;

export default defineFlow(game, {
  browser: true,
  state: "title",
  async run(f) {
    await uiTour(f, [
      { until: has("Open the park") },
      { shot: "title" },
      { type: "pier", field: "[data-new-day-name]", label: "Park name" },
      { tap: "Park saves" },
      { shot: "saves" },
      { tap: "Settings" },
      { shot: "settings" },
      { tap: "Credits", arrive: has("KayKit City Builder") },
      { shot: "credits" },
      { tap: "Open the park", arrive: control("Pause park") },
      { shot: "hud" },
      { tap: "Staff", arrive: has("Handyman") },
      { shot: "hud-build-palette" },
      { tap: "Lab", arrive: control("Close research lab") },
      { shot: "hud-research" },
      { tap: "Close research lab" },
      { tap: "Pause park", arrive: has("Resume the park") },
      { shot: "pause" },
      { tap: "Park settings" },
      { shot: "pause-settings" },
      { tap: "How to play" },
      { shot: "pause-help" },
    ]);
  },
});
