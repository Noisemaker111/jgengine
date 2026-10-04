import {chromium} from '/workspace/JGengine/node_modules/playwright-core';
import {findChromeExecutable} from '/workspace/JGengine/scripts/browser-lib';
import {fitterAnimation} from '/workspace/JGengine/.scratch/characters/consumer/animation-continuity/games/deepward/src/game/fitterArt';
import {entityModels} from '/workspace/JGengine/.scratch/characters/consumer/animation-continuity/games/lantern-reach/src/game/models';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,realpathSync} from 'node:fs';
const root=import.meta.dir;const consumer=process.argv[2]??'/workspace/JGengine/.scratch/characters/consumer/height-proportions';const label=process.argv[3]??'before-f4cbd717-v3';
assert.equal(realpathSync(`${root}/node_modules`),realpathSync(`${consumer}/node_modules`),'browser bundle must resolve exact installed package cohort');
const manifest=JSON.parse(readFileSync(`${consumer}/candidate-package-manifest.json`,'utf8'));for(const pkg of manifest.packages)assert.equal(createHash('sha256').update(readFileSync(pkg.path)).digest('hex'),pkg.sha256);
const requireConsumer=createRequire(`${consumer}/package.json`);const packageExports=['@jgengine/shell/render/useModelAnimation','@jgengine/core/anim/animGraph'].map(name=>{const path=requireConsumer.resolve(name);assert.ok(path.startsWith(`${consumer}/node_modules/`));return{name,path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}});
const configs={lantern:entityModels.player_hero.animation,gait:fitterAnimation({mode:'route'} as any),windups:[.6,.35,.1].map(attack=>fitterAnimation({mode:'winding',attack} as any))};
const build=await Bun.build({entrypoints:[`${root}/fixture.tsx`],target:'browser',format:'esm'});
if(!build.success)throw Error(build.logs.join('\n'));
const glb='/workspace/JGengine-games/deepward/public/models/imported/deepward/fitter/fitter-salvage-operator.glb';
const bytes=readFileSync(glb);const knightGlb='/workspace/JGengine-games/.claude/worktrees/character-proof/lantern-reach/public/models/lantern-reach/players/knight.glb';const knightBytes=readFileSync(knightGlb);const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:request=>{const p=new URL(request.url).pathname;return p==='/configs.json'?Response.json(configs):p==='/fixture.js'?new Response(build.outputs[0],{headers:{'content-type':'application/javascript'}}):p==='/knight.glb'?new Response(knightBytes):p==='/fitter.glb'?new Response(bytes):new Response('<script type="module" src="/fixture.js"></script>',{headers:{'content-type':'text/html'}})}});
const browser=await chromium.launch({executablePath:findChromeExecutable(),headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.port}`);await page.waitForFunction(()=>window.ready);
 const stable=await page.evaluate(()=>window.run(false));const fresh=await page.evaluate(()=>window.run(true));const windup=await page.evaluate(()=>window.windup());const lanternStable=await page.evaluate(()=>window.run(false,'lantern'));const lanternFresh=await page.evaluate(()=>window.run(true,'lantern'));
 assert.deepEqual(windup.poses,windup.held);assert.equal(windup.subscriptionsAfterUnmount,0);assert.ok(new Set(windup.poses.map(pose=>JSON.stringify(pose))).size>1);
 if(label.startsWith('after')){assert.deepEqual(lanternFresh.poses,lanternStable.poses);assert.deepEqual(lanternFresh.actionTimes,lanternStable.actionTimes);assert.ok(new Set(lanternFresh.bonePoses.map(p=>JSON.stringify(p))).size>1);assert.equal(lanternFresh.subscriptionsAfterUnmount,0);assert.deepEqual(fresh.poses,stable.poses);assert.deepEqual(fresh.actionTimes,stable.actionTimes);assert.equal(fresh.subscriptionsAfterUnmount,0);assert.equal(stable.subscriptionsAfterUnmount,0);assert.deepEqual(errors,[])}
 const maxDifference=(a,b)=>Math.max(...a.map((n,i)=>Math.abs(n-b[i])));
 const physicalDifference=(a,b)=>({position:Math.max(...a.map((n,i)=>Math.hypot(...n.position.map((v,k)=>v-b[i].position[k])))),rotationRadians:Math.max(...a.map((n,i)=>2*Math.acos(Math.min(1,Math.abs(n.quaternion.reduce((sum,v,k)=>sum+v*b[i].quaternion[k],0))))))});
 const report={label:'actual Deepward Fitter imported rig; real public React hook and manual Fiber frames; numeric pose continuity only, no native appearance claim',glb,glbSha256:createHash('sha256').update(bytes).digest('hex'),knightGlb,knightGlbSha256:createHash('sha256').update(knightBytes).digest('hex'),lanternStable,lanternFresh,cohort:manifest.commit,tree:manifest.tree,packageExports,configs,windup,errors,stable,fresh,metrics:{stableWorldPoseChange:physicalDifference(stable.bonePoses[29],stable.bonePoses[0]),freshWorldPoseChange:physicalDifference(fresh.bonePoses[29],fresh.bonePoses[0]),stableFinalVsFirst:maxDifference(stable.poses[29],stable.poses[0]),freshFinalVsFirst:maxDifference(fresh.poses[29],fresh.poses[0]),finalStableVsFresh:maxDifference(stable.poses[29],fresh.poses[29])}};
 writeFileSync(`${root}/${label}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,stable:{...stable,poses:'stored',bonePoses:'stored',actionTimes:'stored'},fresh:{...fresh,poses:'stored',bonePoses:'stored',actionTimes:'stored'}},null,2));
}finally{await browser.close();server.stop(true)}
