import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/**
 * A real district trip in the browser: open a day on Main Street, hold it for three stars, pick
 * Downtown Grid on the season map and clock in there. The trip saves the career, switches the scene
 * set (the game rebuilds in place, no page reload) and the next day opens on Downtown with the same
 * career; then the page is reloaded and Continue resumes that day on Downtown again.
 */
export default defineFlow(game, {
  browser: true,
  state: "title",
  async run(f) {
    const settle = () => f.wait(5000);
    await f.waitForPage("(window.__jgNativeUi?.stats().frames ?? 0) > 0", { timeoutMs: 60000, note: "native Rune submitted a frame" });
    await f.see(/new day/i, { timeoutMs: 40000 });
    await f.expect((p) => p.map === 0, "the title stands on Main Street, the season's first district");
    await settle();
    await f.click("New Day");
    await f.see(/time card/i);
    await settle();
    await f.click("Open Maple Street");
    await f.see(/open for business/i, { timeoutMs: 30000 });

    await f.command("run.stage", { mode: "held" });
    await f.see(/the street held/i, { timeoutMs: 30000, note: "the day is held at full attention" });
    await f.see(/clock in at downtown grid/i, { timeoutMs: 10000, note: "three stars on Main Street open Downtown, and the season map points the next day there" });
    await settle();
    await f.shot("trip-before");
    await f.click("Clock in at Downtown Grid");
    await f.waitFor((p) => p.map === 1 && p.ended === 0, { timeoutMs: 120_000, note: "the game rebuilt on Downtown Grid and the next day is open" });
    await f.see(/open for business/i, { timeoutMs: 60000, note: "the new district's day offers its first wave" });
    await f.expect((p) => p.districts === 1 && p.dues > 0, "the same career came along: Main Street held, its dues in the hall");
    await f.expectPage("JSON.parse(localStorage.getItem('game-save:beacon-bastion:keep') ?? '{}').value?.systems?.campaign?.districts?.['main-street'] === 3", "the career was saved with Main Street's three stars before the trip");
    await settle();
    await f.shot("trip-after");

    // Start the wave so the checkpoint keeps this Downtown day, then reload and Continue.
    await f.command("buildTower1");
    await f.command("tower.build", { point: [-7, 0, 1] });
    await f.waitFor((p) => p.towers >= 1, { timeoutMs: 20000, note: "a barista clocks in on Downtown's corner" });
    await f.click("Open for business");
    await f.waitForPage("(() => { const doc = JSON.parse(localStorage.getItem('game-save:beacon-bastion:keep') ?? '{}').value?.systems; return doc?.defense?.map === 'downtown' && Object.keys(doc?.world?.instances ?? {}).length >= 1; })()", { timeoutMs: 60000, note: "the playing checkpoint wrote the Downtown day with its barista" });
    await f.reload();
    await f.see(/continue/i, { timeoutMs: 60000, note: "the reloaded page is back on the title" });
    await f.click("Continue");
    await f.waitFor((p) => p.map === 1 && p.towers >= 1, { timeoutMs: 120_000, note: "Continue resumes the kept day on Downtown with its barista" });
    await settle();
    await f.shot("trip-resumed");
  },
});
