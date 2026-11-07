import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

/** The foot of a steep rise inland of the south beach: 26 m higher 35 m on along this heading. */
const FOOT = [12, 275] as const;
const UPHILL = 3.93;

// Saddle a tamed Pteranodon at the foot of the slope, take off, climb well clear of the ground, fly over
// the rise and land on top: higher ground than a walk would reach in the time.
export default defineProof(game, {
  proves: ["creatures.ride.fly"],
  setup(s) {
    s.waitFor((p) => p.creatures > 0, { timeoutMs: 60_000 });
    s.command("cheat", { teleport: [FOOT[0], FOOT[1], UPHILL] });
    s.wait(300);
    s.command("cheat", { give: { pteranodon_saddle: 1 }, summon: { species: "pteranodon", level: 1, distance: 2.5, tamed: true } });
    s.wait(300);
  },
  async play(p) {
    await p.hold("KeyE", { until: (r) => r.screen === 1, timeoutMs: 3000 });
    await p.act("giveCreature", { inventoryId: "inventory", slot: (await p.probe()).saddleSlot });
    await p.act("closeCreature", {});
    await p.hold("KeyE", { until: (r) => r.riding === 1, timeoutMs: 3000 });
    const start = await p.probe();
    await p.heading(UPHILL);
    await p.hold("Space", { until: (r) => r.alt > 12, timeoutMs: 6000 });
    await p.expect((r) => r.alt > 12, "it took off and climbed over 12 m above the ground");
    await p.hold("KeyW", { until: (r) => r.groundY > start.groundY + 20, timeoutMs: 10_000 });
    await p.hold("KeyC", { until: (r) => r.alt < 1, timeoutMs: 10_000 });
    await p.expect((r) => r.riding === 1 && r.alt < 1 && r.groundY > start.groundY + 20, "it landed on the high ground, over 20 m above where it took off");
  },
});
