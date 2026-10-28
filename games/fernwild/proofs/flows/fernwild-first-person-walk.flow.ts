import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/** First person on the open sand: walk, run and jump, shooting mid-stride so the survivor's own head would show. */
export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.waitFor((p) => p.creatures > 0, { timeoutMs: 60000 });
    await f.press("KeyV");
    await f.command("cheat", { clock: 1800, teleport: [229.5, 1352, Math.PI] });
    await f.wait(1500);
    await f.shot("fernwild-fp-idle");
    await f.hold("KeyW", { ms: 700 });
    await f.shot("fernwild-fp-walk");
    await f.hold("KeyW", { ms: 450 });
    await f.shot("fernwild-fp-walk-2");
    await f.hold(["ShiftLeft", "KeyW"], { ms: 900 });
    await f.shot("fernwild-fp-run");
    await f.press("Space");
    await f.wait(250);
    await f.shot("fernwild-fp-jump");
  },
});
