import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";
import { uiTour } from "@jgengine/core/play/uiTour";

const has = (text: string): string => `document.body.textContent.includes(${JSON.stringify(text)})`;
const pane = (name: string): string => `document.querySelector('[data-${name}]') !== null`;

/** Drift Foundry has no text field, so this tour types nothing. */
export default defineFlow(game, {
  browser: true,
  state: "title",
  async run(f) {
    await uiTour(f, [
      { until: has("New run") },
      { shot: "title" },
      { tap: "Yard calendar", arrive: pane("calendar-pane") },
      { shot: "calendar" },
      { tap: "Pit garage", arrive: pane("garage-pane") },
      { shot: "garage" },
      { tap: "Corridor records", arrive: pane("records-pane") },
      { shot: "records" },
      { tap: "Settings", arrive: pane("pit-settings") },
      { shot: "settings" },
      { tap: "Credits" },
      { shot: "credits" },
      { tap: "New run", arrive: has("LAP 1/1") },
      { shot: "hud" },
      { tap: "Pause run", arrive: has("Back to the run") },
      { shot: "pause" },
      { tap: "Settings", arrive: pane("pit-settings") },
      { shot: "pause-settings" },
      { tap: "Pit garage", arrive: pane("garage-pane") },
      { shot: "pause-garage" },
      { tap: "Back to the run", arrive: has("LAP 1/1") },
      { until: has("RUN IT AGAIN") },
      { shot: "result" },
    ]);
  },
});
