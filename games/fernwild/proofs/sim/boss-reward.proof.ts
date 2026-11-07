import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

/** At the Green Obelisk's terminal, as the boss phases proof stands. */
const OBELISK = [669, 258, 0] as const;

// Summon the Broodmother, beat her, and make what only her trophy makes. Setup brings a level-100 survivor, their
// points in health and melee (her bite takes 180), to the Green Obelisk with the Gamma tribute (the Clever, Hunter and
// Massive artifacts), a spear in hand, and what brood greaves take besides her trophy and flag; and turns the
// server's boss difficulty down to a thousandth of her health, so one spear finishes her. Play opens the terminal, pays the tribute, goes through the portal, kills her in her
// lair, takes the trophy, Element and flag she leaves, then learns brood greaves and makes them round the trophy.
export default defineProof(game, {
  proves: ["boss.summon-arena-reward", "boss.unlocks-progression"],
  setup(s) {
    s.waitFor((p) => p.creatures > 0, { timeoutMs: 60_000 });
    s.command("onboarding.skip");
    s.command("cheat", { clock: 1800, xp: 10_000_000, spend: { health: 60, melee: 40 }, teleport: [...OBELISK], broodStrength: 0.001 });
    s.command("cheat", { give: { artifact_clever: 1, artifact_hunter: 1, artifact_massive: 1, artifact_pack: 1, artifact_strong: 1, hide: 40, spear: 1 }, toHotbar: ["spear"] });
    s.wait(300);
    s.press("Digit1");
  },
  async play(p) {
    await p.expect((r) => r.atObelisk === 1 && r.brood === 0 && r.broodTrophies === 0, "at the obelisk with nothing summoned and no trophy");
    await p.hold("KeyE", { until: (r) => r.screen === 1, timeoutMs: 3000 });
    await p.act("summonBoss", { tier: "gamma" });
    await p.waitFor((r) => r.brood === 1, { timeoutMs: 3000, note: "the tribute is paid and the portal counts down" });
    await p.waitFor((r) => r.brood === 2 && r.inLair === 1, { timeoutMs: 40_000, note: "the portal takes the survivor to her lair" });
    // Close in and strike, turning to her as she moves; in reach, stand and swing.
    for (let swing = 0; swing < 120 && (await p.probe()).brood === 2; swing += 1) {
      const now = await p.probe();
      await p.heading(now.broodYaw);
      await p.hold(now.broodDist > 3 ? ["KeyW", "mouse0"] : ["mouse0"], { ms: 250 });
    }
    await p.expect((r) => r.brood === 3, "she dies");
    await p.expect((r) => r.broodTrophies === 1 && r.element >= 20, "her trophy and Element are in the bag");
    await p.act("learn", { engramId: "brood_greaves" });
    await p.act("craft", { recipeId: "brood_greaves" });
    await p.waitFor((r) => r.broodGear === 1, { timeoutMs: 15_000, note: "brood greaves are made round her trophy" });
    await p.expect((r) => r.broodTrophies === 0, "the trophy went into them");
  },
});
