import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// The player pauses, opens Settings, and moves the inventory from I and Tab to J. Back in play, J opens the
// inventory; I and Tab now open nothing, because a key the game binds nowhere is refused.
export default defineProof(game, {
  proves: ["settings.controls"],
  async play(p) {
    await p.waitFor((r) => r.phase === 1 && r.health > 0, { timeoutMs: 60_000, note: "in play on the beach" });
    await p.press("Escape");
    await p.expect((r) => r.phase === 2, "Escape pauses");
    await p.act("menu.pane", { pane: "settings" });
    await p.expect((r) => r.menuPane === 2, "the pause menu shows Settings");
    await p.act("settings.rebind", { action: "inventory", codes: ["KeyJ"] });
    await p.act("pause");
    await p.expect((r) => r.phase === 1 && r.screen === 0, "back in play, nothing open");
    await p.press("KeyJ");
    await p.expect((r) => r.screen === 1, "J now opens the inventory");
    await p.press("KeyJ");
    await p.expect((r) => r.screen === 0, "and closes it");
    let freed = "";
    await p.press("KeyI").catch((error: unknown) => {
      freed = String(error);
    });
    await p.expect((r) => /bound to no action/.test(freed) && r.screen === 0, "I no longer opens it: it is bound to nothing");
  },
});
