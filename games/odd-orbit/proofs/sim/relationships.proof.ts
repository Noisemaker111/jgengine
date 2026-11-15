import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// The player sends Sister Fog and Pip-9 to chat; their opinion of each other rises.
export default defineProof(game, {
  proves: ["life.relationships"],
  async play(p) {
    const before = await p.probe();
    await p.act("member.socialize", { id: "alien:2", withId: "alien:3" });
    await p.waitFor((r) => r.fogPip > before.fogPip + 3, { timeoutMs: 40_000, note: "the chat warms Sister Fog and Pip-9 to each other" });
  },
});
