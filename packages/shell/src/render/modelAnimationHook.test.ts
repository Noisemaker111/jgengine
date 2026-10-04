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
  for (const pkg of ["react", "react-dom", "three", "@react-three/fiber", "@react-three/drei"]) {
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
    import {useModelAnimation,diagnoseModelAnimation} from '@jgengine/shell/render/useModelAnimation';
    import {FrameDriver} from '@jgengine/shell/drivers/FrameDriver';
    import {createActionStateTracker} from '@jgengine/core/input/actionBindings';
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
    window.discontinuity=async(mode)=>{
      gltf=await gltfPromise;
      const scene=clone(gltf.scene),id='discontinuity-actor';
      const ctx=createGameContext({definition:defineGameDefinition({name:'discontinuity-proof',assets:createAssetCatalog(),multiplayer:'off'}),content:{},player:{userId:'player',isNew:true}});
      ctx.scene.entity.spawn('hero',{id,position:[0,0,0]});
      const animation={...config,oneShots:{...config.oneShots,death:'Death_A'},...(mode==='paused'?{paused:true}:{})};
      const callbacks=new Set(),state={invalidate:()=>{},internal:{subscribe:ref=>{callbacks.add(ref);return()=>callbacks.delete(ref)}}};
      const store=selector=>selector(state);store.getState=()=>state;
      const actions=[];let cleanups=0;
      const originalAction=AnimationMixer.prototype.clipAction,originalUncache=AnimationMixer.prototype.uncacheRoot;
      AnimationMixer.prototype.clipAction=function(...args){const action=originalAction.apply(this,args);actions.push(action);return action};
      AnimationMixer.prototype.uncacheRoot=function(...args){cleanups++;return originalUncache.apply(this,args)};
      const element=document.createElement('div');document.body.append(element);const root=createRoot(element);
      const render=()=>flushSync(()=>root.render(<GameProvider context={ctx}><FiberContext.Provider value={store}><Model scene={scene} id={id} animation={animation}/></FiberContext.Provider></GameProvider>));
      const frame=delta=>{for(const ref of callbacks)ref.current(state,delta)};
      const weights=()=>Object.fromEntries(actions.map(action=>[action.getClip().name,action.getEffectiveWeight()]));
      const at=()=>ctx.scene.entity.get(id).position;
      render();for(let n=0;n<30;n++)frame(1/60);
      if(mode==='vertical')for(let n=0;n<30;n++){ctx.scene.entity.setPose(id,{position:[n*.06,0,0],dt:1/60});frame(1/60)};
      if(mode==='death'){ctx.game.playEntityAnimation(id,'death');frame(0);frame(3)};
      const before={weights:weights(),pose:values(scene)};
      let fast;
      if(mode==='retune'){
        ctx.sim.retune({snapDistance:Infinity});
        for(let n=0;n<30;n++){ctx.scene.entity.setPose(id,{position:[at()[0]+16,0,0],dt:1/60});frame(1/60)};
        fast=weights();ctx.sim.retune({snapDistance:8});
      }
      if(mode==='pending'||mode==='pending-control')ctx.game.playEntityAnimation(id,'attack');
      if(mode!=='pending-control')ctx.scene.entity.setPose(id,{position:mode==='vertical'?[at()[0],10,0]:[at()[0]+16,0,0]});
      frame(0);const zeroDelta=weights();frame(1/60);
      const after={weights:weights(),pose:values(scene)},cleanupBeforeUnmount=cleanups;
      let pending;
      if(mode==='pending'||mode==='pending-control'){frame(.25);pending={weights:weights(),pose:values(scene)}};
      let resumed;
      if(mode==='paused'){animation.paused=false;render();frame(1/60);resumed=weights()};
      flushSync(()=>root.unmount());element.remove();
      AnimationMixer.prototype.clipAction=originalAction;AnimationMixer.prototype.uncacheRoot=originalUncache;
      return{before,zeroDelta,after,fast,pending,resumed,cleanupBeforeUnmount,cleanupAfterUnmount:cleanups,subscriptionsAfterUnmount:callbacks.size};
    };
    window.clockPlayback=async(mode,binding='bound',single=false)=>{
      gltf=await gltfPromise;
      const scene=clone(gltf.scene),id='clock-actor';
      const ctx=createGameContext({definition:defineGameDefinition({name:'clock-proof',assets:createAssetCatalog(),multiplayer:'off'}),content:{},player:{userId:'player',isNew:true},rng:seededRng('clock-gameplay')});
      ctx.scene.entity.spawn('hero',{id,position:[0,0,0]});
      const animation=single?{clip:'Idle'}:config;
      const callbacks=new Set(),state={invalidate:()=>{},internal:{subscribe:ref=>{callbacks.add(ref);return()=>callbacks.delete(ref)}}};
      const store=selector=>selector(state);store.getState=()=>state;
      const actions=[];let cleanups=0;
      const originalAction=AnimationMixer.prototype.clipAction,originalUncache=AnimationMixer.prototype.uncacheRoot;
      AnimationMixer.prototype.clipAction=function(...args){const action=originalAction.apply(this,args);actions.push(action);return action};
      AnimationMixer.prototype.uncacheRoot=function(...args){cleanups++;return originalUncache.apply(this,args)};
      const element=document.createElement('div');document.body.append(element);const root=createRoot(element);
      const content=<FiberContext.Provider value={store}><Model scene={scene} id={binding==='unbound'?undefined:id} animation={animation}/></FiberContext.Provider>;
      flushSync(()=>root.render(binding==='noctx'?content:<GameProvider context={ctx}>{content}</GameProvider>));
      const frame=delta=>{ctx.sim.advance(delta,()=>{});for(const ref of callbacks)ref.current(state,delta)};
      const sample=()=>({pose:values(scene),actions:actions.map(a=>({clip:a.getClip().name,duration:a.getClip().duration,time:a.time,weight:a.getEffectiveWeight()})),rng:ctx.rng.state()});
      for(let n=0;n<30;n++)frame(1/60);
      if(!single&&binding==='bound'){ctx.game.playEntityAnimation(id,'attack');frame(0);frame(.2)};
      const before=sample(),clockBefore=ctx.time.now();
      if(mode==='pause')ctx.time.pause();
      if(mode==='speed-zero')ctx.time.setSpeed(0);
      if(mode==='timescale-zero')ctx.time.setTimescale(0);
      if(mode==='positive-speed')ctx.time.setSpeed(4);
      if(mode==='positive-timescale')ctx.time.setTimescale(.25);
      if(mode!=='control')for(let n=0;n<60;n++){
        if(n===30&&!single&&binding==='bound')ctx.game.playEntityAnimation(id,'attack');
        frame(1/60);
      }
      else if(!single&&binding==='bound')ctx.game.playEntityAnimation(id,'attack');
      const frozen=sample(),clockAfter=ctx.time.now(),cleanupWhileFrozen=cleanups;
      ctx.time.setTimescale(1);ctx.time.play();frame(0);frame(.2);const resumed=sample();
      flushSync(()=>root.unmount());element.remove();
      AnimationMixer.prototype.clipAction=originalAction;AnimationMixer.prototype.uncacheRoot=originalUncache;
      return{before,frozen,resumed,clockBefore,clockAfter,cleanupWhileFrozen,cleanupAfterUnmount:cleanups,subscriptionsAfterUnmount:callbacks.size};
    };
    window.selectedClock=async({rate=1,timescale=1,clock='game',single=false,binding='bound',authoredRate=1,explicitGraph=false,held=false})=>{
      gltf=await gltfPromise;
      const scene=clone(gltf.scene),peer=clone(gltf.scene),id='selected-clock-actor';
      const ctx=createGameContext({definition:defineGameDefinition({name:'selected-clock-proof',assets:createAssetCatalog(),multiplayer:'off',time:{scale:75}}),content:{},player:{userId:'player',isNew:true}});
      ctx.time.setSpeed(rate);ctx.time.setTimescale(timescale);
      ctx.scene.entity.spawn('hero',{id,position:[0,0,0]});
      const animation={...(single?{clip:'Idle'}:explicitGraph?{graph:locomotionGraph(config.states)}:{states:config.states}),...(clock===null?{}:{clock}),timeScale:authoredRate,...(held?{paused:true,time:.3}:{})};
      const callbacks=new Set(),state={invalidate:()=>{},internal:{subscribe:ref=>{callbacks.add(ref);return()=>callbacks.delete(ref)}}};
      const store=selector=>selector(state);store.getState=()=>state;
      const actions=[];let cleanups=0;
      const originalAction=AnimationMixer.prototype.clipAction,originalUncache=AnimationMixer.prototype.uncacheRoot;
      AnimationMixer.prototype.clipAction=function(...args){const action=originalAction.apply(this,args);actions.push(action);return action};
      AnimationMixer.prototype.uncacheRoot=function(...args){cleanups++;return originalUncache.apply(this,args)};
      const element=document.createElement('div');document.body.append(element);const root=createRoot(element);
      const content=<FiberContext.Provider value={store}><Model scene={scene} id={binding==='unbound'?undefined:id} animation={animation}/><Model scene={peer} animation={{clip:'Idle'}}/></FiberContext.Provider>;
      flushSync(()=>root.render(binding==='noctx'?content:<GameProvider context={ctx}>{content}</GameProvider>));
      const sample=target=>({pose:values(target),actions:actions.filter(a=>a.getMixer().getRoot()===target&&a.getEffectiveWeight()>1e-6).map(a=>({clip:a.getClip().name,duration:a.getClip().duration,time:a.time,weight:a.getEffectiveWeight()}))});
      const before=sample(scene);
      for(const ref of callbacks)ref.current(state,0);
      // Identical 3 seconds of speed-normalized travel; the calendar scale is deliberately separate.
      for(let n=0;n<180/(rate*timescale);n++){
        const effectiveDelta=rate*timescale/60;
        ctx.sim.advance(1/60,()=>{});
        ctx.scene.entity.setPose(id,{position:[0,0,(n+1)*effectiveDelta*1.1],dt:effectiveDelta});
        for(const ref of callbacks)ref.current(state,1/60);
      }
      const after=sample(scene),peerAfter=sample(peer),snapshot=ctx.time.snapshot(),cleanupBeforeUnmount=cleanups;
      flushSync(()=>root.unmount());element.remove();
      AnimationMixer.prototype.clipAction=originalAction;AnimationMixer.prototype.uncacheRoot=originalUncache;
      return{before,after,peerAfter,snapshot,cleanupBeforeUnmount,cleanupAfterUnmount:cleanups,subscriptionsAfterUnmount:callbacks.size};
    };
    window.autoDiagnostics=async(mode)=>{
      gltf=await gltfPromise;
      const scene=clone(gltf.scene),bind=values(scene);
      const available=mode==='empty'?[]:mode==='noidle'?gltf.animations.filter(c=>!c.name.toLowerCase().includes('idle')):gltf.animations;
      const diagnostics=diagnoseModelAnimation(scene,{auto:true,clock:'game'},available);
      const callbacks=new Set(),state={invalidate:()=>{},internal:{subscribe:ref=>{callbacks.add(ref);return()=>callbacks.delete(ref)}}};
      const store=selector=>selector(state);store.getState=()=>state;
      const warnings=[];let cleanups=0;
      const originalWarn=console.warn,originalUncache=AnimationMixer.prototype.uncacheRoot;
      console.warn=(...args)=>warnings.push(args.join(' '));
      AnimationMixer.prototype.uncacheRoot=function(...args){cleanups++;return originalUncache.apply(this,args)};
      const element=document.createElement('div');document.body.append(element);const root=createRoot(element);
      function AutoModel({animation}){useModelAnimation(scene,available,animation);return null}
      const render=animation=>flushSync(()=>root.render(<FiberContext.Provider value={store}><AutoModel animation={animation}/></FiberContext.Provider>));
      render('none');render({auto:true,clock:'game'});render({auto:true,clock:'game'});
      for(const ref of callbacks)ref.current(state,.2);
      const after=values(scene),explicitWarnings=[...warnings];
      if(mode==='empty'){render('auto');for(const ref of callbacks)ref.current(state,.2)};
      flushSync(()=>root.unmount());element.remove();
      console.warn=originalWarn;AnimationMixer.prototype.uncacheRoot=originalUncache;
      return{diagnostics,warnings,explicitWarnings,bind,after,cleanups,subscriptionsAfterUnmount:callbacks.size};
    };
    window.acceptedClock=async({rawDelta=1/60,rate=1,hz='variable',maxCatchUpSteps=5,single=false,mode='normal',clock='game'})=>{
      gltf=await gltfPromise;
      const scene=clone(gltf.scene),peer=clone(gltf.scene),id='accepted-clock-actor';
      const definition=defineGameDefinition({name:'accepted-clock-proof',assets:createAssetCatalog(),multiplayer:'off',input:{},time:{scale:75},simulation:{hz,maxCatchUpSteps}});
      const ctx=createGameContext({definition,content:{},player:{userId:'player',isNew:true},rng:seededRng('accepted-clock-gameplay')});
      ctx.time.setSpeed(rate);ctx.scene.entity.spawn('hero',{id,position:[0,0,0]});
      if(mode==='late')ctx.sim.advance(2,()=>{});
      if(mode==='missing')delete ctx.time.advancedSeconds;
      const animation=single?{clip:'Idle',clock}:{...config,clock};
      const callbacks=new Map(),driverErrors=[],warnings=[];const state={invalidate:()=>{},internal:{subscribe:(ref,priority=0)=>{callbacks.set(ref,priority);return()=>callbacks.delete(ref)}}};
      const store=selector=>selector(state);store.getState=()=>state;
      const actions=[];let cleanups=0;
      const originalAction=AnimationMixer.prototype.clipAction,originalUncache=AnimationMixer.prototype.uncacheRoot,originalWarn=console.warn;
      AnimationMixer.prototype.clipAction=function(...args){const action=originalAction.apply(this,args);actions.push(action);return action};
      AnimationMixer.prototype.uncacheRoot=function(...args){cleanups++;return originalUncache.apply(this,args)};
      console.warn=(...args)=>warnings.push(args.join(' '));
      const playable={game:definition,content:{},loop:{onTick:(ctx,gameDt)=>{
        const position=ctx.scene.entity.get(id).position;
        ctx.scene.entity.setPose(id,{position:[0,0,position[2]+gameDt/75*1.1],dt:gameDt/75});
      }}};
      const tracker=createActionStateTracker({}),gate={current:false};
      const driver=<FrameDriver ctx={ctx} playable={playable} tracker={tracker} yawRef={{current:0}} pitchRef={{current:0}} primaryClickRef={{current:false}} pointerAxisRef={{current:null}} analogRef={{current:null}} gateRef={gate} onRuntimeError={(error,phase)=>driverErrors.push({error:String(error),phase})} multiplayer={null} serverIdRef={{current:null}} pointerService={null} pointerAim={false} pingCommand={undefined} poster={false} onPosterSettled={()=>{}} authoritativeFrameRef={{current:null}}/>;
      const element=document.createElement('div');document.body.append(element);const root=createRoot(element);
      flushSync(()=>root.render(<GameProvider context={ctx}><FiberContext.Provider value={store}>{driver}<Model scene={scene} id={id} animation={animation}/><Model scene={peer} animation={{clip:'Idle'}}/></FiberContext.Provider></GameProvider>));
      const frame=delta=>{for(const [ref]of[...callbacks].sort((a,b)=>a[1]-b[1]))ref.current(state,delta)};
      const sample=target=>({pose:values(target),actions:actions.filter(a=>a.getMixer().getRoot()===target&&a.getEffectiveWeight()>1e-6).map(a=>({clip:a.getClip().name,duration:a.getClip().duration,time:a.time,weight:a.getEffectiveWeight()}))});
      frame(0);const before=sample(scene),beforeClock=ctx.time.now(),initialAcceptedProgress=ctx.time.advancedSeconds?.();
      const records=[];
      for(let n=0;n<20;n++){frame(rawDelta);records.push({tick:ctx.sim.tick(),progress:ctx.time.advancedSeconds?.(),clock:ctx.time.now(),pose:sample(scene)})};
      const after=sample(scene),afterClock=ctx.time.now(),acceptedProgress=ctx.time.advancedSeconds?.();
      let offset,queued;
      if(mode==='offset'){
        const baseline=sample(scene);
        gate.current=true;
        for(const now of [ctx.time.now()+10000,1]){ctx.time.hydrate({...ctx.time.snapshot(),now});frame(.2)};
        gate.current=false;
        offset={baseline,after:sample(scene)};
      }
      if(mode==='queue'||mode==='queue-control'){
        ctx.game.playEntityAnimation(id,'attack');
        const baseline=sample(scene);
        if(mode==='queue'){ctx.time.pause();for(let n=0;n<20;n++)frame(.2)};
        const held=sample(scene);ctx.time.play();frame(1/60);frame(1/60);
        queued={baseline,held,resumed:sample(scene),rng:ctx.rng.state()};
      }
      const peerAfter=sample(peer),cleanupBeforeUnmount=cleanups;
      flushSync(()=>root.unmount());element.remove();
      AnimationMixer.prototype.clipAction=originalAction;AnimationMixer.prototype.uncacheRoot=originalUncache;console.warn=originalWarn;
      return{before,after,beforeClock,afterClock,initialAcceptedProgress,acceptedProgress,records,offset,queued,peerAfter,driverErrors,warnings,cleanupBeforeUnmount,cleanupAfterUnmount:cleanups,subscriptionsAfterUnmount:callbacks.size};
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

test("explicit automatic playback diagnoses unsupported imported clips once while legacy automatic playback remains quiet", async () => {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.port}`);
  await page.waitForFunction(() => (window as any).ready);
  for (const mode of ['empty', 'noidle']) {
    const result = await page.evaluate(mode => (window as any).autoDiagnostics(mode), mode);
    expect(result.diagnostics.map((d: any) => d.code)).toEqual(['missing-auto-idle']);
    expect(result.explicitWarnings).toHaveLength(1);
    expect(result.explicitWarnings[0]).toContain('idle');
    expect(result.warnings).toEqual(result.explicitWarnings);
    expect(result.after).toEqual(result.bind);
    expect(result.cleanups).toBe(0);
    expect(result.subscriptionsAfterUnmount).toBe(0);
  }
  const valid = await page.evaluate(() => (window as any).autoDiagnostics('valid'));
  expect(valid.diagnostics).toEqual([]);
  expect(valid.warnings).toEqual([]);
  expect(valid.after).not.toEqual(valid.bind);
  expect(valid.cleanups).toBe(1);
  expect(valid.subscriptionsAfterUnmount).toBe(0);
  await page.close();
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


test("render snap policy clears locomotion speed after horizontal and vertical discontinuities", async () => {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.port}`);
  await page.waitForFunction(() => (window as any).ready);
  for (const mode of ["warp", "vertical"]) {
    const result = await page.evaluate(mode => (window as any).discontinuity(mode), mode);
    expect(result.after.weights.Idle).toBe(1);
    expect(result.after.weights.Walking_A).toBe(0);
    expect(result.after.weights.Running_A).toBe(0);
    expect(result.cleanupBeforeUnmount).toBe(0);
    expect(result.cleanupAfterUnmount).toBe(1);
    expect(result.subscriptionsAfterUnmount).toBe(0);
  }
  await page.close();
}, 30000);

test("live snap-distance retuning preserves genuine fast motion and resumes discontinuity filtering", async () => {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.port}`);
  await page.waitForFunction(() => (window as any).ready);
  const result = await page.evaluate(() => (window as any).discontinuity("retune"));
  expect(result.fast.Running_A).toBe(1);
  expect(result.after.weights.Idle).toBe(1);
  expect(result.after.weights.Running_A).toBe(0);
  expect(result.cleanupBeforeUnmount).toBe(0);
  await page.close();
}, 30000);

test("discontinuities retain pending attack variants and terminal graph states", async () => {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.port}`);
  await page.waitForFunction(() => (window as any).ready);
  const control = await page.evaluate(() => (window as any).discontinuity("pending-control"));
  const warped = await page.evaluate(() => (window as any).discontinuity("pending"));
  expect(warped.pending).toEqual(control.pending);
  const death = await page.evaluate(() => (window as any).discontinuity("death"));
  expect(death.before.pose).toEqual(death.after.pose);
  expect(death.after.weights.Death_A).toBe(1);
  expect(death.cleanupBeforeUnmount).toBe(0);
  await page.close();
}, 30000);

test("paused animation keeps its pose through a warp and resumes with fresh sampling", async () => {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.port}`);
  await page.waitForFunction(() => (window as any).ready);
  const result = await page.evaluate(() => (window as any).discontinuity("paused"));
  expect(result.before.pose).toEqual(result.after.pose);
  expect(result.before.weights).toEqual(result.zeroDelta);
  expect(result.after.weights).toEqual(result.before.weights);
  expect(result.resumed.Idle).toBe(1);
  expect(result.resumed.Running_A).toBe(0);
  await page.close();
}, 30000);


test("bound game animation freezes with pause and zero clock rate, retaining pending variants for resume", async () => {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.port}`);
  await page.waitForFunction(() => (window as any).ready);
  const control = await page.evaluate(() => (window as any).clockPlayback("control"));
  for (const mode of ["pause", "speed-zero", "timescale-zero"]) {
    const result = await page.evaluate(mode => (window as any).clockPlayback(mode), mode);
    expect(result.clockAfter).toBe(result.clockBefore);
    expect(result.frozen).toEqual(result.before);
    expect(result.resumed).toEqual(control.resumed);
    expect(result.cleanupWhileFrozen).toBe(0);
    expect(result.cleanupAfterUnmount).toBe(1);
    expect(result.subscriptionsAfterUnmount).toBe(0);
  }
  await page.close();
}, 30000);

test("single-clip game animation freezes with the context clock and resumes its existing mixer", async () => {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.port}`);
  await page.waitForFunction(() => (window as any).ready);
  const control = await page.evaluate(() => (window as any).clockPlayback("control", "bound", true));
  for (const mode of ["pause", "timescale-zero"]) {
    const result = await page.evaluate(mode => (window as any).clockPlayback(mode, "bound", true), mode);
    expect(result.frozen).toEqual(result.before);
    expect(result.resumed).toEqual(control.resumed);
    expect(result.cleanupWhileFrozen).toBe(0);
    expect(result.cleanupAfterUnmount).toBe(1);
  }
  await page.close();
}, 30000);

test("context-unbound previews and positive game-clock rates keep their visual playback timing", async () => {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.port}`);
  await page.waitForFunction(() => (window as any).ready);
  for (const binding of ["unbound", "noctx"]) {
    const result = await page.evaluate(binding => (window as any).clockPlayback("pause", binding, true), binding);
    expect(result.clockAfter).toBe(result.clockBefore);
    expect(result.frozen.pose).not.toEqual(result.before.pose);
    expect(result.frozen.actions[0].time).toBeCloseTo((result.before.actions[0].time + 1) % result.before.actions[0].duration, 10);
  }
  for (const mode of ["positive-speed", "positive-timescale"]) {
    const result = await page.evaluate(mode => (window as any).clockPlayback(mode, "bound", true), mode);
    expect(result.clockAfter).toBeGreaterThan(result.clockBefore);
    expect(result.frozen.actions[0].time).toBeCloseTo((result.before.actions[0].time + 1) % result.before.actions[0].duration, 10);
  }
  await page.close();
}, 30000);

test("selected game clock keeps imported gait and clip phase coherent at 1x, 2x and 4x", async () => {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.port}`);
  await page.waitForFunction(() => (window as any).ready);
  for (const explicitGraph of [false, true]) {
    const control = await page.evaluate(explicitGraph => (window as any).selectedClock({explicitGraph}), explicitGraph);
    for (const rate of [2, 4]) {
      const result = await page.evaluate(options => (window as any).selectedClock(options), {rate, explicitGraph});
      expect(result.snapshot.scale).toBe(75);
      expect(result.snapshot.now).toBeCloseTo(control.snapshot.now, 8);
      for (let n = 0; n < result.after.actions.length; n++) {
        expect(result.after.actions[n].time).toBeCloseTo(control.after.actions[n].time, 8);
        expect(result.after.actions[n].weight).toBeCloseTo(control.after.actions[n].weight, 6);
      }
      expect(result.after.pose.every(Number.isFinite)).toBe(true);
      expect(result.cleanupBeforeUnmount).toBe(0);
      expect(result.cleanupAfterUnmount).toBe(2);
      expect(result.subscriptionsAfterUnmount).toBe(0);
      // A second model keeps its own unbound real-time policy in the same context.
      const peerTime = result.peerAfter.actions[0];
      expect(peerTime.time).toBeCloseTo((3 / rate) % peerTime.duration, 8);
    }
  }
  await page.close();
}, 30000);

test("selected clock composes global timescale and authored rates while previews and default playback remain real-time", async () => {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.port}`);
  await page.waitForFunction(() => (window as any).ready);
  for (const single of [false, true]) {
    const control = await page.evaluate(single => (window as any).selectedClock({single}), single);
    const combined = await page.evaluate(single => (window as any).selectedClock({single,rate:4,timescale:.5}), single);
    for (let n=0;n<control.after.actions.length;n++) expect(combined.after.actions[n].time).toBeCloseTo(control.after.actions[n].time, 8);
  }
  for (const authoredRate of [0, -.5, .5, 2]) {
    const control = await page.evaluate(authoredRate => (window as any).selectedClock({single:true,authoredRate}), authoredRate);
    const fast = await page.evaluate(authoredRate => (window as any).selectedClock({single:true,authoredRate,rate:4}), authoredRate);
    expect(fast.after.actions[0].time).toBeCloseTo(control.after.actions[0].time, 8);
    expect(fast.after.pose.every(Number.isFinite)).toBe(true);
  }
  for (const clock of [null, 'real']) {
    const result = await page.evaluate(clock => (window as any).selectedClock({clock,rate:4,single:true}), clock);
    expect(result.after.actions[0].time).toBeCloseTo(.75 % result.after.actions[0].duration, 8);
  }
  for (const binding of ['unbound', 'noctx']) {
    const result = await page.evaluate(binding => (window as any).selectedClock({binding,rate:4,single:true}), binding);
    expect(result.after.actions[0].time).toBeCloseTo(.75 % result.after.actions[0].duration, 8);
  }
  const held = await page.evaluate(() => (window as any).selectedClock({rate:4,single:true,held:true}));
  expect(held.before).toEqual(held.after);
  await page.close();
}, 30000);

test("selected game clock follows actual FrameDriver accepted time and fixed-step catch-up drops", async () => {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.port}`);
  await page.waitForFunction(() => (window as any).ready);
  for (const options of [
    {rawDelta:.2,rate:1}, {rawDelta:.2,rate:4},
    {rawDelta:1/120,rate:1,hz:20}, {rawDelta:.2,rate:4,hz:120,maxCatchUpSteps:2},
    {rawDelta:.2,rate:4,mode:'late'},
  ]) {
    const result = await page.evaluate(options => (window as any).acceptedClock({...options,single:true}), options);
    expect(result.driverErrors).toEqual([]);
    const acceptedDelta = result.acceptedProgress-result.initialAcceptedProgress;
    expect(result.after.actions[0].time).toBeCloseTo(acceptedDelta % result.after.actions[0].duration, 8);
    expect(result.afterClock-result.beforeClock).toBeCloseTo(acceptedDelta*75, 8);
    expect(result.cleanupBeforeUnmount).toBe(0);
    expect(result.cleanupAfterUnmount).toBe(2);
    expect(result.subscriptionsAfterUnmount).toBe(0);
    if (options.hz === 20) expect(result.records[0].pose).toEqual(result.before);
  }
  const slowFrame = await page.evaluate(() => (window as any).acceptedClock({rawDelta:.2}));
  expect(slowFrame.after.actions.find((a:any)=>a.clip==='Idle')).toBeUndefined();
  expect(slowFrame.after.actions.find((a:any)=>a.clip==='Running_A').weight).toBeLessThan(.12);
  await page.close();
}, 30000);

test("accepted clock ignores hydrated offsets, retains paused triggers and isolates raw-time peers", async () => {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.port}`);
  await page.waitForFunction(() => (window as any).ready);
  const offset = await page.evaluate(() => (window as any).acceptedClock({mode:'offset',single:true}));
  expect(offset.offset.after).toEqual(offset.offset.baseline);
  const control = await page.evaluate(() => (window as any).acceptedClock({mode:'queue-control'}));
  const queued = await page.evaluate(() => (window as any).acceptedClock({mode:'queue'}));
  expect(queued.queued.held).toEqual(queued.queued.baseline);
  expect(queued.queued.resumed).toEqual(control.queued.resumed);
  expect(queued.queued.rng).toEqual(control.queued.rng);
  expect(queued.peerAfter).not.toEqual(control.peerAfter);
  expect(queued.cleanupBeforeUnmount).toBe(0);
  expect(queued.cleanupAfterUnmount).toBe(2);
  expect(queued.subscriptionsAfterUnmount).toBe(0);
  await page.close();
}, 30000);

test("a custom clock without accepted progress warns once and holds only explicitly bound game playback", async () => {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.port}`);
  await page.waitForFunction(() => (window as any).ready);
  const held = await page.evaluate(() => (window as any).acceptedClock({mode:'missing',single:true}));
  expect(held.after).toEqual(held.before);
  expect(held.warnings).toHaveLength(1);
  expect(held.warnings[0]).toContain('advancedSeconds');
  expect(held.peerAfter.pose).not.toEqual(held.before.pose);
  const real = await page.evaluate(() => (window as any).acceptedClock({mode:'missing',single:true,clock:'real'}));
  expect(real.after.pose).not.toEqual(real.before.pose);
  expect(real.warnings).toEqual([]);
  expect(real.cleanupAfterUnmount).toBe(2);
  expect(real.subscriptionsAfterUnmount).toBe(0);
  await page.close();
}, 30000);
