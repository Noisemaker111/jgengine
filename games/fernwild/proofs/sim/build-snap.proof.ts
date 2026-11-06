import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

export default defineProof(game, {
  proves: ["building.place-snap"],
  setup(s) {
    s.command("cheat", { give: { thatch_foundation: 1, thatch_doorframe: 1 }, toHotbar: ["thatch_foundation", "thatch_doorframe"] });
    // Onto open sand, clear of the palm by the spawn, facing inland.
    s.hold("KeyD", { ms: 700 });
    s.hold("KeyW", { ms: 250 });
  },
  async play(p) {
    await p.press("Digit1");
    await p.waitFor((r) => r.ghost === 1, { timeoutMs: 3000, note: "a green foundation ghost" });
    await p.hold("mouse0", { until: (r) => r.structures === 1, ms: 80, timeoutMs: 3000 });
    // Back off so the build cursor sits on the foundation's near edge.
    await p.hold("KeyS", { until: (r) => r.pastFloor < -4.2, ms: 80, timeoutMs: 3000 });
    await p.press("Digit2");
    await p.waitFor((r) => r.ghostSnapped === 1 && r.ghost === 1, { timeoutMs: 3000, note: "the doorframe ghost snaps to the foundation" });
    await p.hold("mouse0", { until: (r) => r.structures === 2, ms: 80, timeoutMs: 3000 });
    await p.expect((r) => r.structures === 2, "a foundation and a doorframe snapped to it, both standing");
  },
});
