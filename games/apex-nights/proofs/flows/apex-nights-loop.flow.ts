import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.see(/start race/i, { timeoutMs: 60000, note: "arrival: the career opens in the garage with the first race on the board" });
    // line up; the count runs and the lights go green
    await f.click("Start race");
    await f.waitFor((p) => p.racing === 1, { timeoutMs: 20000 });
    await f.expect((p) => p.rivals > 0, "arrival: rivals are on the grid, read from the game's own session");
    // steering assist on, so a held throttle follows the racing line
    await f.press("KeyT");
    await f.waitFor((p) => p.assist === 1, { timeoutMs: 3000 });
    // race the first event flat out
    await f.hold("KeyW", { ms: 70000 });
    await f.waitFor((p) => p.racing === 0, { timeoutMs: 60000 });
    await f.expect((p) => p.racing === 0 && p.cash > 200, "arrival: the race finished on the podium and paid out, so the career loop turns");
  },
});
