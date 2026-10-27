import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  async run(f) {
    // arrival on the beach
    await f.waitFor((p) => p.creatures > 0, { timeoutMs: 60000 });
    // ARK's settimeofday: noon on day one, the sky clear
    await f.command("cheat", {"clock":1800});
    // the south beach at noon is hot
    await f.waitFor((p) => p.temperature > 24, { timeoutMs: 3000 });
    // clear noon on the beach, the temperature at the top of the vitals
    await f.shot("fernwild-noon");
    // late afternoon, inside the schedule's first shower
    await f.command("cheat", {"clock":2500});
    // rain falling here
    await f.waitFor((p) => p.rain > 20, { timeoutMs: 3000 });
    await f.expect((p) => (p.sheltered) === 0, "__jgProbe().sheltered");
    await f.wait(1500);
    // rain on the beach under a grey sky; the HUD reads Rain and the chill it brings
    await f.shot("fernwild-rain");
    // ARK's SetPlayerPos: up to the snow biome in the north-west
    await f.command("cheat", {"teleport":[-760.8,-1119]});
    // 20:00 on day two, in the evening's second shower
    await f.command("cheat", {"clock":6600});
    // up here the shower falls as snow
    await f.waitFor((p) => p.snow > 20, { timeoutMs: 5000 });
    await f.expect((p) => (p.rain) === 0, "__jgProbe().rain");
    // the snow at night is below freezing
    await f.waitFor((p) => p.temperature < 0, { timeoutMs: 5000 });
    await f.wait(2500);
    // night in the snow biome: snow falling under cloud, the survivor freezing
    await f.shot("fernwild-snow-night");
  },
});
