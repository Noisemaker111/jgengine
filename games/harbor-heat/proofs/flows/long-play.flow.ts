import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";
import { DISTRICTS } from "../../src/game/world/districts";

/*
 * Several minutes of ordinary play for a stall hunt (`drive --hitches`, `perf desktop --flow`):
 * walking, sprinting and looking around the spawn, the phone, the gun counter and the garage, gunfire,
 * stealing a parked car and driving it, then a stop in every district the city streams in. Only real
 * input, production commands and teleports, so it plays in a shipped build as well as on the dev
 * server.
 */
export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.waitFor((p) => p.x !== 0 || p.z !== 0, { timeoutMs: 30000 });
    // on foot around the spawn: walk, look, sprint
    await f.hold("KeyW", { ms: 2500 });
    await f.look(600, 0);
    await f.hold(["ShiftLeft", "KeyW"], { ms: 2500 });
    await f.look(-900, 30);
    await f.hold("KeyD", { ms: 1500 });
    await f.look(400, -30);
    await f.hold(["KeyW", "KeyA"], { ms: 2000 });
    // the phone, up and away
    await f.press("KeyT");
    await f.wait(2000);
    await f.press("KeyT");
    await f.wait(600);
    // the gun counter (shut at night, so it may refuse) and the garage sheet
    if ((await f.tryCommand("shop.open")).status === "applied") {
      await f.wait(2000);
      await f.command("shop.close");
    }
    await f.command("garage.open");
    await f.wait(2000);
    await f.command("garage.close");
    await f.wait(600);
    // gunfire
    await f.hold("mouse0", { ms: 1500 });
    await f.look(300, 0);
    await f.hold("mouse0", { ms: 1000 });
    // walk up to the nearest parked car, take it with E and drive
    const here = await f.probe();
    if (here.carDistance >= 0) {
      await f.teleport({ x: here.carX + 2.2, z: here.carZ });
      await f.wait(400);
      await f.press("KeyE");
      const taken = await f.waitFor((p) => p.driving === 1, { timeoutMs: 8000 }).then(() => true, () => false);
      if (taken) {
        await f.hold("KeyW", { ms: 5000 });
        await f.hold(["KeyW", "KeyA"], { ms: 2000 });
        await f.hold("KeyW", { ms: 4000 });
        await f.hold(["KeyW", "KeyD"], { ms: 2000 });
        await f.hold("KeyS", { ms: 2000 });
        await f.press("KeyF");
        await f.waitFor((p) => p.driving === 0, { timeoutMs: 8000 });
      }
    }
    // every district: arrive, look around, walk a little
    for (const district of DISTRICTS) {
      await f.teleport({ x: district.center[0], z: district.center[1] });
      await f.wait(1500);
      await f.look(700, 0);
      await f.hold("KeyW", { ms: 1500 });
      await f.look(-500, 20);
      await f.hold(["ShiftLeft", "KeyW"], { ms: 1500 });
    }
  },
});
