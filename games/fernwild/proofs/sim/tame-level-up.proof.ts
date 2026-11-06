import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { raptorTamed } from "./scenarios";

export default defineProof(game, {
  proves: ["creatures.level-up"],
  setup(s) {
    raptorTamed(s);
    s.command("cheat", { tameXp: 35 });
  },
  async play(p) {
    const before = (await p.probe()).tameHealthMax;
    await p.act("levelTame", { stat: "health" });
    await p.expect((r) => r.tameHealthMax > before, "a point spent raises the tame's health");
  },
});
