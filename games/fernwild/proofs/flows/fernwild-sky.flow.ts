import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/** The south beach below spawn, facing out to sea (yaw 0 looks toward +z); the waterline is at about z 1355. */
const BEACH: readonly [number, number, number] = [229.5, 1318, 0];
const WATERLINE: readonly [number, number, number] = [229.5, 1342, 0];

/** The same sea view at each time of day and weather, then the shallows close up. */
export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.waitFor((p) => p.creatures > 0, { timeoutMs: 60000 });
    await f.command("cheat", { teleport: BEACH });
    const at = async (clock: number, name: string) => {
      await f.command("cheat", { clock });
      await f.wait(2500);
      await f.shot(name);
    };
    await at(1800, "sky-noon");
    await at(2300, "sky-overcast");
    await at(2550, "sky-rain");
    await at(4500, "sky-dawn");
    await at(5700, "sky-storm");
    await at(7400, "sky-night");
    await at(9900, "sky-dusk");
    await f.command("cheat", { clock: 1800 });
    await f.command("cheat", { teleport: WATERLINE });
    await f.wait(2500);
    await f.shot("sky-shore");
  },
});
