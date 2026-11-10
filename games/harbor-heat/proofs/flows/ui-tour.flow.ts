import { defineFlow } from "@jgengine/core/play/flow";
import { uiTour } from "@jgengine/core/play/uiTour";
import { decodePng } from "@jgengine/assets/imageCodec";
import { readFileSync } from "node:fs";
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
      { until: "innerWidth >= 600 || (() => { const card = document.querySelector('.hh-licence'); return card !== null && card.getBoundingClientRect().right <= innerWidth; })()" },
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
      { tap: "Phone" },
      { until: "(() => { const el = document.querySelector('.hh-city'); return el !== null && el.scrollHeight > el.clientHeight; })()" },
      { tap: "down" },
      { until: "document.querySelector('.hh-city').scrollTop > 0" },
      { shot: "city-phone" },
      { tap: "Put away" },
      { tap: "Pause" },
      { until: "document.body.textContent.includes('Back to the coast')" },
      { shot: "pause" },
      { tap: "Settings & controls" },
      { shot: "pause-settings" },
      { tap: "Next page" },
      { shot: "pause-settings-next" },
    ]);
    const bounds = await f.page("window.__jgRuneStage == null || window.__jgRuneStage.unavailable ? null : (() => { const rect = document.querySelector('.hh-set-label').getBoundingClientRect(); return [innerWidth, rect.x + 2, rect.y + 2, rect.width - 4, rect.height - 4]; })()");
    if (bounds !== null) {
      if (!Array.isArray(bounds) || bounds.length !== 5 || !bounds.every((value): value is number => typeof value === "number" && Number.isFinite(value))) throw new Error("the graphics label has no measured bounds");
      const [viewport = 0, x = 0, y = 0, width = 0, height = 0] = bounds;
      const shot = new URL(`../../../../shots/harbor-heat/tour-rune-${viewport}-pause-settings-next.png`, import.meta.url);
      const image = decodePng(readFileSync(shot));
      const scale = image.width / viewport;
      let ink = 0;
      for (let py = Math.max(0, Math.ceil(y * scale)); py < Math.min(image.height, (y + height) * scale); py++) {
        for (let px = Math.max(0, Math.ceil(x * scale)); px < Math.min(image.width, (x + width) * scale); px++) {
          const at = (py * image.width + px) * 4;
          if ((image.data[at] ?? 255) + (image.data[at + 1] ?? 255) + (image.data[at + 2] ?? 255) < 220) ink++;
        }
      }
      await f.expectPage(String(ink > 4), "Rune painted the graphics label after reopening settings");
    }
  },
});
