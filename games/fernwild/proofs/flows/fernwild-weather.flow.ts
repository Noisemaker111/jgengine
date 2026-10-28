import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/** At the waterline: a few seconds of waves, then the clock runs fast through the overcast into rain. */
export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.waitFor((p) => p.creatures > 0, { timeoutMs: 60000 });
    await f.command("cheat", { teleport: [229.5, 1342, 0] });
    await f.command("cheat", { clock: 2330 });
    await f.wait(5000);
    await f.timeScale(12);
    await f.wait(12000);
    await f.timeScale(1);
    await f.wait(4000);
  },
});
