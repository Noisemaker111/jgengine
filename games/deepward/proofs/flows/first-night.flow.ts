import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

// A new burrow, played with keys: walk to the crack, slip out, look around the first room, and come
// straight back through the crack to bank the night.
export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.waitFor((p) => p.home === 1, { timeoutMs: 20000 });
    // The crack glows at the far end of the burrow; walk to it.
    await f.hold("KeyW", { until: (p) => p.z < -173.5, timeoutMs: 10000 });
    await f.press("KeyE");
    await f.waitFor((p) => p.inRun === 1, { timeoutMs: 15000 });
    // Arrival: out in tonight's house, at the crack home, 3 AM.
    await f.expect((p) => p.depth === 0 && p.health > 0, "arrival: the first room, with the crack home right here");
    await f.wait(2500);
    await f.press("KeyE");
    await f.waitFor((p) => p.home === 1, { timeoutMs: 20000 });
    await f.expect((p) => p.extractions === 1, "arrival: home safe, the night counted");
  },
});
