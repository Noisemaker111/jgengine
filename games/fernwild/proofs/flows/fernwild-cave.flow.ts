import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  async run(f) {
    // arrival: all eight caves laid out, each artifact on its pedestal
    await f.waitFor((p) => p.pedestals === 8, { timeoutMs: 60000 });
    // ARK's admin teleport: stand six metres outside the lower south cave's mouth, facing in, the camera swung round behind
    await f.command("cheat", {"goto":{"cave":"cave_lower_south_cave","back":6}});
    // short steps until the survivor faces where the camera, swung round by the teleport on its next frame, looks: down the tunnel
    await f.hold("KeyW", { until: (p) => Math.abs(p.yaw - 2.75) < 0.15, ms: 60, timeoutMs: 3000 });
    await f.expect((p) => (p.caveDepth) === -1, "still outside, in front of the mouth");
    // the mouth in the hillside, crystals glowing inside
    await f.shot("fernwild-cave-mouth");
    // walk in
    await f.hold("KeyW", { until: (p) => p.caveDepth > 12, ms: 200, timeoutMs: 8000 });
    // inside the arched tunnel, lit by the crystals on its walls
    await f.shot("fernwild-cave-tunnel");
    // on down the winding tunnel to the pedestal in the chamber
    await f.hold("KeyW", { until: (p) => p.atPedestal === 1, ms: 200, timeoutMs: 15000 });
    // the chamber and the glowing artifact on its pedestal
    await f.shot("fernwild-cave-chamber");
    // take it
    await f.hold("KeyE", { until: (p) => p.artifacts === 1, timeoutMs: 3000 });
    await f.expect((p) => (p.pedestals) === 7, "that pedestal is empty now");
    // the artifact taken: the notice, and the bare pedestal
    await f.shot("fernwild-cave-artifact");
  },
});
