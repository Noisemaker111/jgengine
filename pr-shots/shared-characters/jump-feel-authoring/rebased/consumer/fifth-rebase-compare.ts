import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=process.argv[2];assert.ok(root,'Provide the independently installed refreshed fifth fixture');
const original=resolve(import.meta.dir,'consumer/jump-authoring');
const read=(dir:string,name:string)=>JSON.parse(readFileSync(resolve(dir,name),'utf8'));
const old=read(original,'jump-authoring-after.json'),fresh=read(root,'jump-authoring-after.json');
assert.equal(old.cohort,'3ab0399cfebd7ea2a02b1fedc79b6f1d35f82127');assert.ok(fresh.cohort.startsWith('e11224cd'));
const cases=[];
for(const game of ['scrap','lantern'])for(const profile of ['cut','recovery']){
 const a=old.games[game].profiles[profile],b=fresh.games[game].profiles[profile];
 assert.equal(b.savedDocumentSha256,a.savedDocumentSha256);
 for(const variant of ['default','raw','authored'])assert.deepEqual(b.records[variant],a.records[variant],`${game}/${profile}/${variant} remains identical after the beta motor rebase`);
 assert.deepEqual(b.records.authored,b.records.raw);assert.deepEqual(b.resolvedConfig,a.resolvedConfig);
 cases.push({game,profile,documentSha256:b.savedDocumentSha256,allThreeFullRecordsIdentical:true,authoredMatchesDirectRuntime:true});
}
assert.notEqual(fresh.moduleHashes['movement/playerMovement'],old.moduleHashes['movement/playerMovement'],'f9105173 changes the motor source; do not relabel old source evidence');
const oldFull=read(original,'jump-authoring-full-document.json'),freshFull=read(root,'jump-authoring-full-document.json');
assert.equal(freshFull.fullDocumentSha256,oldFull.fullDocumentSha256);assert.equal(freshFull.markerCount,438);
assert.deepEqual(freshFull.records,oldFull.records,'the same full saved438-marker document produces identical actual normal-player trajectories');
assert.deepEqual(freshFull.resolvedConfig,oldFull.resolvedConfig);
const report={label:'fresh fifth installed-package regression after beta stance-dependent flight ordering integration; old artifacts keep their original source labels',previousCohort:old.cohort,refreshedCohort:fresh.cohort,refreshedTree:fresh.tree,betaMovementChange:'f91051730dadd7cdb2839b6e464c71fa71bf0a6f',sourceGameCommit:fresh.originalSourceCommit,cases,full438Document:{sha256:freshFull.fullDocumentSha256,allCombinedRuntimeRecordsIdentical:true},compiledModuleHashes:{previous:old.moduleHashes,refreshed:fresh.moduleHashes},playerMovementModuleChanged:true,limitation:'Numerical movement and authoring/package integration evidence; no registry publication, game adoption, native feel/appearance or hardware performance claim.'};
writeFileSync(resolve(root,'fifth-rebase-comparison.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
