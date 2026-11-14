import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";
import toMenu from "./to-menu.flow";

export default defineFlow(game, {
  browser: true,
  async run(f) {
    await toMenu.run(f);
    await f.click("Free skirmish");
    await f.waitForPage("window.__jgNativeUi?.point('Pause battle') != null", { timeoutMs: 15000, note: "the live battle offers its pause seal" });
    const soldiers = "(() => { let n = 0; const walk = (x) => { if (x.props?.label === 'soldier unit') n += 1; x.children.forEach(walk); }; walk(window.__jgNativeUi.tree()); return n; })()";
    await f.waitForPage(`${soldiers} >= 5`, { timeoutMs: 5000, note: "the roster fills a frame after the match starts" });
    await f.expectPage(soldiers, "arrival: five soldiers on the field, not just a click that landed", 5);
    await f.see("Red nest", { note: "arrival: the live-match pantry strip is up" });
  },
});
