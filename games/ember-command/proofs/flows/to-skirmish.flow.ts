import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";
import toMenu from "./to-menu.flow";

export default defineFlow(game, {
  browser: true,
  async run(f) {
    await toMenu.run(f);
    await f.page("window.__jgNativeUi.press('Free skirmish')");
    // The title's verb opens the skirmish sheet; its own button marches out if the verb only selected it.
    await f.wait(1500);
    await f.page("(() => { const ui = window.__jgNativeUi; if (ui.point('Pause battle') == null && ui.point('Into the yard') != null) ui.press('Into the yard'); return true; })()");
    await f.waitForPage("window.__jgNativeUi?.point('Pause battle') != null", { timeoutMs: 60000, note: "the live battle offers its pause seal (a restaged yard can take a while on a software renderer)" });
    const soldiers = "(() => { let n = 0; const walk = (x) => { if (x.props?.label === 'soldier unit') n += 1; x.children.forEach(walk); }; walk(window.__jgNativeUi.tree()); return n; })()";
    await f.waitForPage(`${soldiers} >= 5`, { timeoutMs: 30000, note: "the roster fills a frame after the match starts" });
    await f.expectPage(soldiers, "arrival: five soldiers on the field, not just a click that landed", 5);
    await f.see("Red nest", { note: "arrival: the live-match pantry strip is up" });
  },
});
