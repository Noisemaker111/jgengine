import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

test("changed Rune content cannot report its previous layout as the replacement's size", () => {
  const source = `
    import { Window } from "happy-dom";
    import { installRuneMeasure, setRuneRect, setRuneScroll, invalidateRuneLayout } from ${JSON.stringify(new URL("./domMeasure.view.ts", import.meta.url).href)};
    const win = new Window(); let frame;
    Object.assign(globalThis, { Element: win.Element, HTMLElement: win.HTMLElement, DOMRect: win.DOMRect, Event: win.Event, ResizeObserver: win.ResizeObserver, requestAnimationFrame: callback => { frame=callback; return 1; } });
    const layer=win.document.createElement('div'); layer.setAttribute('data-jg-rune-layer','');
    const panel=win.document.createElement('div'); panel.append(win.document.createElement('div')); layer.append(panel); win.document.body.append(layer);
    const mutations=new win.MutationObserver(()=>{}); mutations.observe(layer,{subtree:true,childList:true,attributes:true,characterData:true});
    installRuneMeasure({scroll(){},flushLayoutChanges(){for(const record of mutations.takeRecords()) invalidateRuneLayout(record.target instanceof win.Element ? record.target : record.target.parentElement);}});
    const flush=()=>{const callback=frame;frame=undefined;callback?.(0);};
    const check=(value,expected)=>{if(value!==expected)throw new Error(value+' !== '+expected);};
    setRuneRect(panel,[0,0,200,150],[0,0,200,150]);
    check(panel.offsetWidth,200);
    panel.replaceChildren(win.document.createElement('button'));
    check(panel.offsetWidth,0);
    check(panel.getBoundingClientRect().width,200);
    const sizes=[]; const observer=new ResizeObserver(entries=>sizes.push(entries[0].borderBoxSize[0].inlineSize)); observer.observe(panel);
    flush();check(sizes.length,0);
    setRuneRect(panel,[0,0,104,26],[0,0,104,26]);flush();
    check(panel.offsetWidth,104);check(sizes[0],104);
    setRuneScroll(panel,[0,0,104,26,300,500]);panel.style.backgroundColor='red';
    check(panel.scrollHeight,0);
    setRuneRect(panel,[0,0,104,26],[0,0,104,26]);flush();check(panel.scrollHeight,500);
    observer.disconnect();mutations.disconnect();await win.happyDOM.close();
  `;
  const result = spawnSync(process.execPath, ["--eval", source], { encoding: "utf8", windowsHide: true, timeout: 10_000 });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
});

test("native layout, resize and scroll APIs preserve their browser contracts", () => {
  const source = `
    import { Window } from "happy-dom";
    import { installRuneMeasure, setRuneRect, setRuneScroll } from ${JSON.stringify(new URL("./domMeasure.view.ts", import.meta.url).href)};
    const win = new Window();
    let frame;
    Object.assign(globalThis, {
      Element: win.Element, HTMLElement: win.HTMLElement, DOMRect: win.DOMRect, Event: win.Event,
      ResizeObserver: win.ResizeObserver,
      requestAnimationFrame: callback => { frame = callback; return 1; },
    });
    const layer = win.document.createElement("div");
    layer.setAttribute("data-jg-rune-layer", "");
    const panel = win.document.createElement("div");
    layer.append(panel); win.document.body.append(layer);
    const requests = [];
    installRuneMeasure({ scroll: (element, x, y, smooth) => requests.push([x, y, smooth]) });
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
    setRuneScroll(panel, [0, 0, 200, 100, 400, 400]);
    check(panel.scrollWidth, 400); check(panel.scrollHeight, 400); check(panel.clientHeight, 100);
    panel.scrollTop = 999;
    check(panel.scrollTop, 300); check(JSON.stringify(requests.at(-1)), "[0,300,false]");
    panel.scrollBy({ top: -50, left: 30, behavior: "instant" });
    check(panel.scrollTop, 250); check(panel.scrollLeft, 30);
    setRuneScroll(panel, [0, 0, 200, 100, 400, 400]);
    setRuneRect(panel, [0, 0, 200, 100], [0, 0, 200, 100]);
    const child = win.document.createElement("button"); panel.append(child);
    setRuneRect(child, [250, 250, 20, 20], [250, 250, 20, 20]);
    child.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    await Promise.resolve();
    check(JSON.stringify(requests.at(-1)), "[160,170,true]");
    observer.disconnect(); await win.happyDOM.close();
  `;
  const result = spawnSync(process.execPath, ["--eval", source], { encoding: "utf8", windowsHide: true, timeout: 10_000 });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
});
