import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

// A brand-new shopper from the title: New run, the sign's first goal, push off, follow the shopping tip
// into a shelf and come away with something in the basket.
export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.see("New run", { timeoutMs: 60000, note: "arrival: customer service, the title menu" });
    await f.click("New run");
    await f.see("HOLD W TO PUSH", { timeoutMs: 60000, note: "arrival: the sign names the first goal" });
    await f.hold("KeyW", { ms: 2500 });
    await f.waitFor((p) => p.run > 12, { timeoutMs: 15000, note: "arrival: the cart is rolling down Aisle 9" });
    await f.see("STEER", { timeoutMs: 20000, note: "arrival: the shopping tip points at the next shelf" });
    await f.hold(["KeyW", "KeyA"], { ms: 700 });
    await f.hold("KeyW", { ms: 2500 });
    await f.waitFor((p) => p.items + p.powerUps + p.mods > 0, { timeoutMs: 20000, note: "arrival: something is in the cart - a grab or a mod" });
  },
});
