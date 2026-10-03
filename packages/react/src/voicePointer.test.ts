import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdir, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type CDPSession, type Page } from "playwright-core";
import { buildBrowserFixture, findChromeExecutable } from "../../../scripts/browser-lib";

const root = resolve(import.meta.dir, "../../..");
const scratch = `${root}/.scratch/voice-pointer-test`;
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
    import React,{useEffect,useState} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
    import {useVoice,PushToTalkButton} from '@jgengine/react/voice';
    const listeners=new Map();for(const [source,types]of [[window,['mouseup','pointercancel','blur']],[document,['visibilitychange','pointerlockchange']]]){const add=source.addEventListener.bind(source),remove=source.removeEventListener.bind(source);source.addEventListener=(type,listener,options)=>{if(types.includes(type)&&new Error().stack.split('\\n')[2]?.includes('/fixture.js')){const set=listeners.get(type)??new Set();set.add(listener);listeners.set(type,set)}add(type,listener,options)};source.removeEventListener=(type,listener,options)=>{listeners.get(type)?.delete(listener);remove(type,listener,options)}}
    const track={enabled:true,stop(){}},stream={id:'fixture-mic',getAudioTracks:()=>[track],getTracks:()=>[track]},capture=async()=>stream,counts={down:0,up:0};
    function Fixture(){const[visible,setVisible]=useState(true),voice=useVoice({getUserMedia:capture,mode:new URLSearchParams(location.search).get('mode')??'hold'});
      useEffect(()=>{void voice.requestMic()},[]);
      window.fixture={snapshot:()=>({transmitting:voice.transmitting,mode:voice.mode,status:voice.status,enabled:track.enabled,listeners:[...listeners.values()].reduce((sum,set)=>sum+set.size,0),...counts}),hide:()=>flushSync(()=>setVisible(false)),show:()=>flushSync(()=>setVisible(true)),externalDown:()=>flushSync(()=>voice.keyDown()),externalUp:()=>flushSync(()=>voice.keyUp())};
      return <div style={{position:'absolute',left:40,top:40}}>{visible&&<PushToTalkButton voice={{...voice,keyDown(){counts.down++;voice.keyDown()},keyUp(){counts.up++;voice.keyUp()}}}>Crew radio</PushToTalkButton>}<button id="outside" style={{position:'fixed',left:700,top:500}}>Other control</button></div>;
    }createRoot(document.getElementById('root')).render(<Fixture/>);
  `);
  const script = buildBrowserFixture(`${scratch}/fixture.tsx`);
  Bun.gc(true);
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => new URL(request.url).pathname === "/fixture.js" ? new Response(script, { headers: { "Content-Type": "text/javascript" } }) : new Response('<style>[data-push-to-talk]{width:220px;height:80px;touch-action:none}</style><div id="root"></div><script type="module" src="/fixture.js"></script>', { headers: { "Content-Type": "text/html" } }) });
  browser = await chromium.launch({ executablePath: findChromeExecutable(), headless: true, args: ["--no-sandbox"] });
  page = await browser.newPage({ viewport: { width: 900, height: 600 }, hasTouch: true });
}, 30000);
beforeEach(async () => { input = await page.context().newCDPSession(page); });
afterEach(async () => { await input?.detach(); });
afterAll(async () => {
  await browser?.close(); server?.stop(true); await rm(scratch, { recursive: true, force: true });
  // Retire bundled build transports before another browser fixture starts.
  Bun.gc(true);
});
async function open(mode = "hold") {
  await page.goto(`http://127.0.0.1:${server.port}/?mode=${mode}`);
  await page.getByRole("button", { name: "Crew radio", exact: true }).waitFor({ timeout: 2000 });
  await page.waitForFunction(() => { const state = (window as any).fixture.snapshot(); return state.enabled === state.transmitting; }, undefined, { timeout: 1000 });
}
async function snapshot() { return page.evaluate(() => (window as any).fixture.snapshot()); }
async function center(id = 1) {
  const box = await page.getByRole("button", { name: "Crew radio", exact: true }).boundingBox();
  if (box === null) throw new Error("Missing radio button");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, id };
}
async function touch(type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel", points: { x: number; y: number; id: number }[]) {
  await input.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
}
async function talking(transmitting: boolean) {
  await page.waitForFunction(expected => { const state = (window as any).fixture.snapshot(); return state.transmitting === expected && state.enabled === expected; }, transmitting, { timeout: 1000 });
  const state = await snapshot();
  expect(state.transmitting).toBe(transmitting); expect(state.enabled).toBe(transmitting);
}

test("native touch release and cancellation gate the captured microphone track once", async () => {
  await open(); const point = await center();
  await touch("touchStart", [point]); await talking(true); await touch("touchEnd", []); await talking(false);
  await touch("touchStart", [point]); await talking(true); await touch("touchCancel", []); await talking(false);
  expect(await snapshot()).toMatchObject({ down: 2, up: 2 });
});
test("right mouse buttons cannot begin push-to-talk", async () => {
  await open(); const point = await center(); await page.mouse.move(point.x, point.y);
  await page.mouse.down({ button: "right" }); await talking(false); await page.mouse.up({ button: "right" });
  expect(await snapshot()).toMatchObject({ down: 0, up: 0 });
});
test("a secondary touch cannot toggle or release the radio owner's session", async () => {
  await open(); const owner = await center(), second = { ...owner, x: owner.x + 30, id: 2 };
  await touch("touchStart", [owner]); await touch("touchStart", [owner, second]);
  await touch("touchEnd", [second]); await talking(true); expect(await snapshot()).toMatchObject({ down: 1, up: 0 });
  await touch("touchEnd", []); await talking(false); expect(await snapshot()).toMatchObject({ down: 1, up: 1 });
});
for (const key of ["Enter", "Space"]) {
  test(`${key} holds the focused radio without repeated activation`, async () => {
    await open(); await page.getByRole("button", { name: "Crew radio", exact: true }).focus();
    await page.keyboard.down(key); await talking(true); await page.keyboard.down(key);
    expect(await snapshot()).toMatchObject({ down: 1, up: 0 });
    await page.keyboard.up(key); await talking(false); expect(await snapshot()).toMatchObject({ down: 1, up: 1 });
  });
}
for (const interruption of ["blur", "hidden", "unmount", "focus"]) {
  test(`${interruption} retires only an owned radio activation`, async () => {
    await open(); const point = await center();
    if (interruption === "focus") { await page.getByRole("button", { name: "Crew radio", exact: true }).focus(); await page.keyboard.down("Space"); }
    else { await page.mouse.move(point.x, point.y); await page.mouse.down(); }
    await talking(true);
    await page.evaluate(reason => {
      if (reason === "blur") window.dispatchEvent(new Event("blur"));
      if (reason === "hidden") { Object.defineProperty(document, "hidden", { value: true, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); }
      if (reason === "unmount") (window as any).fixture.hide();
      if (reason === "focus") document.querySelector<HTMLElement>("#outside")!.focus();
    }, interruption);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    await talking(false); expect(await snapshot()).toMatchObject({ down: 1, up: 1 });
    if (interruption === "focus") await page.keyboard.up("Space"); else await page.mouse.up();
    expect(await snapshot()).toMatchObject({ up: 1 });
    await page.evaluate(() => (window as any).fixture.externalDown()); await talking(true);
    await page.evaluate(() => window.dispatchEvent(new Event("blur"))); await talking(true);
    expect(await snapshot()).toMatchObject({ up: 1 });
  });
}
test("native capture loss ends an owned touch before release", async () => {
  await open(); const point = await center(), button = page.getByRole("button", { name: "Crew radio", exact: true });
  await button.evaluate(element => {
    const capture = { owner: 0, got: false, lost: false }; (window as any).capture = capture;
    element.addEventListener("pointerdown", event => { capture.owner = (event as PointerEvent).pointerId; }, { once: true });
    element.addEventListener("gotpointercapture", event => { capture.got = (event as PointerEvent).pointerId === capture.owner && event.isTrusted; }, { once: true });
    element.addEventListener("lostpointercapture", event => { capture.lost = (event as PointerEvent).pointerId === capture.owner && event.isTrusted; }, { once: true });
  });
  await touch("touchStart", [point]); await touch("touchMove", [{ ...point, x: point.x + 1 }]);
  await page.waitForFunction(() => (window as any).capture.got, undefined, { timeout: 1000 }); await talking(true);
  await button.evaluate(element => element.releasePointerCapture((window as any).capture.owner));
  await touch("touchMove", [{ ...point, x: point.x + 2 }]);
  await page.waitForFunction(() => (window as any).capture.lost, undefined, { timeout: 1000 }); await talking(false);
  await touch("touchEnd", []); expect(await snapshot()).toMatchObject({ down: 1, up: 1 });
});
test("auxiliary mouse release preserves the primary radio hold", async () => {
  await open(); const point = await center(); await page.mouse.move(point.x, point.y); await page.mouse.down();
  await page.mouse.down({ button: "right" }); await page.mouse.up({ button: "right" }); await talking(true);
  await page.mouse.up(); await talking(false); expect(await snapshot()).toMatchObject({ down: 1, up: 1 });
});
test("primary mouse release ends the radio hold while a secondary button remains", async () => {
  await open(); const point = await center(); await page.mouse.move(point.x, point.y); await page.mouse.down();
  await page.mouse.down({ button: "right" }); await page.mouse.up(); await talking(false);
  await page.mouse.up({ button: "right" }); expect(await snapshot()).toMatchObject({ down: 1, up: 1 });
});
test("an unrelated keyboard release cannot end the radio owner's hold", async () => {
  await open(); await page.getByRole("button", { name: "Crew radio", exact: true }).focus();
  await page.keyboard.down("Space"); await page.keyboard.down("Enter"); await page.keyboard.up("Enter"); await talking(true);
  expect(await snapshot()).toMatchObject({ down: 1, up: 0 });
  await page.keyboard.up("Space"); await talking(false);
});
test("a button press cannot claim an existing external hold session", async () => {
  await open(); await page.evaluate(() => (window as any).fixture.externalDown());
  const point = await center(); await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.mouse.up(); await talking(true);
  await page.evaluate(() => (window as any).fixture.hide()); await talking(true);
  expect(await snapshot()).toMatchObject({ down: 0, up: 0, listeners: 0 });
});
test("unmount removes native listeners and a remounted radio can hold again", async () => {
  await open(); const point = await center();
  expect(await snapshot()).toMatchObject({ listeners: 0 });
  await page.mouse.move(point.x, point.y); await page.mouse.down(); expect((await snapshot()).listeners).toBeGreaterThan(0);
  await page.evaluate(() => (window as any).fixture.hide()); await talking(false);
  expect(await snapshot()).toMatchObject({ down: 1, up: 1, listeners: 0 }); await page.mouse.up();
  await page.evaluate(() => (window as any).fixture.show());
  await page.mouse.down(); await talking(true); await page.mouse.up(); await talking(false);
  expect(await snapshot()).toMatchObject({ down: 2, up: 2, listeners: 0 });
});
test("toggle mode changes once per pointer or keyboard activation and survives retirement", async () => {
  await open("toggle"); const owner = await center(), second = { ...owner, x: owner.x + 30, id: 2 };
  await touch("touchStart", [owner]); await touch("touchStart", [owner, second]); await talking(true);
  await touch("touchCancel", []); await talking(true); expect(await snapshot()).toMatchObject({ down: 1, up: 1 });
  await page.getByRole("button", { name: "Crew radio", exact: true }).focus(); await page.keyboard.down("Enter"); await page.keyboard.down("Enter");
  await page.keyboard.up("Enter"); await talking(false); expect(await snapshot()).toMatchObject({ down: 2, up: 2 });
  await page.mouse.click(owner.x, owner.y); await talking(true);
  await page.mouse.click(owner.x, owner.y); await talking(false);
  await page.getByRole("button", { name: "Crew radio", exact: true }).focus(); await page.keyboard.down("Space"); await talking(true);
  await page.evaluate(() => (window as any).fixture.hide()); await talking(true); await page.keyboard.up("Space");
  expect(await snapshot()).toMatchObject({ down: 5, up: 5, listeners: 0 });
});
test("leaving an owned mouse radio hold retires it before outside release", async () => {
  await open(); const point = await center(); await page.mouse.move(point.x, point.y); await page.mouse.down(); await talking(true);
  await page.mouse.move(850, 550); await talking(false); await page.mouse.up();
  expect(await snapshot()).toMatchObject({ down: 1, up: 1 });
});
test("open mic remains caller-owned through button release and suspension", async () => {
  await open("openMic"); await talking(true);
  const point = await center(); await page.mouse.move(point.x, point.y); await page.mouse.down();
  await page.evaluate(() => window.dispatchEvent(new Event("blur"))); await talking(true);
  await page.mouse.up(); await page.evaluate(() => (window as any).fixture.hide()); await talking(true);
});
