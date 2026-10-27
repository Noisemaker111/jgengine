import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  async run(f) {
    await f.expect((p) => p.health > 0 && p.structures === 0, "arrival on the beach, nothing built");
    // ARK's admin console: a few levels and the thatch, wood and fiber a hut costs
    await f.command("cheat", {"xp":2000,"give":{"thatch":100,"wood":30,"fiber":60}});
    await f.command("learn", {"engramId":"thatch_foundation"});
    await f.command("learn", {"engramId":"thatch_doorframe"});
    await f.command("learn", {"engramId":"thatch_wall"});
    await f.command("learn", {"engramId":"thatch_door"});
    // five level-4 engrams, 3 points each
    await f.command("learn", {"engramId":"thatch_ceiling"});
    await f.command("craft", {"recipeId":"thatch_foundation"});
    await f.command("craft", {"recipeId":"thatch_doorframe"});
    await f.command("craft", {"recipeId":"thatch_wall","count":3});
    await f.command("craft", {"recipeId":"thatch_door"});
    // craft the hut: 80 thatch, 22 wood, 56 fiber at ARK's prices
    await f.command("craft", {"recipeId":"thatch_ceiling"});
    await f.expect((p) => (p.crafting) === 7, "__jgProbe().crafting");
    // the crafting queue runs down
    await f.waitFor((p) => p.crafting === 0, { timeoutMs: 40000 });
    // the pieces onto the hotbar, keys 1 to 5
    await f.command("cheat", {"toHotbar":["thatch_foundation","thatch_doorframe","thatch_wall","thatch_door","thatch_ceiling"]});
    // step onto open sand, clear of the palm by the spawn
    await f.hold("KeyD", { ms: 700 });
    // face inland, where the camera looks
    await f.hold("KeyW", { ms: 250 });
    // foundation in hand
    await f.press("Digit1");
    await f.wait(500);
    await f.expect((p) => ([p.ghost, p.holding].join()) === "1,1", "a green ghost on the sand");
    // the foundation ghost in front, the HUD says Place Thatch Foundation
    await f.shot("fernwild-build-ghost");
    // place it
    await f.hold("mouse0", { until: (p) => p.structures === 1, ms: 80, timeoutMs: 3000 });
    // step back so the build cursor (3.5 m out) sits on the near edge
    await f.hold("KeyS", { until: (p) => p.pastFloor < -4.2, ms: 80, timeoutMs: 3000 });
    // doorframe in hand: it snaps to the foundation's edge
    await f.press("Digit2");
    await f.waitFor((p) => p.ghostSnapped === 1 && p.ghost === 1, { timeoutMs: 3000 });
    await f.hold("mouse0", { until: (p) => p.structures === 2, ms: 80, timeoutMs: 3000 });
    // walls for the two side edges
    await f.press("Digit3");
    await f.waitFor((p) => p.ghost === 1, { timeoutMs: 3000 });
    await f.hold("mouse0", { until: (p) => p.structures === 3, ms: 80, timeoutMs: 3000 });
    await f.wait(400);
    await f.hold("mouse0", { until: (p) => p.structures === 4, ms: 80, timeoutMs: 3000 });
    // turn back to face the doorway with one short step, so the hop runs straight instead of curving round from facing the camera
    await f.press("KeyW");
    await f.expect((p) => Math.abs(p.acrossDoor) < 0.2, "square in front of the gap: it is 1.2 m wide and the survivor 0.8 m");
    // running hops straight up through the open doorframe onto the raised floor, held through each jump (letting go of W in the air stops short of the lip); a frame hitch can leave the first one short, so it hops again until the survivor stands past the door
    await f.hold(["Space", "KeyW"], { until: (p) => p.pastDoor > 0.3, ms: 380, timeoutMs: 4000 });
    await f.report("on-the-floor");
    await f.wait(400);
    await f.expect((p) => (p.ghost) === 1, "__jgProbe().ghost");
    // the back wall
    await f.hold("mouse0", { until: (p) => p.structures === 5, ms: 80, timeoutMs: 3000 });
    // the ceiling snaps onto the wall tops
    await f.press("Digit5");
    await f.waitFor((p) => p.ghost === 1, { timeoutMs: 3000 });
    // from inside: the roof ghost over the walls
    await f.shot("fernwild-build-roof-ghost");
    await f.hold("mouse0", { until: (p) => p.structures === 6, ms: 80, timeoutMs: 3000 });
    // back out through the doorway
    await f.hold("KeyS", { until: (p) => p.pastDoor < -0.8, ms: 120, timeoutMs: 4000 });
    // the door snaps into its frame
    await f.press("Digit4");
    await f.waitFor((p) => p.ghost === 1, { timeoutMs: 3000 });
    await f.hold("mouse0", { until: (p) => p.structures === 7, ms: 80, timeoutMs: 3000 });
    await f.wait(500);
    await f.expect((p) => (p.ghost) === -1, "the last piece used up: nothing left to build");
    // a thatch hut: foundation, three walls, a doorframe with its door, a roof
    await f.shot("fernwild-build-hut");
    // looking at the hut: its name and health under the crosshair
    await f.waitFor((p) => p.aimedStructureHealth > 0, { timeoutMs: 3000 });
    // E opens the door
    await f.hold("KeyE", { until: (p) => p.doorsOpen === 1, ms: 80, timeoutMs: 3000 });
    await f.wait(300);
    // the door swung open on its hinge
    await f.shot("fernwild-build-door-open");
  },
});
