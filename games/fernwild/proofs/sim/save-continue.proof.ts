import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// The survivor walks up the beach and the player saves from the pause menu. Quitting and opening the game again
// lands on the title; Continue puts the survivor back where the save left them, not on the spawn.
export default defineProof(game, {
  proves: ["save.continue"],
  async play(p) {
    const spawn = await p.waitFor((r) => r.phase === 1 && r.health > 0, { timeoutMs: 60_000, note: "in play on the beach" });
    await p.hold("KeyW", { ms: 3000 });
    const walked = await p.expect((r) => Math.hypot(r.x - spawn.x, r.z - spawn.z) > 8, "the survivor walked away from the spawn");
    await p.press("Escape");
    await p.act("save");
    await p.restart("title");
    await p.expect((r) => r.phase === 0, "a new game session opens on the title");
    await p.act("continue");
    await p.waitFor((r) => r.phase === 1, { timeoutMs: 5000, note: "Continue enters play" });
    await p.expect(
      (r) => Math.hypot(r.x - walked.x, r.z - walked.z) < 1.5 && Math.hypot(r.x - spawn.x, r.z - spawn.z) > 8,
      "the survivor is where the save left them, not on the spawn",
    );
  },
});
