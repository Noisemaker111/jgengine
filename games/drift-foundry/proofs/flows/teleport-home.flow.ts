import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";
import { ROW_SIX_TRACK } from "../../src/game/tracks/catalog";

export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.see("LAP 1/1", { timeoutMs: 60000, note: "arrival: a run is live" });
    const home = await f.probe();
    const to = { x: home.x, z: home.z + 6, yaw: ROW_SIX_TRACK.spawn.heading };
    for (const [leg, keys] of [["a", ["KeyW"]], ["b", ["KeyW", "KeyD"]]] as const) {
      await f.hold(keys, { ms: 2500 });
      const away = await f.waitFor((p) => Math.hypot(p.x - to.x, p.z - to.z) > 8, { timeoutMs: 15000, note: `leg ${leg}: the kart drove away from the teleport spot` });
      const answer = (await f.rpc({ method: "teleport", ...to })) as { ok?: boolean; error?: string };
      if (answer.ok !== true) throw new Error(`leg ${leg}: teleport answered ${JSON.stringify(answer)}`);
      await f.wait(150);
      const landed = await f.expect((p) => Math.hypot(p.x - to.x, p.z - to.z) < 1.5, `leg ${leg}: the kart is at the teleport spot, not where it was (${away.x.toFixed(1)}, ${away.z.toFixed(1)})`);
      await f.report(`leg ${leg} from (${away.x.toFixed(1)}, ${away.z.toFixed(1)}) landed (${landed.x.toFixed(1)}, ${landed.z.toFixed(1)})`);
    }
  },
});
