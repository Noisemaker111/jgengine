import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.see(/Boots on the dust/i, { timeoutMs: 60000, note: "arrival: a run is up and the first beat started by itself" });
    await f.expect((p) => p.guards > 0 && p.health > 0, "arrival: the outposts are garrisoned and you are alive");
    await f.hold("KeyW", { ms: 400 });
    await f.command("approach", {});
    await f.wait(500);
    for (let i = 0; i < 4; i += 1) {
      await f.hold("mouse0", { ms: 550 });
      await f.wait(350);
    }
    await f.command("approach", {});
    await f.wait(500);
    for (let i = 0; i < 4; i += 1) {
      await f.hold("mouse0", { ms: 550 });
      await f.wait(350);
    }
    await f.command("approach", {});
    await f.wait(500);
    for (let i = 0; i < 4; i += 1) {
      await f.hold("mouse0", { ms: 550 });
      await f.wait(350);
    }
    await f.command("approach", {});
    await f.wait(500);
    for (let i = 0; i < 4; i += 1) {
      await f.hold("mouse0", { ms: 550 });
      await f.wait(350);
    }
    await f.command("approach", {});
    await f.wait(500);
    for (let i = 0; i < 4; i += 1) {
      await f.hold("mouse0", { ms: 550 });
      await f.wait(350);
    }
    await f.command("approach", {});
    await f.wait(500);
    for (let i = 0; i < 4; i += 1) {
      await f.hold("mouse0", { ms: 550 });
      await f.wait(350);
    }
    await f.command("approach", {});
    await f.wait(500);
    for (let i = 0; i < 4; i += 1) {
      await f.hold("mouse0", { ms: 550 });
      await f.wait(350);
    }
    await f.command("approach", {});
    await f.wait(500);
    for (let i = 0; i < 4; i += 1) {
      await f.hold("mouse0", { ms: 550 });
      await f.wait(350);
    }
    await f.command("approach", {});
    await f.wait(500);
    for (let i = 0; i < 4; i += 1) {
      await f.hold("mouse0", { ms: 550 });
      await f.wait(350);
    }
    await f.command("approach", {});
    await f.wait(500);
    for (let i = 0; i < 4; i += 1) {
      await f.hold("mouse0", { ms: 550 });
      await f.wait(350);
    }
    await f.expect((p) => p.kills >= 1, "arrival: shots landed through the projectile system and a guard died");
    await f.waitFor((p) => p.cleared >= 1, { timeoutMs: 15000 });
    await f.expect((p) => p.cleared >= 1 && p.cash > 149, "arrival: Drill Site is cleared and paid out, so the campaign turns");
  },
});
