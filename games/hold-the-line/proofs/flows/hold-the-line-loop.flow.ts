import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.see(/First night/i, { timeoutMs: 60000, note: "arrival: a run is up and the first story beat started by itself" });
    // build a barricade in front of you
    await f.press("Digit1");
    await f.waitFor((p) => p.built >= 1, { timeoutMs: 8000 });
    // call the first night early
    await f.press("KeyN");
    await f.waitFor((p) => p.wave >= 1, { timeoutMs: 10000 });
    await f.expect((p) => p.alive > 0, "arrival: the night spawned at the lairs, read from the game's own session");
    await f.wait(25000);
    for (let i = 0; i < 30; i += 1) {
      await f.press("mouse0");
      await f.wait(400);
    }
    await f.waitFor((p) => p.alive < 3, { timeoutMs: 30000, note: "arrival: swings landed and attackers fell, so the fight is real and not only the spawn" });
  },
});
