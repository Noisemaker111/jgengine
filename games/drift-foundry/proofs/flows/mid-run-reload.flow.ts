import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  state: "title",
  browser: true,
  async run(f) {
    // the pit menu is up
    await f.see("New run", { timeoutMs: 40000 });
    // New run
    await f.hold("Enter", { ms: 200 });
    // the corridor HUD is live
    await f.see("AT RISK", { timeoutMs: 20000 });
    // throttle through the salvage drops, holding E to swap
    await f.hold(["KeyW", "KeyE"], { ms: 8000 });
    // the run advanced past three drops, so the haul is worth keeping
    await f.waitFor((p) => p.z > 50, { timeoutMs: 20000 });
    await f.expectPage("Number(sessionStorage.setItem('haul', document.body.innerText.match(/(\\d+) cr AT RISK/)?.[1] ?? '0') ?? sessionStorage.getItem('haul')) > 0", "record the haul the HUD shows before the reload, and that it is nonzero");
    await f.reload();
    // the pit offers the run the game kept: a checkpoint with parts, not an empty pit
    await f.see(/(\d+) parts/, { timeoutMs: 40000 });
    // Continue run
    await f.hold("Enter", { ms: 200 });
    // the corridor HUD is live again
    await f.see("AT RISK", { timeoutMs: 20000 });
    await f.expectPage("document.body.innerText.match(/(\\d+) cr AT RISK/)?.[1] === sessionStorage.getItem('haul')", "the haul after the reload is the haul before it");
    await f.expect((p) => p.z > 40, "and the route came back, not the start line");
  },
});
