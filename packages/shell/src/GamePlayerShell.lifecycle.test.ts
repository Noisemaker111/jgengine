import { afterAll, beforeAll, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdir, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { buildBrowserFixture, findChromeExecutable } from "../../../scripts/browser-lib";

const scratch = resolve(import.meta.dir, "../../../.scratch/shell-lifecycle-test");
let browser: Browser, page: Page, server: ReturnType<typeof Bun.serve>;
const errors: string[] = [];

beforeAll(async () => {
  await rm(scratch, { recursive: true, force: true });
  await mkdir(`${scratch}/node_modules/@jgengine`, { recursive: true });
  for (const peer of ["react", "react-dom"]) await symlink(resolve(import.meta.dir, "../../react/node_modules", peer), `${scratch}/node_modules/${peer}`, "dir");
  await mkdir(`${scratch}/node_modules/@react-three`, { recursive: true });
  for (const peer of ["@react-three/fiber", "@react-three/drei", "three", "three-stdlib"]) await symlink(resolve(import.meta.dir, "../node_modules", peer), `${scratch}/node_modules/${peer}`, "dir");
  for (const pkg of ["core", "react", "shell"]) {
    const pack = JSON.parse(execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", scratch], { cwd: resolve(import.meta.dir, "../../", pkg), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }))[0];
    await mkdir(`${scratch}/node_modules/@jgengine/${pkg}`, { recursive: true });
    execFileSync("tar", ["-xzf", pack.filename, "-C", `node_modules/@jgengine/${pkg}`, "--strip-components=1"], { cwd: scratch });
  }
  await Bun.write(`${scratch}/fixture.tsx`, `
    import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
    import {GamePlayerShell} from '@jgengine/shell/GamePlayerShell';import {defineGame} from '@jgengine/shell/defineGame';
    import {createEmptyEditorDocument} from '@jgengine/core/editor/document';import {createAssetCatalog} from '@jgengine/core/scene/assetCatalog';
    const document=createEmptyEditorDocument();document.simulation={
      weather:{ambient:{mode:'rain',intensity:1}},
      emitters:[{id:'smoke',position:{x:0,y:1,z:0},config:{max:4,rate:1}}],
      fires:[{id:'fire',position:{x:0,y:0,z:0},config:{cols:1,rows:1,cellSize:1},ignitions:[{col:0,row:0}]}],
      habitats:[{id:'birds',species:'native',position:{x:0,y:2,z:0},radius:2,count:1,seed:1,role:'cosmetic',steering:{maxSpeed:1,separationRadius:1,neighborRadius:2}}]
    };
    const authored=JSON.stringify(document),records=[],removers=new Map();
    const make=id=>defineGame({name:id,editorLayers:document,assets:createAssetCatalog(),presentation:'hud',camera:{rig:'none'},server:{mode:'single'},save:'none',devtools:false,settings:false,
      GameUI:()=> <div aria-label="Active game">{id}</div>,
      loop:{onInit(ctx){const record={id,ctx,calls:0,sameContext:true,stageCalls:0,removedStage:true};records.push(record);ctx.environment.watch({id:'surface',x:0,z:0});removers.set(ctx,ctx.sim.addStage({id:'game-owned',phase:'beforeMovement',run(){record.stageCalls++}}));ctx.sim.runStages('beforeMovement',0.1);ctx.sim.advance(0.1,dt=>ctx.sim.runStages('afterTick',dt));if(id==='init-failure')throw new Error('Expected init failure')},
        onNewPlayer(){if(id==='player-failure')throw new Error('Expected player failure')},
        onDispose(ctx){const record=records.find(value=>value.ctx===ctx);record.calls++;record.sameContext=record.ctx===ctx;removers.get(ctx)?.();const before=record.stageCalls;ctx.sim.runStages('beforeMovement',0.1);record.removedStage=record.stageCalls===before;if(record.id==='dispose-failure')throw new Error('Expected dispose failure')}
      }});
    const games=Object.fromEntries(['first','second','init-failure','player-failure','ready-failure','dispose-failure'].map(id=>[id,make(id)]));
    function summaries(){return {authoredUnchanged:JSON.stringify(document)===authored,records:records.map(record=>{
      const state=record.ctx.environment.snapshot(),before=JSON.stringify(state);if(record.calls)record.ctx.sim.runStages('afterTick',0.1);
      return {id:record.id,calls:record.calls,sameContext:record.sameContext,removedStage:record.removedStage,watched:state.watched.length,surfaces:state.surfaces.surfaces.length,fires:state.fires.length,flocks:state.flocks.length,emitters:record.ctx.particles.emitters().length,inert:JSON.stringify(record.ctx.environment.snapshot())===before}
    })}}
    function Fixture(){const[active,setActive]=useState(null),[report,setReport]=useState(null);return <>
      <div>{Object.keys(games).map(id=><button key={id} onClick={()=>setActive(games[id])}>Mount {id}</button>)}<button onClick={()=>setActive(null)}>Unmount game</button><button onClick={()=>setReport(summaries())}>Inspect lifecycle</button></div>
      <output aria-label="Lifecycle report">{JSON.stringify(report)}</output>
      <div style={{height:300}}>{active&&<GamePlayerShell playable={active} onContextReady={()=>{if(active.game.name==='ready-failure')throw new Error('Expected ready failure')}}/>}</div>
    </>};createRoot(window.document.getElementById('root')).render(<Fixture/>);
  `);
  const script = buildBrowserFixture(`${scratch}/fixture.tsx`);
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => new URL(request.url).pathname === "/fixture.js" ? new Response(script, { headers: { "Content-Type": "text/javascript" } }) : new Response('<div id="root"></div><script type="module" src="/fixture.js"></script>', { headers: { "Content-Type": "text/html" } }) });
  browser = await chromium.launch({ executablePath: findChromeExecutable(), headless: true, args: ["--no-sandbox"] });
  page = await browser.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.port}`);
}, 60000);

afterAll(async () => { await browser?.close(); server?.stop(true); await rm(scratch, { recursive: true, force: true }); });
async function report() {
  await page.getByRole("button", { name: "Inspect lifecycle", exact: true }).click();
  return JSON.parse(await page.getByLabel("Lifecycle report", { exact: true }).textContent() ?? "null");
}
function expectRetired(record: Record<string, unknown>) {
  expect(record).toMatchObject({ calls: 1, sameContext: true, removedStage: true, watched: 0, surfaces: 0, fires: 0, flocks: 0, emitters: 0, inert: true });
}

test("mounted shell retires each owned context exactly once on replacement and unmount", async () => {
  await page.getByRole("button", { name: "Mount first", exact: true }).click();
  await page.getByLabel("Active game", { exact: true }).filter({ hasText: "first" }).waitFor();
  let state = await report();
  expect(state.records).toHaveLength(1);
  expect(state.records[0]).toMatchObject({ calls: 0, watched: 1, surfaces: 1, fires: 1, flocks: 1, emitters: 1 });
  await page.getByRole("button", { name: "Mount second", exact: true }).click();
  await page.getByLabel("Active game", { exact: true }).filter({ hasText: "second" }).waitFor();
  state = await report();
  expect(state.records).toHaveLength(2);
  expectRetired(state.records[0]);
  expect(state.records[1].calls).toBe(0);
  await page.getByRole("button", { name: "Unmount game", exact: true }).click();
  state = await report();
  state.records.forEach(expectRetired);
  expect(state.authoredUnchanged).toBe(true);
  expect(errors).toEqual([]);
}, 30000);

test("partial initialization and throwing game disposal release authority without a second retirement", async () => {
  for (const id of ["init-failure", "player-failure", "ready-failure", "dispose-failure"]) {
    await page.getByRole("button", { name: `Mount ${id}`, exact: true }).click();
    if (id === "dispose-failure") await page.getByLabel("Active game", { exact: true }).waitFor();
    let state = await report();
    expect(state.records.at(-1).id).toBe(id);
    if (id !== "dispose-failure") expectRetired(state.records.at(-1));
    await page.getByRole("button", { name: "Unmount game", exact: true }).click();
    state = await report();
    state.records.forEach(expectRetired);
    expect(state.authoredUnchanged).toBe(true);
  }
  expect(errors).toEqual([]);
}, 30000);
