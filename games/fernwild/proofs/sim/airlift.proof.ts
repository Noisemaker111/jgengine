import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

/** The foot of a steep rise inland of the south beach, as the flying ride's proof takes off from. */
const FOOT = [12, 275] as const;
const UPHILL = 3.93;

// A flying tame lifts a smaller creature and carries it. Setup puts a tamed Pteranodon and its saddle beside
// the survivor at the foot of the rise and a wild dodo a few metres on. Play saddles and mounts it, walks it up
// to the dodo, lifts it in the talons with F, flies it high and away, comes down and lets go.
export default defineProof(game, {
  proves: ["creatures.work.airlift"],
  setup(s) {
    s.waitFor((p) => p.creatures > 0, { timeoutMs: 60_000 });
    s.command("cheat", { teleport: [FOOT[0], FOOT[1], UPHILL] });
    s.wait(300);
    s.command("cheat", { give: { pteranodon_saddle: 1 }, summon: { species: "pteranodon", level: 1, distance: 2.5, tamed: true } });
    s.command("cheat", { summon: { species: "dodo", level: 1, distance: 7 } });
    s.wait(300);
  },
  async play(p) {
    await p.hold("KeyE", { until: (r) => r.screen === 1, timeoutMs: 3000 });
    await p.act("giveCreature", { inventoryId: "inventory", slot: (await p.probe()).saddleSlot });
    await p.act("closeCreature", {});
    await p.hold("KeyE", { until: (r) => r.riding === 1, timeoutMs: 3000 });
    await p.heading((await p.probe()).dodoYaw);
    await p.hold("KeyW", { until: (r) => r.dodoDist >= 0 && r.dodoDist < 2.5, timeoutMs: 6000 });
    await p.press("KeyF");
    await p.waitFor((r) => r.lifting === 1, { timeoutMs: 2000, note: "F lifts the dodo in the Pteranodon's talons" });
    await p.hold("Space", { until: (r) => r.liftedAlt > 8, timeoutMs: 6000 });
    await p.expect((r) => r.liftedAlt > 8, "the dodo hangs under the flyer over 8 m above the ground");
    await p.heading(UPHILL);
    await p.hold("KeyW", { until: (r) => r.liftMoved > 25, timeoutMs: 10_000 });
    await p.hold("KeyC", { until: (r) => r.alt < 3, timeoutMs: 10_000 });
    await p.press("KeyF");
    await p.waitFor((r) => r.lifting === 0, { timeoutMs: 2000, note: "F lets it go" });
    await p.expect((r) => r.liftMoved > 25, "the dodo was set down over 25 m from where it was lifted");
  },
});
