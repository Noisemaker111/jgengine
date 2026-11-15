import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// The page opens on the front desk's title. Credits shows the credits page; starting from the title
// switches on the sign and the house opens with its four tenants.
export default defineProof(game, {
  proves: ["menu.start-and-credits"],
  state: "title",
  async play(p) {
    await p.expect((r) => r.screen === 1 && r.menuPane === 0, "the title, on its default page");
    await p.act("menu.pane", { pane: "credits" });
    await p.expect((r) => r.menuPane === 3, "the credits show");
    await p.act("start");
    await p.waitFor((r) => r.screen === 0 && r.members === 4 && r.rooms === 4, { timeoutMs: 10_000, note: "the house opens with four tenants and four rooms" });
    await p.expect((r) => r.menuPane === 0, "the credits closed with the title");
  },
});
