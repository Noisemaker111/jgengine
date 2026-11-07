import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// The south-coast beach and the northern snow fill with different animals. Setup notes the beach's mix
// at the survivor's start, then sets them down in the snow; play waits there for the herds to fill.
export default defineProof(game, {
  proves: ["spawns.biome-weighted"],
  setup(s) {
    s.waitFor((p) => p.nearCoastKinds >= 2 && p.nearSnowKinds === 0, { timeoutMs: 20_000 });
    s.command("cheat", { teleport: [-980.8, -1146.7] });
  },
  async play(p) {
    await p.waitFor((r) => r.nearSnowKinds >= 2, { timeoutMs: 20_000, note: "snow animals fill the snow" });
    await p.expect((r) => r.nearCoastKinds === 0, "none of the beach's animals live in the snow");
  },
});
