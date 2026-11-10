import { defineFlow } from "@jgengine/core/play/flow";
import { uiTour } from "@jgengine/core/play/uiTour";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  browser: true,
  state: "title",
  async run(f) {
    await uiTour(f, [
      { until: "document.body.textContent.includes('New dive')" },
      { shot: "title" },
      { tap: "Dives & hauls" },
      { shot: "records" },
      { tap: "Settings" },
      { shot: "title-settings" },
      { tap: "Credits" },
      { shot: "credits" },
      { tap: "New dive" },
      { tap: "Take the rail" },
      { until: "document.querySelector('[data-new-dive-start]') === null" },
      { shot: "hud" },
      { press: "Escape" },
      { until: "document.body.textContent.includes('Back to Marrow')" },
      { shot: "pause" },
      { tap: "Settings" },
      { shot: "pause-settings" },
      { tap: "Credits" },
      { shot: "pause-credits" },
    ]);
  },
});
