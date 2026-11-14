import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/** Jacking into a drained Mowbot: its card shows the Discharge and Upload meters while it eats. A shot for review. */
const SLOW = { timeoutMs: 120000 };

export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.waitFor((p) => p.phase === 1 && p.health > 0, SLOW);
    await f.waitForPage("(window.__jgNativeUi?.stats().frames ?? 0) > 0", { note: "native Rune submitted a frame" });
    await f.command("cheat", { give: { mejoberry: 20 }, summon: { species: "mowbot", level: 3, distance: 2.5, knockedOut: true } });
    await f.wait(2000);
    await f.press("KeyE");
    await f.see(/Upload|Discharge/, SLOW);
    await f.wait(12000);
    await f.shot("wildwire-upload");
  },
});
