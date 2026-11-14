import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";
import openPark from "./to-open-park.flow";
import { lotScreen } from "./lotScreen";

/**
 * The first jam, from the empty lot: the open-park proof, a scare that brings the Victorian Child,
 * then the carousel runs until it wears out and seizes up on its own. It stays down, the hint says to
 * bind a gremlin and rings Spooks, the player binds one by clicking, and the gremlin goes straight to
 * the ride and un-jams it.
 */
export default defineFlow(game, {
  browser: true,
  async run(f) {
    await openPark.run(f);
    // Close the ledger, then take the hint's scare step: a Jack-in-the-Coffin beside the path.
    await f.press("KeyL");
    await f.click("Scares");
    await f.click("Jack-in-the-Coffin");
    const nook = await lotScreen(f, -4, 36);
    await f.clickAt(nook.x, nook.y);
    await f.see("Jack-in-the-Coffin built", { timeoutMs: 5000, note: "scare: a toy-coffin jolts the path beside the carousel" });
    await f.press("KeyX");
    // The séance step: the Grave-Dirt Sundaes from the Séance panel.
    await f.click("Séance");
    await f.click("Grave-Dirt Sundaes");
    await f.click("Séance");
    // The carousel and the coffin are all the Victorian Child wants: she moves in, and the next step is a gremlin.
    await f.timeScale(4);
    await f.waitForPage("globalThis.__brightway.read().ghosts === 1", { timeoutMs: 30000, note: "ghost: the Victorian Child moves in" });
    await f.timeScale(1);
    await f.waitForPage("globalThis.__brightway.read().hint === 'mechanic'", { timeoutMs: 3000, note: "hint: with a ghost at home, the next step is a gremlin" });
    await f.timeScale(8);
    await f.waitFor((p) => p.breakdowns > 0, { timeoutMs: 120000, note: "breakdown: the carousel wears out and breaks on its own" });
    await f.timeScale(1);
    await f.see(/bind a Gremlin Tinker/i, { timeoutMs: 5000, note: "jam: the haunt says the ride needs a gremlin" });
    await f.waitForPage("globalThis.__brightway.read().hint === 'mechanic'", { timeoutMs: 3000, note: "hint: the next step is binding a gremlin" });
    await f.expectPage("['category:staff', 'item:staff_mechanic', 'hud:build'].includes(globalThis.__brightway.read().pointed)", "hint: the hint rings the way to the Spooks palette");
    await f.shot("hauntworks-first-jam");
    // With no mechanic, nothing fixes it: still down after a while.
    await f.timeScale(4);
    await f.wait(5000);
    await f.timeScale(1);
    await f.expect((p) => p.breakdowns > 0, "breakdown: the ride is still waiting");
    await f.expectPage("window.__jgNativeUi.text().includes('ride jammed') || window.__jgNativeUi.text().includes('rides jammed')", "jam: the status card counts the ride as jammed");

    await f.click("Spooks");
    await f.click("Gremlin Tinker");
    const grass = await lotScreen(f, -12, 36);
    await f.clickAt(grass.x, grass.y);
    await f.see("Gremlin Tinker built", { timeoutMs: 5000, note: "fix: a gremlin is bound by clicking the palette and the lot" });
    await f.waitForPage("globalThis.__brightway.read().hint === null", { timeoutMs: 3000, note: "hint: the gremlin step is done" });
    await f.timeScale(4);
    await f.see(/running again/i, { timeoutMs: 60000, note: "fix: the new gremlin goes straight to the jammed ride and it runs again" });
    await f.timeScale(1);
    await f.expectPage("!window.__jgNativeUi.text().includes('ride jammed')", "fix: no ride is jammed any more");
    await f.shot("hauntworks-gremlin-fixed");
  },
});
