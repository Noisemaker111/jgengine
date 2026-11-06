import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { click, layPath } from "./scenarios";

export default defineProof(game, {
  proves: ["tycoon.build-attraction"],
  setup: (s) => layPath(s),
  async play(p) {
    const before = await p.probe();
    // The carousel from the palette, beside the path; its window's "Connect it" lays the entrance and exit.
    await p.press("Digit1");
    await p.act("park.pointer", click(4, 36));
    await p.act("build.connect", {});
    await p.expect((r) => r.rides === 1 && r.cash < before.cash, "a carousel bought and running");
    // The gate opens only once a ride runs.
    await p.act("brightway.act", { action: "open_gate" });
    await p.expect((r) => r.gateOpen === 1, "the park is open");
  },
});
