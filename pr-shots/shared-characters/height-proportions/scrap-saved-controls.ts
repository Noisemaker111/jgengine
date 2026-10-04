import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {game} from './games/scrap-signal/src/game.config';
import {createGameContext} from '@jgengine/core/runtime/gameContext';
import {resolvePlayerMovementTuning,stepPlayerMovement,snapshotPlayerMovement} from '@jgengine/core/movement/playerMovement';
import {importEditorDocumentJson} from '@jgengine/core/editor/document';
import {createAuthoredMovementReader,bindAuthoredMovement} from '@jgengine/core/editor/movementCatalog';
import {MOVEMENT_TUNING} from '@jgengine/core/movement/movementModel';
const manifest=JSON.parse(readFileSync(new URL('./candidate-package-manifest.json',import.meta.url),'utf8'));
const authoredDocument=importEditorDocumentJson(readFileSync(new URL('./scrap-full-authoring-doc.json',import.meta.url),'utf8'));
const read=createAuthoredMovementReader(()=>authoredDocument,'player-motion','reactor_hunter');const binding=bindAuthoredMovement(read,{movement:game.movement,physics:game.game.physics});assert.equal(read().diagnostics.length,0);assert.equal(binding.movement.beforeCommit,game.movement?.beforeCommit);
const report:any={cohort:manifest.commit,tree:manifest.tree,normalLifecycle:true,savedFullDocumentConsumed:true,authoringCatalogId:'player-motion',authoringEntryId:'reactor_hunter',readAuthoredConfig:read().config,gameSource:'45a50523cae2021c412aa83ce50589d806dd96d9',physics:game.game.physics,camera:game.camera,movementPolicy:game.movement,cases:{}};
for(const [name,actions] of Object.entries({walk:['moveForward'],sprint:['moveForward','sprint'],crouch:['moveForward','crouch'],sprintCrouch:['moveForward','sprint','crouch'],jump:['jump'],crouchJump:['jump','crouch']})){
 const uid='scrap-controls-'+name;
 const ctx=createGameContext({definition:game.game,content:game.content,models:{entity:kind=>(game.entityModels as any)[kind],object:kind=>(game.objectModels as any)[kind]},player:{userId:uid,isNew:true}});
 game.loop.onInit(ctx);game.loop.onNewPlayer(ctx);await ctx.game.commands.run('character.pick',{characterId:'gunk'});
 const tuning=resolvePlayerMovementTuning({world:game.game.world,physics:binding.physics,movement:binding.movement,collision:game.collision});
 const initial=structuredClone(ctx.scene.entity.get(uid)!);assert.equal(initial.name,'reactor_hunter');assert.equal(initial.movement!.walkSpeed,read().config.walkSpeed);
 let peak=initial.position[1],earlySpeed=0,firstPose;const samples=[];
 for(let i=0;i<180;i++){const jumping=name.toLowerCase().includes('jump');const held=jumping?(i===0?actions:[]):i<120?actions:[];stepPlayerMovement(ctx,uid,{held,pointer:null},1/120,tuning,0);const p=ctx.scene.entity.get(uid)!;if(i===0)firstPose=ctx.player.movement.getPose(uid);if(i===7)earlySpeed=Math.hypot(p.velocity[0],p.velocity[2]);peak=Math.max(peak,p.position[1]);if(i===0||i===7||i===119||i===179)samples.push({frame:i,position:structuredClone(p.position),state:snapshotPlayerMovement(ctx,uid)});}
 const final=ctx.scene.entity.get(uid)!;const state=snapshotPlayerMovement(ctx,uid)!;assert.ok(final.position.every(Number.isFinite));assert.equal(state.motion!.grounded,true);assert.ok(Math.abs(final.position[1]-ctx.world.groundHeightAt(final.position[0],final.position[2]))<1e-8);
 report.cases[name]={initialKind:initial.name,initialPosition:initial.position,entityMovement:initial.movement,earlySpeed,firstPose,peakHeight:peak-initial.position[1],finalPosition:final.position,finalGrounded:state.motion!.grounded,samples};
}
const speed=(key:string)=>report.cases[key].earlySpeed;
report.ratios={sprint:speed('sprint')/speed('walk'),crouch:speed('crouch')/speed('walk'),sprintCrouch:speed('sprintCrouch')/speed('walk')};
assert.ok(Math.abs(report.ratios.sprint-(game.movement?.feel?.runMultiplier??MOVEMENT_TUNING.runSpeedMultiplier))<1e-8);
assert.ok(Math.abs(report.ratios.crouch-(game.movement?.feel?.crouchMultiplier??MOVEMENT_TUNING.crouchSpeedMultiplier))<1e-8);
assert.equal(report.ratios.sprintCrouch,report.ratios.crouch);assert.equal(report.cases.crouch.firstPose,'crouch');assert.equal(report.cases.crouchJump.peakHeight,0);assert.ok(report.cases.jump.peakHeight>0);
writeFileSync(new URL('./scrap-saved-controls.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify({cohort:report.cohort,ratios:report.ratios,cases:Object.fromEntries(Object.entries(report.cases).map(([k,v]:[string,any])=>[k,{kind:v.initialKind,position:v.finalPosition,peakHeight:v.peakHeight,grounded:v.finalGrounded}]))}));
