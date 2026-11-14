import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { viewStore } from "../../src/game/controls";
import { spawnThreat } from "../../src/game/threats";
import { carrying, outInTheHouse, plain } from "./scenarios";

// A battered Little with a coin in the pack is standing on a mousetrap. The coin stays in the house; the
// burrow takes them back after they shake it off.
export default defineProof(game, {
  proves: ["extraction.die-lose-carried", "failure.lose-and-recover"],
  async setup(s) {
    await outInTheHouse(s);
    carrying(s, ["coin"]);
    const me = s.ctx.scene.entity.get(s.userId)!.position;
    viewStore.update(s.ctx, (seen) => { const v = plain(seen); return v.run === null ? v : ({ ...v, run: { ...v.run, health: 20, threats: [...v.run.threats, spawnThreat({ key: "proof:trap", kind: "trap", slot: { id: "proof-trap", kind: "trap", at: [me[0], 0, me[2]], minDepth: 0, label: "a mousetrap" } })] } }); });
  },
  async play(p) {
    await p.expect((r) => r.carried === 1 && r.caught === 0, "carrying a coin, still free");
    await p.waitFor((r) => r.returning === 1, { timeoutMs: 5000, note: "the trap snaps" });
    await p.act("deepward.retrySave");
    await p.expect((r) => r.caught === 1 && r.stash === 0 && r.caughtCount === 1, "caught: the coin is gone and nothing was banked");
    await p.act("deepward.acknowledgeCaught");
    await p.waitFor((r) => r.home === 1, { timeoutMs: 3000, note: "back in the burrow, ready for another night" });
  },
});
