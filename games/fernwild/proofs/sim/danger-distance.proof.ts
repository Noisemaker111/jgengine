import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// Animals by the starting beach roll low levels; ones in the far snow roll far higher. Setup notes the
// levels around the survivor's start, then sets them down in the snow, about 2.5 km away.
export default defineProof(game, {
  proves: ["spawns.danger-by-distance"],
  setup(s) {
    s.waitFor((p) => p.wildLevelNear > 0, { timeoutMs: 20_000 });
    s.wait(2000);
    s.waitFor((p) => p.wildLevelNear <= 5, { timeoutMs: 1000 });
    s.command("cheat", { teleport: [-980.8, -1146.7] });
  },
  async play(p) {
    await p.waitFor((r) => r.wildLevelNear > 15, { timeoutMs: 20_000, note: "the snow's animals are far stronger than the beach's" });
  },
});
