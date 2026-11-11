import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/** Native frames land a beat after a state change on a software adapter: let the page settle before a shot. */
const settle = (f: { wait(ms: number): Promise<void> }) => f.wait(4000);

/** The native page's text, for checks that read what the player sees. */
const text = "window.__jgNativeUi.text()";
const shows = (words: string): string => `${text}.includes(${JSON.stringify(words)})`;

/**
 * Every Brightway screen on the native Rune surface, by real clicks: the title board and its panes,
 * a settings change, a new park's HUD, the palette, the lab, the books, an inspected ride, pause,
 * save, and a reload that loads the saved park back.
 */
export default defineFlow(game, {
  browser: true,
  state: "title",
  async run(f) {
    await f.waitForPage("(window.__jgNativeUi?.stats().frames ?? 0) > 0", { note: "native Rune submitted a frame" });
    await f.see("Open the park");
    await settle(f); await f.shot("title");
    await f.click("Settings");
    await f.see("Reduce motion");
    await settle(f); await f.shot("settings");
    await f.click("Back");
    await f.click("Credits");
    await f.see("KayKit City Builder");
    await settle(f); await f.shot("credits");
    await f.click("Back");
    await f.click("Park saves");
    await f.see("Nothing saved yet");
    await settle(f); await f.shot("saves-empty");
    await f.click("Back");
    await f.click("Open the park");
    await f.see("NEXT STEP", { timeoutMs: 15000, note: "a new park opens the first scenario with its hint" });
    await f.see("Pick a ticket");
    await settle(f); await f.shot("hud-build");
    await f.click("Staff");
    await f.see("Handyman");
    await f.click("Handyman");
    await f.see("Done placing Handyman");
    await settle(f); await f.shot("hud-placing");
    await f.click("Done placing");
    await f.click("Lab");
    await f.see("Idle: pick a topic");
    await settle(f); await f.shot("hud-research");
    await f.click("Close research lab");
    await f.click("Books");
    await f.see("Entry ticket");
    await f.click("Raise ticket price");
    await settle(f); await f.shot("hud-books");
    await f.click("Close park books");
    // A carousel on the lot by the palette key and the pointer command the canvas sends; placing it opens its window.
    await f.press("Digit1");
    await f.command("park.pointer", { point: [4, 0, 36], entity: null, object: null });
    await f.see("Carousel built", { timeoutMs: 5000 });
    await f.press("KeyX");
    await f.command("park.dev.select", { kind: "ride_carousel" });
    await f.see("Demolish", { timeoutMs: 5000, note: "an inspected ride opens its window" });
    await f.see("Connect it");
    await settle(f); await f.shot("hud-inspector");
    await f.click("Close inspector");
    await f.click("Pause park");
    await f.see("Resume the park");
    await settle(f); await f.shot("pause");
    await f.click("Save the park");
    await f.see("The park is on the board", { timeoutMs: 8000 });
    await f.click("Park settings");
    await f.see("Reduce motion");
    await settle(f); await f.shot("pause-settings");
    await f.click("Back");
    await f.click("How to play");
    await f.see("Pan with WASD");
    await settle(f); await f.shot("pause-help");
    await f.click("Back");
    await f.click("Resume the park");
    await f.waitForPage(`!${shows("Resume the park")}`, { note: "resume closes the pause board" });
    await f.reload();
    await f.see("Continue");
    await f.click("Park saves");
    await f.see("Load this park");
    await settle(f); await f.shot("saves");
    await f.click("Load this park");
    await f.waitForPage("window.__jgNativeUi.point('Pause park') !== null", { timeoutMs: 15000, note: "loading the save returns to the park" });
    await settle(f); await f.shot("loaded");
    await f.click("Pause park");
    await f.click("Park settings");
    await f.click("Reduce motion");
    await f.waitForPage("localStorage.getItem('brightway-park.reduced-motion') === 'true'", { note: "settings: Reduce motion is kept" });
    await settle(f); await f.shot("pause-settings-reduced");
  },
});
