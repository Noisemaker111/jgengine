import { defineFlow } from "@jgengine/core/play/flow";
import { uiTour } from "@jgengine/core/play/uiTour";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  browser: true,
  state: "title",
  async run(f) {
    await uiTour(f, [
      { until: "document.querySelector('[data-new-dispatch-name]') !== null" },
      { shot: "title" },
      { type: "Jon", field: "[data-new-dispatch-name]", label: "Courier name" },
      { tap: "Missions & parcels" },
      { shot: "bays" },
      { tap: "Settings" },
      { shot: "title-settings" },
      { tap: "Next page" },
      { shot: "title-settings-next" },
      { tap: "Credits" },
      { shot: "credits" },
      { tap: "Hit the street" },
      { tap: "Take the run" },
      { until: "document.querySelector('[data-new-dispatch-name]') === null" },
      { shot: "hud" },
      { tap: "Pause" },
      { until: "document.body.textContent.includes('Back to the coast')" },
      { shot: "pause" },
      { tap: "Settings & controls" },
      { shot: "pause-settings" },
      { tap: "Next page" },
      { shot: "pause-settings-next" },
    ]);
  },
});
