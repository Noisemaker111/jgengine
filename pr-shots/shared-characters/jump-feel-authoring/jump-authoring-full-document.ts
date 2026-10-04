import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {game} from './games/scrap-signal/src/game.config';
import {createGameContext} from '@jgengine/core/runtime/gameContext';
import {resolvePlayerMovementTuning,stepPlayerMovement,snapshotPlayerMovement} from '@jgengine/core/movement/playerMovement';
import {importEditorDocumentJson} from '@jgengine/core/editor/document';
import {createAuthoredMovementReader,bindAuthoredMovement} from '@jgengine/core/editor/movementCatalog';

const fullDocPath=resolve(import.meta.dir,'../jump-feel-authoring/public-authoring-doc.json');
const fullText=readFileSync(fullDocPath,'utf8');const doc=importEditorDocumentJson(fullText);
const authoringResult=JSON.parse(readFileSync(resolve(import.meta.dir,'../jump-feel-authoring/public-authoring-result.json'),'utf8'));
const manifest=JSON.parse(readFileSync(resolve(import.meta.dir,'candidate-package-manifest.json'),'utf8'));
assert.equal(manifest.commit,authoringResult.packageCohort.commit);assert.equal(manifest.tree,authoringResult.packageCohort.tree);
assert.equal(doc.markers.length,438);
const original=importEditorDocumentJson(readFileSync(resolve(import.meta.dir,'games/scrap-signal/src/editor.scene.json'),'utf8'));
assert.deepEqual({...doc,catalogs:original.catalogs},original,'same full original authored scene outside the movement catalog');
const req=createRequire(resolve(import.meta.dir,'package.json'));
const sha=(text:string|Buffer)=>createHash('sha256').update(text).digest('hex');
const modules=Object.fromEntries(['runtime/gameContext','movement/playerMovement','editor/document','editor/movementCatalog'].map(name=>[name,req.resolve('@jgengine/core/'+name)]));
assert.ok(Object.values(modules).every(path=>path.includes('/node_modules/')&&!path.includes('/JGengine/packages/')));
assert.equal(sha(readFileSync(modules['editor/movementCatalog'])),authoringResult.publicModuleHashes.movementCatalog);
assert.equal(sha(readFileSync(modules['movement/playerMovement'])),authoringResult.publicModuleHashes.playerMovement);
const read=createAuthoredMovementReader(()=>doc,'player-motion','reactor_hunter');
const bound=bindAuthoredMovement(read,{movement:game.movement,physics:game.game.physics});
assert.equal(read().diagnostics.length,0);
const row=doc.catalogs.find(c=>c.id==='player-motion')!.entries.find(e=>e.id==='reactor_hunter')!.meta;
const {walkSpeed,gravity,jumpVelocity,collisionHeight,...feel}=row;
assert.equal(Object.keys(feel).length,8);assert.deepEqual(read().config.movement?.feel,feel);
const rawMovement={...game.movement,collisionHeight,feel:{...game.movement?.feel,...feel}};
const rawPhysics={...game.game.physics,gravity,jumpVelocity};
const callbacks=Object.entries(game.movement??{}).filter(([,value])=>typeof value==='function');
for(const movement of [bound.movement,rawMovement]){
 for(const [name,callback] of callbacks)assert.equal((movement as any)[name],callback);
 assert.equal(movement.collideObjects,game.movement?.collideObjects);
}
const uid='full-document-jump-controls-scrap';const records:any={};
for(const variant of ['authored','raw']){
 const ctx=createGameContext({definition:game.game,content:game.content,models:{entity:kind=>(game.entityModels as any)[kind],object:kind=>(game.objectModels as any)[kind]},player:{userId:uid,isNew:true}});
 game.loop.onInit(ctx);game.loop.onNewPlayer(ctx);await ctx.game.commands.run('character.pick',{characterId:'gunk'});
 const initial=structuredClone(ctx.scene.entity.get(uid)!);
 assert.equal(initial.name,'reactor_hunter');assert.equal(initial.movement!.walkSpeed,walkSpeed,'actual registered character already has the authored walk speed; no runtime entity override');
 const tuning=resolvePlayerMovementTuning({world:game.game.world,physics:variant==='authored'?bound.physics:rawPhysics,movement:variant==='authored'?bound.movement:rawMovement,collision:game.collision});
 const step=(held:string[])=>stepPlayerMovement(ctx,uid,{held,pointer:null},1/120,tuning,0);
 for(let i=0;i<60;i++)step([]);
 const origin=structuredClone(ctx.scene.entity.get(uid)!.position);assert.equal(snapshotPlayerMovement(ctx,uid)!.motion!.grounded,true);
 let peak=origin[1],airborne=false,landFrame=-1;const jumpSamples=[];
 for(let i=0;i<240;i++){
  step(i===0?['jump']:[]);const entity=ctx.scene.entity.get(uid)!;const snapshot=snapshotPlayerMovement(ctx,uid)!;
  peak=Math.max(peak,entity.position[1]);airborne ||= !snapshot.motion!.grounded;
  jumpSamples.push({frame:i,position:structuredClone(entity.position),snapshot});
  if(airborne&&snapshot.motion!.grounded){landFrame=i;break;}
 }
 assert.ok(airborne&&landFrame>0);const landed=snapshotPlayerMovement(ctx,uid)!;assert.ok(landed.motion!.landedAtMs!==null);
 const landingPosition=structuredClone(ctx.scene.entity.get(uid)!.position);const walkSamples=[];
 for(let i=0;i<24;i++){
  step(['moveForward']);const entity=ctx.scene.entity.get(uid)!;const snapshot=snapshotPlayerMovement(ctx,uid)!;
  walkSamples.push({frame:i,position:structuredClone(entity.position),speed:Math.hypot(snapshot.motion!.horizontalVelocityX,snapshot.motion!.horizontalVelocityZ),snapshot});
 }
 records[variant]={initialPosition:initial.position,entityMovement:initial.movement,settledPosition:origin,peakHeight:peak-origin[1],landFrame,landedAtMs:landed.motion!.landedAtMs,landingPosition,speedAt100ms:walkSamples[11].speed,distanceAt100ms:Math.hypot(walkSamples[11].position[0]-landingPosition[0],walkSamples[11].position[2]-landingPosition[2]),jumpSamples,walkSamples,finalSnapshot:snapshotPlayerMovement(ctx,uid)};
}
assert.deepEqual(records.authored,records.raw,'full document-derived combined authored trajectory exactly matches direct configuration from the same row');
assert.ok(records.authored.peakHeight<.2);assert.ok(records.authored.speedAt100ms<3);
const output={cohort:manifest.commit,tree:manifest.tree,evidence:'unreleased installed public package full exported editor document → existing reader/binding → actual unchanged Scrap normal registered player and public inputs',fullDocumentPath:fullDocPath,fullDocumentSha256:sha(fullText),markerCount:doc.markers.length,allSceneContentOutsideCatalogUnchanged:true,catalogId:'player-motion',entryId:'reactor_hunter',normalBootGunkRegistration:true,noPositionOrSceneWrites:true,worldPolicy:'actual original game.game.world and normal onInit; document feeds numeric movement reader only',callbacksPreserved:callbacks.map(([name])=>name),collideObjectsPolicyPreserved:true,row,resolvedConfig:read().config,modulePaths:modules,moduleHashes:Object.fromEntries(Object.entries(modules).map(([key,path])=>[key,sha(readFileSync(path))])),authoredFullRecordExactlyMatchesRaw:true,records,limitation:'Configuration/runtime integration proof only; no published adoption, native appearance/control feel, or hardware performance claim.'};
writeFileSync(new URL('./jump-authoring-full-document.json',import.meta.url),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({cohort:output.cohort,fullDocumentSha256:output.fullDocumentSha256,markerCount:output.markerCount,all8Fields:feel,authoredExactlyMatchesRaw:true,peakHeight:records.authored.peakHeight,speedAt100ms:records.authored.speedAt100ms,distanceAt100ms:records.authored.distanceAt100ms}));
