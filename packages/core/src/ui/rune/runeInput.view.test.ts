import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

test("destroying Rune input restores browser focus before a DOM fallback or remount", () => {
  const source = `
    import { Window } from "happy-dom";
    import { RuneInput } from ${JSON.stringify(new URL("./runeInput.view.ts", import.meta.url).href)};
    const win = new Window();
    Object.assign(globalThis, { window:win, document:win.document, Document:win.Document, Element:win.Element,
      HTMLElement:win.HTMLElement, Event:win.Event, FocusEvent:win.FocusEvent });
    const focus = HTMLElement.prototype.focus, blur = HTMLElement.prototype.blur;
    const active = Object.getOwnPropertyDescriptor(Document.prototype, "activeElement");
    const layer=document.createElement("div"), field=document.createElement("input");
    layer.setAttribute("data-jg-rune-layer", ""); layer.append(field); document.body.append(layer);
    const input=new RuneInput(()=>[]);
    input.focus(field);
    if(input.focusedElement!==field) throw new Error("Rune focus was not established");
    input.destroy();
    if(input.focusedElement!==null) throw new Error("destroy left simulated focus on the old field");
    if(HTMLElement.prototype.focus!==focus || HTMLElement.prototype.blur!==blur || Object.getOwnPropertyDescriptor(Document.prototype,"activeElement")?.get!==active?.get) throw new Error("destroy did not restore browser focus methods");
    const next=new RuneInput(()=>[]);
    if(HTMLElement.prototype.focus===focus) throw new Error("remounted input still uses the destroyed owner");
    next.focus(field);
    next.destroy(); await win.happyDOM.close();
  `;
  const result = spawnSync(process.execPath, ["--eval", source], { encoding: "utf8", windowsHide: true, timeout: 10_000 });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
});

test("wheel handlers receive Rune hit-tested input and can cancel native scrolling", () => {
  const source = `
    import { Window } from "happy-dom";
    import { RuneInput } from ${JSON.stringify(new URL("./runeInput.view.ts", import.meta.url).href)};
    import { idOf } from ${JSON.stringify(new URL("./cssMirror.view.ts", import.meta.url).href)};
    import { setRuneRect } from ${JSON.stringify(new URL("./domMeasure.view.ts", import.meta.url).href)};
    const win = new Window();
    // Happy DOM's WheelEvent extends UIEvent, so provide the browser's MouseEvent fields too.
    class Wheel extends win.MouseEvent {
      constructor(type, init) { super(type, init); Object.assign(this, { deltaX: init.deltaX ?? 0, deltaY: init.deltaY ?? 0, deltaZ: init.deltaZ ?? 0, deltaMode: init.deltaMode ?? 0 }); }
    }
    Object.assign(globalThis, { window: win, document: win.document, Document: win.Document, Element: win.Element,
      HTMLElement: win.HTMLElement, Event: win.Event, MouseEvent: win.MouseEvent, WheelEvent: Wheel });
    const layer = win.document.createElement("div");
    layer.setAttribute("data-jg-rune-layer", "");
    const target = win.document.createElement("div");
    layer.append(target); win.document.body.append(layer);
    const rect = [20, 30, 100, 100];
    setRuneRect(target, rect, rect);
    const input = new RuneInput(() => [{ k: "x", id: idOf(target), hit: 1 }]);
    const received = [];
    let cancel = true;
    target.addEventListener("wheel", event => { received.push([event.deltaX, event.deltaY, event.target === target]); if(cancel) event.preventDefault(); });
    const send = x => { const event = new Wheel("wheel", { clientX: x, clientY: 50, deltaX: 10, deltaY: 180, bubbles: true, cancelable: true }); win.document.body.dispatchEvent(event); return event.defaultPrevented; };
    if (!send(50)) throw new Error("the UI handler did not cancel native scrolling");
    if (JSON.stringify(received) !== "[[10,180,true]]") throw new Error("wheel did not reach its drawn target: " + JSON.stringify(received));
    cancel = false;
    if (send(50)) throw new Error("uncancelled wheel did not reach native scrolling");
    if (send(500) || received.length !== 2) throw new Error("wheel outside the UI was captured");
    input.destroy(); await win.happyDOM.close();
  `;
  const result = spawnSync(process.execPath, ["--eval", source], { encoding: "utf8", windowsHide: true, timeout: 10_000 });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
});
