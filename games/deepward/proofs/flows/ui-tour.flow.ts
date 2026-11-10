import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  browser: true,
  state: "title",
  async run(f) {
    await f.waitForPage("(window.__jgNativeUi?.stats().frames ?? 0) > 0", { note: "native Rune submitted a frame" });
    await f.see("New dive");
    await f.shot("native-title");
    await f.click("Settings");
    await f.see("Master volume");
    await f.wait(2000);
    const frames = await f.page("window.__jgNativeUi.stats().frames");
    await f.wait(1000);
    await f.expectPage("window.__jgNativeUi.stats().frames", "static settings submits no frames", frames);
    await f.shot("native-settings");
    await f.click("New dive");
    await f.click("Take the rail");
    await f.see("Rail departure / 06");
    await f.shot("native-hud");
  },
});
