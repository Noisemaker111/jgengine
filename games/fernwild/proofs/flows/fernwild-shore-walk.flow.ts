import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/** First person at noon: wade out of the south-beach shallows, cross the sand and walk into the jungle. */
export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.waitFor((p) => p.creatures > 0, { timeoutMs: 60000 });
    await f.press("KeyV");
    await f.command("cheat", { clock: 1800, teleport: [229.5, 1352, Math.PI] });
    await f.wait(2000);
    await f.hold("KeyW", { until: (p) => p.z < 1268, timeoutMs: 40000 });
    await f.expect((p) => p.z < 1268, "walked off the sand into the jungle");
  },
});
