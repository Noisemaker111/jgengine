import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// The house starts with 640 credits. The player picks a Holo Arcade from Furnish and taps open floor
// in the commons: it is placed and paid for.
export default defineProof(game, {
  proves: ["life.home-decor"],
  async play(p) {
    const before = await p.probe();
    await p.act("build.tool", { toolId: "holo_arcade" });
    await p.act("world.pointer", { point: { x: -9, y: 0, z: -1 }, entity: null, object: null });
    await p.expect((r) => r.furnishings === before.furnishings + 1 && r.credits <= before.credits - 170, "a Holo Arcade stands in the commons and cost 180 credits");
  },
});
