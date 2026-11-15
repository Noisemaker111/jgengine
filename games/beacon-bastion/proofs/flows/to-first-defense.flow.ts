import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.see(/open for business/i, { timeoutMs: 40000, note: "arrival: a fresh day is up and the hiring board offers the first wave, not the title card" });
    await f.expect((p) => p.wave === 1 && p.creeps === 0, "the day opens on wave 1 with the street empty, read from the game's own session");
    await f.command("buildTower1");
    await f.command("tower.build", { point: [0, 0, 4] });
    await f.waitFor((p) => p.towers >= 1, { timeoutMs: 20000, note: "a barista clocks in on the bend" });
    // open the street with the hiring board's own button
    await f.click("Open for business");
    await f.see(/\d+ gadgets? left/i, { timeoutMs: 20000 });
    await f.expectPage("__jgProbe().creeps > 0 && /wave 1/i.test(window.__jgNativeUi.text())", "arrival: the director put wave 1's tech on the authored road, so the wave mustered rather than only the click landing");
    // Software rendering draws about a frame a second here, so roll the street's sim on until the whole
    // wave has arrived and the board offers the next.
    await f.command("dev.advance", { seconds: 30 });
    await f.see(/send wave 2/i, { timeoutMs: 60000 });
    // the loop turns: the next wave releases off the same director, through the command the board's button runs
    await f.command("wave.send");
    await f.see(/wave 2[^]*\d+ gadgets? left/i, { timeoutMs: 20000 });
    await f.expect((p) => p.wave === 2 && p.creeps > 0, "arrival: wave 2 is on the street from the game's own session, so a day is a repeating loop and not one authored wave");
  },
});
