import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.expect((p) => p.inDive === 0, "standing in Marrow");
    await f.command("deepward.dev.seed", {"stash":["cells","wire","polymer"],"known":["cutter","lure"],"charted":["cold"]});
    await f.command("deepward.dev.stand", {"x":-5.2,"z":15.1});
    await f.press("KeyE");
    await f.see(/Marrow's fabricator/, { timeoutMs: 8000 });
    await f.click("Print Plasma cutter");
    await f.click("Print Blood lure");
    await f.click("Back to Marrow");
    await f.expect((p) => p.lures === 1 && p.gear === 1, "__jgProbe().lures === 1 && __jgProbe().gear === 1");
    await f.command("deepward.dev.stand", {"x":0,"z":9.2});
    await f.press("KeyE");
    await f.waitFor((p) => p.inDive === 1, { timeoutMs: 15000 });
    await f.command("deepward.dev.stand", {"x":-1.2,"z":-41.6});
    // down to the cold stores
    await f.press("KeyE");
    await f.waitFor((p) => p.stratum === 2, { timeoutMs: 8000 });
    await f.press("KeyF");
    await f.waitFor((p) => p.lamp === 1, { timeoutMs: 4000 });
    // off the landing
    await f.hold("KeyS", { ms: 1500 });
    await f.command("deepward.dev.stand", {"x":7.4,"z":0.2});
    // cut the cable: loud
    await f.press("KeyE");
    await f.wait(3000);
    await f.command("deepward.dev.stand", {"x":0.5,"z":-11});
    // the courier comes for the lamp
    await f.waitFor((p) => p.hunting >= 1, { timeoutMs: 20000 });
    await f.wait(1200);
    // blood lure
    await f.press("KeyG");
    await f.waitFor((p) => p.luresOut === 1, { timeoutMs: 4000 });
    // go dark
    await f.press("KeyF");
    await f.waitFor((p) => p.lamp === 0, { timeoutMs: 4000 });
    // it eats the lure
    await f.waitFor((p) => p.luresOut === 0, { timeoutMs: 30000 });
    await f.wait(1500);
  },
});
