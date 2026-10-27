import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  state: "journey",
  async run(f) {
    await f.wait(2000);
    await f.hold("KeyD", { ms: 700 });
    await f.hold("KeyW", { ms: 1500 });
    await f.hold(["KeyW", "Space"], { ms: 2600 });
    await f.hold("KeyD", { ms: 1200 });
    await f.hold("KeyS", { ms: 2500 });
    await f.press("KeyT");
    await f.wait(2500);
    await f.hold("KeyA", { ms: 3000 });
    await f.hold(["KeyA", "Space"], { ms: 2600 });
    await f.hold(["KeyA", "ShiftLeft"], { ms: 5000 });
    await f.hold(["KeyA", "KeyW"], { ms: 3000 });
    await f.press("mouse0");
    await f.wait(400);
    await f.press("mouse0");
    await f.wait(2000);
    await f.expect((p) => p.found >= 2 && p.glided > 0.3, "arrival: two places on the map and a glide flown during the clip");
  },
});
