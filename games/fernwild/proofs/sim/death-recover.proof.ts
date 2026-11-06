import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

export default defineProof(game, {
  proves: ["failure.lose-and-recover"],
  setup(s) {
    s.waitFor((p) => p.pedestals === 8, { timeoutMs: 60_000 });
    s.command("cheat", { give: { stone: 20, wood: 10, stone_pick: 1 }, toHotbar: ["stone_pick"] });
    s.waitFor((p) => p.carrying === 3, { timeoutMs: 3000 });
    s.command("cheat", { goto: { cave: "cave_lower_south_cave", back: 30 } });
    s.waitFor((p) => p.z < 1050, { timeoutMs: 3000 });
    s.command("cheat", { summon: { species: "raptor", level: 30, distance: 5 } });
  },
  async play(p) {
    // The wild raptor's own AI kills the survivor; they wake on the beach with their things left on the body.
    await p.waitFor((r) => r.bodyDistance > 50, { timeoutMs: 90_000, note: "killed and awake on the beach" });
    await p.expect((r) => r.carrying === 0 && r.bodyStacks === 3, "died empty-handed, everything with the body");
  },
});
