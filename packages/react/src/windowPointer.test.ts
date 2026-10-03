import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdir, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type CDPSession, type Page } from "playwright-core";
import { buildBrowserFixture, findChromeExecutable } from "../../../scripts/browser-lib";

const scratch = resolve(import.meta.dir, "../../../.scratch/window-pointer-test");
let browser: Browser, page: Page, input: CDPSession, server: ReturnType<typeof Bun.serve>;
beforeAll(async () => {
  await mkdir(`${scratch}/node_modules/@jgengine`, { recursive: true });
  for (const peer of ["react", "react-dom"]) await symlink(resolve(import.meta.dir, "../node_modules", peer), `${scratch}/node_modules/${peer}`, "dir");
  for (const pkg of ["core", "react"]) {
    const pack = JSON.parse(execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", scratch], { cwd: resolve(import.meta.dir, "../../", pkg), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }))[0];
    await mkdir(`${scratch}/node_modules/@jgengine/${pkg}`, { recursive: true });
    execFileSync("tar", ["-xzf", pack.filename, "-C", `node_modules/@jgengine/${pkg}`, "--strip-components=1"], { cwd: scratch });
  }
  await Bun.write(`${scratch}/fixture.tsx`, `
    import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
    import {Window,PanelHost,usePanels} from '@jgengine/react/panels';
    const listeners=new Map();const add=window.addEventListener.bind(window),remove=window.removeEventListener.bind(window);
    // Exclude browser automation observers from SDK listener ownership.
    window.addEventListener=(type,fn,options)=>{if(new Error().stack.split('\\n')[2]?.includes('/fixture.js')&&['pointermove','pointerup','pointercancel','lostpointercapture','blur'].includes(type)){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn)}return add(type,fn,options)};
    window.removeEventListener=(type,fn,options)=>{listeners.get(type)?.delete(fn);return remove(type,fn,options)};
    const moves=[];
    function Fixture(){const[visible,setVisible]=useState(true),[pos,setPos]=useState({x:20,y:20});
      const manager=usePanels([{id:'journal',title:'Journal',initial:true},{id:'quests',title:'Quests',initial:true}]);
      window.fixture={moves:()=>moves,pos:()=>pos,state:()=>manager.state,hide:()=>flushSync(()=>setVisible(false)),close:()=>flushSync(()=>manager.close('journal')),listeners:()=>Object.fromEntries([...listeners].map(([type,set])=>[type,set.size]))};
      return <>{visible&&<Window title="Inspector" x={pos.x} y={pos.y} onMove={next=>{moves.push(next);setPos(next)}} width={220}><input aria-label="Item name"/></Window>}
        <div style={{position:'absolute',left:360,top:0,width:350,height:500}}><PanelHost manager={manager} width={180} render={id=><p>{id==='journal'?'Travel notes':'Quest objectives'}</p>}/></div>
        <div id="outside" style={{position:'absolute',left:720,top:400,width:80,height:80}}>Outside</div></>;
    }createRoot(document.getElementById('root')).render(<Fixture/>);
  `);
  const script = buildBrowserFixture(`${scratch}/fixture.tsx`);
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => new URL(request.url).pathname === "/fixture.js" ? new Response(script, { headers: { "Content-Type": "text/javascript" } }) : new Response('<style>body{margin:0}</style><div id="root"></div><script type="module" src="/fixture.js"></script>', { headers: { "Content-Type": "text/html" } }) });
  browser = await chromium.launch({ executablePath: findChromeExecutable(), headless: true, args: ["--no-sandbox"] });
}, 30000);
beforeEach(async () => {
  page = await browser.newPage({ viewport: { width: 900, height: 600 }, hasTouch: true });
  input = await page.context().newCDPSession(page);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.port}`);
  try { await page.getByRole("dialog", { name: "Inspector" }).waitFor({ timeout: 2000 }); }
  catch (error) { throw new Error(errors.join("\n") || String(error)); }
  expect(errors).toEqual([]);
});
afterEach(async () => { await input?.detach(); await page?.close(); });
afterAll(async () => { await browser?.close(); server?.stop(true); await rm(scratch, { recursive: true, force: true }); });
async function center(name = "Inspector") {
  const box = await page.getByRole("dialog", { name }).locator("[data-jg-window-titlebar]").boundingBox();
  if (box === null) throw new Error("Missing title bar");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 };
}
async function touch(type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel", points: { x: number; y: number; id: number }[]) {
  await input.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
}
async function pos() { return page.evaluate(() => (window as any).fixture.pos()); }
async function idle() { expect(await page.evaluate(() => Object.values((window as any).fixture.listeners()).reduce((sum: number, count) => sum + (count as number), 0))).toBe(0); }

test("touch repositions a controlled Window and retires on release", async () => {
  const start = await center(); await touch("touchStart", [start]);
  await touch("touchMove", [{ ...start, x: start.x + 50, y: start.y + 30 }]);
  expect(await pos()).toEqual({ x: 70, y: 50 }); await touch("touchEnd", []); await idle();
});
test("PanelHost touch drag preserves manager position and raises its z order", async () => {
  const start = await center("Journal"); await touch("touchStart", [start]);
  await touch("touchMove", [{ ...start, x: start.x + 30, y: start.y + 20 }]); await touch("touchEnd", []);
  const state = await page.evaluate(() => (window as any).fixture.state());
  expect(state.pos.journal).toEqual({ x: 86, y: 76 }); expect(state.z.journal).toBeGreaterThan(state.z.quests); await idle();
});
for (const ending of ["blur", "unmount", "close"] as const) {
  test(`${ending} retires a window gesture before later native pointer movement`, async () => {
    const start = await center(ending === "close" ? "Journal" : "Inspector");
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    expect(await page.evaluate(() => (window as any).fixture.listeners().pointermove)).toBe(1);
    const before = await page.evaluate(() => ({ moves: (window as any).fixture.moves(), state: (window as any).fixture.state() }));
    await page.evaluate(reason => {
      if (reason === "blur") window.dispatchEvent(new Event("blur"));
      if (reason === "unmount") (window as any).fixture.hide();
      if (reason === "close") (window as any).fixture.close();
    }, ending);
    await page.mouse.move(start.x + 90, start.y + 60);
    const after = await page.evaluate(() => ({ moves: (window as any).fixture.moves(), state: (window as any).fixture.state() }));
    expect(after.moves).toEqual(before.moves);
    expect(after.state.pos).toEqual(before.state.pos);
    await idle(); await page.mouse.up();
  });
}
test("a second touch cannot reposition the first owner's window or retire it", async () => {
  const first = await center(), second = { x: 760, y: 450, id: 2 };
  await touch("touchStart", [first]); await touch("touchStart", [first, second]);
  await touch("touchMove", [first, { ...second, x: 790, y: 470 }]);
  expect(await pos()).toEqual({ x: 20, y: 20 });
  await touch("touchEnd", [{ ...second, x: 790, y: 470 }]);
  expect(await page.evaluate(() => (window as any).fixture.listeners().pointermove)).toBe(1);
  await touch("touchMove", [{ ...first, x: first.x + 40, y: first.y + 25 }]);
  expect(await pos()).toEqual({ x: 60, y: 45 }); await touch("touchEnd", []); await idle();
});
test("touch cancellation retires the window without later movement", async () => {
  const start = await center(); await touch("touchStart", [start]); await touch("touchCancel", []);
  await page.mouse.move(800, 500); expect(await pos()).toEqual({ x: 20, y: 20 }); await idle();
});
test("a secondary touch on the same title bar cannot install another gesture", async () => {
  const first = await center(), second = { ...first, x: first.x + 10, id: 2 };
  await touch("touchStart", [first]); await touch("touchStart", [first, second]);
  expect(await page.evaluate(() => (window as any).fixture.listeners().pointermove)).toBe(1);
  await touch("touchEnd", [second]);
  await touch("touchMove", [{ ...first, x: first.x + 20 }]);
  expect(await pos()).toEqual({ x: 40, y: 20 }); await touch("touchEnd", []); await idle();
});
test("explicit capture loss retires a mouse window gesture", async () => {
  const start = await center();
  await page.evaluate(() => window.addEventListener("pointerdown", event => { (window as any).ownerPointer = event.pointerId; }, { once: true }));
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(start.x + 1, start.y + 1);
  const title = page.getByRole("dialog", { name: "Inspector" }).locator("[data-jg-window-titlebar]");
  expect(await title.evaluate(element => element.hasPointerCapture((window as any).ownerPointer))).toBe(true);
  await title.evaluate(element => element.releasePointerCapture((window as any).ownerPointer));
  await page.mouse.move(start.x + 50, start.y + 30); expect(await pos()).toEqual({ x: 21, y: 21 }); await idle(); await page.mouse.up();
});
