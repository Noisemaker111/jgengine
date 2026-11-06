import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { parkOpen } from "./scenarios";

export default defineProof(game, {
  proves: ["tycoon.customers-pay"],
  setup: (s) => parkOpen(s),
  async play(p) {
    const before = await p.probe();
    await p.waitFor((r) => r.guests > 0, { timeoutMs: 120_000, note: "the first guests walk in through the gate" });
    await p.waitFor((r) => r.riding > 0 || r.queued > 0, { timeoutMs: 120_000, note: "guests line up for the carousel" });
    await p.waitFor((r) => r.cash > before.cash, { timeoutMs: 120_000, note: "tickets bring the cash back up" });
  },
});
