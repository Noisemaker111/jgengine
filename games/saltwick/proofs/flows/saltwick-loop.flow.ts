import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.see(/A fresh start/i, { timeoutMs: 60000, note: "arrival: a day is running and the first request started by itself" });
    // plant turnip in the plot in front of you
    await f.press("KeyE");
    await f.waitFor((p) => p.planted >= 1, { timeoutMs: 8000 });
    await f.expect((p) => p.coins === 26, "the seed was paid for");
    // run the in-world clock fast, as a night's sleep does, so the crop grows
    await f.timeScale(24);
    await f.waitFor((p) => p.ripe >= 1, { timeoutMs: 60000, note: "arrival: the turnip ripened on the clock" });
    await f.timeScale(1);
    // harvest it into the basket
    await f.press("KeyE");
    await f.waitFor((p) => p.harvested >= 1 && p.carrying > 0, { timeoutMs: 8000 });
    // sell the basket at the fish cart at your shoulder
    await f.press("KeyE");
    await f.waitFor((p) => p.shipped >= 1, { timeoutMs: 8000 });
    await f.expect((p) => p.coins > 30, "arrival: the sale paid more than the seed cost");
    await f.see(/Something for the pot/i, { timeoutMs: 15000, note: "arrival: the first request is done and the next one is up" });
  },
});
