import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";
export default defineFlow(game, {
  browser: true,
  state: "title",
  async run(f) {
    await f.waitForPage("(window.__jgNativeUi?.stats().frames ?? 0) > 0");
    const nd = (await f.waitForPage("window.__jgNativeUi.point('New dive') ?? false")) as { x: number; y: number };
    await f.touch(nd.x, nd.y);
    await f.see("Another Life.", { timeoutMs: 20000 });
    await f.wait(1500);
    const at = (await f.waitForPage("window.__jgNativeUi.point('Hold / Esc') ?? false")) as { x: number; y: number };
    await f.page(`(window.__dbg = [], ["pointerdown","touchstart","click"].forEach((t) => window.addEventListener(t, (e) => window.__dbg.push(t + " " + (e.target.id || e.target.tagName) + " " + (e.pointerType ?? "")), true)), true)`);
    console.log("at", JSON.stringify(at), "top", await f.page(`(() => { const e = document.elementFromPoint(${at.x}, ${at.y}); return e.tagName + "#" + e.id + "." + e.className; })()`));
    await f.touch(at.x, at.y);
    await f.wait(800);
    console.log("events", JSON.stringify(await f.page("window.__dbg")), "held", await f.page("window.__jgNativeUi.text().includes('DIVE HELD')"));
    await f.clickAt(at.x, at.y);
    await f.wait(800);
    console.log("after mouse click held", await f.page("window.__jgNativeUi.text().includes('DIVE HELD')"));
    await f.shot("debug-phone");
  },
});
