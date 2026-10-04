import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {game as lantern} from './games/lantern-reach/src/game.config';
import {game as scrap} from './games/scrap-signal/src/game.config';
import {CLASS_ENTITY_ID} from './games/lantern-reach/src/game/model';
import {createGameContext} from '@jgengine/core/runtime/gameContext';
import {resolveColliders} from '@jgengine/core/scene/colliders';
import {placeAuthoredObjectsFromDocument} from '@jgengine/core/world/authoredObjects';
import {resolvePlayerMovementTuning,stepPlayerMovement,snapshotPlayerMovement} from '@jgengine/core/movement/playerMovement';
import {DEFAULT_OBSTACLE_PLAYER_RADIUS,resolveObstacleStep} from '@jgengine/core/movement/movementModel';
import {DEFAULT_VOXEL_DIMS} from '@jgengine/core/movement/voxelController';
import {solidObstaclesNear,obstacleFromCollider} from '@jgengine/core/movement/solidObstacles';
import {measureLocalBounds,reportMeasuredBounds} from '@jgengine/shell/render/measureBounds';
import {measureLocalCollisionTriangles,reportMeasuredCollisionMesh} from '@jgengine/shell/render/measureCollisionMesh';
import {cloneModelScene,modelPlacementTransform,disposeModelScene} from '@jgengine/shell/render/modelRender';
const height=DEFAULT_VOXEL_DIMS.height; // matches current documented shared heightfield collision head span
const uid='authored-roof-consumer-proof';
const before=JSON.parse(readFileSync(new URL('./roof-before.json',import.meta.url),'utf8'));
const report:any={label:'actual authored imported object public package AFTER, no document or game config changes',cohort:JSON.parse(readFileSync(new URL('./candidate-package-manifest.json',import.meta.url),'utf8')).commit,gamesSource:'45a50523cae2021c412aa83ce50589d806dd96d9',playerHeight:height,playerHeightSource:'public DEFAULT_VOXEL_DIMS.height, same1.8 currently used by heightfield horizontal collision',numericalImageDecodeSkipped:true,appearanceClaim:false,objects:[]};
for(const[key,game,id]of[['lantern-reach',lantern,'architecture:Odell workshop:160'],['scrap-signal',scrap,'reactor_gate']]as const){
 const marker=game.editorLayers?.markers.find(m=>m.id===id)??JSON.parse(readFileSync(new URL('./games/'+key+'/src/editor.scene.json',import.meta.url),'utf8')).markers.find((m:any)=>m.id===id);
 assert.ok(marker);const catalogId=marker.catalogId??marker.meta.catalogId;
 const model=(game.objectModels as any)[catalogId];assert.ok(model);
 const bytes=readFileSync(new URL('./games/'+key+'/public'+model.url,import.meta.url));
 const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);loader.register(parser=>({name:'numerical-collider-no-image-decode',beforeRoot(){for(const material of parser.json.materials??[]){delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;if(material.pbrMetallicRoughness){delete material.pbrMetallicRoughness.baseColorTexture;delete material.pbrMetallicRoughness.metallicRoughnessTexture;}}}}));
 const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const content=cloneModelScene(gltf.scene);const frame=new THREE.Group().add(content);const bounds=measureLocalBounds(frame)!;const placement=modelPlacementTransform(frame,model,bounds);const triangles=measureLocalCollisionTriangles(frame,{scale:placement.scale,offset:placement.position})!;
 const make=()=>createGameContext({definition:game.game,content:game.content,models:{entity:kind=>(game.entityModels as any)[kind],object:kind=>(game.objectModels as any)[kind]},player:{userId:uid,isNew:true}});
 const ctx=make();
 if(key==='scrap-signal'){game.loop.onInit(ctx);game.loop.onNewPlayer(ctx);}else placeAuthoredObjectsFromDocument(ctx.scene.object,game.editorLayers!,ctx.world.groundHeightAt);
 reportMeasuredBounds(ctx,'object',catalogId,{min:bounds.min.map((v,i)=>v*placement.scale+placement.position[i]!),max:bounds.max.map((v,i)=>v*placement.scale+placement.position[i]!),meshCount:bounds.meshCount});
 reportMeasuredCollisionMesh(ctx,'object',catalogId,triangles);
 const object=ctx.scene.object.get(id)!;assert.ok(object);const colliders=resolveColliders(ctx.scene.object.collidersOf(id));const physical=colliders.find(c=>c.purpose==='physical'&&c.blocks)!;assert.ok(physical);const obstacle=obstacleFromCollider(physical,object.position,object.rotationY);
 const tuning=resolvePlayerMovementTuning({world:game.game.world,physics:game.game.physics,movement:game.movement,collision:game.collision});assert.equal(tuning.hasTerrain,true);assert.equal(tuning.controller,undefined);assert.equal(tuning.collision,undefined);
 const record:any={game:key,marker,catalogId,model,glbSha256:createHash('sha256').update(bytes).digest('hex'),placed:object,placement,measuredTriangleCount:triangles.triangleCount,collider:{shape:physical.shape.kind,halfExtents:(physical.shape as any).halfExtents,offset:(physical.shape as any).offset,compoundBoxes:(physical.shape as any).boxes?.length??0},obstacle,backend:'shared heightfield; no Rapier/capsule or voxel backend',objectCollisionEnabled:tuning.movement?.collideObjects!==false};
 if(key==='lantern-reach'){
  const candidates=[];const localBoxes=obstacle.boxes??[{min:[-obstacle.halfExtents![0]+(obstacle.offset?.[0]??0),-obstacle.halfExtents![1]+(obstacle.offset?.[1]??0),-obstacle.halfExtents![2]+(obstacle.offset?.[2]??0)],max:[obstacle.halfExtents![0]+(obstacle.offset?.[0]??0),obstacle.halfExtents![1]+(obstacle.offset?.[1]??0),obstacle.halfExtents![2]+(obstacle.offset?.[2]??0)]}];
  let rejectedStanding=0,reachableOverheads=0;
  const minX=Math.min(...localBoxes.map(b=>b.min[0])),maxX=Math.max(...localBoxes.map(b=>b.max[0])),minZ=Math.min(...localBoxes.map(b=>b.min[2])),maxZ=Math.max(...localBoxes.map(b=>b.max[2]));
  for(let i=0;i<31;i++)for(let j=0;j<31;j++){
   const lx=minX+(maxX-minX)*(i+.5)/31,lz=minZ+(maxZ-minZ)*(j+.5)/31;
   const overheads=localBoxes.filter(b=>lx>=b.min[0]&&lx<=b.max[0]&&lz>=b.min[2]&&lz<=b.max[2]);if(overheads.length===0)continue;
   const x=object.position[0]+lx,z=object.position[2]+lz,y=ctx.world.groundHeightAt(x,z);const ceiling=object.position[1]+Math.min(...overheads.map(b=>b.min[1]));if(ceiling-y<=height||ceiling-y>=height+game.game.physics!.jumpVelocity!**2/(-2*game.game.physics!.gravity!))continue;
   reachableOverheads++;const blockers=solidObstaclesNear(ctx,[x,y,z],DEFAULT_OBSTACLE_PLAYER_RADIUS,DEFAULT_OBSTACLE_PLAYER_RADIUS);const rest=resolveObstacleStep([x,y,z],0,0,blockers,DEFAULT_OBSTACLE_PLAYER_RADIUS,tuning.movement?.stepHeight??.4);if(rest.stepX===0&&rest.stepZ===0)candidates.push({position:[x,y,z],ceiling});else rejectedStanding++;
  }
  record.candidateSearch={grid:31*31,reachableOverheads,rejectedStanding};
  record.validStandingCandidates=candidates;
  if(candidates.length===0){record.requirementUnproven='No reachable overhead point passed the existing whole-scene standing obstruction check';const prior=before.objects.find((o:any)=>o.game===key);for(const field of ['marker','catalogId','model','glbSha256','placed','placement','collider','obstacle','backend','objectCollisionEnabled'])assert.deepEqual(JSON.parse(JSON.stringify(record[field])),prior[field],key+': '+field+' unchanged');report.objects.push(record);disposeModelScene(content);continue;}
  candidates.sort((a,b)=>Math.hypot(a.position[0]-marker.position.x,a.position[2]-marker.position.z)-Math.hypot(b.position[0]-marker.position.x,b.position[2]-marker.position.z));const selected=candidates[0]!;
  ctx.scene.entity.spawn(CLASS_ENTITY_ID,{id:uid,position:selected.position});
  const frames=[];for(let i=0;i<80;i++){const prior=structuredClone(ctx.scene.entity.get(uid)!.position);stepPlayerMovement(ctx,uid,{held:i===0?['jump']:[],pointer:null},1/60,tuning,0);const next=structuredClone(ctx.scene.entity.get(uid)!.position);const horizontalShift=Math.hypot(next[0]-prior[0],next[2]-prior[2]);frames.push({frame:i,position:next,headY:next[1]+height,ceiling:selected.ceiling,headPenetration:next[1]+height-selected.ceiling,horizontalShift,state:snapshotPlayerMovement(ctx,uid)});}
  record.selected=selected;record.frames=frames;record.maxHorizontalShift=Math.max(...frames.map(f=>f.horizontalShift));record.firstPenetratingFrame=frames.find(f=>f.headPenetration>1e-6);record.firstEjectingFrame=frames.find(f=>f.horizontalShift>1e-4);
  assert.equal(record.firstPenetratingFrame,undefined,'ceiling blocks head overlap');assert.equal(record.firstEjectingFrame,undefined,'jump-only does not eject sideways');
  assert.ok(frames.some(f=>Math.abs(f.headPenetration)<1e-6&&f.state?.motion?.verticalVelocity===0),'ceiling cancels upward velocity');assert.equal(frames.at(-1)!.state.motion!.grounded,true,'player lands after ceiling contact');
  const route=make();game.loop.onInit(route);game.loop.onNewPlayer(route);
  placeAuthoredObjectsFromDocument(route.scene.object,game.editorLayers!,route.world.groundHeightAt,{onExisting:'keep'});
  reportMeasuredCollisionMesh(route,'object',catalogId,triangles);
  const authoredSpawn=structuredClone(route.scene.entity.get(uid)!.position);let routeFrames=0,minDistance=Infinity;
  for(;routeFrames<1800;routeFrames++){
   const p=route.scene.entity.get(uid)!.position;const dx=selected.position[0]!-p[0],dz=selected.position[2]!-p[2],distance=Math.hypot(dx,dz);minDistance=Math.min(minDistance,distance);if(distance<.08)break;
   const yaw=Math.atan2(dx,dz);stepPlayerMovement(route,uid,{held:['moveForward'],analog:{moveForward:Math.min(1,distance/.3)},pointer:null},1/120,tuning,yaw);
  }
  const walkedTo=structuredClone(route.scene.entity.get(uid)!.position);
  record.normalSpawnWalk={authoredSpawn,walkedTo,routeFrames,minDistance,reached:routeFrames<1800,playerKind:route.scene.entity.get(uid)!.name};assert.ok(record.normalSpawnWalk.reached,'unchanged normal authored route reaches workshop');
  if(routeFrames<1800){for(let i=0;i<120;i++)stepPlayerMovement(route,uid,{held:[],pointer:null},1/120,tuning,0);record.normalSpawnWalk.brakedAt=structuredClone(route.scene.entity.get(uid)!.position);record.normalSpawnWalk.beforeJump=snapshotPlayerMovement(route,uid);const frames=[];for(let i=0;i<24;i++){const prior=structuredClone(route.scene.entity.get(uid)!.position);stepPlayerMovement(route,uid,{held:i===0?['jump']:[],pointer:null},1/60,tuning,0);const next=structuredClone(route.scene.entity.get(uid)!.position);frames.push({frame:i,position:next,headPenetration:next[1]+height-selected.ceiling,horizontalShift:Math.hypot(next[0]-prior[0],next[2]-prior[2]),state:snapshotPlayerMovement(route,uid)});}record.normalSpawnWalk.jumpFrames=frames;assert.ok(frames.every(f=>f.headPenetration<=1e-6),'normal authored-spawn route cannot penetrate roof');assert.ok(frames.every(f=>f.horizontalShift<1e-8),'braked normal route cannot eject sideways');assert.equal(frames.at(-1)!.state.motion!.grounded,true);const prior=before.objects.find((o:any)=>o.game===key);for(const field of ['authoredSpawn','walkedTo','brakedAt','routeFrames','playerKind'])assert.deepEqual(record.normalSpawnWalk[field],prior.normalSpawnWalk[field],field+' unchanged by ceiling fix');}
 }
 const prior=before.objects.find((o:any)=>o.game===key);for(const field of ['marker','catalogId','model','glbSha256','placed','placement','collider','obstacle','backend','objectCollisionEnabled'])assert.deepEqual(JSON.parse(JSON.stringify(record[field])),prior[field],key+': '+field+' unchanged');report.objects.push(record);disposeModelScene(content);
}
writeFileSync(new URL('./roof-after.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify({cohort:report.cohort,objects:report.objects.map((o:any)=>({game:o.game,marker:o.marker.id,glbSha256:o.glbSha256,collider:o.collider,candidates:o.validStandingCandidates?.length,firstPenetrating:o.firstPenetratingFrame?.frame,firstEjecting:o.firstEjectingFrame?.frame,maxHorizontalShift:o.maxHorizontalShift}))},null,2));
