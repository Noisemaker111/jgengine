import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";
import { lotScreen } from "./lotScreen";

/**
 * A new park from second 0, by mouse and keyboard only: an empty lot with the gate shut, a path in
 * from the gate, a carousel beside it, "Connect it" for its entrance and exit, then the gate opens
 * and the first guests walk in, ride and pay.
 */
export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.see(/gate shut/i, { timeoutMs: 30000, note: "arrival: a new park opens on the empty lot with its gate shut" });
    await f.expect((p) => p.guests === 0, "arrival: nobody is inside before the player builds and opens the gate");
    await f.expectPage("document.querySelector('[data-hint=gate]')?.disabled === true", "arrival: the gate will not open with no ride running");

    // The path tool, then four cells north from the gate plaza.
    await f.press("Digit6");
    for (const z of [44, 40, 36, 32]) {
      const at = await lotScreen(f, 0, z);
      await f.clickAt(at.x, at.y);
    }
    await f.see("Path built", { timeoutMs: 5000, note: "arrival: a path runs in from the gate, the park's own notice confirming it" });

    // The carousel, beside the new path.
    await f.press("Digit1");
    const plot = await lotScreen(f, 4, 36);
    await f.clickAt(plot.x, plot.y);
    await f.see("Carousel built", { timeoutMs: 5000, note: "arrival: the first ride stands on the lot" });

    // Click the ride to inspect it: shut until it has an entrance and an exit; "Connect it" lays them.
    await f.press("KeyX");
    const ride = await lotScreen(f, 6, 38);
    // The ride's model streams in after the build; click again until it is there to be clicked.
    for (let tries = 0; tries < 8; tries += 1) {
      await f.clickAt(ride.x, ride.y);
      if ((await f.page("document.querySelector('.bw-side')?.innerText.includes('Connect it') === true")) === true) break;
      await f.wait(1000);
    }
    await f.waitForPage("document.querySelector('.bw-side')?.innerText.includes('Connect it') === true", { timeoutMs: 5000 });
    await f.expectPage("document.querySelector('.bw-side')?.innerText.includes('Needs an entrance') === true", "arrival: a new ride is shut until it has an entrance and an exit, and says so");
    await f.click("Connect it");
    await f.see("Connected", { timeoutMs: 5000, note: "arrival: Connect it laid the entrance and the exit, so the ride opens" });
    await f.shot("brightway-first-ride");

    await f.click("Open the gate");
    await f.see(/gate is open/i, { timeoutMs: 5000, note: "arrival: the player opened the gate" });
    await f.timeScale(4);
    await f.waitFor((p) => p.guests > 0, { timeoutMs: 30000, note: "arrival: the first guests walk in through the gate" });
    await f.waitFor((p) => p.riding > 0 || p.queued > 0, { timeoutMs: 40000, note: "arrival: a guest lines up for or rides the carousel" });
    await f.timeScale(1);
    await f.shot("brightway-first-guests");
    // Put the ride window away, then open the park books.
    await f.press("KeyX");
    await f.press("KeyL");
    await f.expectPage("(() => { const m = /Today.{0,2}s sales\\s*\\$([\\d,]+)/.exec(document.body.innerText); return m === null ? -1 : Number(m[1].replace(/,/g, '')); })() > 0", "economy: guests paid at the gate, the same ledger the books read");
    await f.expectPage("(() => { const m = /Gate tickets\\s*\\$([\\d,]+)/.exec(document.querySelector('.bw-side')?.innerText ?? ''); return m === null ? -1 : Number(m[1].replace(/,/g, '')); })() > 0", "books: the month's report counts gate tickets on their own line");
    await f.click("Leaflets in town");
    await f.waitForPage("document.querySelector('.bw-side')?.innerText.includes('left') === true", { timeoutMs: 5000 });
    await f.expectPage("(() => { const m = /Marketing\\s*−\\$([\\d,]+)/.exec(document.querySelector('.bw-side')?.innerText ?? ''); return m === null ? -1 : Number(m[1].replace(/,/g, '')); })() > 0", "marketing: a campaign is paid up front, shows on the books and counts down its days");
    await f.shot("brightway-books");
  },
});
