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
      { until: "innerWidth >= 500 || document.querySelector('[aria-label=\"Show later settings categories\"]') !== null" },
      { tapIf: "Show later settings categories" },
      { until: "(() => { const rail = document.querySelector('[role=group][aria-label=\"settings categories\"]'); return rail !== null && (rail.scrollWidth <= rail.clientWidth || rail.scrollLeft > 0); })()" },
      { tapIf: "Show earlier settings categories" },
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
    const overflow = await f.page("(() => { const el = document.querySelector('[data-credits-scroller]'); el.focus(); return el.scrollHeight > el.clientHeight; })()");
    if (overflow === true) {
      await f.press("End");
      await f.waitForPage("(() => { const el = document.querySelector('[data-credits-scroller]'); return el !== null && el.clientHeight > 0 && document.activeElement === el && Math.abs(el.scrollTop + el.clientHeight - el.scrollHeight) <= 1; })()");
      await f.shot("pause-credits-end");
      await f.press("Home");
      await f.waitForPage("document.querySelector('[data-credits-scroller]').scrollTop === 0");
      await f.press("PageDown");
      await f.waitForPage("document.querySelector('[data-credits-scroller]').scrollTop > 0");
    }
  },
});
