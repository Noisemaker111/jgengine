import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";
import { uiTour } from "@jgengine/core/play/uiTour";

const has = (text: string): string => `document.body.textContent.includes(${JSON.stringify(text)})`;

export default defineFlow(game, {
  browser: true,
  state: "title",
  async run(f) {
    await uiTour(f, [
      { until: "document.querySelector('.orbit-title') !== null" },
      { shot: "title" },
      { tap: "Households", arrive: has("kept") },
      { shot: "households" },
      { tapIf: "Porch" },
      { tap: "Field guide" },
      { shot: "guide" },
      { tapIf: "Porch" },
      { tap: "Settings" },
      { shot: "settings" },
      { tapIf: "Porch" },
      { tap: "Credits", arrive: has("Comfortaa") },
      { shot: "credits" },
      { tapIf: "Porch" },
      { tap: "Move in", arrive: "document.querySelector('[data-new-career-name]') !== null" },
      { type: "odd", field: "[data-new-career-name]", label: "Household name" },
      { tapOn: "[data-new-career-start]", arrive: "document.querySelector('.orbit-title') === null" },
      { until: "typeof __jgProbe === 'function' && __jgProbe().members === 4" },
      { shot: "hud" },
      { tap: "Furnish" },
      { shot: "hud-furnish" },
      { tap: "Close habitat panel" },
      { tap: "Handbook", arrive: "document.querySelector('.orbit-pause') !== null" },
      { shot: "pause" },
      { tap: "Field guide" },
      { shot: "pause-guide" },
      { tapIf: "Contents" },
      { tap: "Settings", arrive: "document.querySelector('[data-orbit-settings]') !== null" },
      { shot: "pause-settings" },
      { tapIf: "Contents" },
      { tap: "Credits" },
      { shot: "pause-credits" },
    ]);
  },
});
