import { defineFlow, type BrowserFlow } from "@jgengine/core/play/flow";
import type { ProbeReadings } from "@jgengine/core/game/playableGame";
import { game } from "../../src/game.config";

/**
 * Every Deepward Rune screen, reached the way a player reaches it: settings categories, a slider,
 * toggle and key rebind; title, pause/resume, save/load and credits; stash, fabricator, the cache's
 * move/rotate/drag/drop; the save-failure and reprint boundaries. Keyboard, mouse and a simulated
 * pad drive it everywhere; a phone run (`--device mobile`) presses and drags by finger instead.
 */
type F = BrowserFlow<ProbeReadings>;
type Point = { x: number; y: number };
const text = "window.__jgNativeUi.text()";
const shows = (words: string): string => `${text}.includes(${JSON.stringify(words)})`;
const focused = "(document.getElementById('jg-ui')?.getAttribute('aria-label') ?? '')";
const point = async (f: F, label: string): Promise<Point> =>
  (await f.waitForPage(`window.__jgNativeUi.point(${JSON.stringify(label)}) ?? false`, { timeoutMs: 15000, note: `a laid-out "${label}"` })) as Point;
/** The packed cache item's grid box `[x, y, w, h]` in cells, read from the native tree. */
const cacheItem = (name: string): string => `(() => {
  const walk = (n) => [n, ...n.children.flatMap(walk)];
  const n = walk(window.__jgNativeUi.tree()).find((n) => n.props.label === ${JSON.stringify(`Select ${name}`)});
  return n ? [n.props.pin[0] / 64, n.props.pin[1] / 64, (n.props.width + 4) / 64, (n.props.height + 4) / 64] : null;
})()`;

/** A standard pad: buttons 0 confirm, 1 back, 12-15 the d-pad. */
const plugPad = (f: F) => f.page(`(() => {
  const pad = { id: "flow pad", index: 0, connected: true, mapping: "standard", timestamp: 0, axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__flowPad = pad;
  navigator.getGamepads = () => [pad, null, null, null];
  window.dispatchEvent(new Event("gamepadconnected"));
  return true;
})()`);
const tapPad = async (f: F, button: number): Promise<void> => {
  await f.page(`(window.__flowPad.buttons[${button}] = { pressed: true, touched: true, value: 1 }, true)`);
  await f.wait(150);
  await f.page(`(window.__flowPad.buttons[${button}] = { pressed: false, touched: false, value: 0 }, true)`);
  await f.wait(250);
};

export default defineFlow(game, {
  browser: true,
  state: "title",
  async run(f) {
    const phone = (await f.page("innerWidth < 600")) === true;
    const pointer = phone ? "touch" : "mouse";
    /** Press a control by finger on the phone run, by mouse otherwise. */
    const press = async (label: string): Promise<void> => {
      const at = await point(f, label);
      if (phone) await f.touch(at.x, at.y); else await f.clickAt(at.x, at.y);
      await f.wait(300);
    };

    await f.waitForPage("(window.__jgNativeUi?.stats().frames ?? 0) > 0", { note: "native Rune submitted a frame" });
    await f.see("New dive");
    await f.shot("native-title");

    // Settings: a static screen stops submitting; slider by drag and by keyboard; a toggle; every category; a rebind.
    await press("Settings");
    await f.see("Master volume");
    await f.wait(2000);
    const frames = await f.page("window.__jgNativeUi.stats().frames");
    await f.wait(1000);
    await f.expectPage("window.__jgNativeUi.stats().frames", "static settings submits no frames", frames);
    await f.shot("native-settings");
    const slider = await point(f, "Master volume");
    await f.drag({ x: slider.x + 100, y: slider.y }, slider, { pointer });
    await f.waitForPage(`!${text}.split("\\n").includes("100%")`, { timeoutMs: 5000, note: "dragging Master volume moved it off 100%" });
    const before = await f.page(text);
    await f.press("Tab");
    await f.press("Tab");
    await f.press("ArrowLeft");
    await f.expectPage(`${text} !== ${JSON.stringify(before)}`, "ArrowLeft on a focused slider changed its value");
    await press("Mute sfx");
    await f.waitForPage(shows("On ›"), { timeoutMs: 5000, note: "the mute toggle reads On" });
    await f.shot("native-settings-changed");
    for (const category of ["Graphics", "Gameplay", "Accessibility"]) {
      await press(category);
      await f.wait(300);
      await f.shot(`native-settings-${category.toLowerCase()}`);
    }
    await press("Controls");
    await f.see("Deepward Interact");
    await press("E");
    await f.see("Press key / Esc cancels");
    await f.press("KeyJ");
    await f.waitForPage(shows("Deepward Interact\nJ\n"), { timeoutMs: 5000, note: "Interact is rebound to J" });
    await f.shot("native-settings-rebound");
    await press("Reset");
    await f.waitForPage(shows("Deepward Interact\nE\n"), { timeoutMs: 5000, note: "Reset put Interact back on E" });
    await f.press("Escape");
    await f.see("ONE LIFE. ONE TANK.", { timeoutMs: 5000 });

    // Credits by pad: step down to Credits, confirm, and the back button returns.
    await plugPad(f);
    for (let step = 0; step < 8 && !String(await f.page(focused)).includes("Credits"); step += 1) await tapPad(f, 13);
    await f.expectPage(`${focused}.includes("Credits")`, "the pad's d-pad reached Credits");
    await tapPad(f, 0);
    await f.see("CREDITS");
    await f.shot("native-credits");
    await tapPad(f, 1);
    await f.see("ONE LIFE. ONE TANK.", { timeoutMs: 5000 });

    // A dive starts at Marrow; pause, save, resume, then save and leave, and load it back.
    await press("New dive");
    await f.see("Another Life.", { timeoutMs: 20000 });
    await f.shot("native-hud");
    await f.press("Escape");
    await f.see("DIVE HELD");
    await f.shot("native-pause");
    await press("Save record");
    await f.see("Record written.", { timeoutMs: 10000 });
    await press("Back to the dive");
    await f.waitForPage(`!${shows("DIVE HELD")}`, { timeoutMs: 5000, note: "the dive resumed" });
    await press("Hold / Esc");
    await f.see("DIVE HELD");
    await press("Save & leave to title");
    await f.see("ONE LIFE. ONE TANK.", { timeoutMs: 15000 });
    await press("Dives & hauls");
    await f.see("Load dive");
    await f.shot("native-records");
    await press("Load dive");
    await f.see("Another Life.", { timeoutMs: 20000 });

    // Marrow's stash and fabricator, on a record seeded with salvage and one known blueprint.
    await f.command("deepward.dev.seed", { stash: ["wire", "wire", "cells", "cells", "polymer"], known: ["cutter"] });
    await f.waitFor((p) => p["stash"] === 5, { timeoutMs: 5000 });
    await f.command("deepward.openStash");
    await f.see("Marrow's stash");
    await f.shot("native-stash");
    await press("Dismantle");
    await f.waitFor((p) => p["banked"] > 0 && p["stash"] === 4, { timeoutMs: 5000 });
    await press("Close ×");
    await f.command("deepward.openFabricator");
    await f.see("Marrow's fabricator");
    await f.shot("native-fabricator");
    await press("Print Plasma cutter");
    await f.waitFor((p) => p["gear"] === 1, { timeoutMs: 5000 });
    await f.see("Plasma cutter printed");
    await press("Back to Marrow");

    // The cache: a staged dive with three searched items; open, select, move, rotate, then drag to drop.
    await f.command("deepward.stage");
    await f.waitFor((p) => p["inDive"] === 1 && p["carried"] >= 1, { timeoutMs: 20000 });
    await f.waitForPage(`!${shows("Taking the rail")}`, { timeoutMs: 20000, note: "the rail transition finished" });
    await f.shot("native-dive");
    if (phone) await press("Cache"); else await f.press("Tab");
    await f.see("CARRIED CACHE");
    // Packing never pauses the dive; slow it so the tank and the Fitter wait for the checks. Slowed
    // after the key: the game samples a tap once per tick.
    await f.timeScale(0.05);
    const name = String(await f.page(`(() => { const walk = (n) => [n, ...n.children.flatMap(walk)]; return walk(window.__jgNativeUi.tree()).find((n) => String(n.props.label ?? "").startsWith("Select "))?.props.label.slice(7) ?? ""; })()`));
    await press(`Select ${name}`);
    await f.waitForPage(shows("Rotate"), { timeoutMs: 5000, note: `pressing ${name} selected it` });
    await f.shot("native-cache");
    // An arrow into an occupied cell is refused; one of the four has room.
    const start = JSON.stringify(await f.page(cacheItem(name)));
    for (const arrow of ["→", "↓", "←", "↑"]) {
      await press(`Move ${arrow}`);
      if (JSON.stringify(await f.page(cacheItem(name))) !== start) break;
    }
    await f.expectPage(`JSON.stringify(${cacheItem(name)}) !== ${JSON.stringify(start)}`, `an arrow moved ${name} one cell`);
    const moved = (await f.page(cacheItem(name))) as number[];
    await press("Rotate");
    const rotated = (await f.page(cacheItem(name))) as number[];
    if (moved[2] !== moved[3]) await f.expectPage(`${cacheItem(name)}[2] === ${moved[3]}`, "Rotate swapped the footprint");
    else await f.expectPage(`${cacheItem(name)}[2] === ${rotated[2]}`, "a square item stays square on Rotate");
    // Drag the item onto the free cell farthest from it; the drop repacks it there.
    const free = (await f.page(`(() => {
      const walk = (n) => [n, ...n.children.flatMap(walk)];
      const nodes = walk(window.__jgNativeUi.tree()), boxes = nodes.filter((n) => String(n.props.label ?? "").startsWith("Select ")).map((n) => [n.props.pin[0] / 64, n.props.pin[1] / 64, (n.props.width + 4) / 64, (n.props.height + 4) / 64]);
      const me = ${cacheItem(name)};
      const taken = (x, y) => boxes.some((b) => b !== null && !(b[0] === me[0] && b[1] === me[1]) && x >= b[0] && x < b[0] + b[2] && y >= b[1] && y < b[1] + b[3]);
      for (let y = 2; y >= 0; y -= 1) for (let x = 3; x >= 0; x -= 1) {
        if (x + me[2] > 4 || y + me[3] > 3 || (x === me[0] && y === me[1])) continue;
        let ok = true;
        for (let dy = 0; dy < me[3]; dy += 1) for (let dx = 0; dx < me[2]; dx += 1) if (taken(x + dx, y + dy)) ok = false;
        if (ok) return [x, y];
      }
      return null;
    })()`)) as [number, number] | null;
    if (free === null) throw new Error("no free cell to drag the cache item to");
    const from = await point(f, `Select ${name}`);
    const cell = await point(f, `Move selected item to column ${free[0] + 1}, row ${free[1] + 1}`);
    await f.drag(from, cell, { pointer });
    await f.waitForPage(`${cacheItem(name)}[0] === ${free[0]} && ${cacheItem(name)}[1] === ${free[1]}`, { timeoutMs: 5000, note: `dragging ${name} dropped it at column ${free[0] + 1}, row ${free[1] + 1}` });
    await f.shot("native-cache-dropped");
    await press("Close cache / Tab");
    await f.waitForPage(`!${shows("CARRIED CACHE")}`, { timeoutMs: 5000, note: "the cache closed" });

    // Save failure: the tank runs out and storage refuses the write that ends the Life, so the
    // return waits on a retry. Dive checkpoints still write; refusing those blocks the record instead.
    await f.page(`(window.__flowSetItem = Storage.prototype.setItem, Storage.prototype.setItem = function (key, value) {
      if (String(value).includes('"mode":"reprinting"')) throw new DOMException("flow: storage refused", "QuotaExceededError");
      return window.__flowSetItem.call(this, key, value);
    }, true)`);
    await f.timeScale(40);
    await f.wait(3000);
    console.log("DEBUG", JSON.stringify(await f.page(text)));
    await f.shot("debug-after-timescale");
    await f.see("Return pending", { timeoutMs: 30000 });
    await f.see("Retry saving this return", { timeoutMs: 10000 });
    await f.shot("native-save-failed");
    await f.page(`(Storage.prototype.setItem = window.__flowSetItem, true)`);
    await f.timeScale(1);
    await press("Retry saving this return");

    // The reprint: the loss is saved, and accepting it returns to Marrow on the next Life.
    await f.see("Bellwether kept the haul.", { timeoutMs: 15000 });
    await f.waitFor((p) => p["reprinting"] === 1 && p["deaths"] === 1, { timeoutMs: 5000 });
    await f.shot("native-reprint");
    await press("Accept reprint");
    await f.waitFor((p) => p["reprinting"] === 0 && p["inDive"] === 0, { timeoutMs: 10000 });
    await f.see("Another Life.");
    await f.shot("native-reprinted");

    // Another window rewrote the record: play stops, and only a reload of the saved record goes on.
    await f.page(`(() => {
      for (const key of Object.keys(localStorage).filter((key) => key.startsWith("deepward.marrow.record:"))) {
        localStorage.setItem(key, localStorage.getItem(key) + " ");
        window.dispatchEvent(new StorageEvent("storage", { key, storageArea: localStorage }));
      }
      return true;
    })()`);
    await f.see("Marrow is unavailable", { timeoutMs: 10000 });
    await f.see("Marrow changed in another window");
    await f.shot("native-blocked");
  },
});
