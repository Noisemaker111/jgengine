import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// Herds come back. Setup waits for the beach herd by the survivor's start, then clears every wild
// animal (ARK's DestroyWildDinos). Play leaves, stays away out of sight for the four-minute refill, and
// walks back to find the beach repopulated.
export default defineProof(game, {
  proves: ["spawns.respawn-population"],
  setup(s) {
    s.waitFor((p) => p.wildNear >= 2, { timeoutMs: 20_000 });
    s.command("cheat", { destroyWild: true });
  },
  async play(p) {
    await p.expect((r) => r.wildNear === 0, "the beach is empty");
    await p.hold("KeyW", { ms: 20_000 });
    await p.wait(250_000);
    await p.hold("KeyS", { ms: 20_000 });
    await p.waitFor((r) => r.wildNear >= 2, { timeoutMs: 20_000, note: "the beach herd has come back" });
  },
});
