import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/**
 * A hard reload in the middle of a day keeps the day (#2246): open a street through the
 * title menu, hire a worker, start wave 1, let the playing checkpoint write, reload the page,
 * and Continue back into the same worker and wave.
 */
export default defineFlow(game, {
  browser: true,
  state: "title",
  async run(f) {
    await f.see(/new day/i, { timeoutMs: 40000, note: "arrival: the title menu over the street, not a day already playing" });
    await f.click("New Day");
    // The time card covers the title, so its Open is the only one on screen.
    await f.see(/time card/i, { timeoutMs: 10000 });
    await f.click("Open Maple Street");
    await f.see(/open for business/i, { timeoutMs: 20000, note: "arrival: the street is open and the director offers wave 1" });
    await f.command("buildTower1");
    await f.command("tower.build", { point: [0, 0, 4] });
    const built = await f.waitFor((p) => p.towers >= 1, { timeoutMs: 20000, note: "the barista clocks in on the plot" });
    await f.click("Open for business");
    await f.see(/\d+ gadgets? left/i, { timeoutMs: 20000 });
    // A fresh profile checkpoints a new day on its own; a reused one (a street already kept) waits for
    // the first save, so save once through the pause menu's own command, then let the checkpoint carry on.
    await f.command("menu.save");
    // The day is kept on whichever street New Day opened (a reused browser profile may already hold one).
    await f.waitForPage("['keep', 'ward', 'beacon'].some((slot) => Object.keys(JSON.parse(localStorage.getItem('game-save:beacon-bastion:' + slot) ?? '{}').value?.systems?.world?.instances ?? {}).length >= 1)", { timeoutMs: 60000, note: "the playing checkpoint wrote the day with its barista" });
    // two more checkpoint beats so the save holds the wave already under way
    await f.wait(2500);
    const before = await f.probe();
    await f.report("before reload");
    await f.shot("reload-before");
    await f.reload();
    await f.see(/continue/i, { timeoutMs: 40000, note: "arrival: the reloaded page is back on the title" });
    await f.click("Continue");
    const after = await f.waitFor((p) => p.towers >= 1, { timeoutMs: 20000, note: "the reopened street stands its worker again" });
    await f.report("after reload");
    // a reloaded page streams the tower model in again; give it a moment so the shot shows what the probe counts
    await f.wait(4000);
    await f.shot("reload-after");
    await f.expect((p) => p.towers === before.towers && p.towers === built.towers, "the reloaded street has the same workers it had before the reload");
    await f.expect((p) => p.wave === before.wave && p.wave >= 1, "the reloaded street is on the wave it was working, not a fresh wave-1 offer");
    await f.expectPage("!/open for business/i.test(window.__jgNativeUi.text())", "the board does not offer to open the street again, so the started wave survived");
    if (after.gold <= 0) throw new Error("the reloaded till is empty");
  },
});
