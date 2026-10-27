import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  state: "boss",
  browser: true,
  async run(f) {
    // arrival: the Rustflat Front is live and its Foreman is on the field, read from the encounter's own state
    const before = await f.waitFor((p) => p.frontStarted === 1 && p.frontBossHealth > 0);
    // click the field to capture the pointer, the same gesture the game asks for; it also fires the first aimed shot
    await f.clickAt(800, 450);
    // a quarter turn off the Foreman for a control shot: reported, not asserted, because a moving target can wander into it
    await f.heading((await f.probe()).frontBossHeading + Math.PI / 2);
    await f.clickAt(800, 450);
    await f.report("off-target");
    // face the Foreman, so the crosshair sits where it stands
    await f.heading((await f.probe()).frontBossHeading);
    await f.clickAt(800, 450);
    await f.clickAt(800, 450);
    await f.waitFor((p) => p.frontBossHealth < before.frontBossHealth, {
      note: "arrival: the Foreman lost health to fire aimed at it - a hit landed, judged by the game's own stat and not by the click",
    });
    // the before and after health prints beside the step so the drop is a number, not a claim
    await f.report("arrival");
  },
});
