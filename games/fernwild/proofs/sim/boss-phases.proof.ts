import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// The Broodmother fights harder as she is hurt. Setup summons the Gamma Broodmother and brings her just
// above two thirds of her health, with a spear in the survivor's hand a few steps from her. Play wounds her
// past two thirds: she cries out and calls six more Araneo out of the walls.
export default defineProof(game, {
  proves: ["boss.phases"],
  setup(s) {
    s.waitFor((p) => p.creatures > 0, { timeoutMs: 60_000 });
    s.command("cheat", { clock: 1800, xp: 5000, spend: { health: 30 }, teleport: [669, 258, 0] });
    s.command("cheat", { give: { artifact_clever: 1, artifact_hunter: 1, artifact_massive: 1, spear: 1 }, toHotbar: ["spear"] });
    s.command("summonBoss", { tier: "gamma" });
    s.waitFor((p) => p.brood === 1, { timeoutMs: 3000 });
    s.command("cheat", { clock: 1830 });
    s.waitFor((p) => p.brood === 2 && p.inLair === 1 && p.araneo >= 4, { timeoutMs: 5000 });
    s.command("cheat", { broodHealth: 0.6602, teleport: [1494, 1500] });
    s.press("Digit1");
  },
  async play(p) {
    const start = await p.probe();
    await p.expect((r) => r.broodPhase === 1 && r.broodTell === 0 && r.broodHealth >= 66, "she starts the fight in her first phase");
    // Close in and strike, turning to her as she moves; in reach, stand and swing.
    for (let swing = 0; swing < 40 && (await p.probe()).broodPhase === 1; swing += 1) {
      const now = await p.probe();
      await p.heading(now.broodYaw);
      await p.hold(now.broodDist > 3 ? ["KeyW", "mouse0"] : ["mouse0"], { ms: 250 });
    }
    await p.expect((r) => r.broodPhase === 2 && r.broodHealth < 66.1, "wounded past two thirds, she turns to her second phase");
    await p.expect((r) => r.broodTell === 1, "she calls her brood");
    await p.expect((r) => r.araneo >= start.araneo + 5, "and more Araneo crawl out of the walls");
  },
});
