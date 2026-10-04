import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=(name:string)=>JSON.parse(readFileSync(new URL('./'+name,import.meta.url),'utf8'));
const before=read('jump-authoring-before.json'),after=read('jump-authoring-after.json');
assert.equal(before.cohort,'f4cbd7176a1f8c0d0702417fd8cc04fcbbe4d8f7');
assert.equal(after.cohort,'3ab0399cfebd7ea2a02b1fedc79b6f1d35f82127');
const sha=(name:string)=>createHash('sha256').update(readFileSync(new URL('./'+name,import.meta.url))).digest('hex');
const cases:any[]=[];
for(const game of ['scrap','lantern'])for(const profile of ['cut','recovery']){
 const b=before.games[game].profiles[profile],a=after.games[game].profiles[profile];
 assert.equal(a.savedDocumentSha256,b.savedDocumentSha256);
 assert.equal(sha(`jump-authoring-${game}-${profile}-saved.json`),b.savedDocumentSha256);
 assert.deepEqual(a.records.default,b.records.default,'unchanged motor defaults across the package boundary');
 assert.deepEqual(a.records.raw,b.records.raw,'unchanged direct runtime behavior across the package boundary');
 assert.deepEqual(b.records.authored,b.records.default,'captured failure remains authored fields ignored before');
 assert.deepEqual(a.records.authored,a.records.raw,'authored settings match runtime after');
 for(const [key,value] of Object.entries(a.fields))assert.equal(a.resolvedConfig.movement.feel[key],value);
 cases.push({game,profile,savedDocumentSha256:a.savedDocumentSha256,defaultRecordUnchanged:true,rawRecordUnchanged:true,authoredRecordNowMatchesRaw:true,defaultPeakHeight:a.records.default.peakHeight,authoredPeakHeight:a.records.authored.peakHeight,defaultLandingSpeedAt100ms:a.records.default.speedAt100ms,authoredLandingSpeedAt100ms:a.records.authored.speedAt100ms,defaultDistanceAt100ms:a.records.default.distanceAt100ms,authoredDistanceAt100ms:a.records.authored.distanceAt100ms});
}
const stableModules=['movement/playerMovement','movement/movementModel'];
for(const name of stableModules)assert.equal(after.moduleHashes[name],before.moduleHashes[name],'owning motor modules unchanged');
const summary={beforeCohort:before.cohort,afterCohort:after.cohort,afterTree:after.tree,beforeEvidenceSha256:sha('jump-authoring-before.json'),afterEvidenceSha256:sha('jump-authoring-after.json'),sourceGameCommit:after.originalSourceCommit,normalBootRegisteredPlayersAndInput:true,noPositionOrSceneWrites:true,unchangedMotorModules:stableModules,cases,limitation:'Unreleased installed public package numeric proof; no published consumer adoption, native appearance/control feel, or hardware performance claim.'};
writeFileSync(new URL('./jump-authoring-cross-cohort.json',import.meta.url),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary));
