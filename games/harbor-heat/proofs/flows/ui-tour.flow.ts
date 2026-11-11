import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/** Every Harbor Heat screen on the native Rune surface: title objects, settings, a new run, HUD, city phone and pause. */
export default defineFlow(game, {
  browser: true,
  state: "title",
  async run(f) {
    await f.waitForPage("(window.__jgNativeUi?.stats().frames ?? 0) > 0", { note: "native Rune submitted a frame" });
    await f.see("TONIGHT ON THE COAST");
    await f.shot("title");
    await f.click("Hit the street");
    await f.see("Courier licence");
    await f.click("Courier name");
    await f.see("TYPE A NAME");
    // The licence signs from key codes (Rune has no native text field yet), so press real keys.
    for (const key of ["KeyJ", "KeyO", "KeyN"] as const) await f.press(key);
    await f.press("Enter");
    await f.see("Jon");
    await f.shot("licence");
    await f.page("window.__jgNativeUi.text().includes('Back to the sign') ? window.__jgNativeUi.press('◀ Back to the sign') : null");
    await f.click("Missions & parcels");
    await f.see("Start here");
    await f.shot("bays");
    await f.page("window.__jgNativeUi.text().includes('Back to the sign') ? window.__jgNativeUi.press('◀ Back to the sign') : null");
    await f.click("Settings");
    await f.see("SOUND");
    await f.shot("title-settings");
    await f.click("Next page");
    await f.shot("title-settings-next");
    await f.page("window.__jgNativeUi.text().includes('Back to the sign') ? window.__jgNativeUi.press('◀ Back to the sign') : null");
    await f.click("Credits");
    await f.see("Who made the heat");
    await f.shot("credits");
    await f.page("window.__jgNativeUi.text().includes('Back to the sign') ? window.__jgNativeUi.press('◀ Back to the sign') : null");
    await f.click("Hit the street");
    await f.click("Take the run");
    await f.see("MAINSAIL page", { timeoutMs: 60_000 });
    await f.shot("hud");
    await f.click("Phone");
    await f.see("Taxi light");
    await f.shot("city-phone");
    await f.click("Put away");
    await f.click("Pause");
    await f.see("Back to the coast");
    await f.shot("pause");
    await f.click("Settings & controls");
    await f.see("SOUND");
    // Paused, the burner's clock stops with the city, so its settings page is static.
    await f.wait(2000);
    const frames = await f.page("window.__jgNativeUi.stats().frames");
    await f.wait(1000);
    await f.expectPage("window.__jgNativeUi.stats().frames", "static settings submits no frames", frames);
    await f.shot("pause-settings");
    await f.click("Next page");
    await f.shot("pause-settings-next");
  },
});
