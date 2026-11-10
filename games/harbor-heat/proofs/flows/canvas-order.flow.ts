import { defineFlow } from "@jgengine/core/play/flow";
import { decodePng } from "@jgengine/assets/imageCodec";
import { readFileSync } from "node:fs";
import { game } from "../../src/game.config";

function redPixels(name: string, viewport: number, x: number, y: number): { covered: boolean; colors: string[] } {
  const image = decodePng(readFileSync(new URL(`../../../../shots/harbor-heat/${name}.png`, import.meta.url)));
  const scale = image.width / viewport;
  let covered = true;
  const colors = new Set<string>();
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const at = (Math.round(y * scale + dy) * image.width + Math.round(x * scale + dx)) * 4;
    colors.add(`${image.data[at]},${image.data[at + 1]},${image.data[at + 2]}`);
    // The photograph's translucent ruler remains above its preview.
    covered &&= (image.data[at] ?? 0) > 180 && (image.data[at + 1] ?? 255) < 10 && (image.data[at + 2] ?? 255) < 10;
  }
  return { covered, colors: [...colors] };
}

export default defineFlow(game, {
  browser: true,
  state: "title",
  async run(f) {
    await f.click("Hit the street");
    await f.waitForPage("window.__jgRuneStage?.unavailable === false && window.__jgRuneStage.canvasFeeds.get(document.querySelector('.hh-licence-photo canvas'))?.received === true");
    try {
      await f.page(`(() => {
        const source = document.querySelector('.hh-licence-photo canvas');
        const cover = document.createElement('div');
        cover.dataset.runeCanvasCover = '';
        cover.style.cssText = 'position:absolute;inset:0;z-index:100;background:rgb(255,0,0)';
        source.parentElement.append(cover);
        window.__canvasOrderProbe = { source, parent:source.parentElement, next:source.nextSibling, cover };
      })()`);
      await f.waitForPage("document.querySelector('[data-rune-canvas-cover]').getBoundingClientRect().width > 100");
      await f.wait(700);
      const bounds = await f.page("(() => { const rect = document.querySelector('[data-rune-canvas-cover]').getBoundingClientRect(); return [innerWidth, rect.x + rect.width / 2, rect.y + rect.height / 2]; })()");
      if (!Array.isArray(bounds) || bounds.length !== 3 || !bounds.every((value): value is number => typeof value === "number" && Number.isFinite(value))) throw new Error("canvas cover has no measured bounds");
      const [viewport = 0, x = 0, y = 0] = bounds;
      const name = `canvas-order-${viewport}`;
      await f.shot(name);
      const cover = redPixels(name, viewport, x, y);
      await f.expectPage(String(cover.covered), `Rune paints a UI control over a changing canvas (${cover.colors.join("; ")})`);
      await f.page(`(() => {
        const probe = window.__canvasOrderProbe;
        document.activeElement?.blur();
        probe.cover.remove();
        probe.source.remove();
        const canvas = document.createElement('canvas');
        canvas.width = 16; canvas.height = 16;
        canvas.style.cssText = 'position:absolute;left:0;top:0';
        const context = canvas.getContext('2d'); context.fillStyle = 'red'; context.fillRect(0,0,16,16);
        probe.static = canvas;
        probe.parent.append(canvas);
      })()`);
      await f.waitForPage("window.__jgRuneStage.canvasFeeds.size === 1 && window.__jgRuneStage.canvasFeeds.get(window.__canvasOrderProbe.static)?.received === true");
      await f.expectPage("window.__canvasOrderProbe.static.offsetWidth === 16 && window.__canvasOrderProbe.static.offsetHeight === 16", "a canvas keeps its intrinsic dimensions");
      await f.wait(1000);
      const staticBounds = await f.page("(() => { const rect = window.__canvasOrderProbe.static.getBoundingClientRect(); return [innerWidth, rect.x + rect.width / 2, rect.y + rect.height / 2]; })()");
      if (!Array.isArray(staticBounds) || !staticBounds.every((value): value is number => typeof value === "number" && Number.isFinite(value))) throw new Error("static canvas has no measured bounds");
      const staticName = `canvas-static-${viewport}`;
      await f.shot(staticName);
      const painted = redPixels(staticName, staticBounds[0] ?? 0, staticBounds[1] ?? 0, staticBounds[2] ?? 0);
      await f.expectPage(String(painted.covered), "Rune presents a canvas drawn once before capture starts");
      await f.page("window.__canvasOrderProbe.static.getContext('2d').fillRect(0,0,16,16)");
      await f.waitForPage("window.__jgRuneStage.canvasFeeds.get(window.__canvasOrderProbe.static)?.streamed === true");
      await f.wait(1000);
      await f.expectPage(`(async () => {
        const prior = window.__jgUiFrame;
        let changed = false;
        window.__jgUiFrame = payload => { changed = true; prior(payload); };
        try { await new Promise(resolve => setTimeout(resolve, 400)); return !changed; }
        finally { window.__jgUiFrame = prior; }
      })()`, "a static canvas requests no extra Rune frame");
    } catch (error) {
      console.log(JSON.stringify(await f.page("({feeds:[...window.__jgRuneStage.canvasFeeds].map(([source,feed])=>({connected:source.isConnected,size:[source.width,source.height],received:feed.received})),staticConnected:window.__canvasOrderProbe?.static?.isConnected,staticRect:window.__canvasOrderProbe?.static?.getBoundingClientRect().toJSON()})")));
      throw error;
    } finally {
      await f.page(`(() => { const probe = window.__canvasOrderProbe; if (probe == null) return; probe.cover.remove(); probe.static?.remove(); if (probe.source.parentElement === null) probe.parent.insertBefore(probe.source, probe.next?.parentElement === probe.parent ? probe.next : null); delete window.__canvasOrderProbe; })()`);
    }
    if (await f.page("document.querySelector('.hh-title.compact') !== null")) await f.click("Back to the sign");
    await f.click("Credits");
    await f.waitForPage("window.__jgRuneStage.canvasFeeds.size === 0");
    if (await f.page("document.querySelector('.hh-title.compact') !== null")) await f.click("Back to the sign");
    await f.click("Hit the street");
    await f.waitForPage("window.__jgRuneStage.canvasFeeds.get(document.querySelector('.hh-licence-photo canvas'))?.received === true && document.querySelector('[data-jg-rune-islands]') === null");
    await f.wait(700);
    await f.shot(`canvas-restored-${String(await f.page("innerWidth"))}`);
  },
});
