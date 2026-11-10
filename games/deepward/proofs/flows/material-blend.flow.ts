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
        const svg = body => 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4">' + body + '</svg>') + '")';
        for (const mode of ['tiles', 'stack']) {
          const probe = document.createElement('div'); probe.dataset.materialProbe = mode;
          probe.style.cssText = 'position:fixed;z-index:999;bottom:16px;width:32px;height:16px;background:black;right:' + (mode === 'tiles' ? 176 : 224) + 'px';
          const green = svg('<path fill="lime" d="M2 0H4V4H2Z"/>');
          const red = svg('<path fill="red" d="M0 0H4V4H0Z"/>');
          if (mode === 'tiles') {
            probe.style.backgroundImage = svg('<path fill="red" d="M0 0H2V4H0Z"/><path fill="lime" d="M2 0H4V4H2Z"/>');
            probe.style.backgroundSize = '4px 4px';
            probe.style.backgroundPosition = '1px 1px';
            probe.style.backgroundRepeat = 'repeat-x';
          } else {
            probe.style.backgroundImage = 'linear-gradient(to right, blue 0%, blue 50%, transparent 50%, transparent 100%),' + green + ',' + red;
            probe.style.backgroundSize = '8px 100%, auto, auto';
            probe.style.backgroundRepeat = 'no-repeat, repeat, repeat';
          }
          layer.append(probe);
        }
      })()`);
      await f.waitForPage("[...document.querySelectorAll('[data-material-probe]')].every(element => element.getBoundingClientRect().width > 0)");
      await f.waitForPage("window.__jgRuneStage.layers.some(layer => JSON.stringify(layer.root).includes('\"natural\":[4,4]'))");
      await f.wait(400);
      const width = Number(await f.page("innerWidth"));
      const name = `material-blend-${width}`;
      await f.shot(name);
      const png = decodePng(readFileSync(new URL(`../../../../shots/deepward/${name}.png`, import.meta.url)));
      const bounds = await f.page("[...document.querySelectorAll('[data-material-probe=mix],[data-material-probe=background]')].map(element => { const rect=element.getBoundingClientRect(); return [rect.x+rect.width/2,rect.y+rect.height/2]; })");
      if (!Array.isArray(bounds) || bounds.length !== 2) throw new Error("material probes have no bounds");
      for (let i = 0; i < bounds.length; i++) {
        const at = bounds[i];
        if (!Array.isArray(at) || typeof at[0] !== "number" || typeof at[1] !== "number") throw new Error("material probe bounds are invalid");
        const scale = png.width / width;
        const index = (Math.round(at[1] * scale) * png.width + Math.round(at[0] * scale)) * 4;
        const color: [number, number, number] = [png.data[index] ?? 255, png.data[index + 1] ?? 255, png.data[index + 2] ?? 255];
        await f.expectPage(String(color[0] <= 2 && color[1] <= 2 && Math.abs(color[2] - 64) <= 2), `${i === 0 ? "mix" : "background"} blend reaches the real canvas (${color.join(",")})`);
      }
      const imageCases: [string, [number,number,number,number,number][]][] = [
        ["tiles", [[2,2,255,0,0], [4,2,0,255,0], [6,2,255,0,0], [2,8,0,0,0]]],
        ["stack", [[2,2,0,0,255], [5,2,255,0,0], [7,2,0,255,0], [9,2,255,0,0]]],
      ];
      for (const [mode, samples] of imageCases) {
        const origin = await f.page(`(() => { const r=document.querySelector('[data-material-probe=${mode}]').getBoundingClientRect(); return [r.x,r.y]; })()`);
        if (!Array.isArray(origin) || typeof origin[0] !== "number" || typeof origin[1] !== "number") throw new Error("image probe has no bounds");
        const scale = png.width / width;
        for (const [x,y,r,g,b] of samples) {
          const at = (Math.floor((origin[1]+y)*scale)*png.width+Math.floor((origin[0]+x)*scale))*4;
          const got = [png.data[at] ?? -1,png.data[at+1] ?? -1,png.data[at+2] ?? -1];
          await f.expectPage(String(got.every((value,index) => Math.abs(value-([r,g,b][index] ?? -255)) <= 2)), `${mode} at ${x},${y} paints ${r},${g},${b}; got ${got.join(",")}`);
        }
      }
      await f.page("document.querySelector('[data-material-probe=tiles]').setAttribute('data-measure-check','unchanged')");
      await f.waitForPage("document.querySelector('[data-material-probe=tiles]').offsetWidth === 32");
      await f.page("document.querySelector('[data-material-probe=tiles]').style.backgroundColor = 'rgb(1,1,1)'");
      await f.waitForPage("document.querySelector('[data-material-probe=tiles]').offsetWidth === 32", { note: "size remains readable after a paint-only native update" });
      await f.page(`(() => {
        const ui=window.__jgRuneStage.ui;
        const rects=[...ui.rects].map(([id,rect]) => [id,rect[0],rect[1],999,rect[3]]);
        ui.onFrame(JSON.stringify({revision:(ui.revision-1)>>>0,events:[],regions:ui.hitRegions,modal:ui.modal,rects}));
      })()`);
      await f.expectPage("document.querySelector('[data-material-probe=tiles]').offsetWidth === 32", "an older native tree cannot overwrite the current layout");
    } finally {
      await f.page("document.querySelectorAll('[data-material-probe]').forEach(element => element.remove())");
    }
  },
});
