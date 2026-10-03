import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,realpathSync} from 'node:fs';
import {Suspense,createElement} from 'react';
import {act,createRoot,useThree,extend} from '@react-three/fiber';
import {preload,peek} from 'suspend-react';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {EntityModel} from '@jgengine/shell/render/SceneModels';
import {sharedGltfLoader} from '@jgengine/shell/render/modelLoad';
import {entityModels as scrapModels} from './games/scrap-signal/src/game/world/models';
import {entityModels as lanternModels} from './games/lantern-reach/src/game/models';
import {CLASS_ENTITY_ID} from './games/lantern-reach/src/game/model';
import {NPC_PLACEMENTS,authoredScene} from './games/scrap-signal/src/game/world/level';
import type {ModelConfig} from '@jgengine/core/game/playableGame';

const expectedFixed=process.env.EXPECT_FIXED==='1';
extend(THREE);
const manifest=JSON.parse(readFileSync(new URL(process.env.MANIFEST??'./baseline-package-manifest.json',import.meta.url),'utf8'));
const originals={gauge:scrapModels.gauge!,reactor_hunter:scrapModels.reactor_hunter!,lantern:lanternModels[CLASS_ENTITY_ID]!};
const sourceModelSha256=Object.fromEntries(Object.entries(originals).map(([key,model])=>[key,createHash('sha256').update(JSON.stringify(model)).digest('hex')]));
const gameSourceFiles=['scrap-signal/src/game/world/models.ts','lantern-reach/src/game/models.ts'].map(file=>{
 const copied=readFileSync(new URL('./games/'+file,import.meta.url));
 const original=readFileSync('/workspace/JGengine-games/.claude/worktrees/character-proof/'+file);
 assert.deepEqual(copied,original);
 return{file,sha256:createHash('sha256').update(copied).digest('hex')};
});
if(expectedFixed){const before=JSON.parse(readFileSync(new URL('./renderer-before.json',import.meta.url),'utf8'));assert.deepEqual(sourceModelSha256,before.sourceModelSha256);assert.deepEqual(gameSourceFiles,before.gameSourceFiles);}
assert.ok(originals.gauge.attachments?.length&&originals.reactor_hunter.attachments?.length);
assert.equal(Object.values(lanternModels).filter(model=>model.attachments?.length).length,0,'Lantern is an unaffected consumer, not an attachment adopter');
const hashes=[];const loaded=new Map<string,any>();let cachedMaterialDisposals=0,cachedGeometryDisposals=0;
for(const [game,model]of[['scrap-signal',originals.gauge],['scrap-signal',originals.reactor_hunter],['lantern-reach',originals.lantern]]as const){
 for(const resource of[model,...(model.attachments??[]).map(a=>a.model as ModelConfig)]){
  if(loaded.has(resource.url))continue;
  const path=new URL('./games/'+game+'/public'+resource.url,import.meta.url);const bytes=readFileSync(path);
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  loader.register(parser=>({name:'numerical-rig-proof-no-image-decode',beforeRoot(){for(const material of parser.json.materials??[]){delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;if(material.pbrMetallicRoughness){delete material.pbrMetallicRoughness.baseColorTexture;delete material.pbrMetallicRoughness.metallicRoughnessTexture;}}}}));
  const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  gltf.scene.traverse((node:any)=>{node.geometry?.addEventListener('dispose',()=>cachedGeometryDisposals++);for(const material of(Array.isArray(node.material)?node.material:node.material?[node.material]:[]))material.addEventListener('dispose',()=>cachedMaterialDisposals++);});
  loaded.set(resource.url,gltf);preload(Promise.resolve([gltf]),[sharedGltfLoader,resource.url]);
  hashes.push({game,url:resource.url,path:realpathSync(path),sha256:createHash('sha256').update(bytes).digest('hex'),clips:gltf.animations.length});
 }
}
await Promise.resolve();
for(const[url,gltf]of loaded)assert.equal((peek([sharedGltfLoader,url])as any[])[0],gltf);
const cacheState=[...loaded].map(([url,gltf])=>({url,scene:gltf.scene.uuid,nodes:[]as any[]}));
for(const state of cacheState)loaded.get(state.url).scene.traverse((node:THREE.Object3D)=>state.nodes.push({uuid:node.uuid,parent:node.parent?.uuid,position:node.position.toArray(),rotation:node.quaternion.toArray(),scale:node.scale.toArray()}));
const rawSlotFailures=Object.entries(originals).filter(([key])=>key!=='lantern').map(([key,model])=>{const scene=loaded.get(model.url).scene;const slot=model.attachments![0]!.slot;const originalNodes:THREE.Object3D[]=[];scene.traverse((node:THREE.Object3D)=>{if(node.userData.name===slot)originalNodes.push(node);});assert.equal(scene.getObjectByName(slot),undefined);assert.equal(originalNodes.length,1);return{model:key,slot,runtimeName:originalNodes[0]!.name,directLookupMissing:true,importedOriginalNameUnique:true};});

let rootState:any;const refs=new Map<string,THREE.Group>();const mounted=new Map<string,THREE.Group>();
function StateProbe(){rootState=useThree();return null;}
const gaugeMarker=NPC_PLACEMENTS.find(p=>p.name==='gauge')!;
const playerMarker=authoredScene.markers.find(p=>p.kind==='player_spawn')!;
const models:Record<string,ModelConfig>={gaugeA:originals.gauge,gaugeB:originals.gauge,hunter:originals.reactor_hunter,lantern:originals.lantern};
let selected=['gaugeA','gaugeB','hunter','lantern'];
function tree(){return createElement(Suspense,{fallback:null},createElement(StateProbe),...selected.map(id=>createElement('group',{key:id,name:'consumer-'+id,position:id==='hunter'?[playerMarker.position.x,playerMarker.position.y,playerMarker.position.z]:[gaugeMarker.x,0,gaugeMarker.z],rotation:[0,id==='gaugeB'?.5:0,0],ref:(node:THREE.Group|null)=>{if(node){refs.set(id,node);mounted.set(id,node);}else refs.delete(id);}},createElement(EntityModel,{model:models[id]!,instanceId:id}))));}
const root=createRoot({}as HTMLCanvasElement);await root.configure({frameloop:'never',size:{width:100,height:100,top:0,left:0},dpr:1,gl:()=>({render(){},setSize(){},setPixelRatio(){}})as unknown as THREE.WebGLRenderer});
const priorAct=(globalThis as any).IS_REACT_ACT_ENVIRONMENT;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
const warnings:string[]=[];const oldWarn=console.warn;console.warn=(...args)=>warnings.push(args.map(String).join(' '));
function matches(root:THREE.Object3D,slot:string){const result:THREE.Object3D[]=[];root.traverse(node=>{if(node.name===slot||node.userData.name===slot)result.push(node);});assert.equal(result.length,1);return result[0]!;}
function attachment(id:string,slot='handslot.r'){const bone=matches(refs.get(id)!,slot);return{bone,weapon:bone.children.find(node=>node.name===loaded.get((models[id]!.attachments![0]!.model as ModelConfig).url).scene.name)};}
const record:any={};let ownedMaterialDisposals=0;
try{
 await act(async()=>root.render(tree()));
 assert.equal(refs.size,4);
 for(const id of['gaugeA','gaugeB','hunter']){
  const{bone,weapon}=attachment(id);record[id]={slot:models[id]!.attachments![0]!.slot,runtimeName:bone.name,attached:weapon!==undefined};
  assert.equal(bone.name,'handslotr','lookup preserves the GLTF animation binding runtime name');
  assert.equal(weapon!==undefined,expectedFixed);
  if(weapon){const config=models[id]!.attachments![0]!;assert.deepEqual(weapon.position.toArray(),config.position);assert.deepEqual(weapon.scale.toArray(),[config.scale,config.scale,config.scale]);weapon.traverse((node:any)=>{for(const material of(Array.isArray(node.material)?node.material:node.material?[node.material]:[]))material.addEventListener('dispose',()=>ownedMaterialDisposals++);});}
 }
 if(expectedFixed){
  const a=attachment('gaugeA'),b=attachment('gaugeB');assert.notEqual(a.weapon,b.weapon);assert.notEqual(a.bone,b.bone);
  rootState.scene.updateMatrixWorld(true);const before=a.weapon!.matrixWorld.clone();
  await act(async()=>{for(let i=1;i<=12;i++)rootState.advance(i/60,false);});
  rootState.scene.updateMatrixWorld(true);
  const expected=a.bone.matrixWorld.clone().multiply(a.weapon!.matrix);assert.ok(expected.elements.every((n,i)=>Math.abs(n-a.weapon!.matrixWorld.elements[i]!)<1e-10));
  record.worldTransformFollowsAnimatedBone=true;record.animationChangedAttachment=before.elements.some((n,i)=>Math.abs(n-a.weapon!.matrixWorld.elements[i]!)>1e-8);
  assert.equal(record.animationChangedAttachment,true);
  const weaponA=a.weapon!,weaponB=b.weapon!;const secondMatrix=weaponB.matrixWorld.clone();
  models.gaugeA={...originals.gauge,attachments:[{...originals.gauge.attachments![0]!,slot:'handslot.l'}]};
  await act(async()=>root.render(tree()));
  assert.equal(weaponA.parent,null,'old slot clone detached on slot change');assert.equal(a.bone.children.includes(weaponA),false);
  const left=attachment('gaugeA','handslot.l');assert.ok(left.weapon);assert.equal(left.weapon!.parent,left.bone);assert.equal(attachment('gaugeB').weapon,weaponB);
  rootState.scene.updateMatrixWorld(true);assert.deepEqual(weaponB.matrixWorld.elements,secondMatrix.elements,'other actor attachment unaffected by retarget');
  selected=selected.filter(id=>id!=='gaugeA');await act(async()=>root.render(tree()));assert.equal(left.weapon!.parent,null);assert.equal(attachment('gaugeB').weapon,weaponB);record.slotChangeDetachAndInstanceIsolation=true;
  models.gaugeB={...originals.gauge,attachments:[{...originals.gauge.attachments![0]!,slot:'missing-imported-slot'}]};
  await act(async()=>root.render(tree()));assert.equal(weaponB.parent,null);assert.ok(warnings.some(w=>w.includes('missing-imported-slot')));assert.ok(refs.get('gaugeB')!.getObjectByProperty('isSkinnedMesh',true),'invalid attachment preserves imported base actor mesh');record.missingSlotDiagnosedWithoutErasingBase=true;
 }
 record.lanternHasNoAttachments=true;
}finally{
 await act(async()=>root.unmount());console.warn=oldWarn;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=priorAct;
}
for(const before of cacheState){const nodes:any[]=[];loaded.get(before.url).scene.traverse((node:THREE.Object3D)=>nodes.push({uuid:node.uuid,parent:node.parent?.uuid,position:node.position.toArray(),rotation:node.quaternion.toArray(),scale:node.scale.toArray()}));assert.deepEqual(nodes,before.nodes);}
assert.equal(cachedMaterialDisposals,0);assert.equal(cachedGeometryDisposals,0);if(expectedFixed)assert.ok(ownedMaterialDisposals>0);
const packageExports=['@jgengine/shell/render/SceneModels','@jgengine/shell/render/modelLoad'].map(name=>{const path=realpathSync(Bun.resolveSync(name,import.meta.dir));assert.ok(path.includes('/node_modules/')&&path.includes('/dist/'));return{name,path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')};});
const result={label:expectedFixed?'unreleased public package renderer proof':'unreleased earlier public package actual attachment failure',cohort:manifest.commit,tree:manifest.tree,packageExports,sourceModelsUnchanged:true,sourceModelSha256,gameSourceFiles,importedImageDecodeSkipped:true,headlessR3FRendererNoPixelOrPerformanceClaim:true,hashes,rawSlotFailures,record,cachedRigTransformsHierarchyPreserved:true,cachedMaterialDisposals,cachedGeometryDisposals,ownedMaterialDisposals,warnings};
writeFileSync(new URL(process.env.OUT??'./renderer-before.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
