import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdir, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type CDPSession, type Page } from "playwright-core";
import { buildBrowserFixture, findChromeExecutable } from "../../../scripts/browser-lib";
const root = resolve(import.meta.dir, "../../..");
const scratch = `${root}/.scratch/fullscreen-map-pointer-test`;
let browser: Browser, page: Page, input: CDPSession, server: ReturnType<typeof Bun.serve>;
beforeAll(async () => {
  await rm(scratch, { recursive: true, force: true });
  await mkdir(`${scratch}/node_modules/@jgengine`, { recursive: true });
  for (const peer of ["react", "react-dom"]) await symlink(`${root}/packages/react/node_modules/${peer}`, `${scratch}/node_modules/${peer}`, "dir");
  for (const pkg of ["core", "react"]) {
    const pack = JSON.parse(execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", scratch], { cwd: `${root}/packages/${pkg}`, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }))[0];
    await mkdir(`${scratch}/node_modules/@jgengine/${pkg}`, { recursive: true });
    execFileSync("tar", ["-xzf", pack.filename, "-C", `node_modules/@jgengine/${pkg}`, "--strip-components=1"], { cwd: scratch });
  }
  await Bun.write(`${scratch}/fixture.tsx`, `
    import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
    import {FullscreenMap,MapLegend} from '@jgengine/react/map';import {createAnnotationLayer} from '@jgengine/core/world/mapAnnotations';
    const owned=new Map(),types=['pointermove','mouseup','pointercancel'],add=window.addEventListener.bind(window),remove=window.removeEventListener.bind(window);
    window.addEventListener=(type,listener,options)=>{if(types.includes(type)){const set=owned.get(type)??new Set();set.add(listener);owned.set(type,set)}add(type,listener,options)};
    window.removeEventListener=(type,listener,options)=>{owned.get(type)?.delete(listener);remove(type,listener,options)};
    window.mapListeners=()=>[...owned.values()].reduce((sum,set)=>sum+set.size,0);
    const layer=createAnnotationLayer({defaultTone:'safe'}),waypoints=[];let controls=0;const draw=new URLSearchParams(location.search).get('mode')==='draw';
    function Controls(){return <div style={{position:'absolute',left:12,bottom:12}}><button id="map-control" onClick={()=>controls++}>Map control</button><span id="shadow-control" ref={element=>{if(element!==null&&element.shadowRoot===null){const button=document.createElement('button');button.textContent='Shadow control';button.onclick=()=>controls++;element.attachShadow({mode:'open'}).append(button)}}}/></div>}
    function Fixture(){const[open,setOpen]=useState(true),[routes,setRoutes]=useState(layer.routes()),[tool,setTool]=useState(draw?'draw':'pan');
      window.fixture={snapshot:()=>layer.snapshot(),waypoints:()=>waypoints,controls:()=>controls,switchTool:tool=>flushSync(()=>setTool(tool)),close:()=>flushSync(()=>setOpen(false)),reopen:()=>flushSync(()=>setOpen(true))};
      return draw?<section aria-label="Expedition planning desk"><FullscreenMap open={open} markers={[]} bounds={{minX:-100,maxX:100,minZ:-50,maxZ:50}} title="Route notebook" tool={tool} drawTone="safe" routes={routes} onStrokeComplete={points=>{layer.addStroke(points);setRoutes(layer.routes())}} overlayClassName="field-notebook" overlayStyle={{position:'absolute',inset:'30px auto auto 30px',width:560,height:360,background:'#24352a',fontFamily:'serif'}}><MapLegend kinds={['camp']} labels={{camp:'Shelter'}} title="Expedition key" style={{position:'absolute',right:12,bottom:12,pointerEvents:'none'}}/><Controls/></FullscreenMap></section>
        :<FullscreenMap open={open} markers={[]} bounds={{minX:-100,maxX:100,minZ:-50,maxZ:50}} title="World navigation" tool={tool} onWorldClick={point=>waypoints.push(point)}><Controls/></FullscreenMap>;
    }const mounted=createRoot(document.getElementById('root'));window.unmountMap=()=>flushSync(()=>mounted.unmount());mounted.render(<Fixture/>);
  `);
  const script = buildBrowserFixture(`${scratch}/fixture.tsx`);
  // Retired Bun child transports can otherwise finalize their pipes during the next browser fixture.
  Bun.gc(true);
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => new URL(request.url).pathname === "/fixture.js" ? new Response(script, { headers: { "Content-Type": "text/javascript" } }) : new Response('<style>body{margin:0}</style><div id="root"></div><script type="module" src="/fixture.js"></script>', { headers: { "Content-Type": "text/html" } }) });
  browser = await chromium.launch({ executablePath: findChromeExecutable(), headless: true, args: ["--no-sandbox"] });
  page = await browser.newPage({ viewport: { width: 900, height: 600 }, hasTouch: true });
}, 30000);
beforeEach(async () => { input = await page.context().newCDPSession(page); });
afterEach(async () => { await input?.detach(); });
afterAll(async () => { await browser?.close(); server?.stop(true); await rm(scratch, { recursive: true, force: true }); });
async function open(mode = "pan") {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.port}/?mode=${mode}`);
  try { await page.locator("[data-fullscreen-map-viewport]").waitFor({ timeout: 2000 }); }
  catch (error) { throw new Error(errors.join("\n") || String(error)); }
  expect(errors).toEqual([]);
}
async function at(x = 0.25, y = 0.3, id = 1) {
  const box = await page.locator("[data-fullscreen-map-viewport]").boundingBox(); if (box === null) throw new Error("Missing map");
  return { x: box.x + box.width * x, y: box.y + box.height * y, id };
}
async function touch(type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel", points: { x: number; y: number; id: number }[]) {
  await input.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
}
async function transform() { return page.locator("[data-world-map-content]").getAttribute("transform"); }
async function strokes() { return page.evaluate(() => (window as any).fixture.snapshot().strokes); }

test("normal touch pan suppresses waypoint placement and a later click still places", async () => {
  await open(); const first = await at(), end = await at(0.35,0.4);
  await touch("touchStart",[first]); await touch("touchMove",[end]); await touch("touchEnd",[]);
  expect(await transform()).not.toBe("translate(0 0) scale(1)"); expect(await page.evaluate(()=>(window as any).fixture.waypoints())).toEqual([]);
  await page.mouse.click(first.x,first.y); expect(await page.evaluate(()=>(window as any).fixture.waypoints().length)).toBe(1);
});
test("canceled map pan does not respond to later native mouse hover", async () => {
  await open(); const first = await at(), end = await at(0.35,0.4);
  await touch("touchStart",[first]); await touch("touchMove",[end]); const before = await transform(); await touch("touchCancel",[]);
  await page.mouse.move(end.x+40,end.y+30); expect(await transform()).toBe(before);
});
test("secondary touch cannot pan the owner's viewport or end its gesture", async () => {
  await open(); const first = await at(), second = await at(0.7,0.6,2);
  await touch("touchStart",[first]); await touch("touchStart",[first,second]);
  await touch("touchMove",[first,{...second,x:second.x+40}]); expect(await transform()).toBe("translate(0 0) scale(1)");
  await touch("touchEnd",[{...second,x:second.x+40}]); await touch("touchMove",[{...first,x:first.x+30}]);
  expect(await transform()).not.toBe("translate(0 0) scale(1)"); await touch("touchEnd",[]);
});
test("closing and reopening retires a map pan before native hover", async () => {
  await open(); const first = await at(); await touch("touchStart",[first]);
  await page.evaluate(()=>(window as any).fixture.close()); await touch("touchEnd",[]); await page.evaluate(()=>(window as any).fixture.reopen());
  await page.mouse.move(first.x+60,first.y+40); expect(await transform()).toBe("translate(0 0) scale(1)");
});
test("reskinned route notebook commits real annotations only on a completed stroke", async () => {
  await open("draw"); const first = await at(0.2,0.3), end = await at(0.3,0.4);
  await touch("touchStart",[first]); await touch("touchMove",[end]); await touch("touchEnd",[]);
  const committed = await strokes(); expect(committed.length).toBe(1); expect(committed[0].tone).toBe("safe"); expect(committed[0].points.length).toBe(2);
  await touch("touchStart",[first]); await touch("touchMove",[end]); expect(await page.locator('[data-map-route="__draft-stroke"]').count()).toBe(1);
  await touch("touchCancel",[]); expect(await page.locator('[data-map-route="__draft-stroke"]').count()).toBe(0); expect(await strokes()).toEqual(committed);
});
test("secondary touch cannot commit a route notebook stroke for the owner", async () => {
  await open("draw"); const first = await at(0.2,0.3), ownerMove = await at(0.3,0.4), second = await at(0.7,0.6,2);
  await touch("touchStart",[first]); await touch("touchMove",[ownerMove]); await touch("touchStart",[ownerMove,second]);
  await touch("touchMove",[ownerMove,{...second,x:second.x+40}]); await touch("touchEnd",[{...second,x:second.x+40}]);
  expect(await strokes()).toEqual([]); await touch("touchMove",[{...ownerMove,x:ownerMove.x+20}]); await touch("touchEnd",[]);
  const committed = await strokes(); expect(committed.length).toBe(1); expect(committed[0].points.length).toBe(3);
  expect(committed[0].points[0][0]).toBeCloseTo(-60); expect(committed[0].points[0][1]).toBeCloseTo(-20);
});
for (const mode of ["pan", "draw"]) {
  test(`${mode} map preserves native custom and shadow overlay controls`, async () => {
    await open(mode); await page.locator("#map-control").click(); await page.getByRole("button", { name: "Shadow control", exact: true }).click();
    expect(await page.evaluate(() => (window as any).fixture.controls())).toBe(2);
    expect(await transform()).toBe("translate(0 0) scale(1)"); expect(await strokes()).toEqual([]);
    expect(await page.evaluate(() => (window as any).fixture.waypoints())).toEqual([]);
  });
}
test("changing tools discards a route draft before another native pointer event", async () => {
  await open("draw"); const first = await at(0.2,0.3), end = await at(0.3,0.4);
  await touch("touchStart",[first]); await touch("touchMove",[end]);
  await page.evaluate(() => (window as any).fixture.switchTool("pan"));
  expect(await page.locator('[data-map-route="__draft-stroke"]').count()).toBe(0); await touch("touchEnd",[]);
  expect(await strokes()).toEqual([]);
});
test("native touch capture loss retires a map pan before later movement", async () => {
  await open(); const first = await at(), end = await at(0.35,0.4);
  const viewport = page.locator("[data-fullscreen-map-viewport]");
  await viewport.evaluate(element => {
    const source = element as HTMLElement; const capture = { owner: 0, got: false, lost: false }; (window as any).capture = capture;
    source.addEventListener("pointerdown", event => { capture.owner = event.pointerId; }, { once: true });
    source.addEventListener("gotpointercapture", event => { capture.got = event.pointerId === capture.owner && event.isTrusted; }, { once: true });
    source.addEventListener("lostpointercapture", event => { capture.lost = event.pointerId === capture.owner && event.isTrusted; }, { once: true });
  });
  await touch("touchStart",[first]); await touch("touchMove",[end]);
  await page.waitForFunction(() => (window as any).capture.got, undefined, { timeout: 1000 }); const before = await transform();
  await viewport.evaluate(element => element.releasePointerCapture((window as any).capture.owner));
  await touch("touchMove",[{...end,x:end.x+40,y:end.y+30}]);
  await page.waitForFunction(() => (window as any).capture.lost, undefined, { timeout: 1000 });
  expect(await transform()).toBe(before); await touch("touchEnd",[]);
});
test("mouse button chords keep the primary pan active until its release", async () => {
  await open(); const first = await at(); await page.mouse.move(first.x,first.y); await page.mouse.down();
  await page.mouse.down({button:"right"}); await page.mouse.move(first.x+20,first.y+15); const chord = await transform();
  await page.mouse.up({button:"right"}); await page.mouse.move(first.x+40,first.y+30); const before = await transform();
  expect(before).not.toBe(chord); await page.mouse.up(); await page.mouse.move(first.x+60,first.y+50); expect(await transform()).toBe(before);
  expect(await page.evaluate(() => (window as any).fixture.waypoints())).toEqual([]);
});

test("primary mouse release retires a chord while the secondary button remains held", async () => {
  await open(); const first = await at(); await page.mouse.move(first.x,first.y); await page.mouse.down();
  await page.mouse.down({button:"right"}); await page.mouse.move(first.x+20,first.y+15); const before = await transform();
  await page.mouse.up(); await page.mouse.move(first.x+40,first.y+30); expect(await transform()).toBe(before);
  await page.mouse.up({button:"right"}); expect(await page.evaluate(() => (window as any).fixture.waypoints())).toEqual([]);
});
test("a mouse pan releases outside the reskinned viewport without stale movement", async () => {
  await open("draw"); await page.evaluate(() => (window as any).fixture.switchTool("pan"));
  const first = await at(); await page.mouse.move(first.x,first.y); await page.mouse.down();
  await page.mouse.move(850,550); const before = await transform(); expect(before).not.toBe("translate(0 0) scale(1)");
  await page.mouse.up(); await page.mouse.move(first.x,first.y); expect(await transform()).toBe(before);
  expect(await strokes()).toEqual([]);
});

for (const retire of ["close", "unmount"]) {
  test(`${retire} detaches a mouse map gesture from its native window`, async () => {
    await open(); const first = await at(); const baseline = await page.evaluate(() => (window as any).mapListeners());
    await page.mouse.move(first.x,first.y); await page.mouse.down();
    expect(await page.evaluate(() => (window as any).mapListeners())).toBeGreaterThan(baseline);
    await page.evaluate(retire => retire === "close" ? (window as any).fixture.close() : (window as any).unmountMap(), retire);
    expect(await page.evaluate(() => (window as any).mapListeners())).toBe(baseline);
    await page.mouse.up();
    if (retire === "close") {
      await page.evaluate(() => (window as any).fixture.reopen()); await page.mouse.move(first.x+60,first.y+40);
      expect(await transform()).toBe("translate(0 0) scale(1)");
    }
  });
}
test("removing the owned viewport discards a mouse route before its release", async () => {
  await open("draw"); const first = await at(0.2,0.3), end = await at(0.3,0.4);
  await page.mouse.move(first.x,first.y); await page.mouse.down(); await page.mouse.move(end.x,end.y);
  expect(await page.locator('[data-map-route="__draft-stroke"]').count()).toBe(1);
  await page.locator("[data-fullscreen-map-viewport]").evaluate(element => element.remove());
  await page.mouse.up(); expect(await strokes()).toEqual([]);
});
