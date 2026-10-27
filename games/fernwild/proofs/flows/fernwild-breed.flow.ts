import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  async run(f) {
    // arrival on the beach
    await f.waitFor((p) => p.creatures > 0, { timeoutMs: 60000 });
    // night on the open south coast, facing north: too cold for a raptor egg
    await f.command("cheat", {"clock":3500,"teleport":[-1005,566,0]});
    await f.wait(1000);
    // a tamed female raptor, mating on (ARK's GMSummon)
    await f.command("cheat", {"summon":{"species":"raptor","level":20,"distance":6,"side":-3.5,"sex":"female","tamed":true,"mating":true}});
    // and a male beside her
    await f.command("cheat", {"summon":{"species":"raptor","level":20,"distance":6,"side":-1,"sex":"male","tamed":true,"mating":true}});
    // standing together, they mate
    await f.waitFor((p) => p.mating === 1, { timeoutMs: 5000 });
    // their models stream in
    await f.wait(4000);
    // the raptor pair mating at night
    await f.shot("fernwild-breed-mating");
    // about a minute later she lays a fertilized egg
    await f.waitFor((p) => p.eggs >= 1, { timeoutMs: 75000 });
    await f.expect((p) => p.eggTemperature < 20, "__jgProbe().eggTemperature < 20");
    // a campfire to the hotbar
    await f.command("cheat", {"give":{"campfire":1},"toHotbar":["campfire"]});
    // campfire in hand
    await f.press("Digit1");
    // lit a few metres from the egg: in a raptor egg's 20-28 °C
    await f.hold("mouse0", { until: (p) => p.eggTemperature >= 20 && p.eggTemperature <= 28, ms: 80, timeoutMs: 3000 });
    await f.wait(1500);
    // the egg by the campfire, incubating
    await f.shot("fernwild-breed-egg");
    // ARK's hatch and maturation multipliers, so the proof does not take two hours
    await f.command("cheat", {"breedingSpeed":1000});
    // it hatches
    await f.waitFor((p) => p.babies >= 1, { timeoutMs: 30000 });
    await f.expect((p) => p.babySize < 40, "__jgProbe().babySize < 40");
    await f.wait(1000);
    // a baby raptor a quarter of its parents' size
    await f.shot("fernwild-breed-hatched");
    // growing up
    await f.waitFor((p) => p.babySize >= 55, { timeoutMs: 80000 });
    // the juvenile, over half its parents' size
    await f.shot("fernwild-breed-growing");
  },
});
