import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";
import { uiTour } from "./uiTour";

const firstSwitch = ".ec-settings-sheet [role=switch]";

export default defineFlow(game, {
  browser: true,
  async run(f) {
    await uiTour(f, [
      { until: "document.querySelector('.ec-pause') !== null" },
      { shot: "hud" },
      { tap: "Pause battle", arrive: "document.querySelector('.ec-front') !== null" },
      { shot: "pause" },
      { tap: "Settings", arrive: "document.querySelector('.ec-settings-sheet') !== null" },
      { shot: "pause-settings" },
      { tap: "Credits" },
      { shot: "pause-credits" },
      { tap: "Return to title", arrive: "document.querySelector('.ec-pause') === null && document.querySelector('.ec-title') !== null" },
      { shot: "title" },
      { tap: "Settings", arrive: "document.querySelector('.ec-settings-sheet') !== null" },
      { shot: "settings" },
      { tapOn: firstSwitch, arrive: `document.querySelector(${JSON.stringify(firstSwitch)}).getAttribute('aria-checked') === 'true'` },
      { shot: "settings-toggled" },
      { tapOn: firstSwitch, arrive: `document.querySelector(${JSON.stringify(firstSwitch)}).getAttribute('aria-checked') === 'false'` },
      { tap: "Credits" },
      { shot: "credits" },
      { tap: "Campaign records" },
      { shot: "records" },
      { tap: "New campaign", arrive: "document.querySelector('[data-new-campaign-name]') !== null" },
      { type: "bram", field: "[data-new-campaign-name]", label: "Commander" },
    ]);
  },
});
