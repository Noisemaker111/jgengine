import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.waitForPage("(window.__jgNativeUi?.stats().frames ?? 0) > 0", { timeoutMs: 60000, note: "native Rune submitted a frame" });
    await f.waitForPage("window.__jgNativeUi?.point('Pause battle') != null", { timeoutMs: 30000, note: "a fresh capture boot lands in a live match, the only screen that offers Pause" });
    await f.click("Pause battle");
    await f.see("Orders on hold", { timeoutMs: 5000 });
    await f.click("Return to title");
    await f.see("Take command", { timeoutMs: 10000, note: "arrival: the title screen offers Take command, so this is the menu and not the pause card" });
    await f.expectPage("window.__jgNativeUi.point('Pause battle') === null", "the battle's pause seal is gone from the title", true);
  },
});
