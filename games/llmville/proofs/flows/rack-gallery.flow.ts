import { defineFlow } from "@jgengine/core/play/flow";
import { decodePng } from "@jgengine/assets/imageCodec";
import { readFileSync } from "node:fs";

/** The actual dev gallery: --param preview=racks --param ui=rune --settle 1000 lets the scene mount. */
export default defineFlow(null, {
  browser: true,
  async run(f) {
    await f.see("Rack visual gallery");
    await f.waitForPage("window.__jgRuneStage?.unavailable === false && [...window.__jgRuneStage.canvasFeeds.values()].some(feed => feed.received && feed.streamed)");
    const width = String(await f.page("innerWidth"));
    await f.wait(500);
    await f.shot(`racks-full-${width}`);
    const png = decodePng(readFileSync(new URL(`../../../../shots/llmville/racks-full-${width}.png`, import.meta.url)));
    const at = (Math.floor(png.height * 0.7) * png.width + Math.floor(png.width * 0.5)) * 4;
    await f.expectPage(String((png.data[at + 1] ?? 0) > 30 && (png.data[at + 1] ?? 0) > (png.data[at] ?? 255)), "the captured gallery includes its lit ground, not just its canvas background");
    await f.click("Empty");
    await f.see("bare frame");
    await f.click("None");
    await f.see("no cooler module");
    await f.click("Off");
    await f.wait(500);
    await f.shot(`racks-empty-${width}`);
    await f.click("Half");
    await f.see("half GPUs");
    await f.click("Installed");
    await f.click("Training");
    await f.wait(500);
    await f.shot(`racks-half-${width}`);
    await f.click("Labels");
    await f.waitForPage("document.querySelector('input[type=checkbox]').checked === false && !document.body.textContent.includes('half GPUs')");
    await f.expectPage("document.querySelector('input[type=checkbox]').checked === false && !document.body.textContent.includes('half GPUs')", "labels can be removed from the captured scene");
    await f.shot(`racks-no-labels-${width}`);
    await f.click("HUD");
    await f.waitForPage("window.__jgRuneStage.canvasFeeds.size === 0");
    await f.click("Racks");
    await f.waitForPage("[...window.__jgRuneStage.canvasFeeds.values()].some(feed => feed.received && feed.streamed)");
    await f.see("full GPUs");
    await f.shot(`racks-restored-${width}`);
  },
});
