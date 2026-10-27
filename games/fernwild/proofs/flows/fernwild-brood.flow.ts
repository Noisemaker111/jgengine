import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  async run(f) {
    // arrival on the beach
    await f.waitFor((p) => p.creatures > 0, { timeoutMs: 60000 });
    // noon; a level-30 survivor, every point in health to take her bites, 20 m south of the Green Obelisk, facing it
    await f.command("cheat", {"clock":1800,"xp":5000,"spend":{"health":30},"teleport":[669,247,0]});
    // a tamed Rex beside the survivor
    await f.command("cheat", {"summon":{"species":"rex","level":30,"distance":9,"side":-7,"tamed":true}});
    // and a tamed Raptor
    await f.command("cheat", {"summon":{"species":"raptor","level":20,"distance":6,"side":5,"tamed":true}});
    // step up to the obelisk's foot
    await f.command("cheat", {"teleport":[669,258,0]});
    // E would open its terminal
    await f.waitFor((p) => p.atObelisk === 1, { timeoutMs: 5000 });
    // E: the terminal
    await f.command("obeliskUse", {});
    await f.wait(800);
    // the three difficulties, each tribute counted against empty pockets, Summon greyed out
    await f.shot("fernwild-brood-terminal-empty");
    // the three artifacts from the caves; the clock back to noon so the portal's 25 s are counted from here
    await f.command("cheat", {"clock":1800,"give":{"artifact_clever":1,"artifact_hunter":1,"artifact_massive":1}});
    await f.wait(600);
    // Gamma's tribute met, its Summon lit; Beta and Alpha still ask for trophies and levels
    await f.shot("fernwild-brood-terminal");
    // Summon the Gamma Broodmother
    await f.command("summonBoss", {"tier":"gamma"});
    // the portal counts down; the artifacts are gone
    await f.waitFor((p) => p.brood === 1 && p.artifacts === 0, { timeoutMs: 3000 });
    // back off to see the obelisk, still inside the portal's 30 m
    await f.command("cheat", {"teleport":[669,241,0]});
    await f.wait(1500);
    // the portal: a green beam and a ring at the obelisk's foot, the countdown across the top
    await f.shot("fernwild-brood-portal");
    // past its 25 seconds
    await f.command("cheat", {"clock":1830});
    // taken through to her lair
    await f.waitFor((p) => p.brood === 2 && p.inLair === 1, { timeoutMs: 5000 });
    await f.expect((p) => (p.lairTames) === 2, "__jgProbe().lairTames");
    // her first Araneo crawl out of the walls
    await f.waitFor((p) => p.araneo >= 4, { timeoutMs: 3000 });
    await f.wait(1200);
    // her walled lair out at sea: the Broodmother in the middle, her health across the top, the tames beside the survivor
    await f.shot("fernwild-brood-lair");
    // her opening spit
    await f.waitFor((p) => p.webbed === 1, { timeoutMs: 6000 });
    await f.wait(300);
    // webbed: acid on the survivor, slowed
    await f.shot("fernwild-brood-webbed");
    // the fight brings her under two thirds
    await f.command("cheat", {"broodHealth":0.6});
    // she calls her brood
    await f.waitFor((p) => p.broodPhase === 2, { timeoutMs: 3000 });
    await f.wait(800);
    // "The Broodmother calls her brood", more Araneo out of the walls
    await f.shot("fernwild-brood-phase");
    // the killing blow
    await f.command("cheat", {"broodHealth":0});
    // won: Element, the Spider Flag and her trophy
    await f.waitFor((p) => p.brood === 3 && p.element === 20, { timeoutMs: 3000 });
    await f.wait(1200);
    // victory: her body, the minute's countdown home, the rewards in the notice
    await f.shot("fernwild-brood-won");
    // past the minute
    await f.command("cheat", {"clock":1920});
    // sent back
    await f.waitFor((p) => p.brood === 0 && p.inLair === 0, { timeoutMs: 5000 });
    await f.wait(1500);
    // back where the survivor stood under the Green Obelisk, with both tames
    await f.shot("fernwild-brood-home");
  },
});
