import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,realpathSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const consumer=process.argv[2],expectedCohort=process.argv[3];
assert.ok(consumer&&expectedCohort,'supply installed consumer path and exact cohort');
const requireConsumer=createRequire(`${consumer}/package.json`);
const manifest=JSON.parse(readFileSync(`${consumer}/candidate-package-manifest.json`,'utf8'));
assert.equal(manifest.commit,expectedCohort);
for(const pkg of manifest.packages)assert.equal(createHash('sha256').update(readFileSync(pkg.path)).digest('hex'),pkg.sha256);
const exported=['@jgengine/core/movement/playerMovement','@jgengine/shell/render/useModelAnimation'].map(name=>{const path=realpathSync(requireConsumer.resolve(name));assert.ok(path.startsWith(`${consumer}/node_modules/`)&&path.includes('/dist/'));return{name,path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')};});
const {resolvePlayerMovementTuning,stepPlayerMovement,snapshotPlayerMovement,restorePlayerMovement,playerMovementTelemetry}=await import(pathToFileURL(exported[0].path));
const {readModelAnimationParams}=await import(pathToFileURL(exported[1].path));
const {createGameContext}=await import(pathToFileURL(requireConsumer.resolve('@jgengine/core/runtime/gameContext')));
const {defineGameDefinition}=await import(pathToFileURL(requireConsumer.resolve('@jgengine/core/game/defineGame')));
const {createAssetCatalog}=await import(pathToFileURL(requireConsumer.resolve('@jgengine/core/scene/assetCatalog')));
const {ANIM_PARAMS_KEY}=await import(pathToFileURL(requireConsumer.resolve('@jgengine/core/anim/animGraph')));
const DT=1/60;let requestedHeight=1.8;
const tuning=resolvePlayerMovementTuning({physics:{gravity:-16,jumpVelocity:6},movement:{get collisionHeight(){return requestedHeight;}}});
function context(){const ctx=createGameContext({definition:defineGameDefinition({name:'height-animation-params-fixture',assets:createAssetCatalog(),multiplayer:'off',features:{players:true}}),content:{entityById:()=>({movement:{walkSpeed:3,poses:['standing','running','crouch']}})},player:{userId:'hero',isNew:true}});ctx.game.players.join('hero',true);ctx.scene.entity.spawn('hero',{id:'hero',position:[0,0,2]});return ctx;}
function roof(ctx,underside=2.058){ctx.world.solids.set('roof',[{center:[0,underside+.05,2],halfExtents:[2,.05,1]}]);}
const ctx=context();roof(ctx);
const extras={grounded:true,verticalSpeed:77,crouched:false,aiming:true};const extrasBefore={...extras};
ctx.scene.entity.blackboard.set('hero',ANIM_PARAMS_KEY,extras);
const out={stale:true,collisionHeight:999};const records=[];
function capture(label,world=ctx){
 const physical=playerMovementTelemetry(world,'hero');
 const authored=world.scene.entity.blackboard.get('hero',ANIM_PARAMS_KEY);
 const before={...authored};const params=readModelAnimationParams(world,'hero',0,out);
 assert.equal(world.scene.entity.blackboard.get('hero',ANIM_PARAMS_KEY),authored);assert.deepEqual(authored,before);
 assert.deepEqual(Object.keys(params).sort(),['aiming','crouched','grounded','speed','verticalSpeed']);
 if(physical){assert.equal(params.grounded,physical.grounded);assert.equal(params.verticalSpeed,physical.verticalVelocity);assert.equal(params.crouched,physical.crouching);}
 else{assert.equal(params.grounded,authored.grounded);assert.equal(params.verticalSpeed,authored.verticalSpeed);assert.equal(params.crouched,authored.crouched);}
 records.push({label,position:[...world.scene.entity.get('hero').position],physical:physical===null?null:{...physical},params:{...params},blackboardUnchanged:true});return physical;
}
stepPlayerMovement(ctx,'hero',{held:[],pointer:null},DT,tuning);capture('standing accepted1.8');
requestedHeight=2.6;stepPlayerMovement(ctx,'hero',{held:[],pointer:null},DT,tuning);
const blocked=capture('growth blocked under roof');assert.equal(blocked.collisionHeight,1.8);assert.equal(blocked.requestedCollisionHeight,2.6);assert.equal(blocked.collisionHeightBlocked,true);assert.equal(out.crouched,false);
const viewBefore={...blocked};assert.throws(()=>readModelAnimationParams(ctx,'hero',0,blocked),/caller-owned/);assert.deepEqual(blocked,viewBefore);
const saved=snapshotPlayerMovement(ctx,'hero');
const replay=context();roof(replay);const replayExtras={...extras};replay.scene.entity.blackboard.set('hero',ANIM_PARAMS_KEY,replayExtras);
restorePlayerMovement(replay,'hero',saved);assert.equal(capture('restored before physical step',replay),null);
stepPlayerMovement(replay,'hero',{held:[],pointer:null},DT,tuning);const replayBlocked=capture('restored blocked growth after step',replay);
assert.deepEqual({...replayBlocked},{...blocked});
for(let i=0;i<120&&playerMovementTelemetry(ctx,'hero').collisionHeightBlocked;i++)stepPlayerMovement(ctx,'hero',{held:['moveForward'],pointer:null},DT,tuning,Math.PI/2);
const grown=capture('clear headroom accepts growth');assert.equal(grown.collisionHeight,2.6);assert.equal(grown.collisionHeightBlocked,false);
requestedHeight=.9;stepPlayerMovement(ctx,'hero',{held:[],pointer:null},DT,tuning);const shrunk=capture('shrink accepted without changing pose');assert.equal(shrunk.collisionHeight,.9);assert.equal(shrunk.collisionHeightBlocked,false);assert.equal(out.crouched,false);
// Re-enter a low roof with the now-small body using ordinary public pose/reset APIs.
ctx.scene.entity.setPose('hero',{position:[0,0,2]});roof(ctx,1.05);
stepPlayerMovement(ctx,'hero',{held:['crouch'],pointer:null},DT,tuning);const crouch=capture('supported crouch remains explicit intent');assert.equal(crouch.crouching,true);assert.equal(out.crouched,true);assert.equal(crouch.collisionHeight,.9);
// The existing motor deliberately prevents a new jump while crouching. Release
// the semantic pose first; body proportions remain .9 independently.
stepPlayerMovement(ctx,'hero',{held:[],pointer:null},DT,tuning);
const released=capture('small body standing before jump');assert.equal(released.crouching,false);
let bumped=false;
for(let i=0;i<20;i++){
 stepPlayerMovement(ctx,'hero',{held:['jump'],pointer:null},DT,tuning);
 const physical=playerMovementTelemetry(ctx,'hero');const position=ctx.scene.entity.get('hero').position;
 if(!physical.grounded&&physical.verticalVelocity===0&&position[1]>0){capture('resolved airborne head bump');bumped=true;assert.equal(out.grounded,false);assert.equal(out.verticalSpeed,0);assert.equal(out.crouched,false);break;}
}
assert.ok(bumped,'small accepted body reaches the actual low ceiling');
const headSnapshot=snapshotPlayerMovement(ctx,'hero');restorePlayerMovement(ctx,'hero',headSnapshot);assert.equal(capture('head-bump restore awaiting physical step'),null);
stepPlayerMovement(ctx,'hero',{held:['crouch'],pointer:null},DT,tuning);const falling=capture('restored head bump continues falling');assert.equal(falling.grounded,false);assert.ok(falling.verticalVelocity<0);assert.equal(out.crouched,true);
for(let i=0;i<60&&!playerMovementTelemetry(ctx,'hero').grounded;i++)stepPlayerMovement(ctx,'hero',{held:['crouch'],pointer:null},DT,tuning);
const landed=capture('accepted floor landing');assert.equal(landed.grounded,true);assert.equal(landed.verticalVelocity,0);assert.equal(out.crouched,true);
assert.deepEqual(extras,extrasBefore);assert.deepEqual(replayExtras,extrasBefore);
const result={label:'unreleased installed public-package numeric animation parameter integration; no native or crouch appearance claim',cohort:manifest.commit,tree:manifest.tree,packageExports:exported,coreTarball:manifest.packages.find(p=>p.name==='@jgengine/core'),shellTarball:manifest.packages.find(p=>p.name==='@jgengine/shell'),fixture:{publicWorldSolidRoofs:[2.058,1.05],requestedHeights:[1.8,2.6,.9],gravity:-16,jumpVelocity:6,stepSeconds:DT,semanticCrouchExplicit:true,collisionHeightDoesNotInferAnimationPose:true},records,blackboardUnchanged:true,onlyExistingPhysicalGraphParamsFed:true,currentTelemetryOutputAliasRejected:true};
writeFileSync('/workspace/JGengine/.scratch/characters/ik/height-animation-params-package.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
