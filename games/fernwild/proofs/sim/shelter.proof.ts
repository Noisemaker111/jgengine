import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// A closed hut holds off the snow's night. Setup stands the survivor in the snow at midnight with a thatch hut
// in front of them, its door shut and facing them (building it by aim is building.place-snap's proof).
// Play opens the door, walks up onto the floor and in, looks back at the doorframe and shuts it.
export default defineProof(game, {
  proves: ["building.shelter"],
  setup(s) {
    s.waitFor((p) => p.creatures > 0, { timeoutMs: 60_000 });
    s.command("cheat", { clock: 3600, teleport: [-980.8, -1146.7] });
    s.command("cheat", { hut: "thatch" });
    s.waitFor((p) => p.structures === 7, { timeoutMs: 3000 });
  },
  async play(p) {
    await p.wait(500);
    const out = await p.probe();
    await p.expect((r) => r.indoors === 0 && r.temperature < 0, "outside the hut, midnight in the snow is below freezing");
    await p.heading(out.doorwayYaw);
    await p.press("KeyE");
    await p.waitFor((r) => r.doorsOpen === 1, { timeoutMs: 3000, note: "the door swings open" });
    await p.hold("KeyW", { until: (r) => r.floorDist < 0.8, ms: 80, timeoutMs: 8000 });
    await p.expect((r) => r.indoors === 0, "inside with the door open, the night still gets in");
    // Look at the doorframe's post beside the open gap, as you look at a door to use it, and shut it.
    await p.heading((await p.probe()).doorwayYaw + 0.6);
    await p.press("KeyE");
    await p.waitFor((r) => r.doorsOpen === 0, { timeoutMs: 3000, note: "the door shuts" });
    await p.waitFor((r) => r.indoors === 1 && r.temperature > out.temperature + 8, { timeoutMs: 3000, note: "shut in, the air is many degrees warmer than outside" });
  },
});
