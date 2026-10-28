import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  browser: true,
  async run(f) {
    // arrival on the beach: a realistic survivor, empty fists
    await f.waitFor((p) => p.pedestals === 8, { timeoutMs: 60000 });
    await f.shot("fernwild-body-idle");
    // walk, then run
    await f.hold("KeyW", { ms: 1200 });
    await f.hold(["ShiftLeft", "KeyW"], { ms: 1200 });
    // a stone pick on the hotbar, then in hand
    await f.command("cheat", { give: { stone_pick: 1 }, toHotbar: ["stone_pick"] });
    await f.press("Digit1");
    await f.wait(600);
    await f.shot("fernwild-body-pick");
    // the overhead swing
    await f.hold("mouse0", { ms: 220 });
    await f.shot("fernwild-body-swing");
    await f.wait(1200);
    // a jump, caught in the air
    await f.press("Space");
    await f.wait(250);
    await f.shot("fernwild-body-jump");
    await f.wait(1200);
    // the pick put away: a bare-handed punch
    await f.press("Digit1");
    await f.hold("mouse0", { ms: 200 });
    await f.shot("fernwild-body-punch");
    await f.wait(1200);
    // V: first person, out of the survivor's own eyes, the pick in hand and swung
    await f.press("KeyV");
    await f.press("Digit1");
    await f.wait(800);
    await f.shot("fernwild-body-first-person");
    await f.hold("mouse0", { ms: 420 });
    await f.shot("fernwild-body-first-person-swing");
    await f.wait(1000);
    await f.press("KeyV");
    await f.press("Digit1");
    // out into the sea: treading water, then swimming
    await f.command("cheat", { teleport: [229.5, 1400, 0] });
    await f.wait(2500);
    await f.shot("fernwild-body-tread");
    await f.hold("KeyW", { ms: 1500 });
    await f.shot("fernwild-body-swim");
  },
});
