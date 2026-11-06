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
    s.waitFor((p) => p.bodyDistance > 50, { timeoutMs: 90_000 });
    s.command("cheat", { destroyWild: true });
    s.command("cheat", { goto: { cave: "cave_lower_south_cave", back: 30 } });
    s.waitFor((p) => p.atBody === 1, { timeoutMs: 5000 });
  },
  async play(p) {
    await p.hold("KeyE", { until: (r) => r.bodyDistance === -1, timeoutMs: 3000 });
    await p.expect((r) => r.carrying === 3, "everything carried again, the body gone");
  },
});
