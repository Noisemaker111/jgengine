import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

export default defineProof(game, {
  proves: ["harvest.tool-bias"],
  setup(s) {
    s.waitFor((p) => p.treeDist >= 0, { timeoutMs: 60_000 });
    s.command("cheat", { give: { stone_hatchet: 1 }, toHotbar: ["stone_hatchet"] });
  },
  async play(p) {
    const start = await p.probe();
    await p.heading(start.treeYaw);
    await p.hold("KeyW", { until: (r) => r.aimStrike === 1, ms: 100, timeoutMs: 30_000 });
    const atTree = await p.probe();
    await p.hold("mouse0", { ms: 3000 });
    const fist = await p.probe();
    await p.press("Digit1");
    await p.hold("mouse0", { ms: 3000 });
    const fistWood = fist.wood - atTree.wood;
    const fistThatch = fist.thatch - atTree.thatch;
    await p.expect(
      (r) => fistThatch > fistWood && r.wood - fist.wood > fistWood && r.wood - fist.wood > r.thatch - fist.thatch,
      "a fist gets thatch from the tree, a hatchet gets wood",
    );
  },
});
