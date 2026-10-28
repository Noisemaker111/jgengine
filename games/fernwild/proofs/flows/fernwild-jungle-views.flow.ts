import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/** Noon on the south beach: the jungle wall from the sand, the sea behind, then first person under the canopy. */
export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.waitFor((p) => p.creatures > 0, { timeoutMs: 60000 });
    await f.command("cheat", { clock: 1800, teleport: [229.5, 1345, Math.PI] });
    await f.wait(2500);
    await f.shot("fernwild-jungle-edge");
    await f.command("cheat", { teleport: [229.5, 1330, 0] });
    await f.wait(2500);
    await f.shot("fernwild-beach-sea");
    await f.press("KeyV");
    await f.command("cheat", { teleport: [229.5, 1262, Math.PI] });
    await f.wait(2500);
    await f.shot("fernwild-jungle-inside");
  },
});
