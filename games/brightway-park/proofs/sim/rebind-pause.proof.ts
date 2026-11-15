import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// The proprietor opens Settings on the pause board and moves "pause" from P to O. Back in the night,
// O stops the clock and P is bound to nothing.
export default defineProof(game, {
  proves: ["settings.controls"],
  async play(p) {
    await p.expect((r) => r.onTitle === 0 && r.clockPaused === 0, "the haunt is running");
    await p.press("KeyP");
    await p.expect((r) => r.clockPaused === 1, "P pauses: the pause board is up");
    await p.act("menu.pane", { pane: "settings" });
    await p.expect((r) => r.menuPane === 2, "the pause board shows Settings");
    await p.act("settings.rebind", { action: "pauseToggle", codes: ["KeyO"] });
    await p.act("menu.pane", { pane: null });
    // Resume the park, the board's own verb.
    await p.act("pauseToggle", {});
    await p.expect((r) => r.clockPaused === 0, "back in the night");
    await p.press("KeyO");
    await p.expect((r) => r.clockPaused === 1, "O now pauses the night");
    await p.act("pauseToggle", {});
    let freed = "";
    await p.press("KeyP").catch((error: unknown) => { freed = String(error); });
    await p.expect((r) => /bound to no action/.test(freed) && r.clockPaused === 0, "P no longer pauses: it is bound to nothing");
  },
});
