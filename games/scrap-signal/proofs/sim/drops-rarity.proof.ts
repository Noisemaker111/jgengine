import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { armed, pull } from "./scenarios";

// A level-12 tinkerer with a leaf blower shoots down a pack of Roomba Primes (the elite Roombas, who
// drop junk more often than not). Their junk lands in more than one condition.
export default defineProof(game, {
  proves: ["loot.drops-rarity"],
  setup(s) {
    s.waitFor((p) => p.health > 0, { timeoutMs: 10_000 });
    s.ctx.scene.entity.stats.set(s.userId, "level", { current: 12 });
    armed(s, "shotgun");
    const me = s.ctx.scene.entity.get(s.userId);
    if (me === null) throw new Error("no player");
    for (let index = 0; index < 8; index += 1) {
      const id = `suite_prime_${index}`;
      s.ctx.scene.entity.spawn("elite_husk", { id, position: [me.position[0] + (index - 3.5) * 0.4, me.position[1], me.position[2] + 6] });
      s.ctx.scene.entity.stats.set(id, "health", { current: 1 });
    }
  },
  async play(p) {
    await p.heading(0);
    for (let shot = 0; shot < 40 && (await p.probe()).groundRarities < 2; shot += 1) await pull(p, 0, -0.08);
    await p.expect((r) => r.kills >= 2 && r.groundRarities >= 2, "the pack's junk lies in more than one condition");
  },
});
