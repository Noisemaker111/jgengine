import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/** A click on Main Street at ground point (x, z), as the street's build command receives it. */
const at = (x: number, z: number) => ({ point: [x, 0, z] });

/**
 * A career from nothing, at 1x game time, through the commands the HUD's own buttons run: four
 * trades in the union (the build bar refuses the rest, `union.test.ts`); the starter crew on Main Street's corners; the waves called
 * as the street clears; the day ends; its dues hire the next trade in the union hall; the next day
 * opens with that trade on the build bar.
 */
export default defineFlow(game, {
  async run(f) {
    await f.command("run.begin", {});
    await f.expect((p) => p.towers === 0 && p.hired === 4 && p.dues === 0, "day one: an empty street, four trades in the union, no dues yet");

    // The opening till buys two: a barista at the bend and a farmer for the flyers.
    await f.command("buildTower1", {});
    await f.command("tower.build", at(0, 4));
    await f.wait(1500);
    await f.command("buildTower3", {});
    await f.command("tower.build", at(-12, -3.2));
    await f.waitFor((p) => p.towers >= 2, { timeoutMs: 20000, note: "the first two trades have clocked in" });

    // Call the first wave, then hire with the kill pay: a teacher for the phones, a plumber, then more.
    await f.command("wave.send", {});
    const hires: [string, number, number, number][] = [
      ["buildTower6", 90, 22, 0], ["buildTower2", 65, 6, 14], ["buildTower3", 60, 12, 16], ["buildTower1", 50, -18, -14], ["buildTower3", 60, 24, 16], ["buildTower1", 50, 32, 2],
    ];
    for (const [key, cost, x, z] of hires) {
      const p = await f.waitFor((p) => p.gold >= cost || p.ended === 1, { timeoutMs: 300_000, note: "kill pay for the next hire" });
      if (p.ended === 1) break;
      await f.command(key, {});
      await f.command("tower.build", at(x, z));
    }
    // The rest of the day: the waves march on their own once each break runs out.
    await f.waitFor((p) => p.ended === 1, { timeoutMs: 900_000, note: "the first day ends, held or lost" });
    await f.expect((p) => p.dues > 0, "the day paid union dues");

    // The union hall: the grandma is the cheapest new hire, and the next day offers her.
    await f.command("union.buy", { hire: "worker_grandma" });
    await f.expect((p) => p.hired === 5, "five trades in the union after the first hire");
    await f.command("legacy.choose", { boon: null });
    await f.expect((p) => p.ended === 0 && p.towers === 0, "the next day opens on a clear street");
    await f.command("buildTower4", {});
    await f.command("tower.build", at(0, 4));
    await f.waitFor((p) => p.towers === 1, { timeoutMs: 20000, note: "the newly hired grandma clocks in on day two" });
  },
});
