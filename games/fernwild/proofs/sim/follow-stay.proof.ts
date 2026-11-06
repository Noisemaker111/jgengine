import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// A tame follows when whistled and stays when told to. Setup puts a fresh tame Phiomia beside the survivor.
// Play walks off and it waits where it woke; T calls it after them; U makes it stay as they walk on.
export default defineProof(game, {
  proves: ["creatures.follow-stay"],
  setup(s) {
    s.waitFor((p) => p.creatures > 0, { timeoutMs: 60_000 });
    s.command("cheat", { summon: { species: "phiomia", level: 10, distance: 4, tamed: true } });
    s.waitFor((p) => p.phiomiaDist > 0 && p.phiomiaDist < 6, { timeoutMs: 3000 });
  },
  async play(p) {
    const away = (await p.probe()).phiomiaYaw + Math.PI;
    await p.heading(away);
    await p.hold("KeyW", { until: (r) => r.phiomiaDist > 15, timeoutMs: 20_000 });
    await p.wait(3000);
    await p.expect((r) => r.phiomiaDist > 15, "fresh from taming, it waits where it woke");
    await p.press("KeyT");
    await p.waitFor((r) => r.phiomiaDist < 6, { timeoutMs: 20_000, note: "whistled, it comes after the survivor" });
    await p.heading(away);
    await p.hold("KeyW", { ms: 3000 });
    await p.waitFor((r) => r.phiomiaDist < 6, { timeoutMs: 10_000, note: "and catches up when they walk on" });
    await p.press("KeyU");
    await p.hold("KeyW", { until: (r) => r.phiomiaDist > 15, timeoutMs: 20_000 });
    await p.wait(3000);
    await p.expect((r) => r.phiomiaDist > 15, "told to stay, it stays as they walk away");
  },
});
