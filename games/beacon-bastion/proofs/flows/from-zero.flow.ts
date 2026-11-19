import { defineFlow } from "@jgengine/core/play/flow";

import { game } from "../../src/game.config";
import { BUILD_PLOTS } from "../../src/game/world/path";

const ARCHERS = "Digit1";
const CANNON = "Digit2";
const TOWER_GOLD = 50;
const CANNON_GOLD = 90;
/** A player glances at the field and the purse about once a second. */
const LOOK_MS = 1000;
const MAX_LOOKS = 3600;

export default defineFlow(game, {
  async run(f) {
    await f.expect((p) => p.wave === 1 && p.creeps === 0 && p.towers === 0, "a new keep: wave 1 waiting, the road empty, no towers yet");
    let built = 0;
    for (let look = 0; look < MAX_LOOKS; look += 1) {
      const p = await f.probe();
      if (p.held === 1 || p.fallen === 1) break;
      const plot = BUILD_PLOTS[built];
      const cannon = built % 3 === 2;
      if (plot !== undefined && p.gold >= (cannon ? CANNON_GOLD : TOWER_GOLD)) {
        // The build bar's key, then a click on the plot.
        await f.press(cannon ? CANNON : ARCHERS);
        const result = await f.tryCommand("tower.build", { point: [plot.position[0], 0, plot.position[2]] });
        if (result.status === "applied") built += 1;
        continue;
      }
      if (plot === undefined && p.gold >= TOWER_GOLD * 2) {
        // Every plot taken: the gold goes into the towers instead.
        await f.tryCommand("upgradeTower", {});
      }
      if (p.waveReady === 1 && p.creeps === 0) await f.tryCommand("wave.send", {});
      await f.wait(LOOK_MS);
    }
    await f.expect((p) => (p.held === 1 || p.fallen === 1) && p.wave > 1, "the run is over: the keep held, or fell after holding at least one wave");
  },
});
