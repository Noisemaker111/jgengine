import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  state: "town",
  browser: true,
  async run(f) {
    await f.wait(9000);
    await f.hold("KeyQ", { ms: 1400 });
    await f.wait(4000);
    await f.hold("KeyW", { ms: 900 });
    await f.wait(6000);
    await f.hold("KeyE", { ms: 1600 });
    await f.wait(9000);
    await f.expect((p) => p.built >= 3, "arrival: the staged town is built and working");
  },
});
