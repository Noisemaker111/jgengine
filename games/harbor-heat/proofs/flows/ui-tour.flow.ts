import { defineFlow } from "@jgengine/core/play/flow";
import { uiTour } from "@jgengine/core/play/uiTour";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  browser: true,
  state: "title",
  async run(f) {
    await uiTour(f, [
      { until: "document.body.textContent.includes('Hit the street')" },
      { shot: "title" },
      { tap: "Hit the street" },
      { until: "document.querySelector('[data-new-dispatch-name]') !== null" },
      { type: "Jon", field: "[data-new-dispatch-name]", label: "Courier name" },
      { tapIf: "Back to the sign" },
      { tap: "Missions & parcels" },
      { until: "innerWidth >= 600 || [...document.querySelectorAll('.hh-bay')].every(el => el.getBoundingClientRect().width > innerWidth * 0.8)" },
      { shot: "bays" },
      { tapIf: "Back to the sign" },
      { tap: "Settings" },
      { shot: "title-settings" },
      { tap: "Next page" },
      { shot: "title-settings-next" },
      { tapIf: "Back to the sign" },
      { tap: "Credits" },
      { shot: "credits" },
      { tapIf: "Back to the sign" },
      { tap: "Hit the street" },
      { tap: "Take the run" },
      { until: "document.querySelector('[data-new-dispatch-name]') === null" },
      { until: "innerWidth >= 600 || (() => { const keys = [...document.querySelectorAll('.hh-hudkeys button')]; return keys.length === 2 && keys.every(el => { const rect = el.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth; }); })()" },
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
