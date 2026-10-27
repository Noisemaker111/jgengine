import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  async run(f) {
    // arrival on the beach
    await f.waitFor((p) => p.creatures > 0, { timeoutMs: 60000 });
    // crates are already down or falling across the island
    await f.waitFor((p) => p.crateDistance > 0, { timeoutMs: 5000 });
    // noon, 80 m south of the south coast's first drop site, facing it
    await f.command("cheat", {"clock":1800,"teleport":[-1013.7,569.5,0]});
    // a white crate sent from that site
    await f.command("cheat", {"drop":"white"});
    // it starts 150 m up
    await f.waitFor((p) => p.crateAltitude > 140, { timeoutMs: 3000 });
    // 103 s into its two-minute fall
    await f.command("cheat", {"clock":1903});
    // close to the ground now
    await f.waitFor((p) => p.crateAltitude > 5 && p.crateAltitude < 30, { timeoutMs: 3000 });
    await f.expect((p) => (p.crateLanded) === 0, "__jgProbe().crateLanded");
    await f.wait(1500);
    // a white crate under its canopy coming down, its beam rising above it
    await f.shot("fernwild-drop-falling");
    // past its two minutes
    await f.command("cheat", {"clock":1925});
    // landed
    await f.waitFor((p) => p.crateLanded === 1 && p.crateAltitude === 0, { timeoutMs: 3000 });
    // walk up beside it
    await f.command("cheat", {"teleport":[-1015.2,647,0]});
    // E would open it
    await f.waitFor((p) => p.atCrate === 1, { timeoutMs: 3000 });
    // a level 1 survivor tries it
    await f.command("openCrate", {});
    await f.expect((p) => (p.atCrate) === 1, "__jgProbe().atCrate");
    await f.wait(800);
    // the crate stays shut: White crate, requires level 3
    await f.shot("fernwild-drop-locked");
    // level 3
    await f.command("cheat", {"xp":25});
    // open it again
    await f.command("openCrate", {});
    // emptied, the crate is gone
    await f.waitFor((p) => p.atCrate === 0, { timeoutMs: 3000 });
    await f.wait(800);
    // the loot in the survivor's pockets, listed in the notice
    await f.shot("fernwild-drop-opened");
    // late evening, 40 m south of a snow-biome drop site
    await f.command("cheat", {"clock":3300,"teleport":[-533.7,-374.5,0]});
    // a red crate, level 60
    await f.command("cheat", {"drop":"red"});
    // it lands after dark
    await f.command("cheat", {"clock":3430});
    await f.waitFor((p) => p.crateLanded === 1, { timeoutMs: 3000 });
    await f.wait(2000);
    // a red beam over the snow at night
    await f.shot("fernwild-drop-red-night");
  },
});
