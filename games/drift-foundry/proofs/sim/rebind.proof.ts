import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// Pause, open Settings and move the hop from Space to J; back in the aisle, J hops the cart.
export default defineProof(game, {
  proves: ["settings.controls"],
  state: "race",
  async play(p) {
    await p.waitFor((r) => r.phase === 1, { timeoutMs: 30_000, note: "in the aisle" });
    await p.act("pause");
    await p.expect((r) => r.phase === 2, "paused");
    await p.act("menu.pane", { pane: "settings" });
    await p.expect((r) => r.menuPane === 7, "the pause board shows Settings");
    await p.act("settings.rebind", { action: "jumpHop", codes: ["KeyJ"] });
    await p.act("pause");
    await p.expect((r) => r.phase === 1 && r.airborne === 0, "back in the aisle, on the floor");
    await p.press("KeyJ");
    await p.waitFor((r) => r.airborne === 1, { timeoutMs: 1000, note: "J now hops the cart" });
  },
});
