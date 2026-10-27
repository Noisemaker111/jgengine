import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.waitForPage("document.querySelector('.ec-pause') !== null", { note: "a fresh capture boot lands in a live match, the only screen that offers Pause" });
    await f.click("Pause battle");
    await f.waitForPage("document.querySelector('.ec-front') !== null", { timeoutMs: 5000 });
    await f.click("Return to title");
    await f.waitForPage("document.querySelector('.ec-pause') === null", { timeoutMs: 10000 });
    await f.expectPage("document.querySelector('.ec-front') !== null && [...document.querySelectorAll('.ec-front button')].some(b => (b.innerText || '').trim() === 'Take command')", "arrival: the title screen offers Take command, so this is the menu and not the pause card");
  },
});
