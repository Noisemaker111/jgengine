import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.see(/First line/i, { timeoutMs: 60000, note: "arrival: the field is up and the first story beat started by itself" });
    await f.expect((p) => p.lives === 20 && p.calm > 0, "arrival: orbital relay stands, the first wave is counting down");
    // pick up a pulse turret
    await f.press("Digit1");
    await f.waitFor((p) => p.armed === 1, { timeoutMs: 5000 });
    // click the middle of the field: the tower goes up on the nearest pad
    await f.clickAt(640, 360);
    await f.waitFor((p) => p.towers >= 1, { timeoutMs: 5000 });
    // pick up a rail cannon
    await f.press("Digit2");
    await f.waitFor((p) => p.armed === 2, { timeoutMs: 5000 });
    // click near another pad: a second tower
    await f.clickAt(752, 388);
    await f.waitFor((p) => p.towers >= 2, { timeoutMs: 5000 });
    // right click puts the tool down
    await f.clickAt(640, 220, { button: "right" });
    await f.waitFor((p) => p.armed === 0, { timeoutMs: 5000 });
    // N sends the first wave early
    await f.press("KeyN");
    await f.waitFor((p) => p.raiding === 1, { timeoutMs: 5000 });
    await f.waitFor((p) => p.kills >= 1, { timeoutMs: 60000, note: "arrival: the towers kill what marches past" });
    await f.waitFor((p) => p.cleared >= 1, { timeoutMs: 120000, note: "arrival: the first wave is held and the next calm starts" });
  },
});
