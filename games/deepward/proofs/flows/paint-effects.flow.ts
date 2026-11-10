import { defineFlow } from "@jgengine/core/play/flow";
import { decodePng } from "@jgengine/assets/imageCodec";
import { readFileSync } from "node:fs";
import { game } from "../../src/game.config";

function installPaintProbes(): void {
  const root = document.createElement("div");
  root.dataset["paintProof"] = "";
  root.style.cssText = "position:fixed;inset:0;z-index:2147480000;background:#202020;color:white;font:14px/20px 'Share Tech Mono',monospace;text-shadow:none;isolation:isolate";
  const tile = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#80c040"/><rect width="8" height="8" fill="#c08040"/><rect x="8" y="8" width="8" height="8" fill="#c08040"/></svg>');
  const image = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="80"><rect width="128" height="80" fill="#e0b040"/></svg>');
  const probes = [
    ["Diagonal mask", "background:#f06030;mask-image:linear-gradient(110deg,#000 10%,rgba(0,0,0,.2) 70%,transparent)", "<div style='position:absolute;inset:12px;background:#40a0e0'></div>"],
    ["Radial mask", "background:#f06030;mask-image:radial-gradient(ellipse at 35% 55%,#000,transparent 75%)", "<div style='position:absolute;inset:12px;background:#40a0e0'></div>"],
    ["Brightness", "background:#80c040;filter:brightness(.5)", "<div style='position:absolute;inset:16px;background:rgba(64,128,240,.6)'></div>"],
    ["Alpha shadow", "filter:drop-shadow(9px 5px 3px #f04020)", "<div style='position:absolute;left:24px;top:12px;width:48px;height:48px;background:#40a0e0;clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)'></div>"],
    ["Repeating conic", "background:repeating-conic-gradient(from 15deg,#f06030 0deg 30deg,#40a0e0 30deg 60deg)", ""],
    ["Gradient text", "background:linear-gradient(90deg,#f06030,#40a0e0);background-clip:text;-webkit-background-clip:text;color:transparent;font-size:36px;line-height:64px", "RUNE"],
    ["Colored underline", "color:white;font-size:28px;line-height:48px;text-decoration:underline #40e080 5px;text-underline-offset:4px;text-decoration-skip-ink:none", "RUNE"],
    ["Polygon image/text", "clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);color:white;font-size:36px;line-height:80px", `<img alt='' src='${image}' style='position:absolute;inset:0;width:128px;height:80px'/><span style='position:relative'>RUNE</span>`],
    ["Texture blend/order", `background-color:#e0c080;background-image:linear-gradient(90deg,rgba(40,80,240,.5),rgba(240,80,40,.5)),url("${tile}"),linear-gradient(#f0f0f0,#808080);background-size:auto,16px 16px,auto;background-blend-mode:screen,multiply,normal`, ""],
    ["Backdrop blur", "background:repeating-linear-gradient(90deg,#000 0 8px,#fff 8px 16px)", "<div style='position:absolute;inset:12px;backdrop-filter:blur(4px);background:rgba(80,160,240,.2)'></div>"],
    ["Subtree blend", "background:#80c040", "<div style='position:absolute;inset:12px;mix-blend-mode:multiply'><div style='position:absolute;inset:0;background:#4080f0'></div></div>"],
    ["Intersected masks", "background:#40a0e0;border:4px solid #f06030;box-sizing:border-box;mask-image:linear-gradient(110deg,#000,transparent),radial-gradient(ellipse,#000,transparent);mask-composite:intersect", ""],
  ];
  const columns = innerWidth < 600 ? 2 : 5;
  for (const [index, probe] of probes.entries()) {
    const card = document.createElement("div");
    card.style.cssText = `position:absolute;left:${16 + (index % columns) * 176}px;top:${16 + Math.floor(index / columns) * 140}px;width:160px;height:128px;background:#303030`;
    const surface = document.createElement("div");
    surface.dataset["paintSurface"] = String(index);
    surface.dataset["paintName"] = probe[0] ?? "";
    surface.style.cssText = "position:absolute;left:12px;top:8px;width:128px;height:80px;" + (probe[1] ?? "");
    surface.innerHTML = probe[2] ?? "";
    const label = document.createElement("div");
    label.style.cssText = "position:absolute;left:8px;top:100px;font-size:12px;line-height:16px;color:white";
    label.textContent = probe[0] ?? "";
    card.append(surface, label);
    root.append(card);
  }
  (document.querySelector("[data-jg-rune-layer]") ?? document.body).append(root);
}

export default defineFlow(game, {
  browser: true,
  state: "title",
  async run(f) {
    const rune = await f.page("new URLSearchParams(location.search).get('ui') === 'rune'");
    if (rune === true) await f.waitForPage("window.__jgRuneStage?.unavailable === false && window.__jgRuneStage.ui?.rects.size > 0");
    try {
      await f.page(`(${installPaintProbes.toString()})()`);
      await f.waitForPage("[...document.querySelectorAll('[data-paint-surface]')].every(element => element.getBoundingClientRect().width === 128)");
      await f.waitForPage("[...document.querySelectorAll('[data-paint-proof] img')].every(image => image.complete && image.naturalWidth > 0)");
      await f.wait(2000);
      const width = Number(await f.page("innerWidth"));
      const name = `paint-effects-${rune === true ? "rune" : "dom"}-${width}`;
      await f.shot(name);
      await f.expectPage("document.querySelectorAll('[data-paint-surface]').length === 12", "all paint probes are present");
      if (rune === true) {
        const actual = decodePng(readFileSync(new URL(`../../../../shots/deepward/${name}.png`, import.meta.url)));
        const expected = decodePng(readFileSync(new URL(`../../../../shots/deepward/paint-effects-dom-${width}.png`, import.meta.url)));
        if (actual.width !== expected.width || actual.height !== expected.height) throw new Error("DOM reference uses a different viewport");
        const surfaces = await f.page("[...document.querySelectorAll('[data-paint-surface]')].map(element => { const r=element.getBoundingClientRect(); return [element.dataset.paintName,r.x,r.y,r.width,r.height]; })");
        if (!Array.isArray(surfaces) || surfaces.length !== 12) throw new Error("paint surfaces have no bounds");
        for (const surface of surfaces) {
          if (!Array.isArray(surface)) throw new Error("paint surface has invalid bounds");
          const [label,x,y,w,h] = surface;
          if (typeof label !== "string" || typeof x !== "number" || typeof y !== "number" || typeof w !== "number" || typeof h !== "number") throw new Error("paint surface bounds are not numeric");
          const scale = actual.width / width;
          let difference = 0, samples = 0;
          for (let row = Math.round(y*scale); row < Math.round((y+h)*scale); row++) {
            for (let col = Math.round(x*scale); col < Math.round((x+w)*scale); col++) {
              for (let channel = 0; channel < 3; channel++) {
                const at = (row*actual.width+col)*4+channel;
                difference += Math.abs((actual.data[at] ?? 0) - (expected.data[at] ?? 255));
                samples++;
              }
            }
          }
          const error = difference / samples;
          await f.expectPage(String(error < 5), `${label} matches saved DOM pixels (mean channel error ${error.toFixed(3)}/255)`);
        }
      }
    } finally {
      await f.page("document.querySelector('[data-paint-proof]')?.remove()");
    }
  },
});
