import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  async run(f) {
    // arrival on the beach
    await f.waitFor((p) => p.pedestals === 8, { timeoutMs: 60000 });
    // ARK's admin give: stone, wood and a pick on the hotbar
    await f.command("cheat", {"give":{"stone":20,"wood":10,"stone_pick":1},"toHotbar":["stone_pick"]});
    // three stacks carried
    await f.waitFor((p) => p.carrying === 3, { timeoutMs: 3000 });
    // teleport to the hillside below the lower south cave, far from the beach
    await f.command("cheat", {"goto":{"cave":"cave_lower_south_cave","back":30}});
    // the teleport has landed, a quarter kilometre north of the beach
    await f.waitFor((p) => p.z < 1050, { timeoutMs: 3000 });
    // a level 30 wild raptor five metres ahead
    await f.command("cheat", {"summon":{"species":"raptor","level":30,"distance":5}});
    // it attacks: health below 70%
    await f.waitFor((p) => p.health < p.healthMax * 0.7, { timeoutMs: 20000 });
    // the raptor on the survivor, health falling
    await f.shot("fernwild-death-raptor");
    // killed: awake back on the beach, the body far behind
    await f.waitFor((p) => p.bodyDistance > 50, { timeoutMs: 60000 });
    await f.expect((p) => (p.carrying) === 0, "empty-handed");
    await f.expect((p) => (p.bodyStacks) === 3, "all three stacks lie with the body");
    // awake on the beach; the HUD says how far the body is and how long it lasts
    await f.shot("fernwild-death-beach");
    // ARK's admin DestroyWildDinos, so the raptor isn't waiting
    await f.command("cheat", {"destroyWild":true});
    // back where the survivor fell
    await f.command("cheat", {"goto":{"cave":"cave_lower_south_cave","back":30}});
    // the body is in reach
    await f.waitFor((p) => p.atBody === 1, { timeoutMs: 5000 });
    // the body's bundle and the beam of light over it
    await f.shot("fernwild-death-body");
    // E: take everything back; the body is gone
    await f.hold("KeyE", { until: (p) => p.bodyDistance === -1, timeoutMs: 3000 });
    await f.expect((p) => (p.carrying) === 3, "all three stacks carried again");
    // things taken back
    await f.shot("fernwild-death-recovered");
  },
});
