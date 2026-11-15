import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// Shop down Aisle 9 the way the tips point until there is stock in the basket and a mod on the cart,
// stop, park and quit. Opening the game again, Continue puts the same cart back where it stood, with
// the same mods, the same basket (its count, its till value, the power-ups in the child seat) and the
// same shelves already cleared.
export default defineProof(game, {
  proves: ["save.continue"],
  state: "race",
  async play(p) {
    await p.waitFor((r) => r.phase === 1, { timeoutMs: 30_000, note: "in the aisle" });
    for (let step = 0; step < 600; step += 1) {
      const r = await p.probe();
      if (r.phase !== 1 || (r.items >= 1 && r.mods > 0 && r.run > 15)) break;
      if (r.jumpNow === 1) await p.press("Space");
      else {
        const want = r.tip === 1 ? r.tipSide * 0.5 : r.tip === 3 && r.tipSide !== 0 ? r.tipSide * 0.3 : Math.max(-0.35, Math.min(0.35, -r.x * 0.08));
        const turn = want - r.heading;
        await p.hold(Math.abs(turn) < 0.08 ? "KeyW" : ["KeyW", turn > 0 ? "KeyA" : "KeyD"], { ms: 150 });
      }
    }
    // Brake in taps until the cart is nearly still (holding on would reverse it), then let it settle.
    for (let tap = 0; tap < 60 && (await p.probe()).speed > 0.6; tap += 1) await p.hold("KeyS", { ms: 120 });
    await p.waitFor((r) => r.speed < 0.05, { timeoutMs: 8000, note: "rolled to a stop" });
    const parked = await p.expect((r) => r.phase === 1 && r.run > 15 && r.mods > 0 && r.items >= 1 && r.value > 0 && r.speed < 0.1, "stopped down the aisle with mods on and shopping in the basket");
    await p.act("run.park");
    await p.expect((r) => r.phase === 0 && r.parked === 1, "parked at customer service");
    await p.wait(4000);
    await p.restart("title");
    await p.waitFor((r) => r.parked === 1, { timeoutMs: 10_000, note: "the new session has the parked cart" });
    await p.expect((r) => r.items === 0 && r.value === 0, "nothing is in a basket before Continue");
    await p.act("startRun");
    await p.waitFor((r) => r.phase === 1 && Math.abs(r.run - parked.run) < 1 && r.mods === parked.mods, { timeoutMs: 10_000, note: "Continue put the same cart back where it stood" });
    await p.expect(
      (r) => r.items === parked.items && r.value === parked.value && r.powerUps === parked.powerUps && r.shelves === parked.shelves,
      "the basket came back as it was parked: the same items, till value, power-ups and cleared shelves",
    );
  },
});
