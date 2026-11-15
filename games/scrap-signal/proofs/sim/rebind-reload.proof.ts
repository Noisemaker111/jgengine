import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { armed, pull } from "./scenarios";

// The player moves Reload from R to T in the controls settings. T reloads the half-empty staple
// gun; R does nothing any more.
export default defineProof(game, {
  proves: ["settings.controls"],
  setup(s) {
    s.waitFor((p) => p.health > 0, { timeoutMs: 10_000 });
    armed(s, "pistol");
  },
  async play(p) {
    for (let shot = 0; shot < 60 && (await p.probe()).magFill >= 0.5; shot += 1) await pull(p, 0, 0.6);
    await p.expect((r) => r.magFill < 0.5 && r.heldAmmo > 0, "half a magazine spent");
    await p.act("settings.rebind", { action: "reload", codes: ["KeyT"] });
    let freed = "";
    await p.press("KeyR").catch((error: unknown) => { freed = String(error); });
    await p.wait(1500);
    await p.expect((r) => /bound to no action/.test(freed) && r.magFill < 0.5, "R no longer reloads");
    await p.press("KeyT");
    await p.waitFor((r) => r.magFill === 1, { timeoutMs: 6000, note: "T reloads" });
  },
});
