import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  async run(f) {
    await f.wait(2000);
    // plant the plot in front
    await f.press("KeyE");
    await f.waitFor((p) => p.planted >= 1, { timeoutMs: 4000 });
    await f.hold("KeyA", { ms: 300 });
    await f.wait(500);
    // the next plot
    await f.press("KeyE");
    await f.hold("KeyD", { ms: 800 });
    await f.wait(500);
    // and the one after
    await f.press("KeyE");
    await f.waitFor((p) => p.planted >= 3, { timeoutMs: 4000 });
    await f.wait(800);
    // the morning runs by
    await f.timeScale(30);
    await f.waitFor((p) => p.ripe >= 3, { timeoutMs: 30000 });
    await f.timeScale(1);
    await f.wait(700);
    // harvest
    await f.press("KeyE");
    await f.hold("KeyA", { ms: 300 });
    await f.wait(500);
    await f.press("KeyE");
    await f.hold("KeyA", { ms: 300 });
    await f.wait(500);
    await f.press("KeyE");
    await f.waitFor((p) => p.harvested >= 3, { timeoutMs: 4000 });
    // back toward the stall
    await f.hold("KeyD", { ms: 600 });
    await f.wait(600);
    // sell at the fish cart
    await f.press("KeyE");
    await f.waitFor((p) => p.shipped >= 3, { timeoutMs: 4000 });
    await f.wait(1500);
    // down the road to the bay
    await f.command("travel", {"sign":"sign-water"});
    await f.wait(1500);
    // cast
    await f.press("KeyE");
    await f.waitFor((p) => p.fishing === 2, { timeoutMs: 9000, note: "a bite" });
    await f.waitFor((p) => p.inZone > 0, { timeoutMs: 3000 });
    // reel in on the green
    await f.press("KeyE");
    await f.waitFor((p) => p.caught >= 1, { timeoutMs: 2000 });
    await f.wait(2200);
    // home along the road
    await f.command("travel", {"sign":"sign-home-water"});
    await f.wait(600);
    // sell the catch
    await f.press("KeyE");
    await f.waitFor((p) => p.carrying === 0, { timeoutMs: 4000 });
    await f.wait(1200);
    // to the harbor market
    await f.command("travel", {"sign":"sign-market"});
    await f.wait(1800);
    // buy cabbage seeds
    await f.press("Digit1");
    await f.wait(2000);
    await f.command("travel", {"sign":"sign-home-market"});
    await f.wait(400);
    // sleep: the day ends and saves
    await f.press("KeyE");
    await f.waitFor((p) => p.day >= 2, { timeoutMs: 4000 });
    await f.wait(3000);
    await f.expect((p) => p.harvested >= 3 && p.caught >= 1 && p.day >= 2, "arrival: a full day on camera");
  },
});
