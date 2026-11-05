import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/**
 * A hard reload in the middle of a defense keeps the defense (#2246): raise a keep through the
 * title menu, build a tower, start wave 1, let the playing checkpoint write, reload the page,
 * and Continue back into the same tower and wave.
 */
export default defineFlow(game, {
  browser: true,
  state: "title",
  async run(f) {
    await f.see(/new defense/i, { timeoutMs: 40000, note: "arrival: the title menu over the keep, not a run already playing" });
    await f.click("New Defense");
    // "Raise The Keep" is also the New Defense plank's hint, so press the commission's own button where it stands
    const raise = await f.page("(() => { const r = document.querySelector('[data-new-keep-start]')?.getBoundingClientRect(); return r ? [r.x + r.width / 2, r.y + r.height / 2] : null; })()");
    if (!Array.isArray(raise) || typeof raise[0] !== "number" || typeof raise[1] !== "number") throw new Error("the commission's Raise button is not on screen");
    await f.clickAt(raise[0], raise[1]);
    await f.see(/begin first assault/i, { timeoutMs: 20000, note: "arrival: the raised keep is playing and the director offers wave 1" });
    await f.command("buildTower1");
    await f.command("tower.build", { point: [-12, 0, -3.2] });
    const built = await f.waitFor((p) => p.towers >= 1, { timeoutMs: 20000, note: "the archer tower rises on the plot" });
    await f.click("Begin first assault");
    await f.see(/\d+ raiders? left/i, { timeoutMs: 20000 });
    await f.waitForPage("localStorage.getItem('game-save:beacon-bastion:keep') !== null && !/unsaved defense/i.test(document.body.innerText)", { timeoutMs: 10000, note: "the playing checkpoint wrote The Keep and the HUD dropped its unsaved sign" });
    // two more checkpoint beats so the save holds the wave already under way
    await f.wait(2500);
    const before = await f.probe();
    await f.report("before reload");
    await f.shot("reload-before");
    await f.reload();
    await f.see(/continue/i, { timeoutMs: 40000, note: "arrival: the reloaded page is back on the title" });
    await f.click("Continue");
    const after = await f.waitFor((p) => p.towers >= 1, { timeoutMs: 20000, note: "the reopened keep stands its tower again" });
    await f.report("after reload");
    // a reloaded page streams the tower model in again; give it a moment so the shot shows what the probe counts
    await f.wait(4000);
    await f.shot("reload-after");
    await f.expect((p) => p.towers === before.towers && p.towers === built.towers, "the reloaded keep has the same towers it had before the reload");
    await f.expect((p) => p.wave === before.wave && p.wave >= 1, "the reloaded keep is on the wave it was fighting, not a fresh wave-1 offer");
    await f.expectPage("!/begin first assault/i.test(document.body.innerText)", "the horn does not offer the first assault again, so the started wave survived");
    if (after.gold <= 0) throw new Error("the reloaded purse is empty");
  },
});
