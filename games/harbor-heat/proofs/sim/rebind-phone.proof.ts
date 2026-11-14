import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

/** The rider moves the city phone from T to K on the phone's Controls page; K opens it, T is free. */
export default defineProof(game, {
  proves: ["settings.controls"],
  async play(p) {
    await p.expect((r) => r["started"] === 1 && r["phone"] === 0, "in the run, phone away");
    await p.act("settings.rebind", { action: "phone", codes: ["KeyK"] });
    await p.press("KeyK");
    await p.expect((r) => r["phone"] === 1, "K now brings the phone out");
    await p.press("KeyK");
    await p.expect((r) => r["phone"] === 0, "and puts it away");
    let freed = "";
    await p.press("KeyT").catch((error: unknown) => {
      freed = String(error);
    });
    await p.expect((r) => /bound to no action/.test(freed) && r["phone"] === 0, "T opens nothing now: it is bound to nothing");
  },
});
