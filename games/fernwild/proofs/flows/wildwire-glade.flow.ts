import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/** Review shot: a jungle herd standing in the glade the foliage clearance opens round its spawn zone. */
export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.waitFor((p) => p.phase === 1 && p.health > 0, { timeoutMs: 120000 });
    await f.waitForPage("(window.__jgNativeUi?.stats().frames ?? 0) > 0", { note: "native Rune submitted a frame" });
    await f.command("cheat", { clock: 1800 });
    // A jungle herd's zone, from the edge of its glade.
    await f.command("cheat", { teleport: [-105, -118, 0] });
    await f.waitFor((p) => Math.abs(p.x + 105) < 2 && Math.abs(p.z + 118) < 2, { timeoutMs: 5000 });
    await f.wait(40000);
    await f.shot("wildwire-jungle-glade");
  },
});
