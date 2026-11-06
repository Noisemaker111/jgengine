import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

const SECONDS = 5_000;

// The same rock for the same five seconds, two ways: a stone hatchet, the best hand tool on stone, then a
// ridden Doedicurus, ARK's stone gatherer. The Doedicurus bites out more than twice the stone.
export default defineProof(game, {
  proves: ["creatures.work.gather"],
  setup(s) {
    s.waitFor((p) => p.creatures > 0 && p.rockDist >= 0, { timeoutMs: 60_000 });
    s.command("cheat", { give: { stone_hatchet: 1, doedicurus_saddle: 1 }, toHotbar: ["stone_hatchet"] });
    s.command("cheat", { summon: { species: "doedicurus", level: 1, distance: 3, side: 4, tamed: true } });
    s.wait(300);
  },
  async play(p) {
    // By hand: walk up to the rock and swing the hatchet.
    await p.heading((await p.probe()).rockYaw);
    await p.hold("KeyW", { until: (r) => r.aimStrike === 1, ms: 100, timeoutMs: 30_000 });
    await p.press("Digit1");
    const atRock = await p.probe();
    await p.hold("mouse0", { ms: SECONDS });
    const byHand = (await p.probe()).stone - atRock.stone;
    await p.expect(() => byHand > 0, `the hatchet broke ${byHand} stone`);

    // On the Doedicurus: walk to it, saddle it, ride it back to the rock and bite.
    await p.heading((await p.probe()).doedicurusYaw);
    await p.hold("KeyW", { until: (r) => r.doedicurusDist < 3.5, ms: 100, timeoutMs: 10_000 });
    await p.heading((await p.probe()).doedicurusYaw);
    await p.hold("KeyE", { until: (r) => r.screen === 1, timeoutMs: 3000 });
    await p.act("giveCreature", { inventoryId: "inventory", slot: (await p.probe()).saddleSlot });
    await p.act("closeCreature", {});
    await p.hold("KeyE", { until: (r) => r.riding === 1, timeoutMs: 3000 });
    await p.heading((await p.probe()).rockYaw);
    await p.hold("KeyW", { until: (r) => r.rockDist < 3.2, ms: 100, timeoutMs: 10_000 });
    await p.heading((await p.probe()).rockYaw);
    const mounted = await p.probe();
    await p.hold("mouse0", { ms: SECONDS });
    const byBite = (await p.probe()).tameStone - mounted.tameStone;
    await p.expect(() => byBite >= byHand * 2, `in ${SECONDS / 1000} s the Doedicurus bit out ${byBite} stone, the hatchet ${byHand}`);
  },
});
