import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  state: "wave",
  async run(f) {
    await f.wait(21000);
    await f.hold("KeyW", { ms: 600 });
    for (let i = 0; i < 24; i += 1) {
      await f.press("mouse0");
      await f.wait(450);
    }
    await f.expect((p) => p.wave >= 1, "arrival: still in the night after the fight");
  },
});
