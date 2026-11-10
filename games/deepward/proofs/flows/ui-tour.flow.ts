import { defineFlow } from "@jgengine/core/play/flow";
import { uiTour } from "@jgengine/core/play/uiTour";
import { game } from "../../src/game.config";

const creditsLabelFits = `(() => {
  const label = [...document.querySelectorAll('span')].find(el => el.textContent === 'Deepward');
  if (label == null) return false;
  const font = getComputedStyle(label);
  const context = document.createElement('canvas').getContext('2d');
  context.font = [font.fontStyle, font.fontWeight, font.fontSize, font.fontFamily].join(' ');
  return label.offsetWidth + 2 >= context.measureText(label.textContent).width;
})()`;

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
      { until: creditsLabelFits },
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
      { until: creditsLabelFits },
      { shot: "pause-credits" },
    ]);
  },
});
