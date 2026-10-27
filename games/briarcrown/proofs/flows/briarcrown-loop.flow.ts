import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.see(/A roof for everyone/i, { timeoutMs: 60000, note: "arrival: the realm is up and the first story beat started by itself" });
    await f.waitFor((p) => p.people >= 1, { timeoutMs: 10000, note: "arrival: the lord's hall stands and houses its first people" });
    // pick up a cottage
    await f.press("Digit1");
    await f.waitFor((p) => p.armed === 1, { timeoutMs: 5000 });
    // click the ground left of the hall: the home goes up
    await f.clickAt(420, 330);
    await f.waitFor((p) => p.building + p.built >= 1, { timeoutMs: 5000 });
    // pick up a lumber camp
    await f.press("Digit3");
    await f.waitFor((p) => p.armed === 3, { timeoutMs: 5000 });
    // click the ground right of the hall: the workplace goes up
    await f.clickAt(1150, 560);
    await f.waitFor((p) => p.building + p.built >= 2, { timeoutMs: 5000 });
    // right click puts the tool down
    await f.clickAt(640, 260, { button: "right" });
    await f.waitFor((p) => p.armed === 0, { timeoutMs: 5000 });
    await f.waitFor((p) => p.built >= 2 && p.building === 0, { timeoutMs: 30000 });
    await f.expect((p) => p.built >= 2, "arrival: both finished building");
    // resource readings are keyed by the idea's resource ids, which the probe's type does not carry yet
    const wood = Number(await f.page("__jgProbe().wood"));
    await f.waitForPage(`__jgProbe().wood >= ${wood + 3}`, { timeoutMs: 30000, note: "arrival: the workplace is working - wood piles up" });
  },
});
