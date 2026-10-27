import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  state: "race",
  async run(f) {
    await f.press("KeyT");
    await f.hold("KeyW", { ms: 25000 });
    await f.expect((p) => p.racing === 1, "arrival: mid-race with assist on");
  },
});
