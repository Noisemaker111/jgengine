import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// Push down Aisle 9, stop, park the cart and quit. Opening the game again, Continue puts the same cart
// back where it stood, with the mods it picked up.
export default defineProof(game, {
  proves: ["save.continue"],
  state: "race",
  async play(p) {
    await p.waitFor((r) => r.phase === 1, { timeoutMs: 30_000, note: "in the aisle" });
    await p.hold("KeyW", { ms: 3500 });
    await p.hold("KeyS", { ms: 1000 });
    await p.waitFor((r) => r.speed < 0.05, { timeoutMs: 5000, note: "rolled to a stop" });
    const parked = await p.expect((r) => r.run > 15 && r.mods > 0 && r.speed < 0.1, "stopped down the aisle with mods on");
    await p.act("run.park");
    await p.expect((r) => r.phase === 0 && r.parked === 1, "parked at customer service");
    await p.wait(4000);
    await p.restart("title");
    await p.waitFor((r) => r.parked === 1, { timeoutMs: 10_000, note: "the new session has the parked cart" });
    await p.act("startRun");
    await p.waitFor((r) => r.phase === 1 && Math.abs(r.run - parked.run) < 1 && r.mods === parked.mods, { timeoutMs: 10_000, note: "Continue put the same cart back where it stood" });
  },
});
