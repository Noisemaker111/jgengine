import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

export default defineProof(game, {
  proves: ["survival.eat-drink"],
  setup(s) {
    s.command("cheat", { give: { mejoberry: 40 }, toHotbar: ["mejoberry"] });
    s.timeScale(60);
    s.waitFor((p) => p.food < 90, { timeoutMs: 600_000 });
  },
  async play(p) {
    const before = (await p.probe()).food;
    for (let bite = 0; bite < 4; bite += 1) await p.press("Digit1");
    await p.expect((r) => r.food > before, "berries from the hotbar raise food");
  },
});
