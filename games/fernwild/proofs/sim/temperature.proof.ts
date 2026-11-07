import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// The snow at night freezes a survivor, and a campfire beside them holds the cold off. Setup stands them in the
// snow at midnight with a campfire and wood. Play loses health to the cold, places and lights the fire, and close to
// it the air warms and the cold takes health more slowly.
export default defineProof(game, {
  proves: ["survival.temperature"],
  setup(s) {
    s.waitFor((p) => p.creatures > 0, { timeoutMs: 60_000 });
    s.command("cheat", { clock: 3600, teleport: [-980.8, -1146.7], give: { campfire: 1, wood: 10 }, toHotbar: ["campfire"] });
  },
  async play(p) {
    await p.wait(500);
    const cold = await p.probe();
    await p.expect((r) => r.temperature < 0, "midnight in the snow is below freezing");
    await p.wait(5000);
    const chilled = await p.probe();
    const coldLoss = cold.health - chilled.health;
    await p.expect(() => coldLoss > 0, `the cold takes health (${coldLoss} in 5 s)`);
    await p.press("Digit1");
    await p.hold("mouse0", { until: (r) => r.fuel >= 0, ms: 80, timeoutMs: 3000 });
    // A campfire goes down cold; wood on it lights it. Then step up to it.
    for (let wood = 0; wood < 4; wood += 1) await p.press("KeyE");
    await p.hold("KeyW", { ms: 400 });
    await p.waitFor((r) => r.temperature > cold.temperature + 8, { timeoutMs: 3000, note: "close by, the lit fire warms the air around them" });
    const warm = await p.probe();
    await p.wait(5000);
    const warmLoss = warm.health - (await p.probe()).health;
    await p.expect(() => warmLoss < coldLoss, `by the fire the cold takes less (${warmLoss} in 5 s, not ${coldLoss})`);
  },
});
