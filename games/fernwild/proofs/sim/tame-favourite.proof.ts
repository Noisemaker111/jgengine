import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { timeTame, turnAround, twoRaptorsDown } from "./scenarios";

// A lodestone's favourite is Simple Firmware: it tames in a fraction of the time raw meat takes, and cleaner.
export default defineProof(game, {
  proves: ["taming.preferred-food"],
  setup: (s) => twoRaptorsDown(s, { firmware_simple: 4, biogel: 20 }),
  async play(p) {
    const favourite = await timeTame(p, (r) => r.firmwareSlot, 0);
    await turnAround(p);
    const ordinary = await timeTame(p, (r) => r.rawMeatSlot, 1);
    await p.expect(() => favourite.seconds < ordinary.seconds / 2, `firmware tamed in ${favourite.seconds}s, raw meat in ${ordinary.seconds}s: under half`);
    await p.expect(() => favourite.effectiveness > ordinary.effectiveness, `firmware ended at ${favourite.effectiveness}% effectiveness, raw meat at ${ordinary.effectiveness}%`);
  },
});
