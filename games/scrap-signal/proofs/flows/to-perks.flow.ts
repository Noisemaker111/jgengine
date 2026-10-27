import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.expectPage("(() => { const pick = [...document.querySelectorAll('button')].find((el) => /^gunk/i.test(el.innerText.trim())); pick?.click(); return true; })()", "start the run: a fresh profile opens on character select (pick Gunk); a resumed one is already in the field");
    // the chassis is standing in Rustflat Waste
    await f.waitForPage("window.__jgengineAgent?.handle({ method: 'player_pose' }).ok === true", { timeoutMs: 60000 });
    await f.waitForPage("window.__jgengineAgent.handle({ method: 'player_pose' }).ok === true");
    // capture the pointer; the first shot also tells the dev capture where the crosshair points
    await f.clickAt(800, 450);
    await f.expectPage("(() => { window.__jgengineAgent.handle({ method: 'run_command', name: 'perks.capture', input: { legendary: 'Chatterbox', husks: 0 } }); return true; })()", "dev-only capture: a Chatterbox (red-text Won't Shut Up: kills stack +10% damage, 5 high) goes into the held slot");
    // arrival: the pickup scan shows the signature perk, its flavor line and the boss that drops it
    await f.waitForPage("/Won't Shut Up/i.test(document.querySelector('.ss-scan')?.innerText ?? '')");
    await f.shot("perk-card");
    // one more aimed shot, so the husks stand down the live crosshair
    await f.clickAt(800, 450);
    await f.expectPage("(() => { window.__jgengineAgent.handle({ method: 'run_command', name: 'perks.capture', input: { legendary: 'Chatterbox', husks: 3 } }); return true; })()", "three husks walk in down the line of fire, staggered");
    // hold the trigger until two kills have stacked the perk: the buff stamp under the magazine reads CHATTER x2
    const stacked = "/CHATTER x[2-5]/i.test(document.querySelector('.ss-perk-buffs')?.innerText ?? '')";
    for (let second = 0; second < 15 && (await f.page(stacked)) !== true; second += 1) await f.hold("mouse0", { ms: 1000 });
    await f.expectPage(stacked, "arrival: two kills stacked the perk within 15 s of holding the trigger");
    await f.shot("perk-proc");
  },
});
