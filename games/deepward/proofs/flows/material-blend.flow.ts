import { defineFlow } from "@jgengine/core/play/flow";
import { decodePng } from "@jgengine/assets/imageCodec";
import { readFileSync } from "node:fs";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  browser: true,
  state: "title",
  async run(f) {
    await f.waitForPage("window.__jgRuneStage?.unavailable === false && window.__jgRuneStage.ui?.rects.size > 0");
    try {
      await f.page(`(() => {
        const layer = document.querySelector('[data-jg-rune-layer]');
        for (const mode of ['mix', 'background']) {
          const probe = document.createElement('div'); probe.dataset.materialProbe = mode;
          probe.style.cssText = 'position:fixed;z-index:999;bottom:16px;width:64px;height:32px;background:rgb(128,192,64);right:' + (mode === 'mix' ? 16 : 96) + 'px';
          if (mode === 'mix') {
            const top = document.createElement('div');
            top.style.cssText = 'position:absolute;inset:0;background:blue;mix-blend-mode:multiply';
            probe.append(top);
          } else {
            probe.style.backgroundImage = 'linear-gradient(blue,blue)';
            probe.style.backgroundBlendMode = 'multiply';
          }
          layer.append(probe);
        }
      })()`);
      await f.waitForPage("[...document.querySelectorAll('[data-material-probe]')].every(element => element.getBoundingClientRect().width === 64)");
      await f.wait(400);
      const width = Number(await f.page("innerWidth"));
      const name = `material-blend-${width}`;
      await f.shot(name);
      const png = decodePng(readFileSync(new URL(`../../../../shots/deepward/${name}.png`, import.meta.url)));
      const bounds = await f.page("[...document.querySelectorAll('[data-material-probe]')].map(element => { const rect=element.getBoundingClientRect(); return [rect.x+rect.width/2,rect.y+rect.height/2]; })");
      if (!Array.isArray(bounds) || bounds.length !== 2) throw new Error("material probes have no bounds");
      for (let i = 0; i < bounds.length; i++) {
        const at = bounds[i];
        if (!Array.isArray(at) || typeof at[0] !== "number" || typeof at[1] !== "number") throw new Error("material probe bounds are invalid");
        const scale = png.width / width;
        const index = (Math.round(at[1] * scale) * png.width + Math.round(at[0] * scale)) * 4;
        const color: [number, number, number] = [png.data[index] ?? 255, png.data[index + 1] ?? 255, png.data[index + 2] ?? 255];
        await f.expectPage(String(color[0] <= 2 && color[1] <= 2 && Math.abs(color[2] - 64) <= 2), `${i === 0 ? "mix" : "background"} blend reaches the real canvas (${color.join(",")})`);
      }
    } finally {
      await f.page("document.querySelectorAll('[data-material-probe]').forEach(element => element.remove())");
    }
  },
});
