import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {game as scrap} from './games/scrap-signal/src/game.config';
import {game as lantern} from './games/lantern-reach/src/game.config';
import {createGameContext} from '@jgengine/core/runtime/gameContext';
import {resolvePlayerMovementTuning,stepPlayerMovement,snapshotPlayerMovement} from '@jgengine/core/movement/playerMovement';
import {createEditorSession} from '@jgengine/core/editor/commands';
import {createEmptyEditorDocument,exportEditorDocumentJson,importEditorDocumentJson} from '@jgengine/core/editor/document';
import {createAuthoredMovementReader,bindAuthoredMovement,createMovementSchema} from '@jgengine/core/editor/movementCatalog';

const phase=process.argv[2]??'before';assert.ok(['before','after'].includes(phase));
const manifest=JSON.parse(readFileSync(new URL('./candidate-package-manifest.json',import.meta.url),'utf8'));
const req=createRequire(resolve(import.meta.dir,'package.json'));
const modulePaths=Object.fromEntries(['runtime/gameContext','movement/playerMovement','movement/movementModel','editor/commands','editor/document','editor/movementCatalog'].map(name=>[name,req.resolve('@jgengine/core/'+name)]));
assert.ok(Object.values(modulePaths).every(path=>path.includes('/node_modules/')&&!path.includes('/JGengine/packages/')));
const sha=(text:string|Buffer)=>createHash('sha256').update(text).digest('hex');
const profiles={cut:{jumpCutFactor:.2},recovery:{landingRecoveryMs:600,landingSpeedScale:.1}};
const output:any={phase,cohort:manifest.commit,tree:manifest.tree,packageManifestSha256:sha(readFileSync(new URL('./candidate-package-manifest.json',import.meta.url))),modulePaths,moduleHashes:Object.fromEntries(Object.entries(modulePaths).map(([name,path])=>[name,sha(readFileSync(path))])),originalSourceCommit:'45a50523cae2021c412aa83ce50589d806dd96d9',normalBootAndRegisteredPlayer:true,noPositionOrSceneWrites:true,evidence:'installed unreleased public package numerical movement; no native feel, appearance, or performance claim',games:{}};

for(const [gameName,game] of Object.entries({scrap,lantern})){
 const uid='authored-jump-controls-'+gameName;
 const row=gameName==='scrap'?'reactor_hunter':'player_hero';
 const make=async()=>{const ctx=createGameContext({definition:game.game,content:game.content,models:{entity:kind=>(game.entityModels as any)[kind],object:kind=>(game.objectModels as any)[kind]},player:{userId:uid,isNew:true}});game.loop.onInit(ctx);game.loop.onNewPlayer(ctx);await Promise.resolve();if(gameName==='scrap')await ctx.game.commands.run('character.pick',{characterId:'gunk'});assert.equal(ctx.scene.entity.get(uid)!.name,row);return ctx;};
 const result:any={playerKind:row,actualPhysics:game.game.physics,worldUnchanged:true,profiles:{}};
 for(const [profileName,fields] of Object.entries(profiles)){
  const savedPath=new URL(`./jump-authoring-${gameName}-${profileName}-saved.json`,import.meta.url);
  if(phase==='before'){
   const session=createEditorSession(createEmptyEditorDocument());
   const defaults={jumpVelocity:game.game.physics!.jumpVelocity!,...fields};
   session.dispatch({type:'addCatalog',id:'player-motion',schema:createMovementSchema(defaults as any)});
   session.dispatch({type:'addCatalogEntry',catalogId:'player-motion',entry:{id:row,meta:{jumpVelocity:game.game.physics!.jumpVelocity!}}});
   session.dispatch({type:'setCatalogEntry',catalogId:'player-motion',entryId:row,patch:{meta:defaults}});
   writeFileSync(savedPath,exportEditorDocumentJson(session.getState().document));
  }else assert.ok(existsSync(savedPath),'After proof must consume the identical previously saved document');
  const saved=readFileSync(savedPath,'utf8');const doc=importEditorDocumentJson(saved);
  const savedMeta=doc.catalogs.find(c=>c.id==='player-motion')!.entries.find(e=>e.id===row)!.meta;
  for(const [name,value] of Object.entries(fields))assert.equal(savedMeta[name],value,'ordinary document save/reload retains the selected value');
  const read=createAuthoredMovementReader(()=>doc,'player-motion',row);
  const bound=bindAuthoredMovement(read,{movement:game.movement,physics:game.game.physics});
  assert.equal(bound.movement.beforeCommit,game.movement?.beforeCommit);assert.equal(bound.movement.climbGradeHeight,game.movement?.climbGradeHeight);assert.equal(read().diagnostics.length,0);
  const records:any={};
  for(const variant of ['default','authored','raw']){
   const ctx=await make();const initial=structuredClone(ctx.scene.entity.get(uid)!);
   const movement=variant==='authored'?bound.movement:variant==='raw'?{...game.movement,feel:{...game.movement?.feel,...fields}}:game.movement;
   assert.equal(movement?.beforeCommit,game.movement?.beforeCommit);
   const tuning=resolvePlayerMovementTuning({world:game.game.world,physics:variant==='authored'?bound.physics:game.game.physics,movement,collision:game.collision});
   const step=(held:string[])=>stepPlayerMovement(ctx,uid,{held,pointer:null},1/120,tuning,0);
   for(let i=0;i<60;i++)step([]);
   const origin=structuredClone(ctx.scene.entity.get(uid)!.position);assert.equal(snapshotPlayerMovement(ctx,uid)!.motion!.grounded,true);
   let peak=origin[1],airborne=false,landFrame=-1;const jumpSamples=[];
   for(let i=0;i<240;i++){
    step(i===0?['jump']:[]);const entity=ctx.scene.entity.get(uid)!;const state=snapshotPlayerMovement(ctx,uid)!;
    peak=Math.max(peak,entity.position[1]);airborne ||= !state.motion!.grounded;
    if(i<4||i%12===0)jumpSamples.push({frame:i,position:structuredClone(entity.position),motion:structuredClone(state.motion)});
    if(airborne&&state.motion!.grounded){landFrame=i;break;}
   }
   assert.ok(airborne&&landFrame>0,'actual registered player jumps and lands through the public motor');
   const landed=snapshotPlayerMovement(ctx,uid)!;assert.ok(landed.motion!.landedAtMs!==null);
   const landingPosition=structuredClone(ctx.scene.entity.get(uid)!.position);const walkSamples=[];
   for(let i=0;i<24;i++){step(['moveForward']);const entity=ctx.scene.entity.get(uid)!;const state=snapshotPlayerMovement(ctx,uid)!;walkSamples.push({frame:i,position:structuredClone(entity.position),speed:Math.hypot(state.motion!.horizontalVelocityX,state.motion!.horizontalVelocityZ),grounded:state.motion!.grounded});}
   const final=ctx.scene.entity.get(uid)!;
   records[variant]={initialPosition:initial.position,entityMovement:initial.movement,settledPosition:origin,peakHeight:peak-origin[1],landFrame,landedAtMs:landed.motion!.landedAtMs,landingPosition,firstWalkSpeed:walkSamples[0].speed,speedAt100ms:walkSamples[11].speed,distanceAt100ms:Math.hypot(walkSamples[11].position[0]-landingPosition[0],walkSamples[11].position[2]-landingPosition[2]),distanceAt200ms:Math.hypot(final.position[0]-landingPosition[0],final.position[2]-landingPosition[2]),jumpSamples,walkSamples,finalSnapshot:snapshotPlayerMovement(ctx,uid)};
  }
  assert.deepEqual(records.default.initialPosition,records.raw.initialPosition);assert.deepEqual(records.default.initialPosition,records.authored.initialPosition);
  const metric=profileName==='cut'?'peakHeight':'distanceAt100ms';
  assert.ok(records.raw[metric]<records.default[metric]*.6,`direct runtime ${profileName} must visibly change the numerical physical trajectory`);
  assert.deepEqual(records.authored,records[phase==='before'?'default':'raw'],`saved ${profileName} ${phase==='before'?'is ignored before the shared reader fix':'matches direct runtime after the shared reader fix'}`);
  result.profiles[profileName]={fields,savedDocumentSha256:sha(saved),schemaKeys:doc.catalogs[0].schema?.fields.map(f=>f.key),resolvedConfig:read().config,diagnostics:read().diagnostics,records};
 }
 output.games[gameName]=result;
}
writeFileSync(new URL(`./jump-authoring-${phase}.json`,import.meta.url),JSON.stringify(output,null,2));
console.log(JSON.stringify({phase,cohort:output.cohort,games:Object.fromEntries(Object.entries(output.games).map(([name,data]:[string,any])=>[name,Object.fromEntries(Object.entries(data.profiles).map(([profile,p]:[string,any])=>[profile,Object.fromEntries(Object.entries(p.records).map(([variant,r]:[string,any])=>[variant,{peakHeight:r.peakHeight,landingSpeedAt100ms:r.speedAt100ms,distanceAt100ms:r.distanceAt100ms}]))]))]))}));
