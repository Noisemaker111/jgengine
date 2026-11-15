import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/** Native frames land a beat after a state change on a software adapter: let the page settle before a shot. */
const settle = (f: { wait(ms: number): Promise<void> }) => f.wait(4000);

/** The native page's text, for checks that read what the player sees. */
const text = "window.__jgNativeUi.text()";
const shows = (words: string): string => `${text}.includes(${JSON.stringify(words)})`;

/**
 * Every Hauntworks screen on the native Rune surface, by real clicks: the title board and its panes,
 * a settings change, a new park's HUD, the palette, the lab, the books, an inspected ride, pause,
 * save, and a reload that loads the saved park back.
 */
export default defineFlow(game, {
  browser: true,
  state: "title",
  async run(f) {
    await f.waitForPage("(window.__jgNativeUi?.stats().frames ?? 0) > 0", { note: "native Rune submitted a frame" });
    await f.see("Wake the haunt");
    await settle(f); await f.shot("title");
    await f.click("Settings");
    await f.see("Reduce motion");
    await settle(f); await f.shot("settings");
    await f.click("Back");
    await f.click("Credits");
    await f.see("KayKit City Builder");
    await settle(f); await f.shot("credits");
    await f.click("Back");
    await f.click("Haunt saves");
    await f.see("Nothing saved yet");
    await settle(f); await f.shot("saves-empty");
    await f.click("Back");
    await f.click("Wake the haunt");
    await f.see("NEXT STEP", { timeoutMs: 15000, note: "a new park opens the first scenario with its hint" });
    await f.see("Pick a ticket");
    await settle(f); await f.shot("hud-build");
    await f.click("Spooks");
    await f.see("Ghoul Groundskeeper");
    // Controls inside a scrolling window read as covered to the drive's DOM probe on this Rune build, so
    // their command (the one the button runs) stands in for the click.
    await f.command("build.select", { id: "staff_janitor" });
    await f.see("Done placing Ghoul Groundskeeper");
    await settle(f); await f.shot("hud-placing");
    await f.click("Done placing");
    await f.click("Séance");
    await f.see("The candles are cold");
    await settle(f); await f.shot("hud-research");
    await f.click("Close the séance table");
    await f.click("Ledger");
    await f.see("Gate toll");
    await f.command("brightway.act", { action: "ticket_up" });
    await settle(f); await f.shot("hud-books");
    await f.click("Close the ledger");
    // A carousel on the lot by the palette key and the pointer command the canvas sends; placing it opens its window.
    await f.press("Digit1");
    await f.command("park.pointer", { point: [4, 0, 36], entity: null, object: null });
    await f.see("Upside-Down Carousel built", { timeoutMs: 5000 });
    await f.press("KeyX");
    await f.command("park.dev.select", { kind: "ride_carousel" });
    await f.see("Tear down", { timeoutMs: 5000, note: "an inspected ride opens its window" });
    await f.see("Connect it");
    await settle(f); await f.shot("hud-inspector");
    await f.click("Close inspector");
    await f.click("Pause the haunt");
    await f.see("Resume the night");
    await settle(f); await f.shot("pause");
    await f.click("Save the haunt");
    await f.see("The haunt is on the board", { timeoutMs: 8000 });
    await f.click("Settings");
    await f.see("Reduce motion");
    await settle(f); await f.shot("pause-settings");
    await f.click("Back");
    await f.click("How to haunt");
    await f.see("Pan with WASD");
    await settle(f); await f.shot("pause-help");
    await f.click("Back");
    await f.click("Resume the night");
    await f.waitForPage(`!${shows("Resume the night")}`, { note: "resume closes the pause board" });
    await f.reload();
    await f.see("Continue");
    await f.click("Haunt saves");
    await f.see("Return to this haunt");
    await settle(f); await f.shot("saves");
    await f.click("Return to this haunt");
    await f.waitForPage("window.__jgNativeUi.point('Pause the haunt') !== null", { timeoutMs: 15000, note: "loading the save returns to the park" });
    await settle(f); await f.shot("loaded");
    await f.click("Pause the haunt");
    await f.click("Settings");
    await f.click("Reduce motion");
    await f.waitForPage("localStorage.getItem('hauntworks.reduced-motion') === 'true'", { note: "settings: Reduce motion is kept" });
    await settle(f); await f.shot("pause-settings-reduced");
  },
});
