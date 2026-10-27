import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  state: "outpost",
  browser: true,
  async run(f) {
    await f.wait(7000);
    await f.hold("KeyQ", { ms: 700 });
    await f.wait(8000);
    await f.hold("KeyE", { ms: 1400 });
    await f.wait(8000);
    await f.hold("KeyQ", { ms: 700 });
    await f.wait(7000);
    await f.expect((p) => p.gathered >= 10 && (p.raiding === 1 || p.raids >= 1), "arrival: the crew hauled loads and the raid hit the base");
  },
});
