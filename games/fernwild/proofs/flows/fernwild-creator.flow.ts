import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.waitFor((p) => p.creatures > 0, { timeoutMs: 60000 });
    await f.command("createSurvivor", { name: "Ada", body: "woman-1", height: 1.08, region: "spawn_north_1" });
    await f.waitFor((p) => p.z < -1000, { timeoutMs: 5000 });
    await f.wait(2500);
    await f.shot("creator-north-back");
    await f.command("cheat", { turn: Math.PI });
    await f.wait(1500);
    await f.shot("creator-north-front");
    await f.press("KeyI");
    await f.wait(1500);
    await f.shot("creator-pane");
    await f.press("KeyI");
    await f.command("cheat", { teleport: [223, 1300] });
    await f.waitFor((p) => p.z > 1000, { timeoutMs: 5000 });
    await f.command("cheat", { give: { stone: 3 }, kill: true });
    await f.waitFor((p) => p.z < -1000, { timeoutMs: 5000 });
    await f.wait(1500);
    await f.shot("creator-respawn-north");
  },
});
