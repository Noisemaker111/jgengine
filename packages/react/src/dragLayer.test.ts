import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdir, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type CDPSession, type Page } from "playwright-core";
import { buildBrowserFixture, findChromeExecutable } from "../../../scripts/browser-lib";

const scratch = resolve(import.meta.dir, "../../../.scratch/drag-layer-test");
let browser: Browser, page: Page, server: ReturnType<typeof Bun.serve>;
let input: CDPSession;
let baselineListeners: [string, unknown][];

beforeAll(async () => {
  await mkdir(`${scratch}/node_modules/@jgengine`, { recursive: true });
  for (const peer of ["react", "react-dom"]) {
    await symlink(resolve(import.meta.dir, "../node_modules", peer), `${scratch}/node_modules/${peer}`, "dir");
  }
  for (const pkg of ["core", "react"]) {
    const result = JSON.parse(execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", scratch], {
      cwd: resolve(import.meta.dir, "../../", pkg), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }))[0];
    const destination = `${scratch}/node_modules/@jgengine/${pkg}`;
    await mkdir(destination, { recursive: true });
    execFileSync("tar", ["-xzf", result.filename, "-C", `node_modules/@jgengine/${pkg}`, "--strip-components=1"], { cwd: scratch });
  }
  const entry = `${scratch}/fixture.tsx`;
  await Bun.write(entry, `
    import React, {useState} from 'react'; import {createRoot} from 'react-dom/client'; import {flushSync} from 'react-dom';
    import {useDragLayer,DraggableCard,DropZone,DragGhost} from '@jgengine/react/dragLayer';
    import {InventoryGrid} from '@jgengine/react/inventoryGrid'; import {GameProvider} from '@jgengine/react/provider';
    import {CardFace} from '@jgengine/react/cards';
    import {defineGameDefinition} from '@jgengine/core/game/defineGame';
    import {createAssetCatalog} from '@jgengine/core/scene/assetCatalog'; import {createGameContext} from '@jgengine/core/runtime/gameContext';
    const listeners=new Map();
    // Browser automation also installs pointer observers; track listeners owned by this bundle.
    const add=window.addEventListener.bind(window), remove=window.removeEventListener.bind(window);
    window.addEventListener=(type,fn,options)=>{if(new Error().stack.split('\\n')[2]?.includes('/fixture.js')&&['pointermove','pointerup','pointercancel','lostpointercapture','blur','keydown'].includes(type)){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn)}return add(type,fn,options)};
    window.removeEventListener=(type,fn,options)=>{listeners.get(type)?.delete(fn);return remove(type,fn,options)};
    const ctx=createGameContext({definition:defineGameDefinition({name:'Drag bag',assets:createAssetCatalog(),multiplayer:'off',inventories:{bag:{slots:6}}}),content:{},player:{userId:'drag-user',isNew:true}});
    ctx.player.inventory.put('bag','sword',1,{slot:0});ctx.player.inventory.put('bag','shield',1,{slot:1});
    ctx.player.inventory.put('bag','potion',3,{slot:2});ctx.player.inventory.put('bag','potion',2,{slot:3});
    function Board(){
      const [cards,setCards]=useState([{id:'ace',rank:'A',suit:'spades'},{id:'king',rank:'K',suit:'hearts'}]);
      const [drops,setDrops]=useState([]),[hidden,setHidden]=useState(false),[destination,setDestination]=useState(true);
      const layer=useDragLayer({onDrop:info=>{setDrops(prev=>[...prev,info]);if(info.target==='discard')setCards(prev=>prev.filter(card=>card.id!==info.payload.id))}});
      window.board={state:()=>layer.state,rotate:()=>flushSync(()=>layer.rotate()),hideCard:()=>flushSync(()=>setHidden(true)),hideTarget:()=>flushSync(()=>setDestination(false))};
      return <div id="board" style={{position:'absolute',left:350,top:20}}>
        <DropZone id="hand" layer={layer}><div style={{display:'flex',gap:20,width:150,height:100}}>{!hidden&&cards.map(card=><DraggableCard key={card.id} id={card.id} value={card} layer={layer}><CardFace {...card} width={50}/></DraggableCard>)}</div></DropZone>
        {destination&&<DropZone id="discard" layer={layer} cellSize={40}><div style={{width:160,height:120,marginTop:40,background:'#ccc'}}>Discard</div></DropZone>}
        <DragGhost layer={layer}>{payload=><CardFace {...payload.value} width={50}/>}</DragGhost>
        <output id="drops">{JSON.stringify(drops)}</output>
      </div>;
    }
    function Fixture(){const [bag,setBag]=useState(true),[board,setBoard]=useState(true);
      window.fixture={slots:()=>ctx.player.inventory.state('bag').slots,hideBag:()=>flushSync(()=>setBag(false)),hideBoard:()=>flushSync(()=>setBoard(false)),listeners:()=>Object.fromEntries([...listeners].map(([key,set])=>[key,set.size]))};
      return <>{bag&&<div style={{position:'absolute',left:20,top:20}}><GameProvider context={ctx}><InventoryGrid inventoryId="bag" columns={3} size={70} gap={10}/></GameProvider></div>}{board&&<Board/>}<div id="outside" style={{position:'absolute',left:600,top:350,width:100,height:100}}>Outside</div></>;
    }
    createRoot(document.getElementById('root')).render(<Fixture/>);
  `);
  const script = buildBrowserFixture(entry);
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => new URL(request.url).pathname === "/fixture.js"
    ? new Response(script, { headers: { "Content-Type": "text/javascript" } })
    : new Response('<meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0}</style><div id="root"></div><script type="module" src="/fixture.js"></script>', { headers: { "Content-Type": "text/html" } }) });
  browser = await chromium.launch({ executablePath: findChromeExecutable(), headless: true, args: ["--no-sandbox"] });
}, 30000);

beforeEach(async () => {
  page = await browser.newPage({ viewport: { width: 800, height: 600 }, hasTouch: true });
  input = await page.context().newCDPSession(page);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.port}`);
  try { await page.locator('[data-card="ace"]').waitFor({ timeout: 2000 }); }
  catch (error) { throw new Error(errors.join("\n") || String(error)); }
  expect(errors).toEqual([]);
  await page.locator("#outside").click();
  baselineListeners = await page.evaluate(() => Object.entries((window as any).fixture.listeners()).filter(([, count]) => count !== 0));
});

afterEach(async () => { await input?.detach(); await page?.close(); });
afterAll(async () => { await browser?.close(); server?.stop(true); await rm(scratch, { recursive: true, force: true }); });

async function center(selector: string) {
  const box = await page.locator(selector).boundingBox();
  if (box === null) throw new Error(`Missing ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
async function touch(type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel", points: { x: number; y: number; id?: number }[]) {
  await input.send("Input.dispatchTouchEvent", { type, touchPoints: points });
}
async function drops() { return JSON.parse(await page.locator("#drops").textContent() ?? "[]"); }
async function slots() { return page.evaluate(() => (window as any).fixture.slots()); }
async function idle() {
  await page.waitForFunction(() => document.querySelector('[data-drag-ghost]') === null, undefined, { timeout: 1000 });
  expect(await page.evaluate(() => Object.entries((window as any).fixture.listeners()).filter(([, count]) => count !== 0))).toEqual(baselineListeners);
}
async function mouseDrag(from: string, to: string) {
  const start = await center(from), end = await center(to);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(end.x, end.y); await page.mouse.up();
}

test("touch inventory drops move, swap, and merge actual live slots", async () => {
  const start = await center('[data-slot="0"]'), empty = await center('[data-slot="4"]');
  await touch("touchStart", [start]); await touch("touchMove", [empty]); await touch("touchEnd", []);
  expect((await slots())[0]).toBeNull(); expect((await slots())[4]).toEqual({ itemId: "sword", count: 1 });
  const sword = await center('[data-slot="4"]'), shield = await center('[data-slot="1"]');
  await touch("touchStart", [sword]); await touch("touchMove", [shield]); await touch("touchEnd", []);
  expect((await slots())[4]).toEqual({ itemId: "shield", count: 1 }); expect((await slots())[1]).toEqual({ itemId: "sword", count: 1 });
  const potion = await center('[data-slot="2"]'), stack = await center('[data-slot="3"]');
  await touch("touchStart", [potion]); await touch("touchMove", [stack]); await touch("touchEnd", []);
  expect((await slots())[2]).toBeNull(); expect((await slots())[3]).toEqual({ itemId: "potion", count: 5 });
  await idle();
}, 10000);

test("touch card crosses zones despite implicit capture and resolves the drop cell", async () => {
  const start = await center('[data-card="ace"]'), end = { x: 450, y: 220 };
  await touch("touchStart", [start]); await touch("touchMove", [end]);
  expect(await page.locator('[data-dropzone="discard"]').getAttribute("data-active")).toBe("");
  await touch("touchEnd", []);
  expect((await drops())[0]).toMatchObject({ payload: { id: "ace", rotation: 0 }, target: "discard", cell: [2, 1], point: end });
  expect(await page.locator('[data-card="ace"]').count()).toBe(0); await idle();
});

test("release outside retires the drag once and a later drag can still land", async () => {
  await mouseDrag('[data-card="ace"]', "#outside"); await idle();
  expect(await drops()).toHaveLength(1); expect((await drops())[0].target).toBeNull();
  await mouseDrag('[data-card="ace"]', '[data-dropzone="discard"]');
  expect(await drops()).toHaveLength(2); expect((await drops())[1].target).toBe("discard"); await idle();
});

test("a removed destination cannot receive a stale drop", async () => {
  const start = await center('[data-card="ace"]');
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(450, 220);
  expect(await page.locator('[data-dropzone="discard"]').getAttribute("data-active")).toBe("");
  await page.evaluate(() => (window as any).board.hideTarget());
  await page.mouse.up();
  expect((await drops())[0].target).toBeNull();
  expect(await page.locator('[data-card="ace"]').count()).toBe(1); await idle();
});

test("Escape and lost capture cancel the drag without consuming the card", async () => {
  const start = await center('[data-card="ace"]');
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.keyboard.press("Escape");
  await idle(); await page.mouse.up(); expect(await drops()).toHaveLength(0);
  await page.locator('[data-card="ace"]').evaluate(element => {
    const card = element as HTMLElement;
    const capture = { owner: 0, got: null as null | { pointerId: number; trusted: boolean; onCard: boolean }, lost: null as null | { pointerId: number; trusted: boolean; onCard: boolean } };
    (window as any).capture = capture;
    card.addEventListener("pointerdown", event => { capture.owner = event.pointerId; }, { once: true });
    card.addEventListener("gotpointercapture", event => { capture.got = { pointerId: event.pointerId, trusted: event.isTrusted, onCard: event.target === card }; }, { once: true });
    card.addEventListener("lostpointercapture", event => { capture.lost = { pointerId: event.pointerId, trusted: event.isTrusted, onCard: event.target === card }; }, { once: true });
  });
  await page.mouse.down();
  // Capture becomes active when the browser processes another pointer event.
  await page.mouse.move(start.x + 1, start.y + 1);
  await page.waitForFunction(() => (window as any).capture.got?.pointerId === (window as any).capture.owner, undefined, { timeout: 1000 });
  const captured = await page.evaluate(() => (window as any).capture);
  expect(captured.got).toEqual({ pointerId: captured.owner, trusted: true, onCard: true });
  await page.locator('[data-card="ace"]').evaluate(element => element.releasePointerCapture((window as any).capture.owner));
  await page.mouse.move(650, 400);
  await page.waitForFunction(() => (window as any).capture.lost?.pointerId === (window as any).capture.owner, undefined, { timeout: 1000 });
  const released = await page.evaluate(() => (window as any).capture);
  expect(released.lost).toEqual({ pointerId: released.owner, trusted: true, onCard: true });
  await idle(); await page.mouse.up();
  expect(await drops()).toHaveLength(0); expect(await page.locator('[data-card="ace"]').count()).toBe(1);
});

for (const termination of ["cancel", "blur", "source", "owner", "bag"] as const) {
  test(`${termination} retires pointer ownership without a drop`, async () => {
    const start = await center(termination === "bag" ? '[data-slot="0"]' : '[data-card="ace"]');
    await touch("touchStart", [start]); expect(await page.locator('[data-drag-ghost]').count()).toBe(1);
    expect(await page.evaluate(() => (window as any).fixture.listeners().pointermove)).toBe(1);
    if (termination === "cancel") await touch("touchCancel", []);
    else await page.evaluate(kind => {
      if (kind === "blur") window.dispatchEvent(new Event("blur"));
      if (kind === "source") (window as any).board.hideCard();
      if (kind === "owner") (window as any).fixture.hideBoard();
      if (kind === "bag") (window as any).fixture.hideBag();
    }, termination);
    await idle();
    if (termination !== "owner") expect(await drops()).toHaveLength(0);
    expect((await slots())[0]).toEqual({ itemId: "sword", count: 1 });
    if (termination !== "cancel") await touch("touchEnd", []);
  });
}

test("a second pointer cannot take over, move, or complete the first pointer's drag", async () => {
  const first = { ...(await center('[data-card="ace"]')), id: 1 }, second = { ...(await center('[data-card="king"]')), id: 2 };
  await touch("touchStart", [first]); await touch("touchStart", [first, second]);
  expect(await page.evaluate(() => (window as any).board.state().payload.id)).toBe("ace");
  await touch("touchMove", [first, { x: 650, y: 400, id: 2 }]);
  expect(await page.locator('[data-drag-ghost]').evaluate(el => (el as HTMLElement).style.left)).toBe(`${first.x}px`);
  await touch("touchEnd", [{ x: 650, y: 400, id: 2 }]); expect(await drops()).toHaveLength(0);
  await touch("touchMove", [{ x: 450, y: 220, id: 1 }]); await touch("touchEnd", []);
  expect((await drops())[0].payload.id).toBe("ace"); await idle();
});

test("secondary click does not start a drag; mouse movement and card rotation remain usable", async () => {
  const start = await center('[data-card="ace"]');
  await page.mouse.click(start.x, start.y, { button: "right" }); expect(await page.locator('[data-drag-ghost]').count()).toBe(0);
  expect(await drops()).toHaveLength(0);
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(450, 220);
  await page.mouse.click(450, 220, { button: "right" });
  expect(await page.locator('[data-drag-ghost]').evaluate(el => (el as HTMLElement).style.transform)).toContain("90deg");
  await page.mouse.up(); expect((await drops())[0].payload.rotation).toBe(1); await idle();
});

test("movement within one target paints the ghost without replacing drag state", async () => {
  const start = await center('[data-card="ace"]');
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.evaluate(() => { (window as any).dragStateBefore = (window as any).board.state(); });
  await page.mouse.move(start.x + 10, start.y + 10);
  expect(await page.evaluate(() => (window as any).board.state() === (window as any).dragStateBefore)).toBe(true);
  expect(await page.locator('[data-drag-ghost]').evaluate(el => (el as HTMLElement).style.left)).toBe(`${start.x + 10}px`);
  await page.keyboard.press("Escape"); await page.mouse.up(); await idle();
});

test("inventory keyboard move and right-click split keep their real command consequences", async () => {
  await page.locator('[data-slot="0"]').focus(); await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowRight"); await page.keyboard.press("Enter");
  expect((await slots())[0]).toBeNull(); expect((await slots())[4]).toEqual({ itemId: "sword", count: 1 });
  await page.locator('[data-slot="3"]').click({ button: "right" });
  expect((await slots())[3]).toEqual({ itemId: "potion", count: 1 });
  expect((await slots())[0]).toEqual({ itemId: "potion", count: 1 }); await idle();
});
