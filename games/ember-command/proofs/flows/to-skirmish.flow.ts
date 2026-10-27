import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";
import toMenu from "./to-menu.flow";

export default defineFlow(game, {
  browser: true,
  async run(f) {
    await toMenu.run(f);
    await f.click("Free skirmish");
    await f.waitForPage("document.querySelector('.ec-pause') !== null", { timeoutMs: 15000 });
    await f.waitForPage("document.querySelectorAll('[aria-label=\"army units\"] [role=\"listitem\"]').length >= 5", { timeoutMs: 5000, note: "the roster fills a frame after the match starts" });
    await f.expectPage("document.querySelectorAll('[aria-label=\"army units\"] [role=\"listitem\"]').length", "arrival: five footmen on the field, not just a click that landed", 5);
    await f.expectPage("document.querySelector('.ec-stock') !== null", "arrival: the live-match stockpile strip is up");
  },
});
