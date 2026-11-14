import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { outInTheHouse } from "./scenarios";

// Out in the house, the player saves from the pause menu and quits. Continue puts the Little back in
// the same seeded house, in the same room, with the same night on the clock.
export default defineProof(game, {
  proves: ["save.continue"],
  async setup(s) { await outInTheHouse(s); },
  async play(p) {
    await p.hold("KeyW", { ms: 1500 });
    const out = await p.expect((r) => r.inRun === 1 && r.elapsed > 1, "a night under way");
    await p.act("deepward.saveRecord");
    await p.wait(300);
    await p.restart("title");
    await p.expect((r) => r.inRun === 0, "a new session opens at the title");
    await p.act("deepward.continue");
    await p.waitFor((r) => r.inRun === 1, { timeoutMs: 5000, note: "Continue resumes the run" });
    await p.expect((r) => r.seedHash === out.seedHash && r.roomHash === out.roomHash && r.elapsed >= out.elapsed - 0.5, "the same house, the same room, the same night");
  },
});
