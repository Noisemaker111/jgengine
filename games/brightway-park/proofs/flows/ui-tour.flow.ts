import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/** Native frames land a beat after a state change on a software adapter: let the page settle before a shot. */
const settle = (f: { wait(ms: number): Promise<void> }) => f.wait(4000);

/**
 * Click a control once Rune says it can be pointed at: panes fade in and out over each other, and on
 * a software renderer a click sent mid-fade lands on the pane that is leaving.
 */
async function tap(f: { waitForPage(expression: string, options?: { timeoutMs?: number; note?: string }): Promise<unknown>; click(label: string): Promise<unknown> }, label: string): Promise<void> {
  await f.waitForPage(`window.__jgNativeUi.point(${JSON.stringify(label)}) !== null`, { timeoutMs: 20000 });
  await f.click(label);
}

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
    await tap(f, "Settings");
    await f.see("Reduce motion");
    await settle(f); await f.shot("settings");
    await tap(f, "Back");
    // The pane fades out over the menu; let it go before the next click.
    await settle(f);
    await tap(f, "Credits");
    await f.see("KayKit City Builder");
    await settle(f); await f.shot("credits");
    await tap(f, "Back");
    await settle(f);
    await tap(f, "Haunt saves");
    await f.see("Nothing saved yet");
    await settle(f); await f.shot("saves-empty");
    await tap(f, "Back");
    await settle(f);
    await tap(f, "Wake the haunt");
    await f.see("NEXT STEP", { timeoutMs: 15000, note: "a new park opens the first scenario with its hint" });
    await f.see("Pick a ticket");
    await settle(f); await f.shot("hud-build");
    await tap(f, "Spooks");
    await f.see("Ghoul Groundskeeper");
    // Controls inside a scrolling window read as covered to the drive's DOM probe on this Rune build, so
    // their command (the one the button runs) stands in for the click.
    await f.command("build.select", { id: "staff_janitor" });
    await f.see("Done placing Ghoul Groundskeeper");
    await settle(f); await f.shot("hud-placing");
    await tap(f, "Done placing");
    await tap(f, "Séance");
    await f.see("The candles are cold");
    await settle(f); await f.shot("hud-research");
    await tap(f, "Close the séance table");
    await tap(f, "Ledger");
    await f.see("Gate toll");
    await f.command("brightway.act", { action: "ticket_up" });
    await settle(f); await f.shot("hud-books");
    await tap(f, "Close the ledger");
    // A carousel on the lot by its palette ticket and the pointer command the canvas sends (the ticket's
    // own command, since a capture boot leaves the keyboard off the play surface).
    await f.command("build.select", { id: "ride_carousel" });
    await f.command("park.pointer", { point: [4, 0, 36], entity: null, object: null });
    await f.see("Upside-Down Carousel built", { timeoutMs: 5000 });
    await f.press("KeyX");
    await f.command("park.dev.select", { kind: "ride_carousel" });
    await f.see("Tear down", { timeoutMs: 5000, note: "an inspected ride opens its window" });
    await f.see("Connect it");
    await settle(f); await f.shot("hud-inspector");
    await tap(f, "Close inspector");
    await tap(f, "Pause the haunt");
    await f.see("Resume the night");
    await settle(f); await f.shot("pause");
    await tap(f, "Save the haunt");
    await f.see("The haunt is on the board", { timeoutMs: 30000, note: "the save takes a thumbnail first, slow on a software renderer" });
    await tap(f, "Settings");
    await f.see("Reduce motion");
    await settle(f); await f.shot("pause-settings");
    await tap(f, "Back");
    await settle(f);
    await tap(f, "How to haunt");
    await f.see("Pan with WASD");
    await settle(f); await f.shot("pause-help");
    await tap(f, "Back");
    await settle(f);
    await tap(f, "Resume the night");
    await f.waitForPage(`!${shows("Resume the night")}`, { note: "resume closes the pause board" });
    await f.reload();
    await f.see("Continue");
    await tap(f, "Haunt saves");
    await f.see("Return to this haunt");
    await settle(f); await f.shot("saves");
    // The saves list scrolls, and a control inside a scrolling window reads as covered to the drive on
    // this Rune build; the title's Continue loads the same, newest save.
    await tap(f, "Back");
    await settle(f);
    await tap(f, "Continue");
    await f.waitForPage("window.__jgNativeUi.point('Pause the haunt') !== null", { timeoutMs: 45000, note: "loading the save returns to the park" });
    await settle(f); await f.shot("loaded");
    await tap(f, "Pause the haunt");
    await f.see("Resume the night");
    await settle(f);
    await tap(f, "Settings");
    await f.see("Reduce motion");
    await settle(f);
    await tap(f, "Reduce motion");
    await f.waitForPage("localStorage.getItem('hauntworks.reduced-motion') === 'true'", { note: "settings: Reduce motion is kept" });
    await settle(f); await f.shot("pause-settings-reduced");
  },
});
