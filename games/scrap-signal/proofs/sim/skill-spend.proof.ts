import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { talentTree } from "../../src/game/characters";

export default defineProof(game, {
  proves: ["loot.build-choices"],
  setup(s) {
    s.waitFor((p) => p.health > 0, { timeoutMs: 10_000 });
    // A level's worth of skill points, as levelling up grants them.
    talentTree()?.grantPoints(3);
    s.ctx.scene.entity.stats.set(s.userId, "skillPoints", { current: talentTree()?.pointsAvailable() ?? 0 });
  },
  async play(p) {
    const before = await p.probe();
    await p.press("KeyK");
    await p.act("talent.spend", { nodeId: "gunk_hot_chamber" });
    await p.expect((r) => r.skillsLearned === before.skillsLearned + 1 && r.skillPoints === before.skillPoints - 1, "a point spent on a node of the build");
  },
});
