import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

test("layout measurements and resize notifications exclude painted transforms", () => {
  const source = `
    import { Window } from "happy-dom";
    import { installRuneMeasure, setRuneRect } from ${JSON.stringify(new URL("./domMeasure.view.ts", import.meta.url).href)};
    const win = new Window();
    let frame;
    Object.assign(globalThis, {
      Element: win.Element, HTMLElement: win.HTMLElement, DOMRect: win.DOMRect,
      ResizeObserver: win.ResizeObserver,
      requestAnimationFrame: callback => { frame = callback; return 1; },
    });
    const layer = win.document.createElement("div");
    layer.setAttribute("data-jg-rune-layer", "");
    const panel = win.document.createElement("div");
    layer.append(panel); win.document.body.append(layer);
    installRuneMeasure();
    const widths = [];
    const observer = new ResizeObserver(entries => widths.push(entries[0].borderBoxSize[0].inlineSize));
    observer.observe(panel);
    const flush = () => { const callback = frame; frame = undefined; callback?.(0); };
    const check = (value, expected) => { if (value !== expected) throw new Error(value + " !== " + expected); };
    setRuneRect(panel, [10, 20, 100, 50], [5, 10, 200, 100]);
    flush();
    check(panel.getBoundingClientRect().width, 100);
    check(panel.offsetWidth, 200); check(panel.offsetHeight, 100); check(widths[0], 200);
    setRuneRect(panel, [15, 30, 80, 40], [5, 10, 200, 100]);
    flush(); check(widths.length, 1);
    setRuneRect(panel, [15, 30, 120, 60], [5, 10, 240, 120]);
    flush(); check(widths.length, 2); check(widths[1], 240); check(panel.offsetWidth, 240);
    observer.disconnect(); await win.happyDOM.close();
  `;
  const result = spawnSync(process.execPath, ["--eval", source], { encoding: "utf8", windowsHide: true, timeout: 10_000 });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
});
