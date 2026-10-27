import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.waitFor((p) => p.members === 4, { timeoutMs: 40000 });
    await f.expect((p) => p.members === 4 && p.term === 0, "arrival: a fresh household of four is live in the charter's first term");
    await f.waitFor((p) => p.incident === 1, { timeoutMs: 240000 });
    await f.expectPage("__jgProbe().incident === 1 && /incoming transmission/i.test(document.body.innerText)", "arrival: the storyteller sent a transmission that waits on an answer, and its slip is on screen");
    // taking the default answer clears the slip; a click alone proves nothing, so the after waits on the household state
    await f.click("default");
    await f.waitFor((p) => p.incident === 0, { timeoutMs: 10000 });
    await f.expectPage("__jgProbe().incident === 0 && !/incoming transmission/i.test(document.body.innerText)", "arrival: the transmission is resolved and its slip is gone");
  },
});
