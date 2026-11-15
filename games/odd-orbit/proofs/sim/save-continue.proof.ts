import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// The landlord gives Pip-9 a room and steps outside (which writes the house down). Opened again on
// the title, Continue brings the house back with Pip-9 still in room 4.
export default defineProof(game, {
  proves: ["save.continue"],
  async play(p) {
    await p.expect((r) => r.screen === 0 && r.pipRoom === -1, "in play, Pip-9 in the cupboard");
    await p.act("room.move", { id: "alien:3", slot: 3 });
    await p.expect((r) => r.pipRoom === 3, "Pip-9 moved into room 4");
    await p.act("orbit.title", {});
    await p.restart("title");
    await p.expect((r) => r.screen === 1, "a new session opens on the title");
    await p.act("orbit.continue", {});
    await p.waitFor((r) => r.screen === 0 && r.members === 4, { timeoutMs: 10_000, note: "Continue enters play" });
    await p.expect((r) => r.pipRoom === 3, "Pip-9 is still in room 4 after the restart");
  },
});
