import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// A tame left on guard fights what comes to it while you are away. Setup puts a level 30 tame lodestone in
// front of the survivor (fresh tames stay where they woke, neutral), then sets a wild mowbot down beside the guard
// and backs the survivor off nearly 30 m. Play whistles the far guard aggressive.
export default defineProof(game, {
  proves: ["creatures.guard-base"],
  setup(s) {
    s.waitFor((p) => p.creatures > 0, { timeoutMs: 60_000 });
    s.command("cheat", { summon: { species: "lodestone", level: 30, distance: 3, tamed: true } });
    s.waitFor((p) => p.lodestoneDist > 0 && p.lodestoneDist < 6 && p.tameStance === 1, { timeoutMs: 3000 });
    s.command("cheat", { summon: { species: "mowbot", level: 1, distance: 5, side: 2 } });
    s.hold("KeyS", { until: (p) => p.lodestoneDist > 27, ms: 100, timeoutMs: 20_000 });
  },
  async play(p) {
    await p.wait(4000);
    await p.expect((r) => r.wildHurt === 0 && r.lodestoneDist > 25, "left neutral on guard, it lets the mowbot be");
    await p.act("whistleAggressive");
    await p.expect((r) => r.tameStance === 2, "whistled aggressive from across the camp");
    await p.waitFor((r) => r.wildHurt >= 1, { timeoutMs: 15_000, note: "the guard attacks the mowbot at its post" });
    await p.expect((r) => r.lodestoneDist > 15, "it fought where it was left, not at the survivor's side");
  },
});
