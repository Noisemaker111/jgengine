import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  state: "siege",
  browser: true,
  async run(f) {
    await f.wait(9000);
    await f.hold("KeyQ", { ms: 700 });
    await f.wait(8000);
    await f.hold("KeyE", { ms: 1400 });
    await f.wait(8000);
    await f.hold("KeyQ", { ms: 700 });
    await f.wait(6000);
    await f.expect((p) => p.kills >= 3, "arrival: the staged towers are killing the third wave");
  },
});
