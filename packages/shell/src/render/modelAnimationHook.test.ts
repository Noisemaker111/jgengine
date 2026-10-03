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
