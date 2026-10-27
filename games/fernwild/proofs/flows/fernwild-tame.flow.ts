import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  async run(f) {
    await f.waitFor((p) => p.creatures > 0, { timeoutMs: 60000 });
    await f.expect((p) => (p.creatures) === 19, "arrival: the zones within reach of the beach spawn wake all at once with ARK's species and weights (dodos, phiomias, dilophosaurs, a trike, a parasaur, a stego, a lystro); far zones sleep");
    // dodos grazing inland of the spawn
    await f.shot("fernwild-herds");
    // ARK's admin console: a levelled survivor with a club, raw meat and a raptor saddle; taming twenty times faster so the proof is short
    await f.command("cheat", {"xp":100000,"spend":{"health":45,"stamina":8},"give":{"wooden_club":1,"raw_meat":10,"raptor_saddle":1},"tamingSpeed":20});
    // the club onto the hotbar
    await f.command("shuttle", {"inventoryId":"inventory","slot":0});
    // club in hand: key 1
    await f.press("Digit1");
    // step right, clear of the tree the survivor woke facing
    await f.hold("KeyD", { until: (p) => p.acrossSpawn > 3, ms: 200, timeoutMs: 4000 });
    // face inland again, where the camera looks
    await f.hold("KeyW", { ms: 250 });
    await f.expect((p) => (p.aimStrike) === 0, "nothing to strike in front, so the club meets the raptor and not a trunk");
    // a level-1 raptor right in front
    await f.command("cheat", {"summon":{"species":"raptor","level":1,"distance":4}});
    await f.wait(700);
    // the raptor charges; its card shows level and health
    await f.shot("fernwild-raptor");
    // club it unconscious: about eighteen hits of torpor
    await f.hold("mouse0", { until: (p) => p.aimedDown === 1, timeoutMs: 30000 });
    await f.expect((p) => p.aimedGap > 1.5, "it went down where it bit from, a body's length away, never inside the survivor");
    // the raptor down, torpor and taming bars under the crosshair
    await f.shot("fernwild-knocked-out");
    // access its inventory
    await f.hold("KeyE", { until: (p) => p.screen === 1, timeoutMs: 3000 });
    // give it the raw meat
    await f.command("giveCreature", {"inventoryId":"inventory","slot":1});
    await f.wait(400);
    // its inventory holds the meat; it eats on its own clock
    await f.shot("fernwild-feeding");
    // tamed after seven meals
    await f.waitFor((p) => p.tamed === 1, { timeoutMs: 45000 });
    // put the raptor saddle on
    await f.command("giveCreature", {"inventoryId":"inventory","slot":2});
    await f.waitFor((p) => p.saddled === 1, { timeoutMs: 3000 });
    // tamed and saddled, with follow and stay orders and its own stat sheet
    await f.shot("fernwild-tamed");
    // ARK's dino XP cheat: 35 XP is two levels on the creature curve (10, then 20)
    await f.command("cheat", {"tameXp":35});
    await f.expect((p) => (p.tamePoints) === 2, "two points to spend");
    // a point into health
    await f.command("levelTame", {"stat":"health"});
    await f.expect((p) => (p.tameHealthMax) === 211, "ARK's +5.4% of the 200 it was tamed with");
    // the sheet: two levels gained, one point left, health raised
    await f.shot("fernwild-tame-levels");
    await f.command("closeCreature", {});
    // climb on
    await f.hold("KeyE", { until: (p) => p.riding === 1, timeoutMs: 3000 });
    // ride inland
    await f.hold("KeyW", { ms: 2500 });
    // sprint: the mount pays for it in stamina
    await f.hold(["ShiftLeft", "KeyW"], { ms: 2000 });
    await f.expect((p) => p.mountStamina < p.mountStaminaMax - 8, "about 6 stamina a second gone from the mount, none from the rider");
    // on the raptor's back, the camera on the mount
    await f.shot("fernwild-riding");
  },
});
