import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

const RETICLE_GAP = "Number(document.querySelector('[data-reticle-gap]')?.getAttribute('data-reticle-gap') ?? -1)";

export default defineFlow(game, {
  state: "front-armed",
  browser: true,
  async run(f) {
    // arrival: both crews are on the field and a rifle is in hand, read from the game's own state
    await f.waitFor((p) => p.frontStarted === 1 && p.frontLiving > 0 && p.gunsHeld > 0);
    // click the field to capture the pointer, the same gesture the game asks for
    await f.clickAt(800, 450);
    await f.wait(900);
    const hipGap = Number(await f.page(RETICLE_GAP));
    await f.shot("hip");
    // aim down sights: the right button is held while the frame is taken, so the zoom and the closed
    // reticle are the aimed view, judged by the handling's own blend and not by the button
    let aimedGap = -1;
    await Promise.all([
      f.hold("mouse2", { ms: 3000 }),
      (async () => {
        await f.waitFor((p) => p.aimed >= 0.99, { timeoutMs: 2500, note: "the aim blend reached full while the button was held" });
        aimedGap = Number(await f.page(RETICLE_GAP));
        await f.shot("aimed");
      })(),
    ]);
    if (!(hipGap > 0 && aimedGap > 0 && aimedGap < hipGap)) {
      throw new Error(`the reticle should close while aimed: hip gap ${hipGap}px, aimed gap ${aimedGap}px`);
    }
    // an attack winding up: a swing's red arc or a gunner's amber line is on the ground before it lands
    await f.waitFor((p) => p.windups > 0, { timeoutMs: 20000, note: "a fighter on the front began a wind-up" });
    await f.heading((await f.probe()).windupHeading);
    await f.waitFor((p) => p.windups > 0, { timeoutMs: 20000, note: "the next wind-up, now in view" });
    await f.shot("windup");
  },
});
