import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {context as FiberContext} from '@react-three/fiber';
import {GameProvider} from '@jgengine/react/provider';
import {useModelAnimation} from '@jgengine/shell/render/useModelAnimation';
import {createGameContext} from '@jgengine/core/runtime/gameContext';
import {defineGameDefinition} from '@jgengine/core/game/defineGame';
import {createAssetCatalog} from '@jgengine/core/scene/assetCatalog';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {AnimationMixer,Vector3,Quaternion} from 'three';
import {clone} from 'three/examples/jsm/utils/SkeletonUtils.js';
const gltfPromise=fetch('/fitter.glb').then(r=>r.arrayBuffer()).then(bytes=>new GLTFLoader().parseAsync(bytes,''));
function Model({scene,clips,animation}) {useModelAnimation(scene,clips,animation,'fitter');return null;}
const values=scene=>{const out=[];scene.traverse(node=>{if(node.isBone)out.push(...node.position.toArray(),...node.quaternion.toArray())});return out};
const bones=scene=>{scene.updateMatrixWorld(true);const out=[];scene.traverse(node=>{if(node.isBone)out.push({name:node.name,position:node.getWorldPosition(new Vector3()).toArray(),quaternion:node.getWorldQuaternion(new Quaternion()).toArray()})});return out};
const newConfig=()=>({states:{idle:'idle',walk:'walk',walkSpeed:0.05,fadeSec:0.16}});
window.run=async(freshEachRender)=>{
 const gltf=await gltfPromise;const scene=clone(gltf.scene);
 const ctx=createGameContext({definition:defineGameDefinition({name:'deepward-continuity',assets:createAssetCatalog(),multiplayer:'off'}),content:{},player:{userId:'player',isNew:true}});
 ctx.scene.entity.spawn('hero',{id:'fitter',position:[0,0,0]});
 const callbacks=new Set();const state={invalidate:()=>{},internal:{subscribe:ref=>{callbacks.add(ref);return()=>callbacks.delete(ref)}}};
 const store=selector=>selector(state);store.getState=()=>state;
 const element=document.createElement('div');document.body.append(element);const root=createRoot(element);const config=newConfig();
 const render=()=>flushSync(()=>root.render(<GameProvider context={ctx}><FiberContext.Provider value={store}><Model scene={scene} clips={gltf.animations} animation={freshEachRender?newConfig():config}/></FiberContext.Provider></GameProvider>));
 const frame=delta=>{for(const ref of callbacks)ref.current(state,delta)};
 let lastActions=[];const originalUpdate=AnimationMixer.prototype.update;AnimationMixer.prototype.update=function(delta){const result=originalUpdate.call(this,delta);lastActions=this._actions.map(a=>({clip:a.getClip().name,time:a.time,weight:a.getEffectiveWeight()}));return result;};
 render();frame(0);const poses=[],bonePoses=[],actionTimes=[];
 for(let i=0;i<30;i++){
   ctx.scene.entity.setPose('fitter',{position:[0,0,(i+1)/60]});
   render();frame(1/60);poses.push(values(scene));bonePoses.push(bones(scene));actionTimes.push(lastActions);
 }
 const result={freshEachRender,poses,bonePoses,actionTimes,clipDurations:gltf.animations.map(c=>[c.name,c.duration]),subscriptionCount:callbacks.size};
 flushSync(()=>root.unmount());element.remove();AnimationMixer.prototype.update=originalUpdate;return {...result,subscriptionsAfterUnmount:callbacks.size};
};window.ready=true;
