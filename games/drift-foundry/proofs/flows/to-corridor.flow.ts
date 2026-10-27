import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.see("LAP 1/1", { timeoutMs: 30000, note: "arrival: a run is live and the HUD's own race line is up, not the pit menu" });
    // throttle down the corridor
    await f.hold("KeyW", { ms: 3000 });
    await f.waitFor((p) => p.z > 12, { timeoutMs: 15000, note: "arrival: the buggy travelled past 12 m of the 470 m corridor (it starts at z=4), so the run state advanced and not just the keypress" });
  },
});
