import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  state: "overdrive",
  browser: true,
  async run(f) {
    // arrival: the console at the wreck lists the ladder, seven tiers cleared, and tier VIII's brief
    await f.waitForPage("document.body.innerText.toLowerCase().includes('overdrive the wreck')");
    await f.shot("overdrive-console");
    // the console's own start button
    await f.click("Overdrive the wreck");
    // arrival: the run card is live on the rig with its clock, wave and mutators
    await f.waitForPage("document.body.innerText.toLowerCase().includes('wave 1 / 4')");
    // capture the pointer and open fire
    await f.clickAt(800, 450);
    await f.wait(1500);
    // sweep the fire across the arc: 60 degrees left, then 120 right
    const pose = await f.rpc({ method: "player_pose" });
    const facing = typeof pose === "object" && pose !== null && "rotationY" in pose && typeof pose.rotationY === "number" ? pose.rotationY : 0;
    await f.heading(facing + Math.PI / 3);
    await f.clickAt(800, 450);
    await f.wait(1200);
    await f.clickAt(800, 450);
    await f.wait(1500);
    await f.heading(facing - Math.PI / 3);
    await f.clickAt(800, 450);
    await f.wait(1200);
    await f.clickAt(800, 450);
    await f.wait(2000);
    await f.shot("overdrive-fight");
    await f.expectPage("document.body.innerText.toLowerCase().includes('overdrive viii')", "the run card still names the tier: the run is live, not lost");
  },
});
