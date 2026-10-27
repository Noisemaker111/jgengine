import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.see(/gates open/i, { timeoutMs: 30000, note: "arrival: the park day is running and the gate is open, not a title card" });
    // the palette's carousel hotkey
    await f.press("Digit1");
    // an empty plot right of the main path, clear of the palette
    await f.clickAt(1120, 420);
    await f.see("8 rides · 3/8", { timeoutMs: 5000, note: "arrival: the starter park's two rides plus one placed carousel are online, so the ride exists in the park and not just as a selected blueprint" });
    // the palette's path hotkey
    await f.press("Digit6");
    await f.clickAt(1300, 470);
    await f.see("Path built", { timeoutMs: 5000, note: "arrival: a guest path is on the ground, the park's own notice confirming the placement" });
    await f.expect((p) => p.guests > 0, "arrival: guests are inside the park, from the live guest sim");
    // open the park books, where the day's ledger lives
    await f.press("KeyL");
    await f.expectPage("(() => { const m = /Today.{0,2}s sales\\s*\\$([\\d,]+)/.exec(document.body.innerText); return m === null ? -1 : Number(m[1].replace(/,/g, '')); })() > 0", "economy: the tills took money today, the same ledger the midnight bill reads");
  },
});
