import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,realpathSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const consumer='/workspace/JGengine/.scratch/characters/consumer/heightfield-ceilings';
const requireConsumer=createRequire(`${consumer}/package.json`);
const manifest=JSON.parse(readFileSync(`${consumer}/candidate-package-manifest.json`,'utf8'));
assert.equal(manifest.commit,'4004ec17cac406fa33d157149c15b82c444f1144');
for(const pkg of manifest.packages)assert.equal(createHash('sha256').update(readFileSync(pkg.path)).digest('hex'),pkg.sha256);
const baselinePath='/workspace/JGengine/.scratch/characters/ik/heightfield-landing-review-4955a444.json';
const baseline=JSON.parse(readFileSync(baselinePath,'utf8'));
const baselineScript=readFileSync('/workspace/JGengine/.scratch/characters/ik/heightfield-landing-review-4955a444.mjs','utf8');
const currentScript=readFileSync(new URL(import.meta.url),'utf8');
const fixtureCode=script=>script.slice(script.search(/^const DT=1\/60;/m),script.search(/^const live=context\(\);/m));
assert.equal(fixtureCode(currentScript),fixtureCode(baselineScript));
const fixtureSourceSha256=createHash('sha256').update(fixtureCode(currentScript)).digest('hex');
const movementPath=realpathSync(requireConsumer.resolve('@jgengine/core/movement/playerMovement'));
assert.ok(movementPath.startsWith(`${consumer}/node_modules/`));
const {resolvePlayerMovementTuning,stepPlayerMovement,snapshotPlayerMovement,restorePlayerMovement,playerMovementTelemetry}=await import(pathToFileURL(movementPath));
const {createGameContext}=await import(pathToFileURL(requireConsumer.resolve('@jgengine/core/runtime/gameContext')));
const {defineGameDefinition}=await import(pathToFileURL(requireConsumer.resolve('@jgengine/core/game/defineGame')));
const {createAssetCatalog}=await import(pathToFileURL(requireConsumer.resolve('@jgengine/core/scene/assetCatalog')));
const DT=1/60;
// Explicit ledge fixture using existing public TerrainField: a 2m platform ending at z=0.
// Gravity/jump values match Lantern; this is not a copy of Lantern's scene or a native-feel claim.
const ground={sampleHeight:(_x,z)=>z<0?2:0,sampleNormal:()=>[0,1,0]};
const tuning={...resolvePlayerMovementTuning({physics:{gravity:-16,jumpVelocity:6},movement:{collideObjects:false,feel:{landingRecoveryMs:300,landingSpeedScale:.2}}}),ground,hasTerrain:true};
function context(){const ctx=createGameContext({definition:defineGameDefinition({name:'existing-heightfield-ledge-fixture',assets:createAssetCatalog(),multiplayer:'off',features:{players:true}}),content:{entityById:()=>({movement:{walkSpeed:3}})},player:{userId:'hero',isNew:true}});ctx.game.players.join('hero',true);ctx.scene.entity.spawn('hero',{id:'hero',position:[0,2,-.001]});return ctx;}
const live=context();stepPlayerMovement(live,'hero',{held:[],pointer:null},DT,tuning);
stepPlayerMovement(live,'hero',{held:['jump'],pointer:null},DT,tuning);
let before,saved,frames=0;
while(frames++<100){
 const state=snapshotPlayerMovement(live,'hero');const m=state.motion;
 if(!m.grounded&&m.verticalVelocity<0&&m.jumpOffset+(m.verticalVelocity-16*DT)*DT< -1e-9){saved=state;before={position:[...live.scene.entity.get('hero').position],motion:{...m},telemetry:{...playerMovementTelemetry(live,'hero')}};break;}
 stepPlayerMovement(live,'hero',{held:[],pointer:null},DT,tuning);
}
assert.ok(saved,'real motor jump must approach its original support height');
const replay=context();replay.scene.entity.setPose('hero',{position:before.position});restorePlayerMovement(replay,'hero',saved);
const records=[];
for(const[label,ctx]of[['live',live],['restored',replay]]){
 stepPlayerMovement(ctx,'hero',{held:['moveForward'],pointer:null},DT,tuning,0);
 const entity=ctx.scene.entity.get('hero'),snapshot=snapshotPlayerMovement(ctx,'hero'),support=ground.sampleHeight(entity.position[0],entity.position[2]);
 const after={position:[...entity.position],support,feetAboveSupport:entity.position[1]-support,motion:{...snapshot.motion},telemetry:{...playerMovementTelemetry(ctx,'hero')}};
 assert.ok(entity.position[2]>0&&after.feetAboveSupport>1.8&&!after.motion.grounded);
 const continuation=[];
 for(let i=0;i<3;i++){stepPlayerMovement(ctx,'hero',{held:['moveForward'],pointer:null},DT,tuning,0);continuation.push({position:[...ctx.scene.entity.get('hero').position],motion:{...snapshotPlayerMovement(ctx,'hero').motion},telemetry:{...playerMovementTelemetry(ctx,'hero')}});}
 let landing=null;
 for(let i=0;i<180;i++){
  const snap=snapshotPlayerMovement(ctx,'hero'),position=[...ctx.scene.entity.get('hero').position];
  if(snap.motion.grounded){landing={position,support:ground.sampleHeight(position[0],position[2]),motion:{...snap.motion},telemetry:{...playerMovementTelemetry(ctx,'hero')}};break;}
  assert.equal(snap.motion.landedAtMs,null,'no landing timestamp while accepted feet remain airborne');
  assert.ok(snap.motion.verticalVelocity<0);
  stepPlayerMovement(ctx,'hero',{held:['moveForward'],pointer:null},DT,tuning,0);
 }
 assert.ok(landing,'fall reaches actual lower support');assert.equal(landing.position[1],landing.support);
 assert.equal(landing.motion.verticalVelocity,0);assert.equal(landing.motion.landedAtMs,landing.motion.clockMs);assert.equal(landing.motion.wasAirborne,false);
 assert.deepEqual(landing.telemetry,{grounded:true,verticalVelocity:0,crouching:false});
 records.push({label,after,continuation,landing});
}
assert.deepEqual(records[0].after,records[1].after,'snapshot replay reproduces public step');
assert.deepEqual(records[0].continuation,records[1].continuation,'snapshot replay preserves continued descent');
assert.deepEqual(records[0].landing,records[1].landing,'snapshot replay reaches the same authoritative landing');
const expectedVerticalVelocity=before.motion.verticalVelocity-16*DT;
assert.ok(expectedVerticalVelocity< -5);
assert.ok(Math.abs(records[0].after.motion.verticalVelocity-expectedVerticalVelocity)<1e-12,'descent is preserved across the old jump origin');
assert.equal(records[0].after.motion.landedAtMs,before.motion.landedAtMs);
assert.equal(records[0].after.motion.wasAirborne,true);
assert.ok(Math.abs(records[0].after.position[1]-(before.position[1]+expectedVerticalVelocity*DT))<1e-12);
assert.equal(baseline.records[0].after.motion.verticalVelocity,0);
assert.notEqual(baseline.records[0].after.motion.landedAtMs,null);
assert.deepEqual(before,baseline.before,'same physical snapshot before crossing the ledge');
const flat=context();flat.scene.entity.setPose('hero',{position:before.position});restorePlayerMovement(flat,'hero',saved);
const flatTuning={...tuning,ground:{sampleHeight:()=>2,sampleNormal:()=>[0,1,0]}};
stepPlayerMovement(flat,'hero',{held:['moveForward'],pointer:null},DT,flatTuning,0);
const control={position:[...flat.scene.entity.get('hero').position],motion:snapshotPlayerMovement(flat,'hero').motion,telemetry:{...playerMovementTelemetry(flat,'hero')}};
const result={label:'fixed exact installed public package heightfield landing-state comparison; no native movement/appearance claim',baselinePath,baselineCohort:baseline.cohort,baselineArtifactSha256:createHash('sha256').update(readFileSync(baselinePath)).digest('hex'),fixtureSourceSha256,sourceFixtureUnchanged:true,cohort:manifest.commit,tree:manifest.tree,packageExport:{name:'@jgengine/core/movement/playerMovement',path:movementPath,sha256:createHash('sha256').update(readFileSync(movementPath)).digest('hex')},coreTarball:manifest.packages.find(p=>p.name==='@jgengine/core'),fixture:{ground:'y=2 for z<0, y=0 for z>=0',physics:{gravity:-16,jumpVelocity:6},stepSeconds:DT,landingRecoveryMs:300,landingSpeedScale:.2,source:'explicit existing public TerrainField ledge fixture; Lantern src/world.ts:62 gravity/jump values, not its authored scene'},before,expectedWithoutSyntheticLanding:{verticalVelocity:expectedVerticalVelocity,landedAtMs:before.motion.landedAtMs},records,flatControl:control,findings:['The unchanged ledge snapshot now preserves downward velocity and airborne latch without stamping a landing.','Live and restored runs stamp landing only when accepted feet meet the actual lower support.','The unchanged flat-support control still lands on the original platform.']};
assert.deepEqual(result.fixture,baseline.fixture);
result.fixtureConfigSha256=createHash('sha256').update(JSON.stringify(result.fixture)).digest('hex');
result.baselineFixtureConfigSha256=createHash('sha256').update(JSON.stringify(baseline.fixture)).digest('hex');
writeFileSync('/workspace/JGengine/.scratch/characters/ik/heightfield-landing-after-4004.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
