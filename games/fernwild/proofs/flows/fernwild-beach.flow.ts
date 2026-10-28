import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/** Fixed spots on the south beach below spawn (yaw 0 looks out to sea, +z; the waterline is near z 1355). */
const SPOTS: readonly { name: string; at: readonly [number, number, number] }[] = [
  { name: "beach-sea", at: [229.5, 1325, 0] },
  { name: "beach-inland", at: [229.5, 1345, Math.PI] },
  { name: "beach-along", at: [229.5, 1335, Math.PI / 2] },
  { name: "jungle-edge", at: [229.5, 1306, Math.PI] },
  { name: "jungle-in", at: [229.5, 1240, Math.PI] },
  { name: "shallows", at: [229.5, 1352, 0.4] },
];

/** The south beach in first person from the same spots every run, at noon, then the shore at night. */
export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.waitFor((p) => p.creatures > 0, { timeoutMs: 60000 });
    await f.press("KeyV");
    await f.command("cheat", { clock: 1800 });
    for (const spot of SPOTS) {
      await f.command("cheat", { teleport: spot.at });
      await f.wait(2500);
      await f.shot(spot.name);
    }
    await f.command("cheat", { teleport: SPOTS[1]?.at ?? [229.5, 1345, Math.PI] });
    await f.command("cheat", { clock: 7400 });
    await f.wait(2500);
    await f.shot("beach-night");
  },
});
