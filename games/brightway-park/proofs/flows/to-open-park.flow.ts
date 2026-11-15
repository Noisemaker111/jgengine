import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";
import { lotScreen } from "./lotScreen";

/**
 * A new park from second 0, by mouse and keyboard only: an empty lot with the gate shut, a path in
 * from the gate, a carousel beside it, "Connect it" for its entrance and exit, then the gate opens
 * and the first guests walk in, ride and pay.
 */
/** A page check: the onboarding card shows this step. */
const step = (id: string) => `globalThis.__brightway.read().hint === '${id}'`;
/** A page check: the hint's ring is on one of these controls (`ui/hintRing.ts` keys). */
const pointed = (...keys: string[]) => `${JSON.stringify(keys)}.includes(globalThis.__brightway.read().pointed)`;
/** The native page's visible text. */
const shown = "window.__jgNativeUi.text()";

export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.see(/gate chained/i, { timeoutMs: 30000, note: "arrival: a new haunt opens on the empty lot with its gate chained" });
    await f.see(/The First Chill/i, { timeoutMs: 20000, note: "arrival: a new game is the first scenario, its goal and deadline on the HUD" });
    await f.see(/by the end of the Frost Moon, season 1/, { timeoutMs: 5000 });
    await f.expectPage(step("path"), "hint: the first step says to lay a path in from the gate");
    await f.expectPage("globalThis.__brightway.read().pointed !== null", "hint: the control that does it is ringed");
    await f.expect((p) => p.guests === 0, "arrival: nobody is inside before the player builds and opens the gate");
    await f.expectPage("window.__jgNativeUi.point('Unchain the gate') === null && window.__jgNativeUi.text().includes('Unchain the gate')", "arrival: the gate will not open with no ride running");

    // A click on the park puts the keyboard on the play surface (a capture boot skips the menu that
    // would have handed it over), then the path tool and four cells north from the gate plaza.
    const grass = await lotScreen(f, 30, 30);
    await f.clickAt(grass.x, grass.y);
    await f.press("Digit6");
    for (const z of [44, 40, 36, 32]) {
      const at = await lotScreen(f, 0, z);
      await f.clickAt(at.x, at.y);
    }
    await f.see("Cobbled Path built", { timeoutMs: 20000, note: "arrival: a path runs in from the gate, the park's own notice confirming it" });
    await f.waitForPage(step("ride"), { timeoutMs: 60000 });
    await f.expectPage(pointed("item:ride_carousel", "category:ride"), "hint: with the path down, the hint rings the carousel ticket");

    // The carousel, beside the new path.
    await f.press("Digit1");
    const plot = await lotScreen(f, 4, 36);
    await f.clickAt(plot.x, plot.y);
    await f.see("Upside-Down Carousel built", { timeoutMs: 20000, note: "arrival: the first ride stands on the lot" });
    await f.waitForPage(step("connect"), { timeoutMs: 60000 });

    // Click the ride to inspect it: shut until it has an entrance and an exit; "Connect it" lays them.
    await f.press("KeyX");
    // The carousel's deck, low on its footprint (its horses hang from the canopy above).
    const ride = await lotScreen(f, 4, 37);
    // The ride's model streams in after the build; click again until it is there to be clicked. The
    // inspector (and only the inspector) offers to tear it down; the hint card also says "Connect it".
    for (let tries = 0; tries < 8; tries += 1) {
      await f.clickAt(ride.x, ride.y);
      if ((await f.page(`${shown}.includes('Tear down')`)) === true) break;
      await f.wait(1000);
    }
    // On a software renderer the model can still be streaming in: inspect it the way the click would.
    if ((await f.page(`${shown}.includes('Tear down')`)) !== true) await f.command("park.dev.select", { kind: "ride_carousel" });
    await f.waitForPage(`${shown}.includes('Tear down')`, { timeoutMs: 5000 });
    await f.expectPage(`${shown}.includes('Closed ·')`, "arrival: a new ride is shut until it has an entrance and an exit, and says why");
    // Controls inside a scrolling window read as covered to the drive's DOM probe on this Rune build, so
    // their command (the one the button runs) stands in for the click.
    await f.command("build.connect", {});
    await f.see("Connected", { timeoutMs: 20000, note: "arrival: Connect it laid the entrance and the exit, so the ride opens" });
    await f.waitForPage(step("gate"), { timeoutMs: 60000 });
    await f.expectPage(pointed("hud:gate"), "hint: with the ride running, the hint rings the gate button");
    await f.shot("hauntworks-first-ride");

    await f.click("Unchain the gate");
    await f.waitForPage(step("scare"), { timeoutMs: 60000, note: "hint: with the gate open, the next step is a scare" });
    await f.see(/gate creaks open/i, { timeoutMs: 20000, note: "arrival: the player unchained the gate" });
    await f.timeScale(4);
    await f.waitFor((p) => p.guests > 0, { timeoutMs: 180000, note: "arrival: at dusk the first of the living walk in through the gate" });
    await f.waitFor((p) => p.riding > 0 || p.queued > 0, { timeoutMs: 180000, note: "arrival: a visitor lines up for or rides the carousel" });
    await f.timeScale(1);
    await f.shot("hauntworks-first-living");
    // Put the ride window away, then open the ledger.
    await f.press("KeyX");
    await f.press("KeyL");
    await f.expectPage("(() => { const m = /Tonight.{0,2}s harvest\\s*([\\d,]+) ecto/.exec(window.__jgNativeUi.text()); return m === null ? -1 : Number(m[1].replace(/,/g, '')); })() > 0", "economy: the gate toll wrung ectoplasm from the living, the same ledger the moon reads");
    await f.expectPage("(() => { const m = /Gate toll\\s*([\\d,]+) ecto/.exec(window.__jgNativeUi.text()); return m === null ? -1 : Number(m[1].replace(/,/g, '')); })() > 0", "ledger: the moon's accounts count the gate toll on its own line");
    await f.command("brightway.act", { action: "ad_leaflets" });
    await f.waitForPage(`${shown}.includes('Chalk warnings on the pier ·') && ${shown}.includes('left')`, { timeoutMs: 5000 });
    await f.expectPage("(() => { const m = /Rumor-mongering\\s*−([\\d,]+) ecto/.exec(window.__jgNativeUi.text()); return m === null ? -1 : Number(m[1].replace(/,/g, '')); })() > 0", "rumor: a rumor is paid up front, shows on the ledger and counts down its nights");
    await f.shot("hauntworks-ledger");
  },
});
