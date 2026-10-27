import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.see(/The road out/i, { timeoutMs: 60000, note: "arrival: a run is up and the first story beat started by itself" });
    await f.expect((p) => p.found === 0 && p.distance > 10, "arrival: nothing found yet, The Broken Gate is ahead on the compass");
    // walk forward to The Broken Gate: it is discovered
    await f.hold("KeyW", { ms: 4200 });
    await f.waitFor((p) => p.found >= 1, { timeoutMs: 6000 });
    await f.shot("found");
    // take Wing of Aurel on its shrine
    await f.press("KeyE");
    await f.waitFor((p) => p.relics >= 1, { timeoutMs: 6000 });
    await f.see(/Warden's Watch/i, { timeoutMs: 8000, note: "arrival: the story moved on to the next beat" });
    // jump and hold Space: the glide model carries you, read from the game's own glide clock
    await f.hold("Space", { ms: 1800 });
    await f.waitFor((p) => p.glided > 0.3, { timeoutMs: 2000 });
    await f.expect((p) => p.relics >= 1, "arrival: still carrying the relic after the glide");
    await f.shot("glide");
  },
});
