import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { outInTheHouse } from "./scenarios";

// Out in the house, the player pauses, opens Settings and moves the pack from Tab to J. Back in play,
// J opens the pack and Tab opens nothing.
export default defineProof(game, {
  proves: ["settings.controls"],
  async setup(s) { await outInTheHouse(s); },
  async play(p) {
    await p.expect((r) => r.inRun === 1 && r.panel === 0, "out in the house, pack closed");
    await p.act("deepward.pause", { paused: true });
    await p.expect((r) => r.phase === 2, "paused");
    await p.act("menu.pane", { pane: "settings" });
    await p.expect((r) => r.menuPane === 2, "the pause menu shows Settings");
    await p.act("settings.rebind", { action: "crumbPack", codes: ["KeyJ"] });
    await p.act("menu.pane", { pane: null });
    await p.act("deepward.pause", { paused: false });
    await p.expect((r) => r.phase === 1 && r.panel === 0, "back in play");
    await p.press("KeyJ");
    await p.expect((r) => r.panel === 4, "J now opens the pack");
    await p.press("KeyJ");
    await p.expect((r) => r.panel === 0, "and closes it");
    let freed = "";
    await p.press("Tab").catch((error: unknown) => { freed = String(error); });
    await p.expect((r) => /bound to no action/.test(freed) && r.panel === 0, "Tab no longer opens it");
  },
});
