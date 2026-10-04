import { afterAll, beforeAll, expect, test } from "bun:test";
import { cp, mkdir, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser } from "playwright-core";
import { buildBrowserFixture, findChromeExecutable } from "../../../../scripts/browser-lib";

// Exercises the real React hook and Fiber frame subscription without claiming rendered appearance.
// The fixture imports built public packages and poses the repository's actual animated Knight.
const scratch = resolve(import.meta.dir, "../../../../.scratch/model-animation-hook-test");
let browser: Browser, server: ReturnType<typeof Bun.serve>;
beforeAll(async () => {
  await rm(scratch, { recursive: true, force: true });
  await mkdir(`${scratch}/node_modules/@jgengine`, { recursive: true });
  await mkdir(`${scratch}/node_modules/@react-three`, { recursive: true });
  for (const pkg of ["react", "react-dom", "three", "@react-three/fiber"]) {
    const owner = pkg === "react-dom" ? "react" : "shell";
    await symlink(resolve(import.meta.dir, "../../../../packages", owner, "node_modules", pkg), `${scratch}/node_modules/${pkg}`, "dir");
  }
  for (const pkg of ["react", "shell", "core"]) {
    const destination = `${scratch}/node_modules/@jgengine/${pkg}`;
    await mkdir(destination, { recursive: true });
    await cp(resolve(import.meta.dir, "../../../../packages", pkg, "package.json"), `${destination}/package.json`);
    await cp(resolve(import.meta.dir, "../../../../packages", pkg, "dist"), `${destination}/dist`, { recursive: true });
  }
  await Bun.write(`${scratch}/fixture.tsx`, `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {flushSync} from 'react-dom';
    import {context as FiberContext} from '@react-three/fiber';
    import {GameProvider} from '@jgengine/react/provider';
    import {useModelAnimation} from '@jgengine/shell/render/useModelAnimation';
    import {locomotionGraph} from '@jgengine/core/anim/locomotionGraph';
    import {AnimationMixer} from 'three';
    import {createGameContext} from '@jgengine/core/runtime/gameContext';
    import {defineGameDefinition} from '@jgengine/core/game/defineGame';
    import {createAssetCatalog} from '@jgengine/core/scene/assetCatalog';
    import {seededRng} from '@jgengine/core/random/rng';
    import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
    import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
    import {clone} from 'three/examples/jsm/utils/SkeletonUtils.js';
    const gltfPromise=fetch('/knight.glb').then(r=>r.arrayBuffer()).then(bytes=>new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes,''));
    const variants=['1H_Melee_Attack_Chop','1H_Melee_Attack_Slice_Diagonal','1H_Melee_Attack_Slice_Horizontal'];
    const config={states:{idle:'Idle',walk:'Walking_A',run:'Running_A'},oneShots:{attack:variants}};
    function Model({scene,id,animation}) { useModelAnimation(scene,gltf.animations,animation,id); return null; }
    let gltf;
    const values=scene=>{const out=[];scene.traverse(node=>{if(node.isBone)out.push(...node.position.toArray(),...node.quaternion.toArray())});return out};
    window.run=async(count,peerNoise=false,animation=config)=>{
      gltf=await gltfPromise;
      const rng=seededRng('simulation-world');
      const ctx=createGameContext({definition:defineGameDefinition({name:'hook-proof',assets:createAssetCatalog(),multiplayer:'off'}),content:{},player:{userId:'player',isNew:true},rng});
      const initial=rng.state();const expected=seededRng('unused');expected.restore(initial);
      const scenes=Array.from({length:count},()=>clone(gltf.scene));const bind=scenes.map(values);
      scenes.forEach((_,i)=>ctx.scene.entity.spawn('hero',{id:'actor'+i,position:[0,0,0]}));
      const callbacks=new Set();const state={invalidate:()=>{},internal:{subscribe:ref=>{callbacks.add(ref);return()=>callbacks.delete(ref)}}};
      const store=selector=>selector(state);store.getState=()=>state;
      const element=document.createElement('div');document.body.append(element);const root=createRoot(element);
      flushSync(()=>root.render(<GameProvider context={ctx}><FiberContext.Provider value={store}>{scenes.map((scene,i)=><Model key={i} scene={scene} id={'actor'+i} animation={animation}/>)}</FiberContext.Provider></GameProvider>));
      const frame=delta=>{for(const ref of callbacks)ref.current(state,delta)};
      const attack=id=>ctx.game.events.emit('entity.animation',{instanceId:id,event:'attack'});
      frame(0);
      const poses=[];
      for(let n=0;n<6;n++){
        if(peerNoise)for(let i=1;i<count;i++){attack('actor'+i);frame(0);frame(.03)}
        if(count)attack('actor0');frame(0);frame(.2);
        if(count)poses.push(values(scenes[0]));
        frame(2); // finish the one-shot and its return fade before the next independent sample
      }
      const final=scenes.map(values);const cursor=rng.state();const next=rng();
      flushSync(()=>root.unmount());element.remove();
      return {initial,cursor,next,expected:expected(),poses,bind,final,subscriptionsAfterUnmount:callbacks.size};
    };
    window.continuity=async(freshEachRender,explicitGraph=false,retune=false,checkPriority=false)=>{
      gltf=await gltfPromise;
      const scene=clone(gltf.scene);
      const ctx=createGameContext({definition:defineGameDefinition({name:'continuity-proof',assets:createAssetCatalog(),multiplayer:'off'}),content:{},player:{userId:'player',isNew:true}});
      ctx.scene.entity.spawn('hero',{id:'actor0',position:[0,0,0]});
      const config={states:{idle:'Idle',walk:'Walking_A',run:'Running_A'},oneShots:{attack:variants}};
      const animation=explicitGraph?{graph:locomotionGraph({...config.states,oneShots:config.oneShots})}:config;
      const callbacks=new Set();const state={invalidate:()=>{},internal:{subscribe:ref=>{callbacks.add(ref);return()=>callbacks.delete(ref)}}};
      const store=selector=>selector(state);store.getState=()=>state;
      const element=document.createElement('div');document.body.append(element);const root=createRoot(element);
      let active=animation;let uncacheCount=0;const originalUncache=AnimationMixer.prototype.uncacheRoot;
      AnimationMixer.prototype.uncacheRoot=function(scene){uncacheCount++;return originalUncache.call(this,scene)};
      const render=()=>flushSync(()=>root.render(<GameProvider context={ctx}><FiberContext.Provider value={store}><Model scene={scene} id='actor0' animation={freshEachRender?JSON.parse(JSON.stringify(active)):active}/></FiberContext.Provider></GameProvider>));
      const frame=delta=>{for(const ref of callbacks)ref.current(state,delta)};
      const poses=[];render();frame(0);
      for(let i=0;i<30;i++){
        ctx.scene.entity.setPose('actor0',{position:[0,0,(i+1)/60]});
        if(i===8||i===20)ctx.game.events.emit('entity.animation',{instanceId:'actor0',event:'attack'});
        render();frame(1/60);poses.push(values(scene));
      }
      const cleanupBeforeRetune=uncacheCount;let retuned;
      if(retune){
        active={clip:'Idle',paused:true,time:0.1};render();frame(1);const first=values(scene);
        active.time=0.7;render();frame(1);const held=values(scene);
        frame(2);const still=values(scene);
        // An in-place nested edit is detected from the retained data snapshot too.
        active={states:{idle:'Idle',walk:'Walking_A'}};render();frame(0);
        active.states.idle='Running_A';render();frame(0.2);const edited=values(scene);
        retuned={first,held,still,edited,cleanupCount:uncacheCount};
      }
      let priority;
      if(checkPriority){
        const triggerBoth=()=>{for(const event of ['first','second'])ctx.game.events.emit('entity.animation',{instanceId:'actor0',event});frame(0);frame(0.2);return values(scene)};
        active={states:config.states,oneShots:{first:variants[0],second:variants[1]}};render();const firstOrder=triggerBoth();
        active.oneShots={second:variants[1],first:variants[0]};render();const secondOrder=triggerBoth();
        active={clip:variants[0],paused:true,time:0.2};render();const expectedFirst=values(scene);
        active={clip:variants[1],paused:true,time:0.2};render();const expectedSecond=values(scene);
        priority={firstOrder,secondOrder,expectedFirst,expectedSecond};
      }
      flushSync(()=>root.unmount());element.remove();AnimationMixer.prototype.uncacheRoot=originalUncache;
      return {poses,retuned,priority,cleanupBeforeRetune,cleanupAfterUnmount:uncacheCount,subscriptionsAfterUnmount:callbacks.size};
    };
    window.ready=true;
  `);
  const script = buildBrowserFixture(`${scratch}/fixture.tsx`);
  const knight = Bun.file(resolve(import.meta.dir, "../../../../apps/dev/public/models/kaykit-adventurers/Knight.glb"));
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => {
    const path = new URL(request.url).pathname;
    if (path === "/fixture.js") return new Response(script, { headers: { "Content-Type": "text/javascript" } });
    if (path === "/knight.glb") return new Response(knight);
    return new Response('<div id="root"></div><script type="module" src="/fixture.js"></script>', { headers: { "Content-Type": "text/html" } });
  } });
  browser = await chromium.launch({ executablePath: findChromeExecutable(), headless: true, args: ["--no-sandbox"] });
}, 30000);
afterAll(async () => { await browser?.close(); server?.stop(true); await rm(scratch, { recursive: true, force: true }); });

test("rendered model count cannot advance gameplay randomness and visual choices are reproducible per model", async () => {
  const page = await browser.newPage();
  page.on("pageerror", error => console.error("animation hook fixture:", error.message));
  await page.goto(`http://127.0.0.1:${server.port}`);
  await page.waitForFunction(() => (window as any).ready, undefined, { timeout: 5000 });
  const empty = await page.evaluate(() => (window as any).run(0));
  const one = await page.evaluate(() => (window as any).run(1));
  const many = await page.evaluate(() => (window as any).run(5, true));
  for (const result of [empty, one, many]) {
    expect(result.cursor).toBe(result.initial);
    expect(result.next).toBe(result.expected);
    expect(result.subscriptionsAfterUnmount).toBe(0);
  }
  expect(one.poses).toEqual(many.poses);
  expect(new Set(one.poses.map((pose: number[]) => JSON.stringify(pose))).size).toBeGreaterThan(1);
  await page.close();
}, 30000);

test("incomplete persisted roles retain the named clip or bind pose without choosing the GLB's first clip", async () => {
  const page = await browser.newPage();
  page.on("pageerror", error => console.error("animation hook fixture:", error.message));
  await page.goto(`http://127.0.0.1:${server.port}`);
  await page.waitForFunction(() => (window as any).ready, undefined, { timeout: 5000 });
  const bind = await page.evaluate(() => (window as any).run(1, false, { states: { run: "Running_A" } }));
  expect(bind.final).toEqual(bind.bind);
  const partial = await page.evaluate(() => (window as any).run(1, false, { clip: "Idle", states: { run: "Running_A" } }));
  const idle = await page.evaluate(() => (window as any).run(1, false, { clip: "Idle" }));
  expect(partial.final).toEqual(idle.final);
  expect(partial.final).not.toEqual(partial.bind);
  await page.close();
}, 30000);


test("equivalent fresh locomotion and graph data retain gait, pending triggers and visual variant state", async () => {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.port}`);
  await page.waitForFunction(() => (window as any).ready);
  for (const graph of [false, true]) {
    const stable = await page.evaluate(graph => (window as any).continuity(false, graph), graph);
    const fresh = await page.evaluate(graph => (window as any).continuity(true, graph), graph);
    expect(fresh.poses).toEqual(stable.poses);
    expect(new Set(fresh.poses.map((pose: number[]) => JSON.stringify(pose))).size).toBeGreaterThan(1);
    expect(fresh.cleanupBeforeRetune).toBe(0);
    expect(fresh.cleanupAfterUnmount).toBe(1);
    expect(fresh.subscriptionsAfterUnmount).toBe(0);
  }
  await page.close();
}, 30000);

test("intentional playback and nested mapping edits still reset and clean up the owned mixer", async () => {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.port}`);
  await page.waitForFunction(() => (window as any).ready);
  for (const fresh of [false, true]) {
    const result = await page.evaluate(fresh => (window as any).continuity(fresh, false, true), fresh);
    expect(result.retuned.first).not.toEqual(result.retuned.held);
    expect(result.retuned.held).toEqual(result.retuned.still);
    expect(result.retuned.edited).not.toEqual(result.retuned.held);
    expect(result.cleanupBeforeRetune).toBe(0);
    expect(result.retuned.cleanupCount).toBe(4);
    expect(result.cleanupAfterUnmount).toBe(5);
    expect(result.subscriptionsAfterUnmount).toBe(0);
  }
  await page.close();
}, 30000);


test("authored one-shot insertion order retains simultaneous trigger priority when configurations change", async () => {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.port}`);
  await page.waitForFunction(() => (window as any).ready);
  const result = await page.evaluate(() => (window as any).continuity(true, false, false, true));
  expect(result.priority.firstOrder).toEqual(result.priority.expectedFirst);
  expect(result.priority.secondOrder).toEqual(result.priority.expectedSecond);
  expect(result.priority.firstOrder).not.toEqual(result.priority.secondOrder);
  expect(result.cleanupAfterUnmount).toBe(5);
  expect(result.subscriptionsAfterUnmount).toBe(0);
  await page.close();
}, 30000);
