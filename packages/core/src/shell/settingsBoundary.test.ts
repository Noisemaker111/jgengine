import { afterAll, afterEach, beforeAll, beforeEach, expect, setDefaultTimeout, test } from "bun:test";
import { mkdir, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { type Browser, type Page } from "playwright-core";
import { buildBrowserFixture } from "../../../../scripts/browser-lib";
import { sharedChromium } from "../../../../scripts/sharedChromium";
import { gotoFixture } from "../../../../scripts/browser-test-fixture";

setDefaultTimeout(30_000);

const root = resolve(import.meta.dir, "../../../..");
const scratch = `${root}/.scratch/settings-boundary-test`;
let browser: Browser, page: Page, server: ReturnType<typeof Bun.serve>;
beforeAll(async () => {
  const dir = scratch;
  await rm(dir, { recursive: true, force: true });
  await mkdir(`${dir}/node_modules`, { recursive: true });

  for (const peer of ["three", "three-stdlib"]) await symlink(resolve(import.meta.dir, "../../node_modules", peer), `${dir}/node_modules/${peer}`, "junction");
  await Bun.write(`${dir}/fixture.tsx`, `
    import React from '@jgengine/core/ui/jsx';import {createRoot} from '@jgengine/core/ui/jsx/client.view';
    import {defineGame} from '@jgengine/core/shell/gameKit.draw';import {ShellHudPresentation} from '@jgengine/core/hud/ShellHudPresentation.draw';
    import {useSettings} from '@jgengine/core/settings/settings.view';
    import {createGameContext} from '@jgengine/core/runtime/gameContext';import {createActionStateTracker} from '@jgengine/core/input/actionBindings';
    import {createSettingsStore,BUILT_IN_SETTING_CATEGORIES} from '@jgengine/core/settings/settingsModel';
    import {playControlsActive} from '@jgengine/core/game/controlGate';import {createAudioEngine} from '@jgengine/core/audio/audioEngine.view';
    const mode=new URLSearchParams(location.search).get('mode');const calls=[];const errors=[];
    const store=createSettingsStore();if(mode==='saved'&&!sessionStorage.getItem('settings-seeded')){store.set('survey.hints',false);sessionStorage.setItem('settings-seeded','true');}
    const settings=mode==='disabled'?false:mode==='default'?undefined:{variant:'sheet',surface:mode==='quick'?'quick':false,
      hide:mode==='quick'?[]:BUILT_IN_SETTING_CATEGORIES,
      categories:mode==='saved'?[{id:'survey',label:'Survey'}]:[],
      extra:mode==='saved'?[{id:'survey.hints',label:'Hints',category:'survey',kind:'toggle',default:true}]:[],
      actions:[{id:'restart',label:'Restart survey',run:ctx=>calls.push(ctx)}]};
    let snapshot,controller;function Hud(){const s=useSettings();controller=s;snapshot={variant:s.variant,surface:s.surface,open:s.isOpen,actions:s.actions.map(a=>a.id),categories:s.categories.map(c=>c.id)};return <output id="ready">Ready</output>;}
    const playable=defineGame({name:'Configured survey settings',multiplayer:'off',chrome:{presentation:'hud',settings},GameUI:Hud});
    const ctx=createGameContext({definition:playable.game,content:playable.content,player:{userId:'settings-user',isNew:true}});
    const audio=createAudioEngine();const root=createRoot(document.getElementById('root'));
    const row=(id)=>controller.categories.flatMap(c=>c.rows).find(r=>r.id===id);
    window.fixture={snapshot:()=>snapshot,open:()=>controller.open(),close:()=>controller.close(),run:(id)=>controller.actions.find(a=>a.id===id).run(),hints:()=>row('survey.hints')?.value,setHints:(v)=>row('survey.hints').set(v),calls:()=>calls.length,sameContext:()=>calls.every(c=>c===ctx),active:()=>playControlsActive(ctx),saved:()=>store.get('survey.hints',true),configDefault:()=>settings?.extra?.[0]?.default,errors:()=>errors,unmount:()=>root.unmount()};
    root.render(<ShellHudPresentation playable={playable} ctx={ctx} multiplayer={null} serverIdRef={{current:null}}
      tracker={createActionStateTracker({})} pointerAxisRef={{current:null}} gateRef={{current:false}} wrapperRef={{current:null}}
      f2HeldRef={{current:false}} yawRef={{current:0}} pitchRef={{current:0}} touchScheme={null} touchSink={{onCodeDown:()=>{},onCodeUp:()=>{}}}
      orientationGate={false} orientationGateEl={null} coarsePointer={false} diagnostics={[]} devtoolsEnabled={false}
      devtoolsOpen={false} setDevtoolsOpen={()=>{}} reportRuntimeError={(e,p)=>errors.push(p+': '+String(e))}
      trackPointerAxis={()=>{}} deactivatePointerAxis={()=>{}} onPointerResumeAudio={()=>{}} settingsStore={store}
      bindingOverrides={{}} rebindAction={()=>{}} resetActionBinding={()=>{}} audioEngine={audio}/>);
  `);
  const script = buildBrowserFixture(`${dir}/fixture.tsx`);
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => new URL(request.url).pathname === "/fixture.js" ? new Response(script, { headers: { "Content-Type": "text/javascript" } }) : new Response('<div id="root"></div><script type="module" src="/fixture.js"></script>', { headers: { "Content-Type": "text/html" } }) });
  Bun.gc(true);
  browser = await sharedChromium(["--no-sandbox"]);
}, 60_000);
beforeEach(async () => { page = await browser.newPage(); });
afterEach(async () => { await page?.close(); });
afterAll(async () => { await browser?.close(); server?.stop(true); await rm(scratch, { recursive: true, force: true }); Bun.gc(true); });
async function open(mode: string) {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await gotoFixture(page, `http://127.0.0.1:${server.port}/?mode=${mode}`, () => page.locator("#ready").waitFor());
  expect(errors).toEqual([]); expect(await page.evaluate(() => (window as any).fixture.errors())).toEqual([]);
}
// Games draw their settings on Rune from this controller; these check what it hands them.
test("configured actions run against the game's real context, and open settings hold play", async () => {
  await open("actions");
  expect(await page.evaluate(() => (window as any).fixture.snapshot())).toEqual({ variant: "sheet", surface: false, open: false, actions: ["restart"], categories: [] });
  await page.evaluate(() => (window as any).fixture.open());
  expect(await page.evaluate(() => (window as any).fixture.snapshot().open)).toBe(true);
  expect(await page.evaluate(() => (window as any).fixture.active())).toBe(false);
  await page.evaluate(() => (window as any).fixture.run("restart"));
  expect(await page.evaluate(() => (window as any).fixture.calls())).toBe(1);
  expect(await page.evaluate(() => (window as any).fixture.sameContext())).toBe(true);
  await page.evaluate(() => (window as any).fixture.close());
  expect(await page.evaluate(() => (window as any).fixture.active())).toBe(true);
});
test("a configured quick surface reaches the controller", async () => {
  await open("quick");
  expect((await page.evaluate(() => (window as any).fixture.snapshot())).surface).toBe("quick");
});
test("explicit settings false removes settings entries and categories", async () => {
  await open("disabled");
  expect(await page.evaluate(() => (window as any).fixture.snapshot())).toEqual({ variant: "panel", surface: false, open: false, actions: [], categories: [] });
});
test("omitted settings keep the built-in categories without forcing a quick surface", async () => {
  await open("default");
  const snapshot = await page.evaluate(() => (window as any).fixture.snapshot());
  expect(snapshot.categories.length).toBeGreaterThan(0);
  expect(snapshot.surface).toBe(false);
  expect(snapshot.actions).toEqual([]);
});
test("saved player values override configured defaults and survive a mounted shell replacement", async () => {
  await open("saved");
  expect((await page.evaluate(() => (window as any).fixture.snapshot())).categories).toEqual(["survey"]);
  expect(await page.evaluate(() => (window as any).fixture.hints())).toBe(false);
  await page.evaluate(() => (window as any).fixture.setHints(true));
  expect(await page.evaluate(() => (window as any).fixture.saved())).toBe(true);
  expect(await page.evaluate(() => (window as any).fixture.configDefault())).toBe(true);
  await page.evaluate(() => (window as any).fixture.setHints(false));
  expect(await page.evaluate(() => (window as any).fixture.saved())).toBe(false);
  await page.evaluate(() => (window as any).fixture.unmount());
  await page.reload(); await page.locator("#ready").waitFor();
  expect(await page.evaluate(() => (window as any).fixture.saved())).toBe(false);
  expect(await page.evaluate(() => (window as any).fixture.configDefault())).toBe(true);
});
