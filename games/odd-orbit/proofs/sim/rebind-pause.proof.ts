import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// The landlord opens the handbook's Settings and moves "pause time" from Space to P. Back at the
// front desk, P stops and starts the clock; Space is bound to nothing.
export default defineProof(game, {
  proves: ["settings.controls"],
  async play(p) {
    await p.expect((r) => r.screen === 0 && r.clockPaused === 0, "the house is running");
    await p.act("orbit.pause", {});
    await p.expect((r) => r.screen === 2, "the handbook is open");
    await p.act("menu.pane", { pane: "settings" });
    await p.expect((r) => r.menuPane === 2, "the handbook shows Settings");
    await p.act("settings.rebind", { action: "pauseToggle", codes: ["KeyP"] });
    await p.act("menu.pane", { pane: null });
    await p.act("orbit.resume", {});
    await p.expect((r) => r.screen === 0 && r.clockPaused === 0, "back at the front desk, clock running");
    await p.press("KeyP");
    await p.expect((r) => r.clockPaused === 1, "P now pauses time");
    await p.press("KeyP");
    await p.expect((r) => r.clockPaused === 0, "and starts it again");
    let freed = "";
    await p.press("Space").catch((error: unknown) => { freed = String(error); });
    await p.expect((r) => /bound to no action/.test(freed) && r.clockPaused === 0, "Space no longer pauses: it is bound to nothing");
  },
});
